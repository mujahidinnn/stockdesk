CREATE TABLE public.t_doc_counters (
    prefix text NOT NULL,
    period text NOT NULL,
    last_no integer NOT NULL,
    PRIMARY KEY (prefix, period)
);
ALTER TABLE public.t_doc_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.t_doc_counters FROM anon, authenticated;

-- GR/2026/09/0001; the upsert's row lock makes concurrent callers queue instead of sharing a number.
CREATE FUNCTION public.next_doc_no(p_prefix text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_period text := to_char(company_today(), 'YYYY/MM');
  v_no     integer;
BEGIN
  INSERT INTO t_doc_counters (prefix, period, last_no) VALUES (p_prefix, v_period, 1)
  ON CONFLICT (prefix, period) DO UPDATE SET last_no = t_doc_counters.last_no + 1
  RETURNING last_no INTO v_no;
  RETURN p_prefix || '/' || v_period || '/' || lpad(v_no::text, 4, '0');
END;
$$;

CREATE TABLE public.t_goods_receipts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gr_no text NOT NULL UNIQUE DEFAULT '', -- set by trg_goods_receipt_no
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    source_type text NOT NULL DEFAULT 'supplier'
      CHECK (source_type IN ('supplier', 'production', 'customer_return', 'client_inbound')),
    supplier_id bigint REFERENCES public.m_suppliers ON DELETE RESTRICT,
    customer_id bigint REFERENCES public.m_customers ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    receipt_date date NOT NULL DEFAULT public.company_today(),
    reference_no text,
    note text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'putaway_done', 'cancelled')),
    posted_at timestamptz,
    posted_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (source_type <> 'supplier' OR supplier_id IS NOT NULL),
    CONSTRAINT t_goods_receipts_customer_check CHECK (source_type = 'customer_return' OR customer_id IS NULL)
);
CREATE INDEX t_goods_receipts_wh_idx ON public.t_goods_receipts (warehouse_id, receipt_date DESC);
CREATE INDEX t_goods_receipts_status_idx ON public.t_goods_receipts (status);

-- The prefix comes from settings.
CREATE FUNCTION public.set_goods_receipt_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.gr_no := next_doc_no(COALESCE((SELECT doc_prefixes->>'receipt' FROM m_settings), 'GR'));
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_goods_receipt_no BEFORE INSERT ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_goods_receipt_no();

CREATE TABLE public.t_goods_receipt_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id bigint NOT NULL REFERENCES public.t_goods_receipts ON DELETE CASCADE,
    line_no integer NOT NULL DEFAULT 0, -- set by trg_receipt_line_no
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    uom_id bigint NOT NULL REFERENCES public.m_uoms ON DELETE RESTRICT,
    qty_received numeric(14,3) NOT NULL CHECK (qty_received > 0),
    qty_rejected numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_rejected >= 0),
    reject_reason text,
    batch_no text,
    mfg_date date,
    expiry_date date,
    -- Filled at posting, in base units.
    base_qty_accepted numeric(14,3),
    base_qty_rejected numeric(14,3),
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (receipt_id, line_no),
    CHECK (qty_rejected <= qty_received),
    CHECK (qty_rejected = 0 OR reject_reason IS NOT NULL),
    CHECK (expiry_date IS NULL OR mfg_date IS NULL OR expiry_date >= mfg_date)
);
CREATE INDEX t_goods_receipt_lines_sku_idx ON public.t_goods_receipt_lines (sku_id);

ALTER TABLE public.t_cogs_entries
  ADD FOREIGN KEY (receipt_line_id) REFERENCES public.t_goods_receipt_lines ON DELETE RESTRICT;

-- Kept apart so Workers can receive goods without seeing what they cost.
CREATE TABLE public.t_receipt_line_costs (
    receipt_line_id bigint PRIMARY KEY REFERENCES public.t_goods_receipt_lines ON DELETE CASCADE,
    unit_cost numeric(18,4) NOT NULL CHECK (unit_cost >= 0),
    currency text NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL
);

CREATE TABLE public.t_attachments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_table text NOT NULL CHECK (entity_table IN ('t_goods_receipt_lines')),
    entity_id bigint NOT NULL,
    storage_path text NOT NULL UNIQUE,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL CHECK (size_bytes > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles ON DELETE CASCADE,
    CHECK (storage_path LIKE entity_table || '/' || entity_id || '/%')
);
CREATE INDEX t_attachments_entity_idx ON public.t_attachments (entity_table, entity_id);

CREATE TABLE public.t_putaway_tasks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    receipt_id bigint REFERENCES public.t_goods_receipts ON DELETE RESTRICT,
    receipt_line_id bigint REFERENCES public.t_goods_receipt_lines ON DELETE RESTRICT,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    from_location_id bigint NOT NULL REFERENCES public.m_locations ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    qty_done numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_done >= 0),
    suggested_location_id bigint REFERENCES public.m_locations ON DELETE SET NULL,
    actual_location_id bigint REFERENCES public.m_locations ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    completed_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    CHECK (qty_done <= qty)
);
CREATE INDEX t_putaway_tasks_open_idx ON public.t_putaway_tasks (warehouse_id, created_at) WHERE status = 'open';
CREATE INDEX t_putaway_tasks_receipt_idx ON public.t_putaway_tasks (receipt_id);

-- Mirrors rankPutawayBins() in src/lib/putaway.ts; keep both in sync.
CREATE FUNCTION public.suggest_putaway_bins(p_sku_id bigint, p_qty numeric, p_warehouse_id bigint, p_batch_id bigint DEFAULT NULL)
RETURNS TABLE (location_id bigint, full_code text, rank integer, free_qty numeric, pick_sequence integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH sku AS (
    SELECT s.id, COALESCE(s.weight_kg, 0) AS weight, p.category_id
      FROM m_skus s JOIN m_products p ON p.id = s.product_id
     WHERE s.id = p_sku_id
       -- Also called while receiving (receipts, transfers, rejected variances).
       AND (has_permission('putaway', 'read') OR has_permission('goods-receipt', 'create')
            OR has_permission('stock-approval', 'update'))
  ), usage AS (
    SELECT b.location_id,
           sum(b.qty_on_hand) AS qty,
           sum(b.qty_on_hand * COALESCE(s.weight_kg, 0)) AS weight,
           bool_or(b.sku_id = p_sku_id AND b.batch_id IS NOT DISTINCT FROM p_batch_id AND b.qty_on_hand > 0) AS same
      FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id
      JOIN m_locations l ON l.id = b.location_id
     WHERE l.warehouse_id = p_warehouse_id
     GROUP BY b.location_id
  ), candidates AS (
    SELECT l.id, l.full_code, l.pick_sequence,
           COALESCE(u.qty, 0) AS used,
           l.max_qty - COALESCE(u.qty, 0) AS free,
           CASE WHEN COALESCE(u.same, false) THEN 1 WHEN COALESCE(u.qty, 0) = 0 THEN 2 ELSE 3 END AS rank
      FROM m_locations l
      CROSS JOIN sku
      LEFT JOIN usage u ON u.location_id = l.id
     WHERE l.warehouse_id = p_warehouse_id
       AND l.level = 'bin' AND l.bin_type IN ('storage', 'picking') AND l.is_active AND NOT l.is_counting
       AND (cardinality(l.allowed_category_ids) = 0 OR sku.category_id = ANY (l.allowed_category_ids))
       AND (l.max_qty IS NULL OR l.max_qty - COALESCE(u.qty, 0) >= p_qty)
       AND (l.max_weight_kg IS NULL OR l.max_weight_kg - COALESCE(u.weight, 0) >= p_qty * sku.weight)
  )
  SELECT id, full_code, rank, free, pick_sequence
    FROM candidates
   ORDER BY rank, pick_sequence, full_code
   LIMIT 5;
$$;

CREATE FUNCTION public.post_goods_receipt(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r        t_goods_receipts;
  l        t_goods_receipt_lines;
  v_sku    m_skus;
  v_owner  bigint;
  v_factor integer;
  v_base   numeric;
  v_rej    numeric;
  v_batch  bigint;
  v_cost   numeric;
  v_rcv    bigint;
  v_qrn    bigint;
  v_exp    date;
BEGIN
  IF NOT has_permission('goods-receipt', 'update') THEN
    RAISE EXCEPTION 'Not allowed to post goods receipts' USING errcode = '42501';
  END IF;
  SELECT * INTO r FROM t_goods_receipts WHERE id = p_id FOR UPDATE;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Goods receipt not found';
  END IF;
  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'Goods receipt % is already %', r.gr_no, r.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_goods_receipt_lines WHERE receipt_id = r.id) THEN
    RAISE EXCEPTION 'Goods receipt % has no lines', r.gr_no;
  END IF;

  SELECT id INTO v_rcv FROM m_locations WHERE warehouse_id = r.warehouse_id AND bin_type = 'receiving' AND is_active ORDER BY id LIMIT 1;
  SELECT id INTO v_qrn FROM m_locations WHERE warehouse_id = r.warehouse_id AND bin_type = 'quarantine' AND is_active ORDER BY id LIMIT 1;
  IF v_rcv IS NULL THEN
    RAISE EXCEPTION 'Warehouse has no active receiving bin';
  END IF;

  FOR l IN SELECT * FROM t_goods_receipt_lines WHERE receipt_id = r.id ORDER BY line_no LOOP
    SELECT * INTO v_sku FROM m_skus WHERE id = l.sku_id;
    SELECT p.owner_id INTO v_owner FROM m_products p WHERE p.id = v_sku.product_id;
    IF NOT v_sku.is_active THEN
      RAISE EXCEPTION 'Line %: SKU % is inactive', l.line_no, v_sku.sku_code;
    END IF;
    IF v_owner <> r.owner_id THEN
      RAISE EXCEPTION 'Line %: SKU % belongs to another owner', l.line_no, v_sku.sku_code;
    END IF;
    SELECT factor_to_base INTO v_factor FROM m_sku_uoms WHERE sku_id = l.sku_id AND uom_id = l.uom_id;
    IF v_factor IS NULL THEN
      RAISE EXCEPTION 'Line %: SKU % has no such unit', l.line_no, v_sku.sku_code;
    END IF;
    IF v_sku.track_batch AND COALESCE(l.batch_no, '') = '' THEN
      RAISE EXCEPTION 'Line %: SKU % needs a batch number', l.line_no, v_sku.sku_code;
    END IF;
    IF v_sku.track_expiry AND l.expiry_date IS NULL THEN
      RAISE EXCEPTION 'Line %: SKU % needs an expiry date', l.line_no, v_sku.sku_code;
    END IF;

    v_base := round(l.qty_received * v_factor, 3);
    v_rej  := round(l.qty_rejected * v_factor, 3);
    v_batch := NULL;
    IF COALESCE(l.batch_no, '') <> '' THEN
      INSERT INTO m_batches (sku_id, batch_no, mfg_date, expiry_date, received_at)
      VALUES (l.sku_id, upper(trim(l.batch_no)), l.mfg_date, l.expiry_date, r.receipt_date)
      ON CONFLICT (sku_id, batch_no) DO NOTHING
      RETURNING id INTO v_batch;
      IF v_batch IS NULL THEN
        SELECT id, expiry_date INTO v_batch, v_exp FROM m_batches WHERE sku_id = l.sku_id AND batch_no = upper(trim(l.batch_no));
        IF l.expiry_date IS DISTINCT FROM v_exp AND l.expiry_date IS NOT NULL THEN
          RAISE EXCEPTION 'Line %: batch % was received before with expiry %', l.line_no, l.batch_no, v_exp;
        END IF;
      END IF;
    END IF;

    -- Cost per base unit; with no price entered the ledger uses the running average.
    SELECT unit_cost / v_factor INTO v_cost FROM t_receipt_line_costs WHERE receipt_line_id = l.id;

    IF v_base - v_rej > 0 THEN
      PERFORM post_stock_movement('receipt', l.sku_id, v_base - v_rej, NULL, v_rcv, v_batch, v_cost,
                                  'goods_receipt', r.id, r.gr_no, NULL, r.receipt_date);
      INSERT INTO t_putaway_tasks (receipt_id, receipt_line_id, warehouse_id, sku_id, batch_id, from_location_id, qty, suggested_location_id)
      VALUES (r.id, l.id, r.warehouse_id, l.sku_id, v_batch, v_rcv, v_base - v_rej,
              (SELECT location_id FROM suggest_putaway_bins(l.sku_id, v_base - v_rej, r.warehouse_id, v_batch) LIMIT 1));
    END IF;
    IF v_rej > 0 THEN
      IF v_qrn IS NULL THEN
        RAISE EXCEPTION 'Warehouse has no active quarantine bin for QC rejects';
      END IF;
      PERFORM post_stock_movement('qc_reject', l.sku_id, v_rej, NULL, v_qrn, v_batch, v_cost,
                                  'goods_receipt', r.id, r.gr_no, l.reject_reason, r.receipt_date);
    END IF;

    UPDATE t_goods_receipt_lines
       SET base_qty_accepted = v_base - v_rej, base_qty_rejected = v_rej, batch_id = v_batch
     WHERE id = l.id;
  END LOOP;

  UPDATE t_goods_receipts
     SET status = CASE WHEN EXISTS (SELECT 1 FROM t_putaway_tasks WHERE receipt_id = r.id) THEN 'received' ELSE 'putaway_done' END,
         posted_at = now(), posted_by = auth.uid()
   WHERE id = r.id;
END;
$$;

CREATE FUNCTION public.complete_putaway(p_task_id bigint, p_location_id bigint, p_qty numeric, p_request_id uuid DEFAULT NULL)
RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  t     t_putaway_tasks;
  v_to  m_locations;
  v_mv  bigint;
BEGIN
  IF NOT has_permission('putaway', 'update') THEN
    RAISE EXCEPTION 'Not allowed to put stock away' USING errcode = '42501';
  END IF;
  SELECT * INTO t FROM t_putaway_tasks WHERE id = p_task_id FOR UPDATE;
  -- Checked after the lock, so a retry waits for the first call and then sees its movement.
  SELECT id INTO v_mv FROM t_stock_movements WHERE request_id = p_request_id;
  IF v_mv IS NOT NULL THEN
    RETURN v_mv;
  END IF;
  IF t.id IS NULL OR t.status <> 'open' THEN
    RAISE EXCEPTION 'Putaway task is not open';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 OR p_qty > t.qty - t.qty_done THEN
    RAISE EXCEPTION 'Quantity must be between 0 and the % still to put away', t.qty - t.qty_done;
  END IF;
  SELECT * INTO v_to FROM m_locations WHERE id = p_location_id;
  IF v_to.warehouse_id IS DISTINCT FROM t.warehouse_id OR v_to.level <> 'bin' OR v_to.bin_type NOT IN ('storage', 'picking') THEN
    RAISE EXCEPTION 'Put stock into a storage or picking bin of the same warehouse';
  END IF;
  -- Category rules count here too, not only in the suggestion list.
  IF cardinality(v_to.allowed_category_ids) > 0 AND NOT EXISTS (
       SELECT 1 FROM m_skus s JOIN m_products p ON p.id = s.product_id
        WHERE s.id = t.sku_id AND p.category_id = ANY (v_to.allowed_category_ids)) THEN
    RAISE EXCEPTION 'Bin % does not take this category', v_to.full_code;
  END IF;

  -- Capacity is enforced by the ledger trigger.
  v_mv := post_stock_movement('putaway', t.sku_id, p_qty, t.from_location_id, p_location_id, t.batch_id, NULL,
                              'putaway_task', t.id, (SELECT gr_no FROM t_goods_receipts WHERE id = t.receipt_id),
                              NULL, NULL, p_request_id);

  UPDATE t_putaway_tasks
     SET qty_done = qty_done + p_qty,
         actual_location_id = p_location_id,
         status = CASE WHEN qty_done + p_qty >= qty THEN 'done' ELSE 'open' END,
         completed_at = CASE WHEN qty_done + p_qty >= qty THEN now() END,
         completed_by = auth.uid()
   WHERE id = t.id;

  IF t.receipt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM t_putaway_tasks WHERE receipt_id = t.receipt_id AND status = 'open') THEN
    UPDATE t_goods_receipts SET status = 'putaway_done' WHERE id = t.receipt_id AND status = 'received';
  END IF;
  RETURN v_mv;
END;
$$;

CREATE FUNCTION public.set_receipt_line_no() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.line_no IS NULL OR NEW.line_no = 0 THEN
    NEW.line_no := COALESCE((SELECT max(line_no) FROM t_goods_receipt_lines WHERE receipt_id = NEW.receipt_id), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_receipt_line_no BEFORE INSERT ON public.t_goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_receipt_line_no();

CREATE FUNCTION public.guard_goods_receipt() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.gr_no <> NEW.gr_no THEN
    RAISE EXCEPTION 'The receipt number cannot change';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_goods_receipt BEFORE UPDATE ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_goods_receipt();

CREATE FUNCTION public.guard_receipt_source() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.source_type = 'customer_return' AND NEW.customer_id IS NULL THEN
    RAISE EXCEPTION 'A customer return needs a customer';
  END IF;
  IF NEW.source_type = 'client_inbound'
     AND (SELECT owner_type FROM m_owners WHERE id = NEW.owner_id) IS DISTINCT FROM 'client' THEN
    RAISE EXCEPTION 'Client inbound receives stock of a client owner only';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_receipt_source BEFORE INSERT OR UPDATE OF source_type, customer_id, owner_id ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_source();

CREATE TRIGGER trg_guard_document_status BEFORE UPDATE OR DELETE ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_status('draft');

CREATE TRIGGER trg_t_goods_receipts_updated_at BEFORE UPDATE ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_t_goods_receipt_lines_updated_at BEFORE UPDATE ON public.t_goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_t_receipt_line_costs_updated_at BEFORE UPDATE ON public.t_receipt_line_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.cancel_goods_receipt(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('goods-receipt', 'update') THEN
    RAISE EXCEPTION 'Not allowed to cancel goods receipts' USING errcode = '42501';
  END IF;
  IF (SELECT status FROM t_goods_receipts WHERE id = p_id FOR UPDATE) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft goods receipt can be cancelled';
  END IF;
  UPDATE t_goods_receipts SET status = 'cancelled' WHERE id = p_id;
END;
$$;

-- p_costs: [{"line_id":1,"unit_cost":12500}] per line unit; null removes the price.
-- Posted receipts are corrected with revalue_receipt instead.
CREATE FUNCTION public.set_receipt_costs(p_receipt_id bigint, p_costs jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c record;
BEGIN
  IF NOT has_permission('valuation', 'update') THEN
    RAISE EXCEPTION 'Not allowed to enter costs' USING errcode = '42501';
  END IF;
  IF (SELECT status FROM t_goods_receipts WHERE id = p_receipt_id FOR UPDATE) IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Prices of a posted receipt change through revaluation';
  END IF;
  FOR c IN SELECT * FROM jsonb_to_recordset(p_costs) AS x(line_id bigint, unit_cost numeric) LOOP
    IF NOT EXISTS (SELECT 1 FROM t_goods_receipt_lines WHERE id = c.line_id AND receipt_id = p_receipt_id) THEN
      RAISE EXCEPTION 'Line % is not on this receipt', c.line_id;
    END IF;
    IF c.unit_cost IS NULL THEN
      DELETE FROM t_receipt_line_costs WHERE receipt_line_id = c.line_id;
    ELSIF c.unit_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost cannot be negative';
    ELSE
      INSERT INTO t_receipt_line_costs (receipt_line_id, unit_cost) VALUES (c.line_id, c.unit_cost)
      ON CONFLICT (receipt_line_id) DO UPDATE SET unit_cost = EXCLUDED.unit_cost, updated_by = auth.uid();
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.t_goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_receipt_line_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_putaway_tasks ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.receipt_is_draft(p_receipt_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM t_goods_receipts WHERE id = p_receipt_id AND status = 'draft');
$$;

CREATE FUNCTION public.receipt_line_is_draft(p_line_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM t_goods_receipt_lines l JOIN t_goods_receipts r ON r.id = l.receipt_id
                  WHERE l.id = p_line_id AND r.status = 'draft');
$$;

CREATE POLICY gr_select ON public.t_goods_receipts FOR SELECT TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'read')));
CREATE POLICY gr_insert ON public.t_goods_receipts FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('goods-receipt', 'create')) AND status = 'draft');
-- Only draft edits; posting and cancelling go through the RPCs.
CREATE POLICY gr_update ON public.t_goods_receipts FOR UPDATE TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'update')) AND status = 'draft')
  WITH CHECK ((SELECT has_permission('goods-receipt', 'update')) AND status = 'draft');
CREATE POLICY gr_delete ON public.t_goods_receipts FOR DELETE TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'delete')) AND status IN ('draft', 'cancelled'));

CREATE POLICY grl_select ON public.t_goods_receipt_lines FOR SELECT TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'read')));
CREATE POLICY grl_insert ON public.t_goods_receipt_lines FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('goods-receipt', 'create')) AND receipt_is_draft(receipt_id)
              AND base_qty_accepted IS NULL AND base_qty_rejected IS NULL AND batch_id IS NULL);
CREATE POLICY grl_update ON public.t_goods_receipt_lines FOR UPDATE TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'update')) AND receipt_is_draft(receipt_id))
  WITH CHECK (receipt_is_draft(receipt_id) AND base_qty_accepted IS NULL AND base_qty_rejected IS NULL AND batch_id IS NULL);
CREATE POLICY grl_delete ON public.t_goods_receipt_lines FOR DELETE TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'update')) AND receipt_is_draft(receipt_id));

-- Prices: valuation readers only; writes go through set_receipt_costs.
CREATE POLICY grc_select ON public.t_receipt_line_costs FOR SELECT TO authenticated
  USING ((SELECT has_permission('valuation', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_receipt_line_costs FROM anon, authenticated;

CREATE POLICY attachments_select ON public.t_attachments FOR SELECT TO authenticated
  USING ((SELECT has_permission('goods-receipt', 'read')));
CREATE POLICY attachments_insert ON public.t_attachments FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND (SELECT has_permission('goods-receipt', 'create')));
-- The uploader may remove their own file only while the receipt is a draft.
CREATE POLICY attachments_delete ON public.t_attachments FOR DELETE TO authenticated
  USING ((created_by = (SELECT auth.uid()) AND receipt_line_is_draft(entity_id))
         OR (SELECT has_permission('goods-receipt', 'update')));

CREATE POLICY putaway_select ON public.t_putaway_tasks FOR SELECT TO authenticated
  USING ((SELECT has_permission('putaway', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_putaway_tasks FROM anon, authenticated;

-- The storage schema survives a db reset, so the bucket is upserted and policies are dropped before create.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attachments', 'attachments', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS attachments_read ON storage.objects;
CREATE POLICY attachments_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attachments' AND (SELECT public.has_permission('goods-receipt', 'read')));
DROP POLICY IF EXISTS attachments_upload ON storage.objects;
CREATE POLICY attachments_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = 't_goods_receipt_lines'
              AND (SELECT public.has_permission('goods-receipt', 'create')));
-- Path is t_goods_receipt_lines/<line id>/<file>; same draft rule as attachments_delete.
DROP POLICY IF EXISTS attachments_remove ON storage.objects;
CREATE POLICY attachments_remove ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'attachments' AND (
    (owner_id = (SELECT auth.uid())::text
      AND (storage.foldername(name))[2] ~ '^[0-9]+$'
      AND public.receipt_line_is_draft(((storage.foldername(name))[2])::bigint))
    OR (SELECT public.has_permission('goods-receipt', 'update'))));

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_putaway_tasks;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.next_doc_no(text), public.guard_receipt_source() FROM authenticated;
