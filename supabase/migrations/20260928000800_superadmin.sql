-- Anyone may ask whether this is the public demo, so the login page can offer demo accounts.
CREATE FUNCTION public.public_demo_mode() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT demo_mode FROM m_settings;
$$;

-- Public demo: webhooks only to safe hosts, so the demo can't be used against others.
CREATE FUNCTION public.guard_demo_webhook() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT demo_mode FROM m_settings)
     AND NOT (NEW.url LIKE 'https://webhook.site/%' OR NEW.url LIKE 'https://example.com/%') THEN
    RAISE EXCEPTION 'The demo only sends webhooks to https://webhook.site/ or https://example.com/';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_demo_webhook BEFORE INSERT OR UPDATE OF url ON public.t_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.guard_demo_webhook();

-- Demo logins are public: in demo mode Auth API changes are refused; the seed runs as table owner and can still reset them.
CREATE FUNCTION public.lock_demo_credentials() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user = 'supabase_auth_admin'
     AND (SELECT demo_mode FROM m_settings WHERE id = 1)
     AND (OLD.email = 'admin@stockdesk.com' OR OLD.email LIKE '%@stockdesk.demo')
     AND (NEW.email IS DISTINCT FROM OLD.email
       OR NEW.email_change IS DISTINCT FROM OLD.email_change
       OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
       OR NEW.banned_until IS DISTINCT FROM OLD.banned_until) THEN
    RAISE EXCEPTION 'Demo account credentials are locked';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lock_demo_credentials ON auth.users;
CREATE TRIGGER lock_demo_credentials BEFORE UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.lock_demo_credentials();

-- Creates or resets a login with a fixed id. Internal (seed and wipe).
CREATE FUNCTION public.upsert_login(p_id uuid, p_email text, p_password text, p_full_name text, p_role text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $$
DECLARE
  v_id uuid := COALESCE((SELECT id FROM auth.users WHERE email = p_email), p_id);
  v_claims text;
BEGIN
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  VALUES ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          crypt(p_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}',
          jsonb_build_object('full_name', p_full_name), now(), now(), '', '', '', '')
  ON CONFLICT (id) DO UPDATE
    SET encrypted_password = EXCLUDED.encrypted_password, banned_until = NULL, updated_at = now();
  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, v_id::text,
          jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
          'email', now(), now(), now())
  ON CONFLICT (provider_id, provider) DO NOTHING;
  -- A superadmin caller holds Admin and the rank guard would refuse giving Admin to someone else:
  -- act as the service role for this one update, then restore the caller.
  v_claims := current_setting('request.jwt.claims', true);
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE profiles SET full_name = p_full_name, role_id = (SELECT id FROM m_roles WHERE role_name = p_role) WHERE id = v_id;
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims, ''), true);
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.ensure_default_admin() RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT upsert_login('00000000-0000-4000-8000-000000000001', 'admin@stockdesk.com', 'Admin123!', 'Admin', 'Admin');
$$;

CREATE FUNCTION public.superadmin_stats() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  v_counts jsonb := '{}';
  r        record;
  v_n      bigint;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  FOR r IN SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.t) INTO v_n;
    v_counts := v_counts || jsonb_build_object(r.t, v_n);
  END LOOP;
  RETURN jsonb_build_object(
    'tables', v_counts,
    'accounts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', u.email, 'role', r2.role_name, 'is_superadmin', p.is_superadmin,
        'banned', u.banned_until IS NOT NULL AND u.banned_until > now(), 'last_sign_in_at', u.last_sign_in_at
      ) ORDER BY u.last_sign_in_at DESC NULLS LAST), '[]')
        FROM profiles p JOIN auth.users u ON u.id = p.id LEFT JOIN m_roles r2 ON r2.id = p.role_id),
    'recent_audit', (
      SELECT COALESCE(jsonb_agg(a ORDER BY a.created_at DESC), '[]')
        FROM (SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, p.full_name AS actor
                FROM t_audit_log a LEFT JOIN profiles p ON p.id = a.actor_id ORDER BY a.created_at DESC LIMIT 20) a),
    'activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', h.hour, 'kind', h.kind, 'n', h.n) ORDER BY h.hour), '[]')
        FROM (SELECT date_trunc('hour', created_at) AS hour, 'audit' AS kind, count(*) AS n
                FROM t_audit_log WHERE created_at >= now() - interval '7 days' GROUP BY 1
              UNION ALL
              SELECT date_trunc('hour', created_at), 'movement', count(*)
                FROM t_stock_movements WHERE created_at >= now() - interval '7 days' GROUP BY 1) h)
  );
END;
$$;

CREATE FUNCTION public.superadmin_monitor() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'storage'
    AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  RETURN jsonb_build_object(
    'failed_logins', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT context->>'email' AS email, message, created_at FROM t_error_log
               WHERE source = 'auth.login' AND created_at >= now() - interval '7 days'
               ORDER BY created_at DESC LIMIT 20) x),
    'inactive_accounts', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.last_sign_in_at NULLS FIRST), '[]')
        FROM (SELECT p.full_name, u.email, u.last_sign_in_at FROM profiles p JOIN auth.users u ON u.id = p.id
               WHERE NOT p.is_superadmin AND (u.banned_until IS NULL OR u.banned_until <= now())
                 AND (u.last_sign_in_at IS NULL OR u.last_sign_in_at < now() - interval '30 days')) x),
    'access_changes', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT a.action, a.entity_type, a.entity_id, a.created_at, p.full_name AS actor
                FROM t_audit_log a LEFT JOIN profiles p ON p.id = a.actor_id
               WHERE a.entity_type IN ('user', 'role_permission', 'access_override', 'api_key', 'webhook')
                  OR (a.entity_type = 'profile' AND a.action = 'update'
                      AND (a.detail->'before'->'role_id' IS DISTINCT FROM a.detail->'after'->'role_id'
                        OR a.detail->'before'->'is_superadmin' IS DISTINCT FROM a.detail->'after'->'is_superadmin'))
               ORDER BY a.created_at DESC LIMIT 20) x),
    -- Keys close to the 60/minute limit in the last hour, and keys still tried after revoking.
    'api_keys', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.peak DESC), '[]')
        FROM (SELECT k.name, k.prefix, k.revoked_at IS NOT NULL AS revoked, max(m.n) AS peak,
                     count(*) FILTER (WHERE k.revoked_at IS NOT NULL AND m.minute > k.revoked_at) AS after_revoke
                FROM t_api_keys k
                JOIN (SELECT api_key_id, date_trunc('minute', created_at) AS minute, count(*) AS n
                        FROM t_api_request_log WHERE created_at >= now() - interval '1 hour' GROUP BY 1, 2) m
                  ON m.api_key_id = k.id
               GROUP BY k.id
              HAVING max(m.n) >= 45 OR count(*) FILTER (WHERE k.revoked_at IS NOT NULL AND m.minute > k.revoked_at) > 0) x),
    'webhooks', (
      SELECT COALESCE(jsonb_agg(x), '[]')
        FROM (SELECT w.url, w.is_active, w.disabled_reason, w.failure_streak,
                     (SELECT count(*) FROM t_webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed
                FROM t_webhooks w
               WHERE NOT w.is_active OR w.failure_streak > 0
                  OR EXISTS (SELECT 1 FROM t_webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed')) x),
    'storage', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.bytes DESC), '[]')
        FROM (SELECT bucket_id AS bucket, count(*) AS files, COALESCE(sum((metadata->>'size')::bigint), 0) AS bytes
                FROM storage.objects GROUP BY bucket_id) x),
    'errors', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.created_at DESC), '[]')
        FROM (SELECT e.source, e.message, e.created_at, p.full_name AS user_name
                FROM t_error_log e LEFT JOIN profiles p ON p.id = e.user_id
               WHERE e.source <> 'auth.login' ORDER BY e.created_at DESC LIMIT 20) x)
  );
END;
$$;

-- Clears every transaction and master row, keeping default data (settings, roles, features, permissions,
-- default units, the INTERNAL owner, the Umum category) and superadmins. admin@stockdesk.com survives only in demo mode.
-- Hosted Supabase loads pg_safeupdate: every UPDATE/DELETE here needs a WHERE clause.
CREATE FUNCTION public.wipe_all_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'storage'
    AS $$
DECLARE
  v_users bigint;
  v_demo  boolean := COALESCE((SELECT demo_mode FROM m_settings WHERE id = 1), false);
BEGIN
  PERFORM set_config('stockdesk.wipe', 'on', true);
  TRUNCATE t_webhook_deliveries, t_webhook_secrets, t_webhooks, t_api_idempotency, t_api_request_log, t_api_keys,
           t_stock_value_snapshots, t_avg_cost_log, t_cogs_entries, t_cost_layers, m_sku_costs,
           t_stock_count_counters, t_stock_count_lines, t_stock_counts, t_stock_transfer_lines, t_stock_transfers,
           t_shipment_items, t_shipments, t_pick_list_lines, t_pick_lists, t_sales_order_lines, t_sales_orders,
           t_putaway_tasks, t_receipt_line_costs, t_goods_receipt_lines, t_goods_receipts, t_attachments,
           t_stock_balances, t_stock_movements, m_batches, m_sku_uoms, m_skus, m_products,
           m_locations, m_warehouses, m_customers, m_suppliers,
           t_doc_counters, t_notifications, t_audit_log, t_error_log, t_user_access_override
    RESTART IDENTITY;
  DELETE FROM m_categories WHERE code <> 'UMUM';
  DELETE FROM m_owners WHERE code <> 'INTERNAL';
  DELETE FROM m_uoms WHERE code NOT IN ('PCS', 'PACK', 'BOX', 'CTN', 'LUSIN', 'SET', 'ROLL', 'KG', 'GR', 'L', 'ML');
  UPDATE m_settings SET locked_until = NULL WHERE id = 1;
  -- ponytail: newer Storage refuses SQL deletes; files then stay orphaned until removed via the Storage API.
  BEGIN
    DELETE FROM storage.objects WHERE bucket_id = 'attachments';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  DELETE FROM auth.users
   WHERE id NOT IN (SELECT id FROM profiles WHERE is_superadmin)
     AND (NOT v_demo OR email <> 'admin@stockdesk.com');
  GET DIAGNOSTICS v_users = ROW_COUNT;
  IF v_demo THEN
    PERFORM ensure_default_admin();
  END IF;
  PERFORM set_config('stockdesk.wipe', '', true);
  RETURN jsonb_build_object('deleted_accounts', v_users);
END;
$$;

-- Typing WIPE on the superadmin page is the confirmation (owner's choice: no company-name check).
CREATE FUNCTION public.superadmin_wipe_all_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  RETURN wipe_all_data();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.public_demo_mode() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_demo_mode() TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.superadmin_stats(), public.superadmin_monitor(), public.superadmin_wipe_all_data()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_demo_webhook(), public.lock_demo_credentials(),
  public.upsert_login(uuid, text, text, text, text), public.ensure_default_admin(), public.wipe_all_data()
  FROM PUBLIC, anon, authenticated;
