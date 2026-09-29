-- Cost pools are per SKU+owner across warehouses; client-owned stock is quantity only, never a company asset.

-- Every change of the moving average, so the report can value any past date.
CREATE TABLE public.t_avg_cost_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    effective_date date NOT NULL,
    avg_cost numeric(18,4) NOT NULL
);
CREATE INDEX t_avg_cost_log_idx ON public.t_avg_cost_log (sku_id, owner_id, effective_date, id);

CREATE TABLE public.t_stock_value_snapshots (
    snapshot_date date NOT NULL,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    total_value numeric(18,2) NOT NULL,
    PRIMARY KEY (snapshot_date, warehouse_id, owner_id)
);

-- Nothing dated on or before locked_until is booked: no movement, no COGS (so revaluations and approvals are covered too).
CREATE FUNCTION public.guard_period_lock() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF period_is_locked(NEW.movement_date) THEN
    RAISE EXCEPTION 'The period up to % is locked', (SELECT locked_until FROM m_settings) USING errcode = '55000';
  END IF;
  IF TG_TABLE_NAME = 't_stock_movements' AND NEW.movement_date > company_today() THEN
    RAISE EXCEPTION 'A movement cannot be dated in the future';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_period_lock BEFORE INSERT ON public.t_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_period_lock();
CREATE TRIGGER trg_guard_period_lock BEFORE INSERT ON public.t_cogs_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_period_lock();

-- Moving the lock forward takes valuation update; moving it back is Admin only. Audited through trg_audit_settings.
CREATE FUNCTION public.set_locked_until(p_date date) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old date := (SELECT locked_until FROM m_settings WHERE id = 1 FOR UPDATE);
BEGIN
  IF NOT has_permission('valuation', 'update') THEN
    RAISE EXCEPTION 'Not allowed to lock periods' USING errcode = '42501';
  END IF;
  IF p_date >= company_today() THEN
    RAISE EXCEPTION 'Only past dates can be locked';
  END IF;
  IF v_old IS NOT NULL AND (p_date IS NULL OR p_date < v_old) AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only an Admin can unlock a period' USING errcode = '42501';
  END IF;
  UPDATE m_settings SET locked_until = p_date WHERE id = 1;
END;
$$;

-- Internal: no permission check (the snapshot job uses it). FIFO value = newest layers up to qty held.
-- ponytail: replays the ledger per call; read t_stock_value_snapshots once history passes a few hundred thousand movements.
CREATE FUNCTION public.valuation_rows(p_as_of date, p_method text, p_warehouse_id bigint DEFAULT NULL)
RETURNS TABLE (sku_id bigint, owner_id bigint, warehouse_id bigint, qty numeric, unit_cost numeric, value numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH wh AS (
    SELECT sm.sku_id, sm.owner_id, l.warehouse_id,
           sum(CASE WHEN l.id = sm.to_location_id THEN sm.qty ELSE -sm.qty END) AS qty
      FROM t_stock_movements sm
      JOIN m_locations l ON l.id IN (sm.from_location_id, sm.to_location_id)
     WHERE sm.movement_date <= p_as_of
     GROUP BY 1, 2, 3
  ), co AS (
    SELECT wh.sku_id, wh.owner_id, sum(wh.qty) AS qty FROM wh GROUP BY 1, 2 HAVING sum(wh.qty) > 0
  ), unit AS (
    SELECT co.sku_id, co.owner_id,
           CASE WHEN p_method = 'average' THEN
             (SELECT a.avg_cost FROM t_avg_cost_log a
               WHERE a.sku_id = co.sku_id AND a.owner_id = co.owner_id AND a.effective_date <= p_as_of
               ORDER BY a.effective_date DESC, a.id DESC LIMIT 1)
           ELSE
             (SELECT sum(least(n.qty_in, greatest(co.qty - n.newer, 0)) * n.unit_cost)
                FROM (SELECT c.qty_in, c.unit_cost,
                             COALESCE(sum(c.qty_in) OVER (ORDER BY c.received_at DESC, c.id DESC
                                                          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS newer
                        FROM t_cost_layers c
                       WHERE c.sku_id = co.sku_id AND c.owner_id = co.owner_id AND c.received_at <= p_as_of) n) / co.qty
           END AS unit_cost
      FROM co
  )
  SELECT wh.sku_id, wh.owner_id, wh.warehouse_id, wh.qty,
         round(COALESCE(u.unit_cost, 0), 4), round(wh.qty * COALESCE(u.unit_cost, 0), 2)
    FROM wh JOIN unit u USING (sku_id, owner_id)
   WHERE wh.qty <> 0 AND (p_warehouse_id IS NULL OR wh.warehouse_id = p_warehouse_id);
$$;

CREATE FUNCTION public.stock_valuation(p_as_of date DEFAULT NULL, p_method text DEFAULT NULL, p_warehouse_id bigint DEFAULT NULL)
RETURNS TABLE (sku_id bigint, sku_code text, product_name text, category_name text, owner_id bigint, owner_name text,
               owner_type text, warehouse_id bigint, warehouse_code text, qty numeric, unit_cost numeric, value numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('valuation', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read valuation' USING errcode = '42501';
  END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('fifo', 'average') THEN
    RAISE EXCEPTION 'Unknown valuation method %', p_method;
  END IF;
  RETURN QUERY
  SELECT v.sku_id, s.sku_code, p.name, c.name, v.owner_id, o.name, o.owner_type, v.warehouse_id, w.code, v.qty,
         CASE WHEN o.owner_type = 'in_house' THEN v.unit_cost END,
         CASE WHEN o.owner_type = 'in_house' THEN v.value END
    FROM valuation_rows(COALESCE(p_as_of, company_today()),
                        COALESCE(p_method, (SELECT valuation_method FROM m_settings)), p_warehouse_id) v
    JOIN m_skus s ON s.id = v.sku_id
    JOIN m_products p ON p.id = s.product_id
    LEFT JOIN m_categories c ON c.id = p.category_id
    JOIN m_owners o ON o.id = v.owner_id
    JOIN m_warehouses w ON w.id = v.warehouse_id
   ORDER BY o.owner_type DESC, s.sku_code, w.code;
END;
$$;

-- Client-owned goods are not the company's cost and are left out.
CREATE FUNCTION public.cogs_report(p_from date, p_to date)
RETURNS TABLE (sku_id bigint, sku_code text, product_name text, category_name text, kind text,
               qty numeric, cost_fifo numeric, cost_average numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('valuation', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read COGS' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT e.sku_id, s.sku_code, p.name, c.name, e.kind,
         sum(CASE WHEN e.kind = 'revaluation' THEN 0 ELSE e.qty END), sum(e.cost_fifo), sum(e.cost_average)
    FROM t_cogs_entries e
    JOIN m_owners o ON o.id = e.owner_id AND o.owner_type = 'in_house'
    JOIN m_skus s ON s.id = e.sku_id
    JOIN m_products p ON p.id = s.product_id
    LEFT JOIN m_categories c ON c.id = p.category_id
   WHERE e.movement_date BETWEEN p_from AND p_to
   GROUP BY 1, 2, 3, 4, 5
   ORDER BY 2, 5;
END;
$$;

-- Run daily by cron; safe to re-run for the same day.
CREATE FUNCTION public.snapshot_stock_value(p_date date DEFAULT NULL) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  INSERT INTO t_stock_value_snapshots (snapshot_date, warehouse_id, owner_id, total_value)
  SELECT COALESCE(p_date, company_today()), v.warehouse_id, v.owner_id, sum(v.value)
    FROM valuation_rows(COALESCE(p_date, company_today()), (SELECT valuation_method FROM m_settings)) v
    JOIN m_owners o ON o.id = v.owner_id AND o.owner_type = 'in_house'
   GROUP BY v.warehouse_id, v.owner_id
  ON CONFLICT (snapshot_date, warehouse_id, owner_id) DO UPDATE SET total_value = EXCLUDED.total_value;
$$;

-- p_unit_cost is per line unit; on-hand part is repriced, the part already gone is booked today as revaluation COGS.
-- ponytail: average-method COGS gets the FIFO difference; exact per-method history needs a full replay.
CREATE FUNCTION public.revalue_receipt(p_receipt_line_id bigint, p_unit_cost numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  l        t_goods_receipt_lines;
  r        t_goods_receipts;
  v_new    numeric;
  v_delta  numeric;
  v_out    numeric;
  v_basis  numeric;
  v_avg    numeric;
  ly       t_cost_layers;
BEGIN
  IF NOT has_permission('valuation', 'update') THEN
    RAISE EXCEPTION 'Not allowed to revalue receipts' USING errcode = '42501';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost cannot be negative';
  END IF;
  SELECT * INTO l FROM t_goods_receipt_lines WHERE id = p_receipt_line_id;
  SELECT * INTO r FROM t_goods_receipts WHERE id = l.receipt_id;
  IF r.id IS NULL OR r.posted_at IS NULL OR r.status = 'cancelled' THEN
    RAISE EXCEPTION 'Only posted receipts can be revalued';
  END IF;
  IF period_is_locked(r.receipt_date) THEN
    RAISE EXCEPTION 'Period % is locked', to_char(r.receipt_date, 'YYYY-MM');
  END IF;
  -- Layers point at the receipt, not the line; two lines with the same SKU and batch cannot be told apart.
  IF (SELECT count(*) FROM t_goods_receipt_lines
       WHERE receipt_id = r.id AND sku_id = l.sku_id AND batch_id IS NOT DISTINCT FROM l.batch_id) > 1 THEN
    RAISE EXCEPTION 'Receipt % has several lines for this SKU and batch; revalue them together is not supported', r.gr_no;
  END IF;

  v_new := round(p_unit_cost / (SELECT factor_to_base FROM m_sku_uoms WHERE sku_id = l.sku_id AND uom_id = l.uom_id), 4);
  PERFORM 1 FROM m_sku_costs WHERE sku_id = l.sku_id AND owner_id = r.owner_id FOR UPDATE;

  FOR ly IN SELECT c.* FROM t_cost_layers c JOIN t_stock_movements sm ON sm.id = c.source_movement_id
             WHERE sm.ref_type = 'goods_receipt' AND sm.ref_id = r.id AND sm.sku_id = l.sku_id
               AND sm.batch_id IS NOT DISTINCT FROM l.batch_id
             ORDER BY c.id FOR UPDATE OF c LOOP
    v_delta := v_new - ly.unit_cost;
    v_out := ly.qty_in - ly.qty_remaining;
    IF v_delta <> 0 AND v_out > 0 THEN
      INSERT INTO t_cogs_entries (receipt_line_id, sku_id, owner_id, movement_date, kind, qty, cost_fifo, cost_average)
      VALUES (l.id, ly.sku_id, ly.owner_id, company_today(), 'revaluation', v_out,
              round(v_out * v_delta, 2), round(v_out * v_delta, 2));
    END IF;
    IF v_delta <> 0 AND ly.qty_remaining > 0 THEN
      SELECT sum(qty_remaining) INTO v_basis FROM t_cost_layers WHERE sku_id = ly.sku_id AND owner_id = ly.owner_id;
      UPDATE m_sku_costs SET avg_cost = round(avg_cost + ly.qty_remaining * v_delta / v_basis, 4), updated_at = now()
       WHERE sku_id = ly.sku_id AND owner_id = ly.owner_id
      RETURNING avg_cost INTO v_avg;
      INSERT INTO t_avg_cost_log (sku_id, owner_id, effective_date, avg_cost)
      VALUES (ly.sku_id, ly.owner_id, company_today(), v_avg);
    END IF;
    UPDATE t_cost_layers SET unit_cost = v_new, is_estimate = false WHERE id = ly.id;
  END LOOP;

  INSERT INTO t_receipt_line_costs (receipt_line_id, unit_cost) VALUES (l.id, p_unit_cost)
  ON CONFLICT (receipt_line_id) DO UPDATE SET unit_cost = EXCLUDED.unit_cost, updated_by = auth.uid();
  UPDATE m_sku_costs SET last_cost = v_new WHERE sku_id = l.sku_id AND owner_id = r.owner_id;
END;
$$;

CREATE FUNCTION public.estimated_receipt_lines()
RETURNS TABLE (receipt_line_id bigint, gr_no text, receipt_date date, sku_id bigint, uom_id bigint, qty numeric, unit_cost numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('valuation', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read costs' USING errcode = '42501';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (gl.id) gl.id, g.gr_no, g.receipt_date, gl.sku_id, gl.uom_id, gl.qty_received,
         round(c.unit_cost * u.factor_to_base, 4)
    FROM t_cost_layers c
    JOIN t_stock_movements sm ON sm.id = c.source_movement_id AND sm.ref_type = 'goods_receipt'
    JOIN t_goods_receipts g ON g.id = sm.ref_id
    JOIN t_goods_receipt_lines gl ON gl.receipt_id = g.id AND gl.sku_id = sm.sku_id
                                 AND gl.batch_id IS NOT DISTINCT FROM sm.batch_id
    JOIN m_sku_uoms u ON u.sku_id = gl.sku_id AND u.uom_id = gl.uom_id
   WHERE c.is_estimate
   ORDER BY gl.id DESC;
END;
$$;

-- Money fields are null for callers without valuation read.
CREATE FUNCTION public.dashboard_summary(p_warehouse_id bigint DEFAULT NULL) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_today date := company_today();
  v_money boolean := has_permission('valuation', 'read');
  v_warn  integer := (SELECT expiry_warning_days FROM m_settings);
  v_count bigint;
BEGIN
  IF NOT has_permission('dashboard', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read the dashboard' USING errcode = '42501';
  END IF;
  SELECT id INTO v_count FROM t_stock_counts
   WHERE status = 'approved' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
   ORDER BY decided_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'asset_value', CASE WHEN v_money THEN
      (SELECT COALESCE(sum(v.value), 0) FROM valuation_rows(v_today, (SELECT valuation_method FROM m_settings), p_warehouse_id) v
         JOIN m_owners o ON o.id = v.owner_id AND o.owner_type = 'in_house') END,
    'active_skus', (SELECT count(*) FROM m_skus WHERE is_active),
    'below_reorder', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.on_hand / NULLIF(x.reorder_point, 0), x.sku_code), '[]')
        FROM (SELECT s.sku_code, p.name, COALESCE(sum(b.qty_on_hand), 0) AS on_hand, s.reorder_point, s.reorder_qty
                FROM m_skus s JOIN m_products p ON p.id = s.product_id
                LEFT JOIN t_stock_balances b ON b.sku_id = s.id AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
               WHERE s.is_active AND s.reorder_point > 0
               GROUP BY s.id, p.name
              HAVING COALESCE(sum(b.qty_on_hand), 0) <= s.reorder_point) x),
    'expiring', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.expiry_date, x.batch_no), '[]')
        FROM (SELECT bt.batch_no, s.sku_code, bt.expiry_date, sum(b.qty_on_hand) AS qty
                FROM t_stock_balances b
                JOIN m_batches bt ON bt.id = b.batch_id
                JOIN m_skus s ON s.id = b.sku_id
               WHERE b.qty_on_hand > 0 AND bt.expiry_date <= v_today + v_warn
                 AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id)
               GROUP BY bt.id, s.sku_code) x),
    'putaway_pending', (SELECT count(*) FROM t_putaway_tasks
                         WHERE status = 'open' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)),
    'pick_lists_today', (SELECT count(*) FROM t_pick_lists
                          WHERE status <> 'cancelled' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
                            AND (created_at AT TIME ZONE (SELECT timezone FROM m_settings))::date = v_today),
    'count_accuracy', (SELECT round(100.0 * count(*) FILTER (WHERE counted_qty = system_qty) / NULLIF(count(*), 0), 1)
                         FROM t_stock_count_lines WHERE count_id = v_count AND counted_qty IS NOT NULL),
    -- Month-end (or latest) snapshot of the last six months, then today's live value.
    'value_trend', CASE WHEN v_money THEN (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'value', total) ORDER BY d), '[]')
        FROM (SELECT DISTINCT ON (date_trunc('month', snapshot_date)) snapshot_date AS d, total
                FROM (SELECT snapshot_date, sum(total_value) AS total FROM t_stock_value_snapshots
                       WHERE snapshot_date > v_today - interval '6 months' AND snapshot_date < v_today
                         AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
                       GROUP BY snapshot_date) daily
               ORDER BY date_trunc('month', snapshot_date), snapshot_date DESC) m) END,
    -- Dispatched quantity over 90 days; slow movers are SKUs in stock that moved least.
    'movers', (
      WITH stock AS (
        SELECT b.sku_id, sum(b.qty_on_hand) AS on_hand FROM t_stock_balances b
         WHERE p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id GROUP BY 1
      ), outq AS (
        SELECT sm.sku_id, sum(sm.qty) AS qty FROM t_stock_movements sm JOIN m_locations l ON l.id = sm.from_location_id
         WHERE sm.movement_type = 'dispatch' AND sm.movement_date > v_today - 90
           AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
         GROUP BY 1
      ), per_sku AS (
        SELECT s.sku_code, s.product_id, COALESCE(o.qty, 0) AS out_qty, COALESCE(st.on_hand, 0) AS on_hand
          FROM m_skus s LEFT JOIN outq o ON o.sku_id = s.id LEFT JOIN stock st ON st.sku_id = s.id
         WHERE s.is_active AND (o.qty > 0 OR st.on_hand > 0)
      )
      SELECT jsonb_build_object(
        'fast', (SELECT COALESCE(jsonb_agg(f), '[]') FROM (SELECT sku_code, out_qty FROM per_sku WHERE out_qty > 0
                                                         ORDER BY out_qty DESC, sku_code LIMIT 10) f),
        'slow', (SELECT COALESCE(jsonb_agg(f), '[]') FROM (SELECT sku_code, out_qty, on_hand FROM per_sku WHERE on_hand > 0
                                                         ORDER BY out_qty, on_hand DESC, sku_code LIMIT 10) f),
        -- Quantity turnover: units out in 90 days per unit on hand now.
        'turnover', (SELECT COALESCE(jsonb_agg(t ORDER BY t.turnover DESC NULLS LAST, t.category), '[]')
                       FROM (SELECT COALESCE(c.name, '-') AS category, sum(ps.out_qty) AS out_qty, sum(ps.on_hand) AS on_hand,
                                    round(sum(ps.out_qty) / NULLIF(sum(ps.on_hand), 0), 2) AS turnover
                               FROM per_sku ps JOIN m_products p ON p.id = ps.product_id
                               LEFT JOIN m_categories c ON c.id = p.category_id
                              GROUP BY c.name) t)
      ) FROM (SELECT 1) one),
    'out_of_stock', (SELECT count(*) FROM m_skus s
                      WHERE s.is_active AND NOT EXISTS (
                        SELECT 1 FROM t_stock_balances b WHERE b.sku_id = s.id AND b.qty_on_hand > 0
                           AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id))),
    'dispatched_today', CASE WHEN has_permission('dispatch', 'read') THEN
      (SELECT count(*) FROM t_shipments WHERE status = 'dispatched'
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
          AND (dispatched_at AT TIME ZONE (SELECT timezone FROM m_settings))::date = v_today) END,
    -- Units received (incl. QC rejects) and dispatched per day, last 30 days.
    'flow', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'in_qty', COALESCE(f.in_qty, 0), 'out_qty', COALESCE(f.out_qty, 0)) ORDER BY d), '[]')
        FROM generate_series(v_today - 29, v_today, interval '1 day') d
        LEFT JOIN (
          SELECT sm.movement_date,
                 sum(sm.qty) FILTER (WHERE sm.movement_type IN ('receipt', 'qc_reject')) AS in_qty,
                 sum(sm.qty) FILTER (WHERE sm.movement_type = 'dispatch') AS out_qty
            FROM t_stock_movements sm
            JOIN m_locations l ON l.id = COALESCE(sm.to_location_id, sm.from_location_id)
           WHERE sm.movement_type IN ('receipt', 'qc_reject', 'dispatch') AND sm.movement_date > v_today - 30
             AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
           GROUP BY 1) f ON f.movement_date = d::date),
    -- Work waiting per step; null where the caller cannot open that page.
    'queue', jsonb_build_object(
      'receipt_drafts', CASE WHEN has_permission('goods-receipt', 'read') THEN
        (SELECT count(*) FROM t_goods_receipts WHERE status = 'draft' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'orders_open', CASE WHEN has_permission('pick-list', 'read') THEN
        (SELECT count(*) FROM t_sales_orders WHERE status IN ('open', 'allocated') AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'pick_lists_open', CASE WHEN has_permission('pick-list', 'read') THEN
        (SELECT count(*) FROM t_pick_lists WHERE status IN ('open', 'picking') AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'to_pack', CASE WHEN has_permission('dispatch', 'read') THEN
        (SELECT count(*) FROM t_sales_orders WHERE status = 'picked' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'to_dispatch', CASE WHEN has_permission('dispatch', 'read') THEN
        (SELECT count(*) FROM t_sales_orders WHERE status = 'packed' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'in_transit', CASE WHEN has_permission('stock-transfer', 'read') THEN
        (SELECT count(*) FROM t_stock_transfers WHERE status = 'in_transit'
            AND (p_warehouse_id IS NULL OR p_warehouse_id IN (from_warehouse_id, to_warehouse_id))) END,
      'variances', CASE WHEN has_permission('stock-transfer', 'read') THEN
        (SELECT count(*) FROM t_stock_transfer_lines l JOIN t_stock_transfers t ON t.id = l.transfer_id
          WHERE l.variance_status = 'pending' AND (p_warehouse_id IS NULL OR p_warehouse_id IN (t.from_warehouse_id, t.to_warehouse_id))) END,
      'counts_active', CASE WHEN has_permission('stock-opname', 'read') THEN
        (SELECT count(*) FROM t_stock_counts WHERE status IN ('draft', 'counting') AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'counts_submitted', CASE WHEN has_permission('stock-opname', 'read') THEN
        (SELECT count(*) FROM t_stock_counts WHERE status = 'submitted' AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)) END,
      'estimated_costs', CASE WHEN has_permission('valuation', 'read') THEN
        (SELECT count(DISTINCT sm.ref_id) FROM t_cost_layers c JOIN t_stock_movements sm ON sm.id = c.source_movement_id
          WHERE c.is_estimate AND (p_warehouse_id IS NULL OR c.warehouse_id = p_warehouse_id)) END,
      'webhooks_failed', CASE WHEN has_permission('integration', 'read') THEN
        (SELECT count(*) FROM t_webhook_deliveries WHERE status = 'failed') END),
    -- Storage and picking bins in use, and fill against max_qty where a bin has one.
    'utilization', (
      SELECT COALESCE(jsonb_agg(u ORDER BY u.code), '[]') FROM (
        SELECT w.code, w.name,
               count(*) AS bins,
               count(*) FILTER (WHERE COALESCE(st.qty, 0) > 0) AS used,
               round(100.0 * sum(LEAST(COALESCE(st.qty, 0), l.max_qty)) FILTER (WHERE l.max_qty > 0)
                     / NULLIF(sum(l.max_qty) FILTER (WHERE l.max_qty > 0), 0), 1) AS fill_pct
          FROM m_warehouses w
          JOIN m_locations l ON l.warehouse_id = w.id AND l.level = 'bin' AND l.bin_type IN ('storage', 'picking') AND l.is_active
          LEFT JOIN (SELECT location_id, sum(qty_on_hand) AS qty FROM t_stock_balances GROUP BY 1) st ON st.location_id = l.id
         WHERE w.is_active AND (p_warehouse_id IS NULL OR w.id = p_warehouse_id)
         GROUP BY w.id) u),
    'recent', CASE WHEN has_permission('stock-audit', 'read') THEN (
      SELECT COALESCE(jsonb_agg(r ORDER BY r.id DESC), '[]') FROM (
        SELECT sm.id, sm.movement_type, s.sku_code, sm.qty, sm.ref_no, sm.created_at, pr.full_name AS actor
          FROM t_stock_movements sm
          JOIN m_skus s ON s.id = sm.sku_id
          LEFT JOIN profiles pr ON pr.id = sm.created_by
          LEFT JOIN m_locations lf ON lf.id = sm.from_location_id
          LEFT JOIN m_locations lt ON lt.id = sm.to_location_id
         WHERE p_warehouse_id IS NULL OR p_warehouse_id IN (lf.warehouse_id, lt.warehouse_id)
         ORDER BY sm.id DESC LIMIT 8) r) END,
    -- Cost of goods sold this month by the configured method (COGS is kept per owner, not per warehouse).
    'cogs_month', CASE WHEN v_money THEN (
      SELECT COALESCE(sum(CASE WHEN (SELECT valuation_method FROM m_settings) = 'fifo' THEN cost_fifo ELSE cost_average END), 0)
        FROM t_cogs_entries WHERE kind = 'sale' AND movement_date >= date_trunc('month', v_today)::date) END,
    'locked_until', CASE WHEN v_money THEN (SELECT locked_until FROM m_settings WHERE id = 1) END
  );
END;
$$;

-- One call for the map: per warehouse stock and bin use, and inter-warehouse transfers on the road or received in 30 days.
CREATE FUNCTION public.warehouse_network() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT has_permission('dashboard', 'read') THEN
    RAISE EXCEPTION 'Not allowed to read the dashboard' USING errcode = '42501';
  END IF;
  RETURN jsonb_build_object(
    'warehouses', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', w.id, 'code', w.code, 'name', w.name, 'type', w.warehouse_type, 'address', w.address, 'is_active', w.is_active,
               'lat', w.latitude, 'lng', w.longitude,
               'qty', COALESCE(s.qty, 0), 'skus', COALESCE(s.skus, 0),
               'bins', COALESCE(b.bins, 0), 'bins_used', COALESCE(b.used, 0),
               'open_orders', (SELECT count(*) FROM t_sales_orders o
                                WHERE o.warehouse_id = w.id AND o.status NOT IN ('dispatched', 'cancelled')))
             ORDER BY w.code), '[]')
        FROM m_warehouses w
        LEFT JOIN (SELECT warehouse_id, sum(qty_on_hand) AS qty, count(DISTINCT sku_id) AS skus
                     FROM t_stock_balances WHERE qty_on_hand > 0 GROUP BY warehouse_id) s ON s.warehouse_id = w.id
        LEFT JOIN (SELECT l.warehouse_id, count(*) AS bins,
                          count(*) FILTER (WHERE EXISTS (SELECT 1 FROM t_stock_balances sb
                                                          WHERE sb.location_id = l.id AND sb.qty_on_hand > 0)) AS used
                     FROM m_locations l WHERE l.bin_type IN ('storage', 'picking') GROUP BY l.warehouse_id) b
               ON b.warehouse_id = w.id),
    'transfers', (
      SELECT COALESCE(jsonb_agg(x), '[]')
        FROM (SELECT t.from_warehouse_id AS from_id, t.to_warehouse_id AS to_id,
                     count(*) FILTER (WHERE t.status = 'in_transit') AS in_transit,
                     COALESCE(sum(l.qty) FILTER (WHERE t.status = 'in_transit'), 0) AS in_transit_qty,
                     count(*) FILTER (WHERE t.status IN ('received', 'done')) AS received_30d
                FROM t_stock_transfers t
                LEFT JOIN (SELECT transfer_id, sum(qty) AS qty FROM t_stock_transfer_lines GROUP BY transfer_id) l
                       ON l.transfer_id = t.id
               WHERE t.transfer_type = 'inter_warehouse'
                 AND (t.status = 'in_transit' OR (t.status IN ('received', 'done') AND t.received_at > now() - interval '30 days'))
               GROUP BY t.from_warehouse_id, t.to_warehouse_id) x)
  );
END;
$$;

-- All or nothing; owner and base unit are fixed once set, so rows changing them are refused.
CREATE FUNCTION public.import_products(p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  r        record;
  v_owner  bigint;
  v_cat    bigint;
  v_uom    bigint;
  v_prod   m_products;
  v_sku    m_skus;
  v_n      integer := 0;
BEGIN
  IF NOT (has_permission('master-product', 'create') AND has_permission('master-product', 'update')) THEN
    RAISE EXCEPTION 'Not allowed to import products' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'Send at most 5000 rows';
  END IF;

  FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(
             row integer, product_code text, product_name text, category_code text, owner_code text, sku_code text,
             attributes jsonb, base_uom text, barcode text, track_batch boolean, track_expiry boolean,
             safety_stock numeric, reorder_point numeric, reorder_qty numeric, weight_kg numeric, is_active boolean) LOOP
    SELECT id INTO v_owner FROM m_owners WHERE code = r.owner_code;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'Row %: unknown owner %', r.row, r.owner_code;
    END IF;
    v_cat := NULL;
    IF COALESCE(r.category_code, '') <> '' THEN
      SELECT id INTO v_cat FROM m_categories WHERE code = r.category_code;
      IF v_cat IS NULL THEN
        RAISE EXCEPTION 'Row %: unknown category %', r.row, r.category_code;
      END IF;
    END IF;
    SELECT id INTO v_uom FROM m_uoms WHERE code = r.base_uom;
    IF v_uom IS NULL THEN
      RAISE EXCEPTION 'Row %: unknown unit %', r.row, r.base_uom;
    END IF;

    INSERT INTO m_products (code, name, category_id, owner_id, variant_attributes)
    VALUES (r.product_code, r.product_name, v_cat, v_owner, ARRAY(SELECT jsonb_object_keys(COALESCE(r.attributes, '{}'))))
    ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name, category_id = EXCLUDED.category_id,
          variant_attributes = m_products.variant_attributes
            || ARRAY(SELECT k FROM unnest(EXCLUDED.variant_attributes) k WHERE k <> ALL (m_products.variant_attributes))
    RETURNING * INTO v_prod;
    IF v_prod.owner_id <> v_owner THEN
      RAISE EXCEPTION 'Row %: product % belongs to another owner', r.row, r.product_code;
    END IF;

    INSERT INTO m_skus (product_id, sku_code, barcode, attributes, base_uom_id, track_batch, track_expiry,
                        safety_stock, reorder_point, reorder_qty, weight_kg, is_active)
    VALUES (v_prod.id, r.sku_code, NULLIF(r.barcode, ''), COALESCE(r.attributes, '{}'), v_uom,
            COALESCE(r.track_batch, false), COALESCE(r.track_expiry, false), COALESCE(r.safety_stock, 0),
            COALESCE(r.reorder_point, 0), COALESCE(r.reorder_qty, 0), r.weight_kg, COALESCE(r.is_active, true))
    ON CONFLICT (sku_code) DO UPDATE
      SET barcode = EXCLUDED.barcode, attributes = EXCLUDED.attributes, track_batch = EXCLUDED.track_batch,
          track_expiry = EXCLUDED.track_expiry, safety_stock = EXCLUDED.safety_stock,
          reorder_point = EXCLUDED.reorder_point, reorder_qty = EXCLUDED.reorder_qty,
          weight_kg = EXCLUDED.weight_kg, is_active = EXCLUDED.is_active
    RETURNING * INTO v_sku;
    IF v_sku.product_id <> v_prod.id OR v_sku.base_uom_id <> v_uom THEN
      RAISE EXCEPTION 'Row %: SKU % exists under another product or unit', r.row, r.sku_code;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

ALTER TABLE public.t_avg_cost_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_value_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY avg_cost_log_select ON public.t_avg_cost_log FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('valuation', 'read')));
CREATE POLICY value_snapshots_select ON public.t_stock_value_snapshots FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('valuation', 'read')));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.t_avg_cost_log, public.t_stock_value_snapshots FROM anon, authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.valuation_rows(date, text, bigint), public.snapshot_stock_value(date),
  public.guard_period_lock() FROM authenticated;
