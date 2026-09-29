CREATE TABLE public.t_sales_orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    so_no text NOT NULL UNIQUE DEFAULT '', -- set by trg_sales_order_no
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    customer_id bigint REFERENCES public.m_customers ON DELETE RESTRICT,
    customer_name text NOT NULL,
    ship_to text,
    channel text NOT NULL DEFAULT 'manual' CHECK (channel IN ('manual', 'pos', 'marketplace', 'api')),
    reference_no text,
    order_date date NOT NULL DEFAULT public.company_today(),
    note text,
    status text NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'allocated', 'picking', 'picked', 'packed', 'dispatched', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX t_sales_orders_status_idx ON public.t_sales_orders (warehouse_id, status);

CREATE TABLE public.t_sales_order_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id bigint NOT NULL REFERENCES public.t_sales_orders ON DELETE CASCADE,
    line_no integer NOT NULL DEFAULT 0,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    uom_id bigint NOT NULL REFERENCES public.m_uoms ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    -- Base units, kept by trigger (base_qty) and by the pick RPCs.
    base_qty numeric(14,3) NOT NULL DEFAULT 0,
    qty_allocated numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_allocated >= 0),
    qty_picked numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_picked >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, line_no),
    CHECK (qty_allocated + qty_picked <= base_qty)
);
CREATE INDEX t_sales_order_lines_sku_idx ON public.t_sales_order_lines (sku_id);

CREATE TABLE public.t_pick_lists (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pick_no text NOT NULL UNIQUE DEFAULT '',
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picking', 'done', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    completed_at timestamptz
);

CREATE TABLE public.t_pick_list_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pick_list_id bigint NOT NULL REFERENCES public.t_pick_lists ON DELETE CASCADE,
    order_line_id bigint NOT NULL REFERENCES public.t_sales_order_lines ON DELETE RESTRICT,
    seq integer NOT NULL,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    location_id bigint NOT NULL REFERENCES public.m_locations ON DELETE RESTRICT,
    balance_id bigint NOT NULL REFERENCES public.t_stock_balances ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    qty_picked numeric(14,3) NOT NULL DEFAULT 0 CHECK (qty_picked >= 0),
    short_reason text,
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'picked', 'short', 'cancelled')),
    picked_at timestamptz,
    picked_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    -- Retry key of confirm_pick_line; kept here because a fully short pick posts no movement.
    picked_request_id uuid,
    CHECK (qty_picked <= qty),
    CHECK (status <> 'short' OR short_reason IS NOT NULL)
);
CREATE INDEX t_pick_list_lines_list_idx ON public.t_pick_list_lines (pick_list_id, seq);
CREATE INDEX t_pick_list_lines_order_idx ON public.t_pick_list_lines (order_line_id);

CREATE TABLE public.t_shipments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    do_no text NOT NULL UNIQUE DEFAULT '',
    order_id bigint NOT NULL UNIQUE REFERENCES public.t_sales_orders ON DELETE RESTRICT,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'packed' CHECK (status IN ('packed', 'dispatched')),
    weight_kg numeric(10,3) CHECK (weight_kg > 0),
    packages integer NOT NULL DEFAULT 1 CHECK (packages > 0),
    dimensions text,
    courier text,
    tracking_no text,
    packed_at timestamptz NOT NULL DEFAULT now(),
    packed_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    dispatched_at timestamptz,
    dispatched_by uuid REFERENCES public.profiles ON DELETE SET NULL,
    CHECK (status <> 'dispatched' OR courier IS NOT NULL)
);

CREATE TABLE public.t_shipment_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    shipment_id bigint NOT NULL REFERENCES public.t_shipments ON DELETE CASCADE,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    UNIQUE NULLS NOT DISTINCT (shipment_id, sku_id, batch_id)
);

-- Also numbers t_stock_transfers and t_stock_counts (their triggers live in the control migration).
CREATE FUNCTION public.set_outbound_doc_no() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  p jsonb := (SELECT doc_prefixes FROM m_settings);
BEGIN
  CASE TG_TABLE_NAME
    WHEN 't_sales_orders'    THEN NEW.so_no := next_doc_no(COALESCE(p->>'sales_order', 'SO'));
    WHEN 't_pick_lists'      THEN NEW.pick_no := next_doc_no(COALESCE(p->>'pick_list', 'PL'));
    WHEN 't_shipments'       THEN NEW.do_no := next_doc_no(COALESCE(p->>'shipment', 'DO'));
    WHEN 't_stock_transfers' THEN NEW.transfer_no := next_doc_no(COALESCE(p->>'transfer', 'TRF'));
    WHEN 't_stock_counts'    THEN NEW.count_no := next_doc_no(COALESCE(p->>'count', 'CNT'));
  END CASE;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sales_order_no BEFORE INSERT ON public.t_sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_outbound_doc_no();
CREATE TRIGGER trg_pick_list_no BEFORE INSERT ON public.t_pick_lists FOR EACH ROW EXECUTE FUNCTION public.set_outbound_doc_no();
CREATE TRIGGER trg_shipment_no BEFORE INSERT ON public.t_shipments FOR EACH ROW EXECUTE FUNCTION public.set_outbound_doc_no();

CREATE FUNCTION public.set_order_line() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_factor integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.line_no = 0 THEN
    NEW.line_no := COALESCE((SELECT max(line_no) FROM t_sales_order_lines WHERE order_id = NEW.order_id), 0) + 1;
  END IF;
  SELECT factor_to_base INTO v_factor FROM m_sku_uoms WHERE sku_id = NEW.sku_id AND uom_id = NEW.uom_id;
  IF v_factor IS NULL THEN
    RAISE EXCEPTION 'The SKU has no such unit';
  END IF;
  IF (SELECT p.owner_id FROM m_skus s JOIN m_products p ON p.id = s.product_id WHERE s.id = NEW.sku_id)
     <> (SELECT owner_id FROM t_sales_orders WHERE id = NEW.order_id) THEN
    RAISE EXCEPTION 'The SKU belongs to another owner than the order';
  END IF;
  NEW.base_qty := round(NEW.qty * v_factor, 3);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_order_line BEFORE INSERT OR UPDATE OF sku_id, uom_id, qty ON public.t_sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_order_line();

CREATE FUNCTION public.refresh_order_status(p_order_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status  text := (SELECT status FROM t_sales_orders WHERE id = p_order_id);
  v_need    numeric;
  v_alloc   numeric;
  v_picked  numeric;
  v_open    boolean;
BEGIN
  IF v_status IN ('packed', 'dispatched', 'cancelled') THEN
    RETURN;
  END IF;
  SELECT sum(base_qty), sum(qty_allocated), sum(qty_picked) INTO v_need, v_alloc, v_picked
    FROM t_sales_order_lines WHERE order_id = p_order_id;
  v_open := EXISTS (SELECT 1 FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id
                     WHERE ol.order_id = p_order_id AND pl.status = 'open');
  UPDATE t_sales_orders SET status = CASE
      WHEN v_open AND v_picked > 0 THEN 'picking'
      WHEN v_open AND v_alloc + v_picked >= v_need THEN 'allocated'
      WHEN v_open THEN 'open'
      WHEN v_picked > 0 THEN 'picked'
      ELSE 'open'
    END
   WHERE id = p_order_id;
END;
$$;

-- Balances locked FOR UPDATE so concurrent pick lists can't promise the same units.
-- FEFO (skips expired, inside m_settings.min_shelf_life_days, or in a bin being counted) else FIFO, then nearest bin;
-- mirrors allocateFefo()/sortPickRoute() in src/lib/fefo.ts.
CREATE FUNCTION public.generate_pick_list(p_order_ids bigint[]) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_wh    bigint;
  v_list  bigint;
  ol      record;
  b       record;
  v_need  numeric;
  v_take  numeric;
  v_any   boolean := false;
  v_shelf integer := (SELECT min_shelf_life_days FROM m_settings);
BEGIN
  IF NOT has_permission('pick-list', 'create') THEN
    RAISE EXCEPTION 'Not allowed to create pick lists' USING errcode = '42501';
  END IF;
  IF (SELECT count(DISTINCT warehouse_id) FROM t_sales_orders WHERE id = ANY (p_order_ids)) <> 1 THEN
    RAISE EXCEPTION 'Pick one warehouse at a time';
  END IF;
  IF EXISTS (SELECT 1 FROM t_sales_orders WHERE id = ANY (p_order_ids) AND status NOT IN ('open', 'allocated', 'picking')) THEN
    RAISE EXCEPTION 'Only open orders can be allocated';
  END IF;
  SELECT warehouse_id INTO v_wh FROM t_sales_orders WHERE id = p_order_ids[1];
  PERFORM 1 FROM t_sales_orders WHERE id = ANY (p_order_ids) ORDER BY id FOR UPDATE;
  -- Lock the candidate balances in id order first, so two pickers never deadlock on FEFO order.
  PERFORM 1 FROM t_stock_balances
    WHERE warehouse_id = v_wh AND sku_id IN (SELECT sku_id FROM t_sales_order_lines WHERE order_id = ANY (p_order_ids))
    ORDER BY id FOR UPDATE;

  INSERT INTO t_pick_lists (warehouse_id) VALUES (v_wh) RETURNING id INTO v_list;

  DROP TABLE IF EXISTS _alloc;
  CREATE TEMP TABLE _alloc (order_line_id bigint, sku_id bigint, batch_id bigint, location_id bigint,
                            balance_id bigint, qty numeric) ON COMMIT DROP;

  FOR ol IN
    SELECT l.*, o.owner_id, s.track_expiry
      FROM t_sales_order_lines l
      JOIN t_sales_orders o ON o.id = l.order_id
      JOIN m_skus s ON s.id = l.sku_id
     WHERE l.order_id = ANY (p_order_ids) AND l.base_qty - l.qty_allocated - l.qty_picked > 0
     ORDER BY l.order_id, l.line_no
  LOOP
    v_need := ol.base_qty - ol.qty_allocated - ol.qty_picked;
    FOR b IN
      SELECT sb.id, sb.location_id, sb.batch_id, sb.qty_on_hand - sb.qty_reserved AS free
        FROM t_stock_balances sb
        JOIN m_locations l ON l.id = sb.location_id
        LEFT JOIN m_batches mb ON mb.id = sb.batch_id
       WHERE sb.warehouse_id = v_wh AND sb.sku_id = ol.sku_id AND sb.owner_id = ol.owner_id
         AND l.bin_type IN ('storage', 'picking') AND l.is_active AND NOT l.is_counting
         AND sb.qty_on_hand - sb.qty_reserved > 0
         AND (mb.expiry_date IS NULL OR mb.expiry_date >= company_today() + v_shelf)
       ORDER BY CASE WHEN ol.track_expiry THEN mb.expiry_date END NULLS LAST,
                mb.received_at NULLS LAST, l.pick_sequence, sb.id
       FOR UPDATE OF sb
    LOOP
      EXIT WHEN v_need <= 0;
      v_take := least(v_need, b.free);
      UPDATE t_stock_balances SET qty_reserved = qty_reserved + v_take, updated_at = now() WHERE id = b.id;
      INSERT INTO _alloc VALUES (ol.id, ol.sku_id, b.batch_id, b.location_id, b.id, v_take);
      v_need := v_need - v_take;
    END LOOP;
    UPDATE t_sales_order_lines
       SET qty_allocated = qty_allocated + (ol.base_qty - ol.qty_allocated - ol.qty_picked - v_need)
     WHERE id = ol.id;
  END LOOP;

  -- Route: rank aisles among the stops, alternate rack direction per aisle.
  INSERT INTO t_pick_list_lines (pick_list_id, order_line_id, seq, sku_id, batch_id, location_id, balance_id, qty)
  SELECT v_list, a.order_line_id,
         row_number() OVER (ORDER BY z.code NULLS LAST, ar.aisle_rank NULLS LAST,
                              CASE WHEN ar.aisle_rank % 2 = 1 THEN r.code END ASC,
                              CASE WHEN ar.aisle_rank % 2 = 0 THEN r.code END DESC,
                              bin.code, bin.pick_sequence, a.order_line_id),
         a.sku_id, a.batch_id, a.location_id, a.balance_id, a.qty
    FROM _alloc a
    JOIN m_locations bin ON bin.id = a.location_id
    LEFT JOIN m_locations r ON r.id = bin.parent_id
    LEFT JOIN m_locations ai ON ai.id = r.parent_id
    LEFT JOIN m_locations z ON z.id = ai.parent_id
    LEFT JOIN (
      SELECT DISTINCT ai2.id, dense_rank() OVER (ORDER BY z2.code, ai2.code) AS aisle_rank
        FROM _alloc a2
        JOIN m_locations b2 ON b2.id = a2.location_id
        JOIN m_locations r2 ON r2.id = b2.parent_id
        JOIN m_locations ai2 ON ai2.id = r2.parent_id
        JOIN m_locations z2 ON z2.id = ai2.parent_id
    ) ar ON ar.id = ai.id;

  GET DIAGNOSTICS v_take = ROW_COUNT;
  IF v_take = 0 THEN
    RAISE EXCEPTION 'No free stock to allocate for these orders' USING errcode = '23514';
  END IF;

  FOR ol IN SELECT unnest(p_order_ids) AS id LOOP
    PERFORM refresh_order_status(ol.id);
  END LOOP;
  RETURN v_list;
END;
$$;

-- A short pick needs a reason; the unpicked reservation is released so the line can be reallocated.
CREATE FUNCTION public.confirm_pick_line(p_line_id bigint, p_qty numeric, p_short_reason text DEFAULT NULL,
                                         p_request_id uuid DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  pl      t_pick_list_lines;
  v_list  t_pick_lists;
  v_stg   bigint;
  v_order bigint;
BEGIN
  IF NOT has_permission('pick-list', 'update') THEN
    RAISE EXCEPTION 'Not allowed to pick' USING errcode = '42501';
  END IF;
  SELECT * INTO pl FROM t_pick_list_lines WHERE id = p_line_id FOR UPDATE;
  -- A retry of a confirmed stop: same request id, already done.
  IF pl.status <> 'open' AND pl.picked_request_id = p_request_id THEN
    RETURN;
  END IF;
  IF pl.id IS NULL OR pl.status <> 'open' THEN
    RAISE EXCEPTION 'This pick line is not open';
  END IF;
  IF p_qty IS NULL OR p_qty < 0 OR p_qty > pl.qty THEN
    RAISE EXCEPTION 'Picked quantity must be between 0 and %', pl.qty;
  END IF;
  IF p_qty < pl.qty AND COALESCE(trim(p_short_reason), '') = '' THEN
    RAISE EXCEPTION 'A short pick needs a reason';
  END IF;
  SELECT * INTO v_list FROM t_pick_lists WHERE id = pl.pick_list_id FOR UPDATE;
  SELECT id INTO v_stg FROM m_locations WHERE warehouse_id = v_list.warehouse_id AND bin_type = 'staging' AND is_active ORDER BY id LIMIT 1;
  IF v_stg IS NULL THEN
    RAISE EXCEPTION 'Warehouse has no active staging bin';
  END IF;

  -- Release the whole reservation, then move what was actually picked.
  UPDATE t_stock_balances SET qty_reserved = qty_reserved - pl.qty, updated_at = now() WHERE id = pl.balance_id;
  IF p_qty > 0 THEN
    PERFORM post_stock_movement('pick', pl.sku_id, p_qty, pl.location_id, v_stg, pl.batch_id, NULL,
                                'pick_list', v_list.id, v_list.pick_no, NULL, NULL, p_request_id);
  END IF;

  UPDATE t_pick_list_lines
     SET qty_picked = p_qty, status = CASE WHEN p_qty < qty THEN 'short' ELSE 'picked' END,
         short_reason = CASE WHEN p_qty < qty THEN trim(p_short_reason) END,
         picked_at = now(), picked_by = auth.uid(), picked_request_id = p_request_id
   WHERE id = pl.id;
  UPDATE t_sales_order_lines
     SET qty_allocated = qty_allocated - pl.qty, qty_picked = qty_picked + p_qty
   WHERE id = pl.order_line_id
   RETURNING order_id INTO v_order;

  UPDATE t_pick_lists
     SET status = CASE WHEN EXISTS (SELECT 1 FROM t_pick_list_lines WHERE pick_list_id = v_list.id AND status = 'open')
                       THEN 'picking' ELSE 'done' END,
         completed_at = CASE WHEN EXISTS (SELECT 1 FROM t_pick_list_lines WHERE pick_list_id = v_list.id AND status = 'open')
                             THEN NULL ELSE now() END
   WHERE id = v_list.id;
  PERFORM refresh_order_status(v_order);
END;
$$;

CREATE FUNCTION public.cancel_pick_list(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  pl record;
BEGIN
  IF NOT has_permission('pick-list', 'delete') THEN
    RAISE EXCEPTION 'Not allowed to cancel pick lists' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM t_pick_lists WHERE id = p_id AND status IN ('open', 'picking') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick list is not open';
  END IF;
  -- Picked stock already sits in staging for its order; confirm the rest as short instead.
  IF EXISTS (SELECT 1 FROM t_pick_list_lines WHERE pick_list_id = p_id AND qty_picked > 0) THEN
    RAISE EXCEPTION 'Stock was already picked from this list; confirm the open lines as short instead';
  END IF;
  FOR pl IN SELECT * FROM t_pick_list_lines WHERE pick_list_id = p_id AND status = 'open' FOR UPDATE LOOP
    UPDATE t_stock_balances SET qty_reserved = qty_reserved - pl.qty, updated_at = now() WHERE id = pl.balance_id;
    UPDATE t_sales_order_lines SET qty_allocated = qty_allocated - pl.qty WHERE id = pl.order_line_id;
    UPDATE t_pick_list_lines SET status = 'cancelled' WHERE id = pl.id;
  END LOOP;
  UPDATE t_pick_lists SET status = 'cancelled', completed_at = now() WHERE id = p_id;
  FOR pl IN SELECT DISTINCT ol.order_id FROM t_pick_list_lines l JOIN t_sales_order_lines ol ON ol.id = l.order_line_id
             WHERE l.pick_list_id = p_id LOOP
    PERFORM refresh_order_status(pl.order_id);
  END LOOP;
END;
$$;

-- p_items [{sku_id,batch_id,qty}] from scanning must match exactly what was picked.
CREATE FUNCTION public.pack_shipment(p_order_id bigint, p_items jsonb, p_weight_kg numeric,
                                     p_packages integer DEFAULT 1, p_dimensions text DEFAULT NULL) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  o     t_sales_orders;
  v_id  bigint;
BEGIN
  IF NOT has_permission('dispatch', 'create') THEN
    RAISE EXCEPTION 'Not allowed to pack' USING errcode = '42501';
  END IF;
  SELECT * INTO o FROM t_sales_orders WHERE id = p_order_id FOR UPDATE;
  IF o.status <> 'picked' THEN
    RAISE EXCEPTION 'Order % is not ready for packing (status %)', o.so_no, o.status;
  END IF;

  IF EXISTS (
    WITH picked AS (
      SELECT pl.sku_id, pl.batch_id, sum(pl.qty_picked) AS qty
        FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id
       WHERE ol.order_id = o.id AND pl.qty_picked > 0
       GROUP BY pl.sku_id, pl.batch_id
    ), packed AS (
      SELECT (x->>'sku_id')::bigint AS sku_id, NULLIF(x->>'batch_id', '')::bigint AS batch_id, sum((x->>'qty')::numeric) AS qty
        FROM jsonb_array_elements(p_items) x GROUP BY 1, 2
    )
    SELECT 1 FROM picked FULL JOIN packed
      ON packed.sku_id = picked.sku_id AND packed.batch_id IS NOT DISTINCT FROM picked.batch_id
     WHERE picked.qty IS DISTINCT FROM packed.qty
  ) THEN
    RAISE EXCEPTION 'Packed items do not match what was picked for %', o.so_no;
  END IF;

  INSERT INTO t_shipments (order_id, warehouse_id, weight_kg, packages, dimensions)
  VALUES (o.id, o.warehouse_id, p_weight_kg, COALESCE(p_packages, 1), NULLIF(trim(p_dimensions), ''))
  RETURNING id INTO v_id;
  INSERT INTO t_shipment_items (shipment_id, sku_id, batch_id, qty)
  SELECT v_id, (x->>'sku_id')::bigint, NULLIF(x->>'batch_id', '')::bigint, sum((x->>'qty')::numeric)
    FROM jsonb_array_elements(p_items) x GROUP BY 2, 3;
  UPDATE t_sales_orders SET status = 'packed' WHERE id = o.id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION public.dispatch_shipment(p_id bigint, p_courier text, p_tracking_no text DEFAULT NULL) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  s     t_shipments;
  i     t_shipment_items;
  v_stg bigint;
BEGIN
  IF NOT has_permission('dispatch', 'update') THEN
    RAISE EXCEPTION 'Not allowed to dispatch' USING errcode = '42501';
  END IF;
  SELECT * INTO s FROM t_shipments WHERE id = p_id FOR UPDATE;
  IF s.id IS NULL OR s.status <> 'packed' THEN
    RAISE EXCEPTION 'Shipment is not packed';
  END IF;
  IF COALESCE(trim(p_courier), '') = '' THEN
    RAISE EXCEPTION 'Courier is required';
  END IF;
  SELECT id INTO v_stg FROM m_locations WHERE warehouse_id = s.warehouse_id AND bin_type = 'staging' AND is_active ORDER BY id LIMIT 1;
  FOR i IN SELECT * FROM t_shipment_items WHERE shipment_id = s.id LOOP
    PERFORM post_stock_movement('dispatch', i.sku_id, i.qty, v_stg, NULL, i.batch_id, NULL, 'shipment', s.id, s.do_no);
  END LOOP;
  UPDATE t_shipments
     SET status = 'dispatched', courier = trim(p_courier), tracking_no = NULLIF(trim(p_tracking_no), ''),
         dispatched_at = now(), dispatched_by = auth.uid()
   WHERE id = s.id;
  UPDATE t_sales_orders SET status = 'dispatched' WHERE id = s.order_id;
END;
$$;

CREATE TRIGGER trg_t_sales_orders_updated_at BEFORE UPDATE ON public.t_sales_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_t_sales_order_lines_updated_at BEFORE UPDATE ON public.t_sales_order_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_guard_document_status BEFORE UPDATE OR DELETE ON public.t_sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_document_status('open');

CREATE FUNCTION public.order_is_editable(p_order_id bigint) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (SELECT 1 FROM t_sales_orders o WHERE o.id = p_order_id AND o.status = 'open')
     AND NOT EXISTS (SELECT 1 FROM t_sales_order_lines WHERE order_id = p_order_id AND (qty_allocated > 0 OR qty_picked > 0));
$$;

CREATE FUNCTION public.cancel_sales_order(p_id bigint) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('pick-list', 'update') THEN
    RAISE EXCEPTION 'Not allowed to cancel orders' USING errcode = '42501';
  END IF;
  PERFORM 1 FROM t_sales_orders WHERE id = p_id FOR UPDATE;
  IF NOT order_is_editable(p_id) THEN
    RAISE EXCEPTION 'Only an open order with nothing allocated can be cancelled';
  END IF;
  UPDATE t_sales_orders SET status = 'cancelled' WHERE id = p_id;
END;
$$;

-- Runs as the caller, so movements RLS (stock-audit read) decides who sees counts.
CREATE FUNCTION public.bin_pick_counts(p_warehouse_id bigint, p_days integer DEFAULT 30)
RETURNS TABLE (location_id bigint, picks bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT sm.from_location_id, count(*)
    FROM t_stock_movements sm
    JOIN m_locations l ON l.id = sm.from_location_id
   WHERE sm.movement_type = 'pick'
     AND l.warehouse_id = p_warehouse_id
     AND sm.movement_date > company_today() - p_days
   GROUP BY sm.from_location_id;
$$;

ALTER TABLE public.t_sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_pick_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_pick_list_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_shipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY so_select ON public.t_sales_orders FOR SELECT TO authenticated
  USING ((SELECT has_permission('pick-list', 'read')) OR (SELECT has_permission('dispatch', 'read')));
CREATE POLICY so_insert ON public.t_sales_orders FOR INSERT TO authenticated
  WITH CHECK ((SELECT has_permission('pick-list', 'create')) AND status = 'open');
-- Edits only before anything is allocated; cancelling goes through cancel_sales_order.
CREATE POLICY so_update ON public.t_sales_orders FOR UPDATE TO authenticated
  USING ((SELECT has_permission('pick-list', 'update')) AND order_is_editable(id))
  WITH CHECK (status = 'open');
CREATE POLICY so_delete ON public.t_sales_orders FOR DELETE TO authenticated
  USING ((SELECT has_permission('pick-list', 'delete')) AND (status = 'cancelled' OR order_is_editable(id)));

CREATE POLICY sol_select ON public.t_sales_order_lines FOR SELECT TO authenticated
  USING ((SELECT has_permission('pick-list', 'read')) OR (SELECT has_permission('dispatch', 'read')));
CREATE POLICY sol_write ON public.t_sales_order_lines FOR ALL TO authenticated
  USING ((SELECT has_permission('pick-list', 'update')) AND order_is_editable(order_id))
  WITH CHECK ((SELECT has_permission('pick-list', 'create')) AND order_is_editable(order_id)
              AND qty_allocated = 0 AND qty_picked = 0);

CREATE POLICY pl_select ON public.t_pick_lists FOR SELECT TO authenticated
  USING ((SELECT has_permission('pick-list', 'read')));
CREATE POLICY pll_select ON public.t_pick_list_lines FOR SELECT TO authenticated
  USING ((SELECT has_permission('pick-list', 'read')) OR (SELECT has_permission('dispatch', 'read')));
CREATE POLICY sh_select ON public.t_shipments FOR SELECT TO authenticated
  USING ((SELECT has_permission('dispatch', 'read')));
CREATE POLICY shi_select ON public.t_shipment_items FOR SELECT TO authenticated
  USING ((SELECT has_permission('dispatch', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_pick_lists, public.t_pick_list_lines, public.t_shipments, public.t_shipment_items
  FROM anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_pick_list_lines, public.t_sales_orders;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.refresh_order_status(bigint) FROM authenticated;
