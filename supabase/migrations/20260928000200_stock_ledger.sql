-- Direction: to-only = stock enters the company, from-only = it leaves, both = internal move (no value change).

CREATE TABLE public.m_batches (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_no text NOT NULL CHECK (batch_no <> ''),
    mfg_date date,
    expiry_date date,
    received_at date NOT NULL DEFAULT public.company_today(),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sku_id, batch_no),
    CHECK (expiry_date IS NULL OR mfg_date IS NULL OR expiry_date >= mfg_date)
);
CREATE INDEX m_batches_expiry_idx ON public.m_batches (expiry_date) WHERE expiry_date IS NOT NULL;

CREATE TABLE public.t_stock_movements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_date date NOT NULL DEFAULT public.company_today(),
    movement_type text NOT NULL CHECK (movement_type IN
      ('receipt', 'putaway', 'pick', 'dispatch', 'transfer_out', 'transfer_in', 'bin_transfer', 'adjustment', 'qc_reject', 'return')),
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    -- Copied from the product by the trigger; stock always belongs to its product's owner.
    owner_id bigint NOT NULL DEFAULT 0
      CONSTRAINT t_stock_movements_owner_fkey REFERENCES public.m_owners ON DELETE RESTRICT,
    from_location_id bigint REFERENCES public.m_locations ON DELETE RESTRICT,
    to_location_id bigint REFERENCES public.m_locations ON DELETE RESTRICT,
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    ref_type text,
    ref_id bigint,
    ref_no text,
    note text,
    -- One scan = one request id: a retried call finds its movement and stops.
    request_id uuid UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL),
    CHECK (from_location_id IS DISTINCT FROM to_location_id)
);
CREATE INDEX t_stock_movements_sku_idx ON public.t_stock_movements (sku_id, movement_date);
CREATE INDEX t_stock_movements_date_idx ON public.t_stock_movements (movement_date DESC, id DESC);
CREATE INDEX t_stock_movements_from_idx ON public.t_stock_movements (from_location_id);
CREATE INDEX t_stock_movements_to_idx ON public.t_stock_movements (to_location_id);
CREATE INDEX t_stock_movements_ref_idx ON public.t_stock_movements (ref_type, ref_id);
CREATE INDEX t_stock_movements_batch_idx ON public.t_stock_movements (batch_id);

CREATE TABLE public.t_stock_balances (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    location_id bigint NOT NULL REFERENCES public.m_locations ON DELETE RESTRICT,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    batch_id bigint REFERENCES public.m_batches ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    qty_on_hand numeric(14,3) NOT NULL DEFAULT 0,
    qty_reserved numeric(14,3) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (location_id, sku_id, batch_id, owner_id),
    CHECK (qty_on_hand >= 0 AND qty_reserved >= 0 AND qty_reserved <= qty_on_hand)
);
CREATE INDEX t_stock_balances_sku_idx ON public.t_stock_balances (sku_id, warehouse_id);
CREATE INDEX t_stock_balances_wh_idx ON public.t_stock_balances (warehouse_id, location_id);
CREATE INDEX t_stock_balances_batch_idx ON public.t_stock_balances (batch_id);

CREATE FUNCTION public.period_is_locked(p_date date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(p_date <= (SELECT locked_until FROM m_settings), false);
$$;

-- Movements are history; only the demo wipe (stockdesk.wipe = on, own transaction) may clear them.
CREATE FUNCTION public.guard_movement_immutable() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_setting('stockdesk.wipe', true) = 'on' THEN
    RETURN COALESCE(OLD, NEW);
  END IF;
  RAISE EXCEPTION 'Stock movements cannot be changed or deleted; post a correcting movement instead';
END;
$$;

-- FOR UPDATE locks make concurrent movements on one balance queue instead of reading the same qty.
CREATE FUNCTION public.apply_stock_movement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sku   m_skus;
  v_from  m_locations;
  v_to    m_locations;
  v_bal   t_stock_balances;
  v_used  numeric;
  v_wt    numeric;
BEGIN
  SELECT * INTO v_sku FROM m_skus WHERE id = NEW.sku_id;
  NEW.owner_id := (SELECT owner_id FROM m_products WHERE id = v_sku.product_id);

  IF v_sku.track_batch AND NEW.batch_id IS NULL THEN
    RAISE EXCEPTION 'SKU % needs a batch', v_sku.sku_code;
  END IF;
  IF NEW.batch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM m_batches WHERE id = NEW.batch_id AND sku_id = NEW.sku_id) THEN
    RAISE EXCEPTION 'Batch does not belong to SKU %', v_sku.sku_code;
  END IF;

  IF NEW.from_location_id IS NOT NULL THEN
    SELECT * INTO v_from FROM m_locations WHERE id = NEW.from_location_id;
    IF v_from.level <> 'bin' THEN
      RAISE EXCEPTION 'Stock moves between bins, % is a %', v_from.full_code, v_from.level;
    END IF;
    SELECT * INTO v_bal FROM t_stock_balances
     WHERE location_id = NEW.from_location_id AND sku_id = NEW.sku_id
       AND batch_id IS NOT DISTINCT FROM NEW.batch_id AND owner_id = NEW.owner_id
     FOR UPDATE;
    IF v_bal.id IS NULL OR v_bal.qty_on_hand - v_bal.qty_reserved < NEW.qty THEN
      RAISE EXCEPTION 'Not enough free stock of % in %: % on hand, % reserved, % requested',
        v_sku.sku_code, v_from.full_code, COALESCE(v_bal.qty_on_hand, 0), COALESCE(v_bal.qty_reserved, 0), NEW.qty
        USING errcode = '23514';
    END IF;
    UPDATE t_stock_balances SET qty_on_hand = qty_on_hand - NEW.qty, updated_at = now() WHERE id = v_bal.id;
  END IF;

  IF NEW.to_location_id IS NOT NULL THEN
    SELECT * INTO v_to FROM m_locations WHERE id = NEW.to_location_id FOR UPDATE;
    IF v_to.level <> 'bin' THEN
      RAISE EXCEPTION 'Stock moves between bins, % is a %', v_to.full_code, v_to.level;
    END IF;
    IF NOT v_to.is_active THEN
      RAISE EXCEPTION 'Bin % is inactive', v_to.full_code;
    END IF;
    IF v_to.max_qty IS NOT NULL OR v_to.max_weight_kg IS NOT NULL THEN
      SELECT COALESCE(sum(b.qty_on_hand), 0), COALESCE(sum(b.qty_on_hand * COALESCE(s.weight_kg, 0)), 0)
        INTO v_used, v_wt
        FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id
       WHERE b.location_id = v_to.id;
      IF v_used + NEW.qty > v_to.max_qty THEN
        RAISE EXCEPTION 'Bin % is full: % of % used, % more requested', v_to.full_code, v_used, v_to.max_qty, NEW.qty
          USING errcode = '23514';
      END IF;
      IF v_wt + NEW.qty * COALESCE(v_sku.weight_kg, 0) > v_to.max_weight_kg THEN
        RAISE EXCEPTION 'Bin % would exceed % kg', v_to.full_code, v_to.max_weight_kg USING errcode = '23514';
      END IF;
    END IF;
    INSERT INTO t_stock_balances (warehouse_id, location_id, sku_id, batch_id, owner_id, qty_on_hand)
    VALUES (v_to.warehouse_id, v_to.id, NEW.sku_id, NEW.batch_id, NEW.owner_id, NEW.qty)
    ON CONFLICT (location_id, sku_id, batch_id, owner_id)
    DO UPDATE SET qty_on_hand = t_stock_balances.qty_on_hand + EXCLUDED.qty_on_hand, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement BEFORE INSERT ON public.t_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();
CREATE TRIGGER trg_movement_immutable BEFORE UPDATE OR DELETE ON public.t_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.guard_movement_immutable();
CREATE TRIGGER trg_movement_no_truncate BEFORE TRUNCATE ON public.t_stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_movement_immutable();

-- ponytail: cost is company-wide per SKU+owner; add warehouse_id to the key if branches need own averages.
CREATE TABLE public.m_sku_costs (
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    avg_cost numeric(18,4) NOT NULL DEFAULT 0,
    last_cost numeric(18,4) NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (sku_id, owner_id)
);

CREATE TABLE public.t_cost_layers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE RESTRICT,
    source_movement_id bigint NOT NULL UNIQUE REFERENCES public.t_stock_movements ON DELETE RESTRICT,
    received_at date NOT NULL,
    qty_in numeric(14,3) NOT NULL CHECK (qty_in > 0),
    qty_remaining numeric(14,3) NOT NULL CHECK (qty_remaining >= 0 AND qty_remaining <= qty_in),
    unit_cost numeric(18,4) NOT NULL CHECK (unit_cost >= 0),
    -- Receipt had no price yet: costed from the last purchase price (or running average) until revalued.
    is_estimate boolean NOT NULL DEFAULT false
);
CREATE INDEX t_cost_layers_fifo_idx ON public.t_cost_layers (sku_id, owner_id, received_at, id) WHERE qty_remaining > 0;

-- Both methods recorded per outbound movement so reports never recompute history; kind splits sales/losses.
-- Revaluation entries belong to a receipt line, not to a movement (FK added in the inbound migration).
CREATE TABLE public.t_cogs_entries (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    movement_id bigint UNIQUE REFERENCES public.t_stock_movements ON DELETE RESTRICT,
    receipt_line_id bigint,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    movement_date date NOT NULL,
    kind text NOT NULL CHECK (kind IN ('sale', 'adjustment', 'revaluation')),
    qty numeric(14,3) NOT NULL CHECK (qty > 0),
    cost_fifo numeric(18,2) NOT NULL,
    cost_average numeric(18,2) NOT NULL,
    CHECK ((kind = 'revaluation') = (movement_id IS NULL AND receipt_line_id IS NOT NULL))
);
CREATE INDEX t_cogs_entries_date_idx ON public.t_cogs_entries (movement_date, sku_id);

-- Every stock-changing RPC goes through here; clients have no insert right on the ledger.
-- In: new FIFO layer; a receipt without a price takes the last purchase price and is flagged an estimate.
-- Out: layers consumed oldest first, one COGS entry with both methods. Internal moves cost nothing.
CREATE FUNCTION public.post_stock_movement(
    p_type text, p_sku_id bigint, p_qty numeric,
    p_from_location_id bigint DEFAULT NULL, p_to_location_id bigint DEFAULT NULL,
    p_batch_id bigint DEFAULT NULL, p_unit_cost numeric DEFAULT NULL,
    p_ref_type text DEFAULT NULL, p_ref_id bigint DEFAULT NULL, p_ref_no text DEFAULT NULL,
    p_note text DEFAULT NULL, p_movement_date date DEFAULT NULL, p_request_id uuid DEFAULT NULL
) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  m        t_stock_movements;
  v_cost   m_sku_costs;
  v_basis  numeric;
  v_unit   numeric;
  v_take   numeric;
  v_rest   numeric;
  v_fifo   numeric := 0;
  l        t_cost_layers;
BEGIN
  INSERT INTO t_stock_movements (movement_date, movement_type, sku_id, batch_id, from_location_id, to_location_id,
                                 qty, ref_type, ref_id, ref_no, note, request_id)
  VALUES (COALESCE(p_movement_date, company_today()), p_type, p_sku_id, p_batch_id, p_from_location_id,
          p_to_location_id, p_qty, p_ref_type, p_ref_id, p_ref_no, p_note, p_request_id)
  RETURNING * INTO m;

  IF (m.from_location_id IS NULL) = (m.to_location_id IS NULL) THEN
    RETURN m.id;
  END IF;
  -- A client's consigned stock carries no cost of ours: no layers, no COGS.
  IF (SELECT owner_type FROM m_owners WHERE id = m.owner_id) = 'client' THEN
    RETURN m.id;
  END IF;

  INSERT INTO m_sku_costs (sku_id, owner_id) VALUES (m.sku_id, m.owner_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_cost FROM m_sku_costs WHERE sku_id = m.sku_id AND owner_id = m.owner_id FOR UPDATE;

  IF m.to_location_id IS NOT NULL THEN
    IF p_unit_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost cannot be negative';
    END IF;
    v_unit := COALESCE(p_unit_cost,
                       CASE WHEN m.movement_type IN ('receipt', 'qc_reject') THEN NULLIF(v_cost.last_cost, 0) END,
                       NULLIF(v_cost.avg_cost, 0), v_cost.last_cost);
    SELECT COALESCE(sum(qty_remaining), 0) INTO v_basis
      FROM t_cost_layers WHERE sku_id = m.sku_id AND owner_id = m.owner_id;
    INSERT INTO t_cost_layers (sku_id, owner_id, warehouse_id, source_movement_id, received_at, qty_in, qty_remaining, unit_cost, is_estimate)
    VALUES (m.sku_id, m.owner_id, (SELECT warehouse_id FROM m_locations WHERE id = m.to_location_id),
            m.id, m.movement_date, m.qty, m.qty, v_unit,
            p_unit_cost IS NULL AND m.movement_type = 'receipt'
              AND (SELECT owner_type FROM m_owners WHERE id = m.owner_id) = 'in_house');
    UPDATE m_sku_costs
       SET avg_cost = round((v_basis * avg_cost + m.qty * v_unit) / (v_basis + m.qty), 4),
           last_cost = CASE WHEN p_unit_cost IS NOT NULL THEN p_unit_cost ELSE last_cost END,
           updated_at = now()
     WHERE sku_id = m.sku_id AND owner_id = m.owner_id
    RETURNING * INTO v_cost;
    INSERT INTO t_avg_cost_log (sku_id, owner_id, effective_date, avg_cost)
    VALUES (m.sku_id, m.owner_id, m.movement_date, v_cost.avg_cost);
    RETURN m.id;
  END IF;

  v_rest := m.qty;
  FOR l IN SELECT * FROM t_cost_layers
            WHERE sku_id = m.sku_id AND owner_id = m.owner_id AND qty_remaining > 0
            ORDER BY received_at, id FOR UPDATE LOOP
    EXIT WHEN v_rest <= 0;
    v_take := least(v_rest, l.qty_remaining);
    UPDATE t_cost_layers SET qty_remaining = qty_remaining - v_take WHERE id = l.id;
    v_fifo := v_fifo + v_take * l.unit_cost;
    v_rest := v_rest - v_take;
  END LOOP;
  IF v_rest > 0 THEN
    RAISE EXCEPTION 'Cost layers for SKU % are short by %', m.sku_id, v_rest;
  END IF;

  INSERT INTO t_cogs_entries (movement_id, sku_id, owner_id, movement_date, kind, qty, cost_fifo, cost_average)
  VALUES (m.id, m.sku_id, m.owner_id, m.movement_date,
          CASE WHEN m.movement_type = 'dispatch' THEN 'sale' ELSE 'adjustment' END,
          m.qty, round(v_fifo, 2), round(m.qty * v_cost.avg_cost, 2));

  -- Nothing left means nothing to average; start fresh on the next receipt.
  IF NOT EXISTS (SELECT 1 FROM t_cost_layers WHERE sku_id = m.sku_id AND owner_id = m.owner_id AND qty_remaining > 0) THEN
    UPDATE m_sku_costs SET avg_cost = 0, updated_at = now() WHERE sku_id = m.sku_id AND owner_id = m.owner_id;
    INSERT INTO t_avg_cost_log (sku_id, owner_id, effective_date, avg_cost) VALUES (m.sku_id, m.owner_id, m.movement_date, 0);
  END IF;
  RETURN m.id;
END;
$$;

-- Notify product managers once when total on hand crosses the reorder point (not again until it recovers).
CREATE FUNCTION public.notify_low_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_sku    m_skus;
  v_total  numeric;
  v_before numeric;
BEGIN
  SELECT * INTO v_sku FROM m_skus WHERE id = NEW.sku_id;
  IF v_sku.reorder_point <= 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(sum(qty_on_hand), 0) INTO v_total FROM t_stock_balances WHERE sku_id = NEW.sku_id;
  v_before := v_total + NEW.qty;
  IF v_total <= v_sku.reorder_point AND v_before > v_sku.reorder_point THEN
    INSERT INTO t_notifications (user_id, title, body, link)
    SELECT p.id, 'Stok menipis: ' || v_sku.sku_code,
           format('Sisa %s, reorder point %s. Saran order %s.', v_total, v_sku.reorder_point, v_sku.reorder_qty),
           '/products'
      FROM profiles p
     WHERE EXISTS (
       SELECT 1 FROM t_role_permissions rp JOIN m_features f ON f.id = rp.feature_id
        WHERE rp.role_id = p.role_id AND f.feature_key = 'master-product' AND rp.can_update);
    PERFORM enqueue_webhook_event('stock.low', jsonb_build_object(
      'sku', v_sku.sku_code, 'on_hand', v_total, 'reorder_point', v_sku.reorder_point, 'reorder_qty', v_sku.reorder_qty));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_low_stock AFTER INSERT ON public.t_stock_movements
  FOR EACH ROW WHEN (NEW.to_location_id IS NULL) EXECUTE FUNCTION public.notify_low_stock();

-- Never copy a key hash into the log.
CREATE FUNCTION public.audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_new jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) - 'key_hash' END;
  v_old jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) - 'key_hash' END;
  v_row jsonb := COALESCE(v_new, v_old);
BEGIN
  INSERT INTO t_audit_log (actor_id, action, entity_type, entity_id, detail)
  VALUES (
    auth.uid(), lower(TG_OP), TG_ARGV[0], COALESCE(v_row->>'id', v_row->>'period', '-'),
    CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('after', v_new)
      WHEN 'DELETE' THEN jsonb_build_object('before', v_old)
      ELSE jsonb_build_object('before', v_old, 'after', v_new)
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- audit_row_change is defined here, so the audit triggers of the access and master tables are created here too.
CREATE TRIGGER trg_audit_profiles AFTER UPDATE ON public.profiles
  FOR EACH ROW WHEN (OLD.role_id IS DISTINCT FROM NEW.role_id OR OLD.is_superadmin IS DISTINCT FROM NEW.is_superadmin)
  EXECUTE FUNCTION public.audit_row_change('profile');
CREATE TRIGGER trg_audit_role_permission AFTER INSERT OR UPDATE OR DELETE ON public.t_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('role_permission');
CREATE TRIGGER trg_audit_access_override AFTER INSERT OR UPDATE OR DELETE ON public.t_user_access_override
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('access_override');
CREATE TRIGGER trg_audit_settings AFTER UPDATE ON public.m_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('settings');

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['m_owners', 'm_categories', 'm_uoms', 'm_suppliers', 'm_customers', 'm_products',
                           'm_skus', 'm_sku_uoms', 'm_warehouses', 'm_locations'] LOOP
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change(%2$L)', t, substr(t, 3));
  END LOOP;
END $$;

CREATE TRIGGER trg_m_batches_updated_at BEFORE UPDATE ON public.m_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.m_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m_sku_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_cost_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t_cogs_entries ENABLE ROW LEVEL SECURITY;

-- Read-only for clients: every write comes from a SECURITY DEFINER RPC.
CREATE POLICY batches_select ON public.m_batches FOR SELECT TO authenticated
  USING ((SELECT public.has_any_access()));
CREATE POLICY balances_select ON public.t_stock_balances FOR SELECT TO authenticated
  USING ((SELECT public.has_any_access()));
CREATE POLICY movements_select ON public.t_stock_movements FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('stock-audit', 'read')));
CREATE POLICY sku_costs_select ON public.m_sku_costs FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('valuation', 'read')));
CREATE POLICY cost_layers_select ON public.t_cost_layers FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('valuation', 'read')));
CREATE POLICY cogs_select ON public.t_cogs_entries FOR SELECT TO authenticated
  USING ((SELECT public.has_permission('valuation', 'read')));

-- RLS WITH CHECK runs after BEFORE triggers; without these revokes a refused insert still fires the definer balance trigger.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.m_batches, public.t_stock_movements, public.t_stock_balances,
  public.m_sku_costs, public.t_cost_layers, public.t_cogs_entries FROM anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.t_stock_balances;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
-- Internal: only other SECURITY DEFINER functions post movements.
REVOKE EXECUTE ON FUNCTION public.post_stock_movement(text, bigint, numeric, bigint, bigint, bigint, numeric, text, bigint, text, text, date, uuid)
  FROM authenticated;
