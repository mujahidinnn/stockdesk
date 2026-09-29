-- Security audit 2026-09-29: closes direct-table paths around the RPC rules.

-- Order lines: clients set sku, uom and qty only; base_qty is the trigger's and
-- order_id stays put (a moved line would skip set_order_line's owner check).
REVOKE UPDATE ON public.t_sales_order_lines FROM authenticated;
GRANT UPDATE (sku_id, uom_id, qty) ON public.t_sales_order_lines TO authenticated;

-- Bins are frozen and released by stock counts only.
CREATE FUNCTION public.guard_location_counting() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.is_counting IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_counting ELSE false END) THEN
    RAISE EXCEPTION 'is_counting is set by stock counts only' USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_location_counting BEFORE INSERT OR UPDATE ON public.m_locations
  FOR EACH ROW EXECUTE FUNCTION public.guard_location_counting();

-- A blind count hides system_qty; a frozen bin's balance and ledger would give it away.
ALTER POLICY balances_select ON public.t_stock_balances USING (
  (SELECT public.has_any_access())
  AND ((SELECT public.has_permission('stock-approval', 'read'))
       OR NOT EXISTS (SELECT 1 FROM public.m_locations l WHERE l.id = location_id AND l.is_counting)));
ALTER POLICY movements_select ON public.t_stock_movements USING (
  (SELECT public.has_permission('stock-audit', 'read'))
  AND ((SELECT public.has_permission('stock-approval', 'read'))
       OR NOT EXISTS (SELECT 1 FROM public.m_locations l
                       WHERE l.is_counting AND l.id IN (from_location_id, to_location_id))));

-- Nobody hands out a permission they do not hold themselves.
CREATE FUNCTION public.can_grant(p_feature_id bigint, p_create boolean, p_read boolean, p_update boolean, p_delete boolean)
RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT (NOT COALESCE(p_create, false) OR has_permission(f.feature_key, 'create'))
     AND (NOT COALESCE(p_read, false)   OR has_permission(f.feature_key, 'read'))
     AND (NOT COALESCE(p_update, false) OR has_permission(f.feature_key, 'update'))
     AND (NOT COALESCE(p_delete, false) OR has_permission(f.feature_key, 'delete'))
    FROM m_features f WHERE f.id = p_feature_id;
$$;
ALTER POLICY overrides_write ON public.t_user_access_override
  WITH CHECK ((SELECT public.has_permission('users', 'update')) AND user_id <> (SELECT auth.uid()) AND public.outranks(user_id)
              AND public.can_grant(feature_id, can_create, can_read, can_update, can_delete));

-- The hidden superadmin stays hidden in the audit log too.
ALTER POLICY audit_select ON public.t_audit_log USING (
  CASE
    WHEN entity_type = 'profile' AND (detail->'after'->>'is_superadmin' = 'true' OR detail->'before'->>'is_superadmin' = 'true')
      THEN (SELECT public.is_superadmin())
    WHEN entity_type IN ('access_override', 'profile', 'role_permission', 'user') THEN (SELECT public.has_permission('users', 'read'))
    WHEN entity_type IN ('api_key', 'webhook') THEN (SELECT public.has_permission('integration', 'read'))
    ELSE (SELECT public.has_permission('stock-audit', 'read'))
  END);

-- An account without access sees only itself, not the staff directory.
ALTER POLICY profiles_select ON public.profiles USING (
  id = (SELECT auth.uid())
  OR ((SELECT public.has_any_access()) AND (NOT is_superadmin OR (SELECT public.is_superadmin()))));

CREATE OR REPLACE FUNCTION public.get_users_with_email()
RETURNS TABLE (id uuid, full_name text, email text, role_id bigint, role_name text, avatar_url text,
               created_at timestamptz, banned_until timestamptz, is_superadmin boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT p.id, p.full_name,
         CASE WHEN public.is_admin() THEN u.email::text ELSE '' END,
         p.role_id, r.role_name, p.avatar_url, p.created_at, u.banned_until, p.is_superadmin
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN public.m_roles r ON r.id = p.role_id
   WHERE public.has_any_access() AND (NOT p.is_superadmin OR public.is_superadmin())
   ORDER BY p.created_at;
$$;

-- created_by is who made the row, not what the client says.
CREATE FUNCTION public.stamp_created_by() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.created_by := CASE WHEN TG_OP = 'INSERT' THEN auth.uid() ELSE OLD.created_by END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT OR UPDATE ON public.t_sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT OR UPDATE ON public.t_goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();
CREATE TRIGGER trg_stamp_created_by BEFORE INSERT OR UPDATE ON public.t_goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.stamp_created_by();

CREATE OR REPLACE FUNCTION public.generate_pick_list(p_order_ids bigint[]) RETURNS bigint
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
  SELECT warehouse_id INTO v_wh FROM t_sales_orders WHERE id = p_order_ids[1];
  PERFORM 1 FROM t_sales_orders WHERE id = ANY (p_order_ids) ORDER BY id FOR UPDATE;
  -- Checked after the lock, so an order cancelled meanwhile is not allocated.
  IF EXISTS (SELECT 1 FROM t_sales_orders WHERE id = ANY (p_order_ids) AND status NOT IN ('open', 'allocated', 'picking')) THEN
    RAISE EXCEPTION 'Only open orders can be allocated';
  END IF;
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

REVOKE EXECUTE ON FUNCTION public.guard_location_counting(), public.stamp_created_by() FROM PUBLIC, anon, authenticated;
-- can_grant runs inside the overrides_write policy, so authenticated keeps it.
REVOKE EXECUTE ON FUNCTION public.can_grant(bigint, boolean, boolean, boolean, boolean), public.get_users_with_email(),
  public.generate_pick_list(bigint[]) FROM PUBLIC, anon;
