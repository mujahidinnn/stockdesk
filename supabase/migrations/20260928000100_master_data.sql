CREATE TABLE public.m_owners (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    owner_type text NOT NULL CHECK (owner_type IN ('in_house', 'client')),
    contact_name text,
    phone text,
    email text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_categories (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_uoms (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    -- Weight and volume units may hold fractions, so they can only be a base unit.
    is_decimal boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_suppliers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    contact_name text,
    phone text,
    email text,
    address text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_customers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    contact_name text,
    phone text,
    email text,
    address text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.m_products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9][A-Z0-9_]*$'),
    name text NOT NULL,
    category_id bigint REFERENCES public.m_categories ON DELETE RESTRICT,
    owner_id bigint NOT NULL REFERENCES public.m_owners ON DELETE RESTRICT,
    description text,
    variant_attributes text[] NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX m_products_category_idx ON public.m_products (category_id);
CREATE INDEX m_products_owner_idx ON public.m_products (owner_id);

CREATE TABLE public.m_skus (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    product_id bigint NOT NULL REFERENCES public.m_products ON DELETE CASCADE,
    sku_code text NOT NULL UNIQUE CHECK (sku_code ~ '^[A-Z0-9][A-Z0-9_-]*$'),
    barcode text UNIQUE,
    attributes jsonb NOT NULL DEFAULT '{}',
    base_uom_id bigint NOT NULL REFERENCES public.m_uoms ON DELETE RESTRICT,
    track_batch boolean NOT NULL DEFAULT false,
    track_expiry boolean NOT NULL DEFAULT false,
    safety_stock numeric(14,3) NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    reorder_point numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
    reorder_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (reorder_qty >= 0),
    weight_kg numeric(10,3) CHECK (weight_kg >= 0),
    length_cm numeric(10,2) CHECK (length_cm >= 0),
    width_cm numeric(10,2) CHECK (width_cm >= 0),
    height_cm numeric(10,2) CHECK (height_cm >= 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- Expiry lives on the batch, so tracking expiry means tracking batches.
    CHECK (track_batch OR NOT track_expiry)
);
CREATE INDEX m_skus_product_idx ON public.m_skus (product_id);
CREATE INDEX m_skus_base_uom_idx ON public.m_skus (base_uom_id);

CREATE TABLE public.m_sku_uoms (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku_id bigint NOT NULL REFERENCES public.m_skus ON DELETE CASCADE,
    uom_id bigint NOT NULL REFERENCES public.m_uoms ON DELETE RESTRICT,
    factor_to_base integer NOT NULL CHECK (factor_to_base > 0),
    barcode text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sku_id, uom_id),
    UNIQUE (sku_id, factor_to_base)
);
CREATE INDEX m_sku_uoms_uom_idx ON public.m_sku_uoms (uom_id);

CREATE FUNCTION public.create_base_uom() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base) VALUES (NEW.id, NEW.base_uom_id, 1);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_create_base_uom AFTER INSERT ON public.m_skus
  FOR EACH ROW EXECUTE FUNCTION public.create_base_uom();

-- Stock is stored in base units, so the base unit can never change once set.
CREATE FUNCTION public.guard_sku_base_uom() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.base_uom_id IS DISTINCT FROM OLD.base_uom_id THEN
    RAISE EXCEPTION 'The base unit of a SKU cannot change';
  END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    RAISE EXCEPTION 'A SKU cannot move to another product';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_sku_base_uom BEFORE UPDATE ON public.m_skus
  FOR EACH ROW EXECUTE FUNCTION public.guard_sku_base_uom();

CREATE FUNCTION public.guard_sku_uom() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_base bigint;
  v_row  m_sku_uoms := COALESCE(NEW, OLD);
BEGIN
  SELECT base_uom_id INTO v_base FROM m_skus WHERE id = v_row.sku_id;
  -- The SKU itself is being deleted: its unit rows go with it.
  IF v_base IS NULL THEN
    RETURN v_row;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.uom_id = v_base THEN
      RAISE EXCEPTION 'The base unit row cannot be removed';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.sku_id <> OLD.sku_id OR NEW.uom_id <> OLD.uom_id) THEN
    RAISE EXCEPTION 'Change the factor or barcode instead of moving a unit row';
  END IF;
  IF (NEW.uom_id = v_base) <> (NEW.factor_to_base = 1) THEN
    RAISE EXCEPTION 'Only the base unit has factor 1';
  END IF;
  IF NEW.uom_id <> v_base AND (SELECT is_decimal FROM m_uoms WHERE id = NEW.uom_id) THEN
    RAISE EXCEPTION 'A decimal unit (kg, liter) can only be the base unit';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_sku_uom BEFORE INSERT OR UPDATE OR DELETE ON public.m_sku_uoms
  FOR EACH ROW EXECUTE FUNCTION public.guard_sku_uom();

-- A scan must resolve to exactly one SKU unit, and a 13-digit code must be a valid EAN-13.
CREATE FUNCTION public.guard_barcode_unique() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.barcode IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.barcode ~ '^[0-9]{13}$' AND right(NEW.barcode, 1)::int <>
     (10 - (SELECT sum(substr(NEW.barcode, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
              FROM generate_series(1, 12) i) % 10) % 10 THEN
    RAISE EXCEPTION 'Barcode % has a wrong EAN-13 check digit', NEW.barcode;
  END IF;
  IF (TG_TABLE_NAME = 'm_skus' AND EXISTS (SELECT 1 FROM m_sku_uoms WHERE barcode = NEW.barcode))
     OR (TG_TABLE_NAME = 'm_sku_uoms' AND EXISTS (SELECT 1 FROM m_skus WHERE barcode = NEW.barcode)) THEN
    RAISE EXCEPTION 'Barcode % is already used', NEW.barcode;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_barcode_unique BEFORE INSERT OR UPDATE OF barcode ON public.m_skus
  FOR EACH ROW EXECUTE FUNCTION public.guard_barcode_unique();
CREATE TRIGGER trg_barcode_unique BEFORE INSERT OR UPDATE OF barcode ON public.m_sku_uoms
  FOR EACH ROW EXECUTE FUNCTION public.guard_barcode_unique();

-- Stock is kept apart per owner, so a product's owner is fixed once it has moved.
CREATE FUNCTION public.guard_sku_owner_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.owner_id <> OLD.owner_id AND EXISTS (
       SELECT 1 FROM t_stock_movements sm JOIN m_skus s ON s.id = sm.sku_id WHERE s.product_id = OLD.id) THEN
    RAISE EXCEPTION 'The owner of % cannot change: it already has stock movements', OLD.code;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_sku_owner_change BEFORE UPDATE OF owner_id ON public.m_products
  FOR EACH ROW EXECUTE FUNCTION public.guard_sku_owner_change();

-- p: {"product":{code,name,category_id,owner_id,description,variant_attributes},
--     "skus":[{sku_code,attributes,base_uom_id,barcode,track_batch,track_expiry,
--              safety_stock,reorder_point,reorder_qty,weight_kg,length_cm,width_cm,height_cm}]}
-- One transaction: the product never exists without its variants.
CREATE FUNCTION public.create_product_with_skus(payload jsonb) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  p    jsonb := payload->'product';
  v_id bigint;
BEGIN
  IF NOT has_permission('master-product', 'create') THEN
    RAISE EXCEPTION 'Not allowed to create products' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(payload->'skus') <> 'array' OR jsonb_array_length(payload->'skus') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A product needs 1 to 500 SKUs';
  END IF;
  INSERT INTO m_products (code, name, category_id, owner_id, description, variant_attributes)
  VALUES (upper(trim(p->>'code')), trim(p->>'name'), (p->>'category_id')::bigint, (p->>'owner_id')::bigint,
          NULLIF(trim(p->>'description'), ''),
          COALESCE(ARRAY(SELECT jsonb_array_elements_text(p->'variant_attributes')), '{}'))
  RETURNING id INTO v_id;
  INSERT INTO m_skus (product_id, sku_code, attributes, base_uom_id, barcode, track_batch, track_expiry,
                      safety_stock, reorder_point, reorder_qty, weight_kg, length_cm, width_cm, height_cm)
  SELECT v_id, upper(trim(s.sku_code)), COALESCE(s.attributes, '{}'), s.base_uom_id, NULLIF(trim(s.barcode), ''),
         COALESCE(s.track_batch, false), COALESCE(s.track_expiry, false), COALESCE(s.safety_stock, 0),
         COALESCE(s.reorder_point, 0), COALESCE(s.reorder_qty, 0), s.weight_kg, s.length_cm, s.width_cm, s.height_cm
    FROM jsonb_to_recordset(payload->'skus') AS s(
           sku_code text, attributes jsonb, base_uom_id bigint, barcode text, track_batch boolean, track_expiry boolean,
           safety_stock numeric, reorder_point numeric, reorder_qty numeric, weight_kg numeric,
           length_cm numeric, width_cm numeric, height_cm numeric);
  RETURN v_id;
END;
$$;

CREATE TABLE public.m_warehouses (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]+$'),
    name text NOT NULL,
    address text,
    warehouse_type text NOT NULL DEFAULT 'main' CHECK (warehouse_type IN ('main', 'store', 'transit')),
    latitude numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
    longitude numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT m_warehouses_latlng_pair CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE public.m_locations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    warehouse_id bigint NOT NULL REFERENCES public.m_warehouses ON DELETE CASCADE,
    parent_id bigint REFERENCES public.m_locations ON DELETE RESTRICT,
    level text NOT NULL CHECK (level IN ('zone', 'aisle', 'rack', 'bin')),
    code text NOT NULL CHECK (code ~ '^[A-Z0-9]+$'),
    full_code text NOT NULL DEFAULT '', -- set by trg_location_full_code
    bin_type text CHECK (bin_type IN ('receiving', 'storage', 'picking', 'staging', 'dispatch', 'quarantine', 'in_transit')),
    max_qty numeric(14,3) CHECK (max_qty > 0),
    max_weight_kg numeric(10,3) CHECK (max_weight_kg > 0),
    pick_sequence integer NOT NULL DEFAULT 0,
    grid_x integer,
    grid_y integer,
    allowed_category_ids bigint[] NOT NULL DEFAULT '{}',
    -- Set while a stock count covers the bin; movements in or out are refused.
    is_counting boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid DEFAULT auth.uid() REFERENCES public.profiles ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (warehouse_id, full_code),
    UNIQUE NULLS NOT DISTINCT (warehouse_id, parent_id, code),
    CHECK ((level = 'bin') = (bin_type IS NOT NULL))
);
CREATE INDEX m_locations_parent_idx ON public.m_locations (parent_id);
CREATE INDEX m_locations_pick_idx ON public.m_locations (warehouse_id, pick_sequence);

-- Tree: zone > aisle > rack > bin; dock/virtual bins may hang straight off the warehouse.
CREATE FUNCTION public.set_location_full_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  p m_locations;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.warehouse_id <> OLD.warehouse_id OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.level <> OLD.level THEN
      RAISE EXCEPTION 'A location cannot move; create a new one instead';
    END IF;
    IF NEW.code <> OLD.code AND EXISTS (SELECT 1 FROM m_locations WHERE parent_id = OLD.id) THEN
      RAISE EXCEPTION 'Rename the children first: their codes include this one';
    END IF;
  END IF;

  IF NEW.parent_id IS NULL THEN
    IF NEW.level NOT IN ('zone', 'bin') OR NEW.bin_type IN ('storage', 'picking') THEN
      RAISE EXCEPTION 'Only zones and dock bins sit directly under a warehouse';
    END IF;
    NEW.full_code := (SELECT code FROM m_warehouses WHERE id = NEW.warehouse_id) || '-' || NEW.code;
  ELSE
    SELECT * INTO p FROM m_locations WHERE id = NEW.parent_id;
    IF p.warehouse_id <> NEW.warehouse_id THEN
      RAISE EXCEPTION 'Parent location belongs to another warehouse';
    END IF;
    IF (p.level, NEW.level) NOT IN (('zone', 'aisle'), ('aisle', 'rack'), ('rack', 'bin')) THEN
      RAISE EXCEPTION 'A % cannot sit under a %', NEW.level, p.level;
    END IF;
    NEW.full_code := p.full_code || '-' || NEW.code;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_location_full_code BEFORE INSERT OR UPDATE ON public.m_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_location_full_code();

-- A location (or anything above it) that still holds stock stays active; moving is refused by set_location_full_code.
CREATE FUNCTION public.guard_location_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR (OLD.is_active AND NOT NEW.is_active))
     AND EXISTS (
       SELECT 1 FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
        WHERE b.qty_on_hand > 0 AND (l.id = OLD.id OR l.full_code LIKE OLD.full_code || '-%')
          AND l.warehouse_id = OLD.warehouse_id) THEN
    RAISE EXCEPTION 'Location % still holds stock', OLD.full_code;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER trg_guard_location_change BEFORE UPDATE OF is_active OR DELETE ON public.m_locations
  FOR EACH ROW EXECUTE FUNCTION public.guard_location_change();

CREATE FUNCTION public.create_default_bins() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO m_locations (warehouse_id, level, code, bin_type, pick_sequence) VALUES
    (NEW.id, 'bin', 'RCV', 'receiving', 0),
    (NEW.id, 'bin', 'QRN', 'quarantine', 0),
    (NEW.id, 'bin', 'STG', 'staging', 999999),
    (NEW.id, 'bin', 'TRANSIT', 'in_transit', 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_create_default_bins AFTER INSERT ON public.m_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.create_default_bins();

-- Location full codes embed the warehouse code, so it is fixed once created.
CREATE FUNCTION public.guard_warehouse_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'A warehouse code cannot change once created';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_guard_warehouse_code BEFORE UPDATE ON public.m_warehouses
  FOR EACH ROW EXECUTE FUNCTION public.guard_warehouse_code();

CREATE FUNCTION public.ensure_location(p_warehouse_id bigint, p_parent_id bigint, p_level text, p_code text) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id bigint;
BEGIN
  SELECT id INTO v_id FROM m_locations
   WHERE warehouse_id = p_warehouse_id AND parent_id IS NOT DISTINCT FROM p_parent_id AND code = p_code;
  IF v_id IS NULL THEN
    INSERT INTO m_locations (warehouse_id, parent_id, level, code)
    VALUES (p_warehouse_id, p_parent_id, p_level, p_code)
    RETURNING id INTO v_id;
  ELSIF (SELECT level FROM m_locations WHERE id = v_id) <> p_level THEN
    RAISE EXCEPTION 'Location % already exists as another level', p_code;
  END IF;
  RETURN v_id;
END;
$$;

-- Idempotent (existing nodes reused); pick sequence snakes aisles in an S shape, matching lib/fefo.ts.
CREATE FUNCTION public.generate_bins(
    p_warehouse_id bigint, p_zone text, p_aisles text[], p_racks integer, p_levels text[],
    p_bin_type text DEFAULT 'storage', p_max_qty numeric DEFAULT NULL, p_max_weight_kg numeric DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_zone  bigint;
  v_aisle bigint;
  v_rack  bigint;
  v_rack_pos int;
  v_new   int := 0;
BEGIN
  IF NOT has_permission('master-warehouse', 'create') THEN
    RAISE EXCEPTION 'Not allowed to create locations' USING errcode = '42501';
  END IF;
  IF p_bin_type NOT IN ('storage', 'picking') THEN
    RAISE EXCEPTION 'Generated bins are storage or picking bins';
  END IF;
  IF p_racks NOT BETWEEN 1 AND 99 OR cardinality(p_aisles) NOT BETWEEN 1 AND 52
     OR cardinality(p_levels) NOT BETWEEN 1 AND 26 THEN
    RAISE EXCEPTION 'Layout too large: at most 52 aisles, 99 racks and 26 levels';
  END IF;

  v_zone := ensure_location(p_warehouse_id, NULL, 'zone', upper(p_zone));
  FOR a IN 1 .. cardinality(p_aisles) LOOP
    v_aisle := ensure_location(p_warehouse_id, v_zone, 'aisle', upper(p_aisles[a]));
    FOR r IN 1 .. p_racks LOOP
      v_rack := ensure_location(p_warehouse_id, v_aisle, 'rack', lpad(r::text, 2, '0'));
      v_rack_pos := CASE WHEN a % 2 = 1 THEN r ELSE p_racks + 1 - r END;
      FOR l IN 1 .. cardinality(p_levels) LOOP
        INSERT INTO m_locations (warehouse_id, parent_id, level, code, bin_type, max_qty, max_weight_kg,
                                 pick_sequence, grid_x, grid_y)
        VALUES (p_warehouse_id, v_rack, 'bin', upper(p_levels[l]), p_bin_type, p_max_qty, p_max_weight_kg,
                a * 10000 + v_rack_pos * 100 + l, r, l)
        ON CONFLICT (warehouse_id, parent_id, code) DO NOTHING;
        IF FOUND THEN v_new := v_new + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN v_new;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['m_owners', 'm_categories', 'm_uoms', 'm_suppliers', 'm_customers', 'm_products',
                           'm_skus', 'm_sku_uoms', 'm_warehouses', 'm_locations'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I
                      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- Reference data: readable by anyone given access (role-less accounts read nothing); writes need the feature permission.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('m_owners', 'master-product'), ('m_categories', 'master-product'), ('m_uoms', 'master-product'),
      ('m_suppliers', 'master-product'), ('m_customers', 'master-product'), ('m_products', 'master-product'),
      ('m_skus', 'master-product'), ('m_sku_uoms', 'master-product'),
      ('m_warehouses', 'master-warehouse'), ('m_locations', 'master-warehouse')
    ) AS v(tbl, feature) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO authenticated
                      USING ((SELECT public.has_any_access()))', t.tbl);
    EXECUTE format('CREATE POLICY %1$s_insert ON public.%1$I FOR INSERT TO authenticated
                      WITH CHECK ((SELECT public.has_permission(%2$L, ''create'')))', t.tbl, t.feature);
    EXECUTE format('CREATE POLICY %1$s_update ON public.%1$I FOR UPDATE TO authenticated
                      USING ((SELECT public.has_permission(%2$L, ''update'')))
                      WITH CHECK ((SELECT public.has_permission(%2$L, ''update'')))', t.tbl, t.feature);
    EXECUTE format('CREATE POLICY %1$s_delete ON public.%1$I FOR DELETE TO authenticated
                      USING ((SELECT public.has_permission(%2$L, ''delete'')))', t.tbl, t.feature);
  END LOOP;
END $$;

INSERT INTO public.m_owners (code, name, owner_type) VALUES ('INTERNAL', 'Internal', 'in_house');

INSERT INTO public.m_categories (code, name) VALUES ('UMUM', 'Umum');

INSERT INTO public.m_uoms (code, name, is_decimal) VALUES
  ('PCS', 'Pieces', false), ('PACK', 'Pack', false), ('BOX', 'Box', false), ('CTN', 'Carton', false),
  ('LUSIN', 'Lusin', false), ('SET', 'Set', false), ('ROLL', 'Roll', false),
  ('KG', 'Kilogram', true), ('GR', 'Gram', true), ('L', 'Liter', true), ('ML', 'Mililiter', true);

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon;
REVOKE EXECUTE ON FUNCTION public.ensure_location(bigint, bigint, text, text), public.guard_sku_owner_change()
  FROM authenticated;
