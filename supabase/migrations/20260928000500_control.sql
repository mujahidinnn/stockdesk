-- Approving counts and transfer variances is its own feature; the argument only keeps call sites readable.
CREATE FUNCTION public.can_approve(p_feature text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT has_permission('stock-approval', 'update');
$$;

CREATE TABLE public.t_stock_transfers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_no text NOT NULL UNIQUE DEFAULT '',
    transfer_type text NOT NULL CHECK (transfer_type IN ('bin_to_bin', 'inter_warehouse')),
    from_warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    to_warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_transit', 'received', 'done', 'cancelled')),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    sent_at timestamptz,
    sent_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    received_at timestamptz,
    received_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    CHECK ((transfer_type = 'bin_to_bin') = (from_warehouse_id = to_warehouse_id))
);
CREATE INDEX t_stock_transfers_status_idx ON public.t_stock_transfers (status, created_at DESC);

CREATE TABLE public.t_stock_transfer_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transfer_id bigint NOT NULL REFERENCES public.t_stock_transfers ON DELETE CASCADE,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    from_location_id bigint NOT NULL REFERENCES public.m_locations ON DELETE RESTRICT,
    to_location_id bigint REFERENCES public.m_locations ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    qty_received numeric(14,3) CHECK (qty_received >= 0),
    variance_reason text,
    -- none: nothing missing; pending: waiting for a manager; approved: written off; rejected: back to origin.
    variance_status text NOT NULL DEFAULT 'none' CHECK (variance_status IN ('none', 'pending', 'approved', 'rejected')),
    variance_decided_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    variance_decided_at timestamptz,
    CHECK (qty_received IS NULL OR qty_received <= qty)
);
CREATE INDEX t_stock_transfer_lines_transfer_idx ON public.t_stock_transfer_lines (transfer_id);

CREATE TABLE public.t_stock_counts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    count_no text NOT NULL UNIQUE DEFAULT '',
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    -- Empty scope = the whole warehouse. Locations may be zones, aisles, racks or bins.
    scope_location_ids bigint[] NOT NULL DEFAULT '{}',
    scope_category_id bigint REFERENCES public.m_categories ON DELETE RESTRICT,
    blind boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'counting', 'submitted', 'approved', 'rejected', 'cancelled')),
    note text,
    reject_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    started_at timestamptz,
    submitted_at timestamptz,
    submitted_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    decided_at timestamptz,
    decided_by uuid REFERENCES public.profiles ON DELETE SET NULL
);

CREATE TABLE public.t_stock_count_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    count_id bigint NOT NULL REFERENCES public.t_stock_counts ON DELETE CASCADE,
    location_id bigint NOT NULL REFERENCES public.m_locations ON DELETE RESTRICT,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    -- Snapshot at start. Not readable by counters on a blind count (column grants below).
    system_qty numeric(14,3) NOT NULL DEFAULT 0,
    counted_qty numeric(14,3) CHECK (counted_qty >= 0),
    counted_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    counted_at timestamptz,
    UNIQUE NULLS NOT DISTINCT (count_id, location_id, sku_id, batch_id)
);
CREATE INDEX t_stock_count_lines_count_idx ON public.t_stock_count_lines (count_id, location_id);

-- Everyone who recorded a line on the count; none of them may approve or reject it.
CREATE TABLE public.t_stock_count_counters (
    count_id bigint NOT NULL REFERENCES public.t_stock_counts ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
    first_counted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (count_id, user_id)
);
CREATE INDEX t_stock_count_counters_user_idx ON public.t_stock_count_counters (user_id);

CREATE TRIGGER trg_transfer_no BEFORE INSERT ON public.t_stock_transfers FOR EACH ROW EXECUTE FUNCTION public.set_outbound_doc_no();
CREATE TRIGGER trg_count_no BEFORE INSERT ON public.t_stock_counts FOR EACH ROW EXECUTE FUNCTION public.set_outbound_doc_no();
CREATE TRIGGER trg_guard_document_status BEFORE UPDATE OR DELETE ON public.t_stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_status('draft');
CREATE TRIGGER trg_guard_document_status BEFORE UPDATE OR DELETE ON public.t_stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_status('draft');

-- Bins being counted are frozen until the count closes (closing unlocks them first).
CREATE FUNCTION public.guard_counting_bins() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM m_locations WHERE id IN (NEW.from_location_id, NEW.to_location_id) AND is_counting) THEN
    RAISE EXCEPTION 'Bin is being counted; stock there cannot move until the count is closed' USING errcode = '55006';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_counting_bins BEFORE INSERT ON public.t_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_counting_bins();

-- Whoever counted or submitted a count does not also approve or reject it.
CREATE FUNCTION public.guard_approval_self() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.status IN ('approved', 'rejected') AND OLD.status IS DISTINCT FROM NEW.status
     AND (auth.uid() = OLD.submitted_by
          OR EXISTS (SELECT 1 FROM t_stock_count_counters WHERE count_id = OLD.id AND user_id = auth.uid())) THEN
    RAISE EXCEPTION 'Whoever counted or submitted the count cannot approve or reject it';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_approval_self BEFORE UPDATE ON public.t_stock_counts
  FOR EACH ROW EXECUTE FUNCTION public.guard_approval_self();

CREATE FUNCTION public.create_bin_transfer(p_from_location_id bigint, p_to_location_id bigint, p_sku_id bigint,
                                           p_batch_id bigint, p_qty numeric, p_note text DEFAULT NULL) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_from m_locations;
  v_to   m_locations;
  v_id   bigint;
BEGIN
  IF NOT has_permission('stock-transfer', 'create') THEN
    RAISE EXCEPTION 'Not allowed to move stock' USING errcode = '42501';
  END IF;
  SELECT * INTO v_from FROM m_locations WHERE id = p_from_location_id;
  SELECT * INTO v_to FROM m_locations WHERE id = p_to_location_id;
  IF v_from.warehouse_id IS DISTINCT FROM v_to.warehouse_id THEN
    RAISE EXCEPTION 'Bin to bin moves stay inside one warehouse; use an inter-warehouse transfer';
  END IF;
  IF v_from.level IS DISTINCT FROM 'bin' OR v_from.bin_type NOT IN ('storage', 'picking', 'quarantine') THEN
    RAISE EXCEPTION 'Move stock out of a storage, picking or quarantine bin';
  END IF;
  IF v_to.level <> 'bin' OR v_to.bin_type NOT IN ('storage', 'picking') THEN
    RAISE EXCEPTION 'Move stock into a storage or picking bin';
  END IF;

  INSERT INTO t_stock_transfers (transfer_type, from_warehouse_id, to_warehouse_id, status, note, sent_at, sent_by, received_at, received_by)
  VALUES ('bin_to_bin', v_from.warehouse_id, v_to.warehouse_id, 'done', NULLIF(trim(p_note), ''), now(), auth.uid(), now(), auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO t_stock_transfer_lines (transfer_id, sku_id, batch_id, from_location_id, to_location_id, qty, qty_received)
  VALUES (v_id, p_sku_id, p_batch_id, p_from_location_id, p_to_location_id, p_qty, p_qty);
  PERFORM post_stock_movement('bin_transfer', p_sku_id, p_qty, p_from_location_id, p_to_location_id, p_batch_id, NULL,
                              'stock_transfer', v_id, (SELECT transfer_no FROM t_stock_transfers WHERE id = v_id), NULLIF(trim(p_note), ''));
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.send_transfer(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  t       t_stock_transfers;
  l       t_stock_transfer_lines;
  v_from  m_locations;
  v_trans bigint;
BEGIN
  IF NOT has_permission('stock-transfer', 'update') THEN
    RAISE EXCEPTION 'Not allowed to send transfers' USING errcode = '42501';
  END IF;
  SELECT * INTO t FROM t_stock_transfers WHERE id = p_id FOR UPDATE;
  IF t.status IS DISTINCT FROM 'draft' OR t.transfer_type <> 'inter_warehouse' THEN
    RAISE EXCEPTION 'Only a draft inter-warehouse transfer can be sent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM t_stock_transfer_lines WHERE transfer_id = t.id) THEN
    RAISE EXCEPTION 'Transfer has no lines';
  END IF;
  SELECT id INTO v_trans FROM m_locations WHERE warehouse_id = t.from_warehouse_id AND bin_type = 'in_transit' ORDER BY id LIMIT 1;
  FOR l IN SELECT * FROM t_stock_transfer_lines WHERE transfer_id = t.id LOOP
    SELECT * INTO v_from FROM m_locations WHERE id = l.from_location_id;
    IF v_from.warehouse_id <> t.from_warehouse_id THEN
      RAISE EXCEPTION 'A line takes stock from another warehouse';
    END IF;
    IF v_from.level IS DISTINCT FROM 'bin' OR v_from.bin_type NOT IN ('storage', 'picking', 'quarantine') THEN
      RAISE EXCEPTION 'Send stock from a storage, picking or quarantine bin, not %', v_from.full_code;
    END IF;
    PERFORM post_stock_movement('transfer_out', l.sku_id, l.qty, l.from_location_id, v_trans, l.batch_id, NULL,
                                'stock_transfer', t.id, t.transfer_no);
  END LOOP;
  UPDATE t_stock_transfers SET status = 'in_transit', sent_at = now(), sent_by = auth.uid() WHERE id = t.id;
END;
$$;

-- What arrived moves from transit into the destination's receiving bin with a putaway task.
-- Missing qty stays in transit until a manager (not the receiver) decides the variance.
-- p_lines: [{"line_id":1,"qty_received":10,"reason":"..."}]
CREATE FUNCTION public.receive_transfer(p_id bigint, p_lines jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  t       t_stock_transfers;
  l       t_stock_transfer_lines;
  v_in    jsonb;
  v_qty   numeric;
  v_trans bigint;
  v_rcv   bigint;
BEGIN
  -- Receiving is inbound work at the destination, so it takes goods-receipt create.
  IF NOT has_permission('goods-receipt', 'create') THEN
    RAISE EXCEPTION 'Not allowed to receive transfers' USING errcode = '42501';
  END IF;
  SELECT * INTO t FROM t_stock_transfers WHERE id = p_id FOR UPDATE;
  IF t.status IS DISTINCT FROM 'in_transit' THEN
    RAISE EXCEPTION 'Transfer is not in transit';
  END IF;
  SELECT id INTO v_trans FROM m_locations WHERE warehouse_id = t.from_warehouse_id AND bin_type = 'in_transit' ORDER BY id LIMIT 1;
  SELECT id INTO v_rcv FROM m_locations WHERE warehouse_id = t.to_warehouse_id AND bin_type = 'receiving' AND is_active ORDER BY id LIMIT 1;

  FOR l IN SELECT * FROM t_stock_transfer_lines WHERE transfer_id = t.id FOR UPDATE LOOP
    SELECT x INTO v_in FROM jsonb_array_elements(p_lines) x WHERE (x->>'line_id')::bigint = l.id;
    IF v_in IS NULL THEN
      RAISE EXCEPTION 'Every line needs a received quantity';
    END IF;
    v_qty := (v_in->>'qty_received')::numeric;
    IF v_qty < 0 OR v_qty > l.qty THEN
      RAISE EXCEPTION 'Received quantity must be between 0 and %', l.qty;
    END IF;
    IF v_qty < l.qty AND COALESCE(trim(v_in->>'reason'), '') = '' THEN
      RAISE EXCEPTION 'Explain why less arrived than was sent';
    END IF;
    IF v_qty > 0 THEN
      PERFORM post_stock_movement('transfer_in', l.sku_id, v_qty, v_trans, v_rcv, l.batch_id, NULL,
                                  'stock_transfer', t.id, t.transfer_no);
      INSERT INTO t_putaway_tasks (warehouse_id, sku_id, batch_id, from_location_id, qty, suggested_location_id)
      VALUES (t.to_warehouse_id, l.sku_id, l.batch_id, v_rcv, v_qty,
              (SELECT location_id FROM suggest_putaway_bins(l.sku_id, v_qty, t.to_warehouse_id, l.batch_id) LIMIT 1));
    END IF;
    UPDATE t_stock_transfer_lines
       SET qty_received = v_qty,
           variance_reason = CASE WHEN v_qty < qty THEN trim(v_in->>'reason') END,
           variance_status = CASE WHEN v_qty < qty THEN 'pending' ELSE 'none' END
     WHERE id = l.id;
  END LOOP;
  UPDATE t_stock_transfers SET status = 'received', received_at = now(), received_by = auth.uid() WHERE id = t.id;
END;
$$;

-- Approve writes the missing units off transit (costed adjustment); reject returns them to the origin's receiving bin for putaway.
CREATE FUNCTION public.approve_transfer_variance(p_line_id bigint, p_approve boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  l       t_stock_transfer_lines;
  t       t_stock_transfers;
  v_trans bigint;
  v_rcv   bigint;
  v_gap   numeric;
BEGIN
  IF NOT can_approve('stock-transfer') THEN
    RAISE EXCEPTION 'Not allowed to approve transfer variances' USING errcode = '42501';
  END IF;
  SELECT * INTO l FROM t_stock_transfer_lines WHERE id = p_line_id FOR UPDATE;
  IF l.variance_status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'No variance waiting on this line';
  END IF;
  SELECT * INTO t FROM t_stock_transfers WHERE id = l.transfer_id;
  IF t.received_by = auth.uid() THEN
    RAISE EXCEPTION 'The person who received the transfer cannot approve its variance';
  END IF;
  v_gap := l.qty - l.qty_received;
  SELECT id INTO v_trans FROM m_locations WHERE warehouse_id = t.from_warehouse_id AND bin_type = 'in_transit' ORDER BY id LIMIT 1;
  IF p_approve THEN
    PERFORM post_stock_movement('adjustment', l.sku_id, v_gap, v_trans, NULL, l.batch_id, NULL,
      'stock_transfer', t.id, t.transfer_no, 'Transfer variance: ' || l.variance_reason);
  ELSE
    SELECT id INTO v_rcv FROM m_locations
     WHERE warehouse_id = t.from_warehouse_id AND bin_type = 'receiving' AND is_active ORDER BY id LIMIT 1;
    IF v_rcv IS NULL THEN
      RAISE EXCEPTION 'Origin warehouse has no active receiving bin';
    END IF;
    PERFORM post_stock_movement('transfer_in', l.sku_id, v_gap, v_trans, v_rcv, l.batch_id, NULL,
      'stock_transfer', t.id, t.transfer_no, 'Transfer variance rejected, back to origin');
    INSERT INTO t_putaway_tasks (warehouse_id, sku_id, batch_id, from_location_id, qty, suggested_location_id)
    VALUES (t.from_warehouse_id, l.sku_id, l.batch_id, v_rcv, v_gap,
            (SELECT location_id FROM suggest_putaway_bins(l.sku_id, v_gap, t.from_warehouse_id, l.batch_id) LIMIT 1));
  END IF;
  UPDATE t_stock_transfer_lines
     SET variance_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
         variance_decided_by = auth.uid(), variance_decided_at = now()
   WHERE id = l.id;
END;
$$;

CREATE FUNCTION public.count_scope_bins(p_count_id bigint) RETURNS SETOF bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT l.id
    FROM m_locations l
    JOIN t_stock_counts c ON c.id = p_count_id AND c.warehouse_id = l.warehouse_id
   WHERE l.level = 'bin' AND l.bin_type IN ('storage', 'picking')
     AND (cardinality(c.scope_location_ids) = 0 OR EXISTS (
           SELECT 1 FROM m_locations s WHERE s.id = ANY (c.scope_location_ids)
              AND (l.id = s.id OR l.full_code LIKE s.full_code || '-%')));
$$;

CREATE FUNCTION public.start_stock_count(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c t_stock_counts;
BEGIN
  IF NOT has_permission('stock-opname', 'update') THEN
    RAISE EXCEPTION 'Not allowed to start counts' USING errcode = '42501';
  END IF;
  SELECT * INTO c FROM t_stock_counts WHERE id = p_id FOR UPDATE;
  IF c.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Only a draft count can start';
  END IF;
  PERFORM 1 FROM m_locations WHERE id IN (SELECT count_scope_bins(p_id)) ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM m_locations WHERE id IN (SELECT count_scope_bins(p_id)) AND is_counting) THEN
    RAISE EXCEPTION 'Some of these bins are already in another count';
  END IF;
  -- Reserved stock belongs to an open pick list; counting under it would race the picker.
  IF EXISTS (SELECT 1 FROM t_stock_balances WHERE location_id IN (SELECT count_scope_bins(p_id)) AND qty_reserved > 0) THEN
    RAISE EXCEPTION 'Finish or cancel the open pick lists in these bins first';
  END IF;

  INSERT INTO t_stock_count_lines (count_id, location_id, sku_id, batch_id, owner_id, system_qty)
  SELECT p_id, b.location_id, b.sku_id, b.batch_id, b.owner_id, b.qty_on_hand
    FROM t_stock_balances b
    JOIN m_skus s ON s.id = b.sku_id
    JOIN m_products p ON p.id = s.product_id
   WHERE b.location_id IN (SELECT count_scope_bins(p_id)) AND b.qty_on_hand > 0
     AND (c.scope_category_id IS NULL OR p.category_id = c.scope_category_id);

  UPDATE m_locations SET is_counting = true WHERE id IN (SELECT count_scope_bins(p_id));
  UPDATE t_stock_counts SET status = 'counting', started_at = now() WHERE id = p_id;
END;
$$;

-- An unexpected SKU becomes a new line with system qty 0 (found stock).
CREATE FUNCTION public.record_count(p_count_id bigint, p_location_id bigint, p_sku_id bigint, p_batch_id bigint, p_qty numeric)
RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('stock-opname', 'update') THEN
    RAISE EXCEPTION 'Not allowed to count' USING errcode = '42501';
  END IF;
  IF (SELECT status FROM t_stock_counts WHERE id = p_count_id) IS DISTINCT FROM 'counting' THEN
    RAISE EXCEPTION 'This count is not open for counting';
  END IF;
  IF p_location_id NOT IN (SELECT count_scope_bins(p_count_id)) THEN
    RAISE EXCEPTION 'That bin is not part of this count';
  END IF;
  IF p_qty IS NULL OR p_qty < 0 THEN
    RAISE EXCEPTION 'Counted quantity cannot be negative';
  END IF;
  IF p_batch_id IS NULL AND (SELECT track_batch FROM m_skus WHERE id = p_sku_id) THEN
    RAISE EXCEPTION 'Scan or pick the batch for this SKU';
  END IF;
  INSERT INTO t_stock_count_lines (count_id, location_id, sku_id, batch_id, owner_id, system_qty, counted_qty, counted_by, counted_at)
  VALUES (p_count_id, p_location_id, p_sku_id, p_batch_id,
          (SELECT p.owner_id FROM m_skus s JOIN m_products p ON p.id = s.product_id WHERE s.id = p_sku_id),
          0, p_qty, auth.uid(), now())
  ON CONFLICT (count_id, location_id, sku_id, batch_id)
  DO UPDATE SET counted_qty = EXCLUDED.counted_qty, counted_by = EXCLUDED.counted_by, counted_at = now();
  INSERT INTO t_stock_count_counters (count_id, user_id) VALUES (p_count_id, auth.uid()) ON CONFLICT DO NOTHING;
END;
$$;

CREATE FUNCTION public.submit_stock_count(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('stock-opname', 'update') THEN
    RAISE EXCEPTION 'Not allowed to submit counts' USING errcode = '42501';
  END IF;
  IF (SELECT status FROM t_stock_counts WHERE id = p_id FOR UPDATE) IS DISTINCT FROM 'counting' THEN
    RAISE EXCEPTION 'This count is not being counted';
  END IF;
  IF EXISTS (SELECT 1 FROM t_stock_count_lines WHERE count_id = p_id AND counted_qty IS NULL) THEN
    RAISE EXCEPTION 'Some lines are not counted yet; enter 0 for what is not there';
  END IF;
  UPDATE t_stock_counts SET status = 'submitted', submitted_at = now(), submitted_by = auth.uid() WHERE id = p_id;
END;
$$;

-- Blind count: system qty hidden without stock-approval read until submitted; variance value only for cost readers.
CREATE FUNCTION public.count_review(p_id bigint)
RETURNS TABLE (line_id bigint, location_id bigint, sku_id bigint, batch_id bigint, system_qty numeric,
               counted_qty numeric, variance numeric, variance_value numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c t_stock_counts;
  v_cost boolean := has_permission('valuation', 'read');
BEGIN
  SELECT * INTO c FROM t_stock_counts WHERE id = p_id;
  IF NOT has_permission('stock-opname', 'read')
     OR (c.blind AND c.status IN ('draft', 'counting') AND NOT has_permission('stock-approval', 'read')) THEN
    RAISE EXCEPTION 'System quantities of a blind count stay hidden until it is submitted' USING errcode = '42501';
  END IF;
  RETURN QUERY
    SELECT l.id, l.location_id, l.sku_id, l.batch_id, l.system_qty, l.counted_qty,
           COALESCE(l.counted_qty, 0) - l.system_qty,
           CASE WHEN v_cost THEN round((COALESCE(l.counted_qty, 0) - l.system_qty) * COALESCE(sc.avg_cost, 0), 2) END
      FROM t_stock_count_lines l
      LEFT JOIN m_sku_costs sc ON sc.sku_id = l.sku_id AND sc.owner_id = l.owner_id
     WHERE l.count_id = p_id
     ORDER BY l.location_id, l.sku_id;
END;
$$;

CREATE FUNCTION public.approve_stock_count(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c      t_stock_counts;
  l      record;
  v_now  numeric;
  v_diff numeric;
BEGIN
  IF NOT can_approve('stock-opname') THEN
    RAISE EXCEPTION 'Not allowed to approve counts' USING errcode = '42501';
  END IF;
  SELECT * INTO c FROM t_stock_counts WHERE id = p_id FOR UPDATE;
  IF c.status IS DISTINCT FROM 'submitted' THEN
    RAISE EXCEPTION 'Only a submitted count can be approved';
  END IF;
  -- The guard trigger also enforces this; checked first for a clear message.
  IF c.submitted_by = auth.uid() OR EXISTS (SELECT 1 FROM t_stock_count_counters WHERE count_id = p_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Whoever counted or submitted the count cannot approve or reject it';
  END IF;

  UPDATE m_locations SET is_counting = false WHERE id IN (SELECT count_scope_bins(p_id));
  FOR l IN SELECT * FROM t_stock_count_lines WHERE count_id = p_id ORDER BY id LOOP
    SELECT COALESCE(sum(qty_on_hand), 0) INTO v_now FROM t_stock_balances
     WHERE location_id = l.location_id AND sku_id = l.sku_id AND batch_id IS NOT DISTINCT FROM l.batch_id AND owner_id = l.owner_id;
    v_diff := l.counted_qty - v_now;
    IF v_diff > 0 THEN
      PERFORM post_stock_movement('adjustment', l.sku_id, v_diff, NULL, l.location_id, l.batch_id, NULL,
                                  'stock_count', c.id, c.count_no, 'Stock opname: found');
    ELSIF v_diff < 0 THEN
      PERFORM post_stock_movement('adjustment', l.sku_id, -v_diff, l.location_id, NULL, l.batch_id, NULL,
                                  'stock_count', c.id, c.count_no, 'Stock opname: missing');
    END IF;
  END LOOP;
  UPDATE t_stock_counts SET status = 'approved', decided_at = now(), decided_by = auth.uid() WHERE id = p_id;
END;
$$;

-- Reject or cancel: bins unlock, stock stays as the system says.
CREATE FUNCTION public.reject_stock_count(p_id bigint, p_reason text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT can_approve('stock-opname') THEN
    RAISE EXCEPTION 'Not allowed to reject counts' USING errcode = '42501';
  END IF;
  IF (SELECT status FROM t_stock_counts WHERE id = p_id FOR UPDATE) IS DISTINCT FROM 'submitted'
     OR COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Only a submitted count can be rejected, with a reason';
  END IF;
  UPDATE m_locations SET is_counting = false WHERE id IN (SELECT count_scope_bins(p_id));
  UPDATE t_stock_counts SET status = 'rejected', reject_reason = trim(p_reason), decided_at = now(), decided_by = auth.uid()
   WHERE id = p_id;
END;
$$;

CREATE FUNCTION public.cancel_stock_count(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT has_permission('stock-opname', 'update') THEN
    RAISE EXCEPTION 'Not allowed to cancel counts' USING errcode = '42501';
  END IF;
  SELECT status INTO v_status FROM t_stock_counts WHERE id = p_id FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('draft', 'counting') THEN
    RAISE EXCEPTION 'Only a draft or running count can be cancelled';
  END IF;
  IF v_status = 'counting' THEN
    UPDATE m_locations SET is_counting = false WHERE id IN (SELECT count_scope_bins(p_id));
  END IF;
  UPDATE t_stock_counts SET status = 'cancelled', decided_at = now(), decided_by = auth.uid() WHERE id = p_id;
END;
$$;

-- Moves between two bins inside the scope net to nothing and are left out.
CREATE FUNCTION public.stock_card(p_sku_id bigint, p_from date, p_to date, p_warehouse_id bigint DEFAULT NULL)
RETURNS TABLE (movement_id bigint, movement_date date, movement_type text, ref_no text, batch_no text,
               from_code text, to_code text, qty_in numeric, qty_out numeric, balance numeric, note text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('stock-audit', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read the stock card' USING errcode = '42501';
  END IF;
  RETURN QUERY
  WITH m AS (
    SELECT sm.*, fl.full_code AS from_code, tl.full_code AS to_code,
           (tl.id IS NOT NULL AND (p_warehouse_id IS NULL OR tl.warehouse_id = p_warehouse_id)) AS to_in,
           (fl.id IS NOT NULL AND (p_warehouse_id IS NULL OR fl.warehouse_id = p_warehouse_id)) AS from_in
      FROM t_stock_movements sm
      LEFT JOIN m_locations fl ON fl.id = sm.from_location_id
      LEFT JOIN m_locations tl ON tl.id = sm.to_location_id
     WHERE sm.sku_id = p_sku_id AND sm.movement_date <= p_to
  ), signed AS (
    SELECT m.*, CASE WHEN to_in AND NOT from_in THEN m.qty ELSE 0 END AS q_in,
                CASE WHEN from_in AND NOT to_in THEN m.qty ELSE 0 END AS q_out
      FROM m WHERE to_in <> from_in
  ), opening AS (
    SELECT COALESCE(sum(q_in - q_out), 0) AS qty FROM signed WHERE signed.movement_date < p_from
  )
  SELECT NULL::bigint, p_from, 'opening'::text, NULL::text, NULL::text, NULL::text, NULL::text,
         NULL::numeric, NULL::numeric, (SELECT qty FROM opening), NULL::text
  UNION ALL
  SELECT s.id, s.movement_date, s.movement_type, s.ref_no, b.batch_no, s.from_code, s.to_code, s.q_in, s.q_out,
         (SELECT qty FROM opening) + sum(s.q_in - s.q_out) OVER (ORDER BY s.movement_date, s.id), s.note
    FROM signed s LEFT JOIN m_batches b ON b.id = s.batch_id
   WHERE s.movement_date >= p_from
  ORDER BY 2, 1 NULLS FIRST;
END;
$$;

CREATE FUNCTION public.transfer_is_draft(p_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM t_stock_transfers WHERE id = p_id AND status = 'draft' AND transfer_type = 'inter_warehouse');
$$;

CREATE FUNCTION public.cancel_stock_transfer(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('stock-transfer', 'update') THEN
    RAISE EXCEPTION 'Not allowed to cancel transfers' USING errcode = '42501';
  END IF;
  IF NOT transfer_is_draft(p_id) THEN
    RAISE EXCEPTION 'Only a draft inter-warehouse transfer can be cancelled';
  END IF;
  UPDATE t_stock_transfers SET status = 'cancelled' WHERE id = p_id;
END;
$$;

-- Tells stock-approval updaters when a received transfer has variance lines waiting for them.
CREATE FUNCTION public.notify_transfer_variance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_lines integer;
BEGIN
  SELECT count(*) INTO v_lines FROM t_stock_transfer_lines WHERE transfer_id = NEW.id AND variance_status = 'pending';
  IF v_lines > 0 THEN
    INSERT INTO t_notifications (user_id, title, body, link)
    SELECT p.id, 'Selisih transfer ' || NEW.transfer_no,
           format('%s baris diterima kurang di %s (dari %s). Setujui atau tolak selisihnya.', v_lines,
                  (SELECT code FROM m_warehouses WHERE id = NEW.to_warehouse_id),
                  (SELECT code FROM m_warehouses WHERE id = NEW.from_warehouse_id)),
           '/transfers?tab=inter'
      FROM profiles p
     WHERE EXISTS (
       SELECT 1 FROM t_role_permissions rp JOIN m_features f ON f.id = rp.feature_id
        WHERE rp.role_id = p.role_id AND f.feature_key = 'stock-approval' AND rp.can_update);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_transfer_variance AFTER UPDATE OF status ON public.t_stock_transfers
  FOR EACH ROW WHEN (NEW.status = 'received' AND OLD.status IS DISTINCT FROM 'received')
  EXECUTE FUNCTION public.notify_transfer_variance();

-- Transfers on the road for more than 3 days, for managers; called from run_daily_jobs().
CREATE FUNCTION public.notify_late_transfers() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_list text;
  v_count integer;
BEGIN
  SELECT count(*), string_agg(format('%s (%s→%s)', t.transfer_no, fw.code, tw.code), ', ' ORDER BY t.sent_at)
    INTO v_count, v_list
    FROM t_stock_transfers t
    JOIN m_warehouses fw ON fw.id = t.from_warehouse_id
    JOIN m_warehouses tw ON tw.id = t.to_warehouse_id
   WHERE t.status = 'in_transit' AND t.sent_at < now() - interval '3 days';
  IF v_count > 0 THEN
    INSERT INTO t_notifications (user_id, title, body, link)
    SELECT p.id, format('%s transfer lebih dari 3 hari di jalan', v_count),
           'Belum diterima: ' || v_list || '. Cek ke gudang tujuan atau ekspedisi.', '/transfers?tab=inter'
      FROM profiles p JOIN m_roles r ON r.id = p.role_id
     WHERE r.rank <= (SELECT rank FROM m_roles WHERE role_name = 'Warehouse Manager');
  END IF;
END;
$$;

ALTER TABLE public.t_stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_count_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_count_counters ENABLE ROW LEVEL SECURITY;

-- Inter-warehouse drafts are typed by managers (stock-transfer update); Workers only move bin to bin, through the RPC.
CREATE POLICY tr_select ON public.t_stock_transfers FOR SELECT TO authenticated
  USING ((SELECT has_permission('stock-transfer', 'read')));
CREATE POLICY tr_insert ON public.t_stock_transfers FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('stock-transfer', 'update')) AND transfer_type = 'inter_warehouse' AND status = 'draft');
CREATE POLICY tr_update ON public.t_stock_transfers FOR UPDATE TO authenticated
  USING ((SELECT has_permission('stock-transfer', 'update')) AND status = 'draft')
  WITH CHECK (status = 'draft' AND transfer_type = 'inter_warehouse');
CREATE POLICY tr_delete ON public.t_stock_transfers FOR DELETE TO authenticated
  USING ((SELECT has_permission('stock-transfer', 'delete')) AND status = 'draft');

CREATE POLICY trl_select ON public.t_stock_transfer_lines FOR SELECT TO authenticated
  USING ((SELECT has_permission('stock-transfer', 'read')));
CREATE POLICY trl_write ON public.t_stock_transfer_lines FOR ALL TO authenticated
  USING ((SELECT has_permission('stock-transfer', 'update')) AND transfer_is_draft(transfer_id))
  WITH CHECK ((SELECT has_permission('stock-transfer', 'update')) AND transfer_is_draft(transfer_id)
              AND qty_received IS NULL AND variance_status = 'none');

CREATE POLICY sc_select ON public.t_stock_counts FOR SELECT TO authenticated
  USING ((SELECT has_permission('stock-opname', 'read')));
CREATE POLICY sc_insert ON public.t_stock_counts FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('stock-opname', 'create')) AND status = 'draft');
CREATE POLICY sc_update ON public.t_stock_counts FOR UPDATE TO authenticated
  USING ((SELECT has_permission('stock-opname', 'update')) AND status = 'draft')
  WITH CHECK (status = 'draft');
CREATE POLICY sc_delete ON public.t_stock_counts FOR DELETE TO authenticated
  USING ((SELECT has_permission('stock-opname', 'delete')) AND status IN ('draft', 'cancelled'));

CREATE POLICY scl_select ON public.t_stock_count_lines FOR SELECT TO authenticated
  USING ((SELECT has_permission('stock-opname', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_stock_count_lines FROM anon, authenticated;
-- The snapshot quantity is only reachable through count_review().
REVOKE SELECT ON public.t_stock_count_lines FROM anon, authenticated;
GRANT SELECT (id, count_id, location_id, sku_id, batch_id, owner_id, counted_qty, counted_by, counted_at)
  ON public.t_stock_count_lines TO authenticated;

CREATE POLICY scc_select ON public.t_stock_count_counters FOR SELECT TO authenticated
  USING ((SELECT has_permission('stock-opname', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_stock_count_counters FROM anon, authenticated;

-- Count lines stay out of Realtime: its payload would carry system_qty.
ALTER PUBLICATION supabase_realtime ADD TABLE public.t_stock_transfers;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.notify_transfer_variance(), public.notify_late_transfers() FROM authenticated;
