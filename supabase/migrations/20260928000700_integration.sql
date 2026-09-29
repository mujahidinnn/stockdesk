-- Secrets never reach a client: API keys are kept as SHA-256 hashes; webhook secrets have no client policy.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE public.t_api_keys (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (name <> ''),
    prefix text NOT NULL,
    key_hash text NOT NULL UNIQUE,
    scopes text[] NOT NULL CHECK (scopes <> '{}' AND scopes <@ ARRAY['stock:read', 'products:read', 'orders:write']),
    -- Set = the key only sees and orders that owner's goods.
    owner_id bigint REFERENCES public.m_owners ON DELETE RESTRICT,
    expires_at timestamptz,
    last_used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL
);
CREATE INDEX t_api_keys_owner_idx ON public.t_api_keys (owner_id);

CREATE TABLE public.t_api_request_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    api_key_id bigint REFERENCES public.t_api_keys ON DELETE CASCADE,
    method text NOT NULL,
    path text NOT NULL,
    status integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_api_request_log_key_idx ON public.t_api_request_log (api_key_id, created_at DESC);
CREATE INDEX t_api_request_log_created_idx ON public.t_api_request_log (created_at);

CREATE TABLE public.t_api_idempotency (
    api_key_id bigint NOT NULL REFERENCES public.t_api_keys ON DELETE CASCADE,
    idem_key text NOT NULL CHECK (length(idem_key) BETWEEN 1 AND 200),
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (api_key_id, idem_key)
);
CREATE INDEX t_api_idempotency_created_idx ON public.t_api_idempotency (created_at);

CREATE TABLE public.t_webhooks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url text NOT NULL CHECK (url ~ '^https://[^/?#@\s]+' AND length(url) <= 500),
    events text[] NOT NULL CHECK (events <> '{}' AND events <@ ARRAY['stock.low', 'stock.changed', 'receipt.posted',
                                                                     'shipment.dispatched', 'count.approved', 'batch.expiring']),
    is_active boolean NOT NULL DEFAULT true,
    -- Final delivery failures in a row; 20 switches the webhook off.
    failure_streak integer NOT NULL DEFAULT 0,
    disabled_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.t_webhook_secrets (
    webhook_id bigint PRIMARY KEY REFERENCES public.t_webhooks ON DELETE CASCADE,
    secret text NOT NULL
);

CREATE TABLE public.t_webhook_deliveries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    webhook_id bigint NOT NULL REFERENCES public.t_webhooks ON DELETE CASCADE,
    event text NOT NULL,
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_status_code integer,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz
);
CREATE INDEX t_webhook_deliveries_due_idx ON public.t_webhook_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX t_webhook_deliveries_hook_idx ON public.t_webhook_deliveries (webhook_id, created_at DESC);

-- Returns the full key once; only its hash and a 12-character prefix are kept. The public demo refuses orders:write.
CREATE FUNCTION public.create_api_key(p_name text, p_scopes text[], p_owner_id bigint DEFAULT NULL,
                                      p_expires_at timestamptz DEFAULT NULL) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT has_permission('integration', 'create') THEN
    RAISE EXCEPTION 'Not allowed to create API keys' USING errcode = '42501';
  END IF;
  IF p_expires_at <= now() THEN
    RAISE EXCEPTION 'Expiry must be in the future';
  END IF;
  IF (SELECT demo_mode FROM m_settings) AND 'orders:write' = ANY (p_scopes) THEN
    RAISE EXCEPTION 'The demo does not allow orders:write keys';
  END IF;
  v_key := 'sd_live_' || rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
  INSERT INTO t_api_keys (name, prefix, key_hash, scopes, owner_id, expires_at)
  VALUES (trim(p_name), left(v_key, 12), encode(digest(v_key, 'sha256'), 'hex'),
          ARRAY(SELECT DISTINCT unnest(p_scopes) ORDER BY 1), p_owner_id, p_expires_at);
  RETURN v_key;
END;
$$;

CREATE FUNCTION public.revoke_api_key(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('integration', 'delete') THEN
    RAISE EXCEPTION 'Not allowed to revoke API keys' USING errcode = '42501';
  END IF;
  UPDATE t_api_keys SET revoked_at = now() WHERE id = p_id AND revoked_at IS NULL;
END;
$$;

-- Answers with an HTTP-like status instead of raising, so the edge function can log it.
CREATE FUNCTION public.api_authenticate(p_key_hash text, p_scope text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  k        t_api_keys;
  v_count  integer;
  v_oldest timestamptz;
BEGIN
  SELECT * INTO k FROM t_api_keys WHERE key_hash = p_key_hash;
  IF k.id IS NULL THEN
    RETURN jsonb_build_object('status', 401, 'error', 'invalid_key');
  END IF;
  IF k.revoked_at IS NOT NULL OR k.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 401, 'error', 'invalid_key', 'key_id', k.id);
  END IF;
  IF NOT p_scope = ANY (k.scopes) THEN
    RETURN jsonb_build_object('status', 403, 'error', 'missing_scope', 'key_id', k.id);
  END IF;
  SELECT count(*), min(created_at) INTO v_count, v_oldest
    FROM t_api_request_log WHERE api_key_id = k.id AND created_at > now() - interval '1 minute';
  IF v_count >= 60 THEN
    RETURN jsonb_build_object('status', 429, 'error', 'rate_limited', 'key_id', k.id,
      'retry_after', greatest(1, ceil(60 - extract(epoch FROM now() - v_oldest)))::integer);
  END IF;
  IF k.last_used_at IS NULL OR k.last_used_at < now() - interval '1 minute' THEN
    UPDATE t_api_keys SET last_used_at = now() WHERE id = k.id;
  END IF;
  RETURN jsonb_build_object('status', 200, 'key_id', k.id, 'owner_id', k.owner_id);
END;
$$;

CREATE FUNCTION public.api_stock(p_owner_id bigint, p_sku text, p_warehouse text, p_limit integer, p_offset integer)
RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(x), '[]') FROM (
    SELECT s.sku_code AS sku, w.code AS warehouse, sum(b.qty_on_hand) AS on_hand, sum(b.qty_reserved) AS reserved,
           sum(b.qty_on_hand - b.qty_reserved) AS available
      FROM t_stock_balances b
      JOIN m_skus s ON s.id = b.sku_id
      JOIN m_warehouses w ON w.id = b.warehouse_id
     WHERE b.qty_on_hand > 0
       AND (p_owner_id IS NULL OR b.owner_id = p_owner_id)
       AND (p_sku IS NULL OR s.sku_code = upper(p_sku))
       AND (p_warehouse IS NULL OR w.code = upper(p_warehouse))
     GROUP BY s.sku_code, w.code
     ORDER BY 1, 2
     LIMIT least(p_limit, 100) OFFSET p_offset) x;
$$;

CREATE FUNCTION public.api_products(p_owner_id bigint, p_updated_since timestamptz, p_limit integer, p_offset integer)
RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(x), '[]') FROM (
    SELECT s.sku_code AS sku, s.barcode, p.code AS product_code, p.name, c.name AS category, s.attributes,
           u.code AS base_uom, s.is_active AND p.is_active AS is_active, greatest(s.updated_at, p.updated_at) AS updated_at
      FROM m_skus s
      JOIN m_products p ON p.id = s.product_id
      LEFT JOIN m_categories c ON c.id = p.category_id
      JOIN m_uoms u ON u.id = s.base_uom_id
     WHERE (p_owner_id IS NULL OR p.owner_id = p_owner_id)
       AND (p_updated_since IS NULL OR greatest(s.updated_at, p.updated_at) >= p_updated_since)
     ORDER BY greatest(s.updated_at, p.updated_at), s.id
     LIMIT least(p_limit, 100) OFFSET p_offset) x;
$$;

-- The first answer per Idempotency-Key is stored and replayed on every retry.
CREATE FUNCTION public.api_create_order(p_key_id bigint, p_owner_id bigint, p_idem_key text, p_body jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_resp  jsonb;
  v_wh    bigint;
  v_owner bigint := p_owner_id;
  v_so    t_sales_orders;
  l       jsonb;
  v_sku   record;
  v_uom   bigint;
BEGIN
  SELECT response INTO v_resp FROM t_api_idempotency WHERE api_key_id = p_key_id AND idem_key = p_idem_key;
  IF FOUND THEN
    RETURN v_resp;
  END IF;

  BEGIN
    SELECT id INTO v_wh FROM m_warehouses WHERE code = upper(p_body->>'warehouse') AND is_active;
    IF v_wh IS NULL THEN
      RAISE EXCEPTION 'Unknown warehouse %', p_body->>'warehouse';
    END IF;
    IF jsonb_typeof(p_body->'lines') <> 'array' OR jsonb_array_length(p_body->'lines') NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'An order needs 1 to 200 lines';
    END IF;
    FOR l IN SELECT * FROM jsonb_array_elements(p_body->'lines') LOOP
      SELECT s.id, s.base_uom_id, p.owner_id INTO v_sku
        FROM m_skus s JOIN m_products p ON p.id = s.product_id
       WHERE s.sku_code = upper(l->>'sku') AND s.is_active AND p.is_active;
      IF v_sku.id IS NULL THEN
        RAISE EXCEPTION 'Unknown or inactive SKU %', l->>'sku';
      END IF;
      v_owner := COALESCE(v_owner, v_sku.owner_id);
      IF v_sku.owner_id <> v_owner THEN
        RAISE EXCEPTION 'SKU % belongs to another owner', l->>'sku';
      END IF;
    END LOOP;

    INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_name, ship_to, channel, reference_no, note)
    VALUES (v_wh, v_owner, p_body->>'customer_name', p_body->>'ship_to', 'api', p_body->>'reference_no', p_body->>'note')
    RETURNING * INTO v_so;
    FOR l IN SELECT * FROM jsonb_array_elements(p_body->'lines') LOOP
      SELECT s.id, s.base_uom_id INTO v_sku FROM m_skus s WHERE s.sku_code = upper(l->>'sku');
      v_uom := v_sku.base_uom_id;
      IF l ? 'uom' THEN
        SELECT id INTO v_uom FROM m_uoms WHERE code = upper(l->>'uom');
        IF v_uom IS NULL THEN
          RAISE EXCEPTION 'Unknown unit %', l->>'uom';
        END IF;
      END IF;
      INSERT INTO t_sales_order_lines (order_id, sku_id, uom_id, qty) VALUES (v_so.id, v_sku.id, v_uom, (l->>'qty')::numeric);
    END LOOP;
    v_resp := jsonb_build_object('status', 201, 'data', jsonb_build_object('id', v_so.id, 'so_no', v_so.so_no, 'status', v_so.status));
  EXCEPTION WHEN raise_exception OR check_violation OR not_null_violation OR invalid_text_representation THEN
    v_resp := jsonb_build_object('status', 422, 'error', SQLERRM);
  END;

  INSERT INTO t_api_idempotency (api_key_id, idem_key, response) VALUES (p_key_id, p_idem_key, v_resp);
  RETURN v_resp;
END;
$$;

CREATE FUNCTION public.create_webhook(p_url text, p_events text[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_id     bigint;
  v_secret text := 'whsec_' || encode(gen_random_bytes(24), 'hex');
BEGIN
  IF NOT has_permission('integration', 'create') THEN
    RAISE EXCEPTION 'Not allowed to create webhooks' USING errcode = '42501';
  END IF;
  INSERT INTO t_webhooks (url, events) VALUES (trim(p_url), ARRAY(SELECT DISTINCT unnest(p_events) ORDER BY 1))
  RETURNING id INTO v_id;
  INSERT INTO t_webhook_secrets (webhook_id, secret) VALUES (v_id, v_secret);
  RETURN jsonb_build_object('id', v_id, 'secret', v_secret);
END;
$$;

CREATE FUNCTION public.rotate_webhook_secret(p_id bigint) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_secret text := 'whsec_' || encode(gen_random_bytes(24), 'hex');
BEGIN
  IF NOT has_permission('integration', 'update') THEN
    RAISE EXCEPTION 'Not allowed to rotate webhook secrets' USING errcode = '42501';
  END IF;
  UPDATE t_webhook_secrets SET secret = v_secret WHERE webhook_id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook not found';
  END IF;
  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (auth.uid(), 'update', 'webhook', p_id::text, '{"secret":"rotated"}');
  RETURN v_secret;
END;
$$;

CREATE FUNCTION public.retry_webhook_delivery(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('integration', 'update') THEN
    RAISE EXCEPTION 'Not allowed to retry deliveries' USING errcode = '42501';
  END IF;
  UPDATE t_webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = now()
   WHERE id = p_id AND status = 'failed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only failed deliveries can be sent again';
  END IF;
END;
$$;

CREATE FUNCTION public.enqueue_webhook_event(p_event text, p_data jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO t_webhook_deliveries (webhook_id, event, payload)
  SELECT id, p_event, p_data FROM t_webhooks WHERE is_active AND p_event = ANY (events);
$$;

CREATE FUNCTION public.enqueue_document_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_data jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM t_webhooks WHERE is_active AND TG_ARGV[0] = ANY (events)) THEN
    RETURN NULL;
  END IF;
  -- NEW has a different row type per table, so each branch is its own statement.
  IF TG_TABLE_NAME = 't_stock_movements' THEN
    v_data := jsonb_build_object(
      'movement_id', NEW.id, 'type', NEW.movement_type, 'date', NEW.movement_date, 'qty', NEW.qty,
      'sku', (SELECT sku_code FROM m_skus WHERE id = NEW.sku_id),
      'batch', (SELECT batch_no FROM m_batches WHERE id = NEW.batch_id),
      'from', (SELECT full_code FROM m_locations WHERE id = NEW.from_location_id),
      'to', (SELECT full_code FROM m_locations WHERE id = NEW.to_location_id), 'ref_no', NEW.ref_no);
  ELSIF TG_TABLE_NAME = 't_goods_receipts' THEN
    v_data := jsonb_build_object(
      'id', NEW.id, 'gr_no', NEW.gr_no, 'date', NEW.receipt_date, 'reference_no', NEW.reference_no,
      'warehouse', (SELECT code FROM m_warehouses WHERE id = NEW.warehouse_id),
      'lines', (SELECT jsonb_agg(jsonb_build_object('sku', s.sku_code, 'accepted', l.base_qty_accepted, 'rejected', l.base_qty_rejected))
                  FROM t_goods_receipt_lines l JOIN m_skus s ON s.id = l.sku_id WHERE l.receipt_id = NEW.id));
  ELSIF TG_TABLE_NAME = 't_shipments' THEN
    v_data := jsonb_build_object(
      'id', NEW.id, 'do_no', NEW.do_no, 'courier', NEW.courier, 'tracking_no', NEW.tracking_no,
      'so_no', (SELECT so_no FROM t_sales_orders WHERE id = NEW.order_id),
      'reference_no', (SELECT reference_no FROM t_sales_orders WHERE id = NEW.order_id));
  ELSE
    v_data := jsonb_build_object(
      'id', NEW.id, 'count_no', NEW.count_no, 'warehouse', (SELECT code FROM m_warehouses WHERE id = NEW.warehouse_id));
  END IF;
  PERFORM enqueue_webhook_event(TG_ARGV[0], v_data);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_webhook_stock_changed AFTER INSERT ON public.t_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_document_event('stock.changed');
CREATE TRIGGER trg_webhook_receipt_posted AFTER UPDATE OF status ON public.t_goods_receipts
  FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status IN ('received', 'putaway_done'))
  EXECUTE FUNCTION public.enqueue_document_event('receipt.posted');
CREATE TRIGGER trg_webhook_shipment_dispatched AFTER UPDATE OF status ON public.t_shipments
  FOR EACH ROW WHEN (OLD.status <> 'dispatched' AND NEW.status = 'dispatched')
  EXECUTE FUNCTION public.enqueue_document_event('shipment.dispatched');
CREATE TRIGGER trg_webhook_count_approved AFTER UPDATE OF status ON public.t_stock_counts
  FOR EACH ROW WHEN (OLD.status <> 'approved' AND NEW.status = 'approved')
  EXECUTE FUNCTION public.enqueue_document_event('count.approved');

-- SKIP LOCKED plus a 2-minute lease on next_attempt_at keeps two dispatchers from sending the same one.
CREATE FUNCTION public.claim_webhook_deliveries(p_limit integer DEFAULT 50)
RETURNS TABLE (id bigint, webhook_id bigint, url text, secret text, event text, payload jsonb, created_at timestamptz)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT d.id FROM t_webhook_deliveries d
     WHERE d.status = 'pending' AND d.next_attempt_at <= now()
     ORDER BY d.next_attempt_at, d.id
     LIMIT p_limit FOR UPDATE SKIP LOCKED
  ), leased AS (
    UPDATE t_webhook_deliveries d SET next_attempt_at = now() + interval '2 minutes'
      FROM due WHERE d.id = due.id
    RETURNING d.*
  )
  SELECT l.id, l.webhook_id, w.url, s.secret, l.event, l.payload, l.created_at
    FROM leased l JOIN t_webhooks w ON w.id = l.webhook_id JOIN t_webhook_secrets s ON s.webhook_id = w.id
   WHERE w.is_active;
END;
$$;

-- Retry after 1m, 5m, 30m, 2h, 12h; the 5th failure is final; 20 final failures in a row disable the webhook and tell Admins.
CREATE FUNCTION public.record_webhook_result(p_id bigint, p_ok boolean, p_status_code integer, p_error text)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  d t_webhook_deliveries;
  w t_webhooks;
BEGIN
  UPDATE t_webhook_deliveries
     SET attempts = attempts + 1, last_status_code = p_status_code, last_error = left(p_error, 1000),
         status = CASE WHEN p_ok THEN 'success' WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         delivered_at = CASE WHEN p_ok THEN now() END,
         next_attempt_at = now() + (ARRAY[interval '1 minute', interval '5 minutes', interval '30 minutes',
                                          interval '2 hours', interval '12 hours'])[least(attempts + 1, 5)]
   WHERE id = p_id AND status = 'pending'
  RETURNING * INTO d;
  IF d.id IS NULL OR d.status = 'pending' THEN
    RETURN;
  END IF;

  UPDATE t_webhooks SET failure_streak = CASE WHEN d.status = 'success' THEN 0 ELSE failure_streak + 1 END
   WHERE id = d.webhook_id RETURNING * INTO w;
  IF w.failure_streak >= 20 AND w.is_active THEN
    UPDATE t_webhooks SET is_active = false, disabled_reason = '20 failed deliveries in a row' WHERE id = w.id;
    INSERT INTO t_notifications (user_id, title, body, link)
    SELECT p.id, 'Webhook dinonaktifkan', format('%s gagal 20 kali berturut-turut.', w.url), '/settings/integration?tab=webhooks'
      FROM profiles p JOIN m_roles r ON r.id = p.role_id WHERE r.role_name = 'Admin';
  END IF;
END;
$$;

-- Needs Vault secrets project_url + cron_dispatch_secret; no-op without them so a fresh DB never errors every minute.
CREATE FUNCTION public.dispatch_webhooks() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_url    text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url');
  v_secret text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_dispatch_secret');
BEGIN
  IF v_url IS NULL OR v_secret IS NULL
     OR NOT EXISTS (SELECT 1 FROM t_webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= now()) THEN
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/webhook-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', v_secret),
    body := '{}'::jsonb);
END;
$$;

-- Morning job: expiring batches and low stock for Managers and Admins, batch.expiring event, late transfers, value snapshot.
CREATE FUNCTION public.run_daily_jobs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := company_today();
  v_batches jsonb;
  v_low integer;
BEGIN
  SELECT jsonb_agg(x ORDER BY x.expiry_date) INTO v_batches
    FROM (SELECT s.sku_code AS sku, bt.batch_no AS batch, bt.expiry_date, w.code AS warehouse, sum(b.qty_on_hand) AS qty
            FROM t_stock_balances b
            JOIN m_batches bt ON bt.id = b.batch_id
            JOIN m_skus s ON s.id = b.sku_id
            JOIN m_warehouses w ON w.id = b.warehouse_id
           WHERE b.qty_on_hand > 0 AND bt.expiry_date <= v_today + (SELECT expiry_warning_days FROM m_settings)
           GROUP BY s.sku_code, bt.batch_no, bt.expiry_date, w.code) x;
  SELECT count(*) INTO v_low FROM (
    SELECT s.id FROM m_skus s LEFT JOIN t_stock_balances b ON b.sku_id = s.id
     WHERE s.is_active AND s.reorder_point > 0
     GROUP BY s.id HAVING COALESCE(sum(b.qty_on_hand), 0) <= s.reorder_point) low;

  IF v_batches IS NOT NULL THEN
    PERFORM enqueue_webhook_event('batch.expiring', jsonb_build_object('date', v_today, 'batches', v_batches));
  END IF;
  IF v_batches IS NOT NULL OR v_low > 0 THEN
    INSERT INTO t_notifications (user_id, title, body, link)
    SELECT p.id, 'Ringkasan stok pagi ini',
           concat_ws(' ', CASE WHEN v_batches IS NOT NULL THEN format('%s batch mendekati kedaluwarsa.', jsonb_array_length(v_batches)) END,
                          CASE WHEN v_low > 0 THEN format('%s SKU di bawah reorder point.', v_low) END),
           '/'
      FROM profiles p JOIN m_roles r ON r.id = p.role_id
     WHERE r.rank <= (SELECT rank FROM m_roles WHERE role_name = 'Warehouse Manager');
  END IF;
  PERFORM notify_late_transfers();
  PERFORM snapshot_stock_value(v_today);
END;
$$;

-- Never touches the ledger or the audit log.
CREATE FUNCTION public.run_housekeeping() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM t_error_log WHERE created_at < now() - interval '90 days';
  DELETE FROM t_api_request_log WHERE created_at < now() - interval '30 days';
  DELETE FROM t_api_idempotency WHERE created_at < now() - interval '7 days';
  DELETE FROM t_webhook_deliveries WHERE status = 'success' AND created_at < now() - interval '30 days';
  DELETE FROM t_notifications WHERE is_read AND created_at < now() - interval '90 days';
$$;

-- The cron schema survives a db reset on hosted Supabase, so jobs are unscheduled before scheduling.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('stockdesk-webhook-dispatch', 'stockdesk-daily', 'stockdesk-housekeeping');
  PERFORM cron.schedule('stockdesk-webhook-dispatch', '* * * * *', 'SELECT public.dispatch_webhooks()');
  -- 23:00 UTC = 06:00 WIB (Asia/Jakarta). Adjust if m_settings.timezone changes.
  PERFORM cron.schedule('stockdesk-daily', '0 23 * * *', 'SELECT public.run_daily_jobs()');
  PERFORM cron.schedule('stockdesk-housekeeping', '0 20 * * 0', 'SELECT public.run_housekeeping()');
END $$;

CREATE TRIGGER trg_t_webhooks_updated_at BEFORE UPDATE ON public.t_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_audit_api_keys AFTER INSERT OR UPDATE OR DELETE ON public.t_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('api_key');
CREATE TRIGGER trg_audit_webhooks AFTER INSERT OR UPDATE OR DELETE ON public.t_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('webhook');

ALTER TABLE public.t_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_api_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_api_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_webhook_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_keys_select ON public.t_api_keys FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('integration', 'read')));
CREATE POLICY api_log_select ON public.t_api_request_log FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('integration', 'read')));
CREATE POLICY webhooks_select ON public.t_webhooks FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('integration', 'read')));
CREATE POLICY webhooks_update ON public.t_webhooks FOR UPDATE TO authenticated
  USING ((SELECT public.has_permission('integration', 'update')))
  WITH CHECK ((SELECT public.has_permission('integration', 'update')));
CREATE POLICY webhooks_delete ON public.t_webhooks FOR DELETE TO authenticated
  USING ((SELECT public.has_permission('integration', 'delete')));
CREATE POLICY deliveries_select ON public.t_webhook_deliveries FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('integration', 'read')));

-- Keys and secrets are written only by the RPCs; clients may only flip a webhook's url, events and switch.
REVOKE ALL ON public.t_api_keys, public.t_api_request_log, public.t_api_idempotency, public.t_webhooks,
  public.t_webhook_secrets, public.t_webhook_deliveries FROM anon, authenticated;
GRANT SELECT (id, name, prefix, scopes, owner_id, expires_at, last_used_at, revoked_at, created_at, created_by)
  ON public.t_api_keys TO authenticated;
GRANT SELECT ON public.t_api_request_log, public.t_webhooks, public.t_webhook_deliveries TO authenticated;
GRANT UPDATE (url, events, is_active, failure_streak, disabled_reason), DELETE ON public.t_webhooks TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.api_authenticate(text, text), public.api_stock(bigint, text, text, integer, integer),
  public.api_products(bigint, timestamptz, integer, integer), public.api_create_order(bigint, bigint, text, jsonb),
  public.enqueue_webhook_event(text, jsonb), public.claim_webhook_deliveries(integer),
  public.record_webhook_result(bigint, boolean, integer, text), public.dispatch_webhooks(),
  public.run_daily_jobs(), public.run_housekeeping() FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE FUNCTION public.sidebar_counts(p_warehouse_id bigint DEFAULT NULL) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'putaway', CASE WHEN has_permission('putaway', 'read')
                    THEN (SELECT count(*) FROM t_putaway_tasks WHERE status = 'open'
                            AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) ELSE 0 END,
    'pickList', CASE WHEN has_permission('pick-list', 'read')
                    THEN (SELECT count(*) FROM t_pick_lists WHERE status IN ('open', 'picking')
                            AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) ELSE 0 END,
    'dispatch', CASE WHEN has_permission('dispatch', 'read')
                    THEN (SELECT count(*) FROM t_sales_orders WHERE status IN ('picked', 'packed')
                            AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) ELSE 0 END,
    -- In transit towards the active warehouse, plus variances waiting for a decision.
    'transfer', CASE WHEN has_permission('stock-transfer', 'read')
                    THEN (SELECT count(*) FROM t_stock_transfers WHERE status = 'in_transit'
                            AND (p_warehouse_id IS NULL OR to_warehouse_id = p_warehouse_id))
                       + (SELECT count(*) FROM t_stock_transfer_lines l JOIN t_stock_transfers t ON t.id = l.transfer_id
                           WHERE l.variance_status = 'pending'
                             AND (p_warehouse_id IS NULL OR p_warehouse_id IN (t.from_warehouse_id, t.to_warehouse_id))) ELSE 0 END,
    'opname', CASE WHEN has_permission('stock-approval', 'update')
                    THEN (SELECT count(*) FROM t_stock_counts WHERE status = 'submitted'
                            AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) ELSE 0 END,
    'valuation', CASE WHEN has_permission('valuation', 'update')
                    THEN (SELECT count(DISTINCT sm.ref_id) FROM t_cost_layers c
                            JOIN t_stock_movements sm ON sm.id = c.source_movement_id
                           WHERE c.is_estimate) ELSE 0 END,
    'integration', CASE WHEN has_permission('integration', 'update')
                    THEN (SELECT count(*) FROM t_webhook_deliveries WHERE status = 'failed') ELSE 0 END
  );
$$;
REVOKE EXECUTE ON FUNCTION public.sidebar_counts(bigint) FROM PUBLIC, anon;
