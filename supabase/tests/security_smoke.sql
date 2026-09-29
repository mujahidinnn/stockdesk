-- Proves the access rules in supabase/migrations. Runs in one transaction and
-- rolls back, so it is safe on any database with every migration applied:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/security_smoke.sql
-- A failing case raises 'FAIL: ...'.

\set ON_ERROR_STOP on
SET client_min_messages = warning;
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin2@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'manager@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'worker@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'worker2@test.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'worker3@test.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'pending@test.local');

-- Fixtures act as the service role, like an edge function would.
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id IN ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2');
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Manager')
 WHERE id = '00000000-0000-0000-0000-0000000000b1';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Worker')
 WHERE id IN ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2',
              '00000000-0000-0000-0000-0000000000c3');
-- The demo seed turns demo mode on; the rules below are for a normal install.
UPDATE m_settings SET demo_mode = false;
SET LOCAL "request.jwt.claims" = '';

DO $$ BEGIN
  ASSERT (SELECT role_id FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000d1') IS NULL,
    'FAIL: new sign-ups should start without a role';
  ASSERT (SELECT array_agg(role_name ORDER BY rank) FROM m_roles) = ARRAY['Admin', 'Warehouse Manager', 'Warehouse Worker'],
    'FAIL: lower rank should be more power';
END $$;

-- ---------------------------------------------------------------- no role yet
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000d1';
DO $$
DECLARE
  f text;
BEGIN
  FOR f IN SELECT feature_key FROM m_features LOOP
    ASSERT NOT has_permission(f, 'read'), format('FAIL: user without a role can read %s', f);
  END LOOP;
  ASSERT (SELECT count(*) FROM t_goods_receipts) = 0, 'FAIL: user without a role reads receipts';
  ASSERT (SELECT count(*) FROM t_stock_movements) = 0, 'FAIL: user without a role reads movements';
  ASSERT (SELECT count(*) FROM t_audit_log) = 0, 'FAIL: user without a role reads the audit log';
  BEGIN
    PERFORM dashboard_summary(NULL);
    RAISE EXCEPTION 'FAIL: user without a role read the dashboard';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL "request.jwt.claim.sub" = '';

-- ---------------------------------------------------------------- anon
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM profiles) = 0, 'FAIL: anon read profiles';
  BEGIN
    PERFORM superadmin_bootstrap('x@test.local', 'password123');
    RAISE EXCEPTION 'FAIL: anon ran superadmin_bootstrap';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Failed logins are logged before sign-in, but only 20 a minute.
  FOR i IN 1..25 LOOP
    PERFORM log_client_error('auth.login', 'bad password');
  END LOOP;
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM t_error_log WHERE user_id IS NULL AND source = 'auth.login') = 20,
    'FAIL: anon error log is not rate limited';
END $$;

-- ---------------------------------------------------------------- worker
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c1';
DO $$ BEGIN
  ASSERT has_permission('goods-receipt', 'create'), 'FAIL: worker cannot create goods receipts';
  ASSERT NOT has_permission('goods-receipt', 'delete'), 'FAIL: worker can delete goods receipts';
  ASSERT NOT has_permission('valuation', 'read'), 'FAIL: worker can read valuation';
  ASSERT NOT has_permission('users', 'read'), 'FAIL: worker can read users';
  ASSERT NOT is_admin(), 'FAIL: worker is admin';

  BEGIN
    UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
     WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL: worker promoted themselves';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE profiles SET is_superadmin = true WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL: worker set the superadmin flag';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Own profile details are fine; other people's are not.
  UPDATE profiles SET full_name = 'Worker One' WHERE id = auth.uid();
  ASSERT (SELECT full_name FROM profiles WHERE id = auth.uid()) = 'Worker One', 'FAIL: worker cannot edit own profile';
  UPDATE profiles SET full_name = 'hacked' WHERE id = '00000000-0000-0000-0000-0000000000c2';
  ASSERT (SELECT full_name FROM profiles WHERE id = '00000000-0000-0000-0000-0000000000c2') <> 'hacked',
    'FAIL: worker edited someone else''s profile';

  BEGIN
    INSERT INTO t_user_access_override (user_id, feature_id, can_read)
    VALUES (auth.uid(), (SELECT id FROM m_features WHERE feature_key = 'valuation'), true);
    RAISE EXCEPTION 'FAIL: worker granted themselves access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE t_role_permissions SET can_delete = true;
  ASSERT NOT has_permission('goods-receipt', 'delete'), 'FAIL: worker rewrote the role matrix';

  UPDATE m_settings SET company_name = 'hacked';
  ASSERT (SELECT company_name FROM m_settings) <> 'hacked', 'FAIL: worker changed settings';

  ASSERT (SELECT count(*) FROM t_error_log) = 0, 'FAIL: worker can read the error log';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- manager
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN
  ASSERT has_permission('valuation', 'read'), 'FAIL: manager cannot read valuation';
  ASSERT NOT has_permission('valuation', 'update'), 'FAIL: manager can lock periods';
  ASSERT NOT has_permission('integration', 'read'), 'FAIL: manager can open integrations';
  -- No users permission, so the update matches no rows.
  UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Manager')
   WHERE id = '00000000-0000-0000-0000-0000000000c1';
  ASSERT (SELECT r.role_name FROM profiles p JOIN m_roles r ON r.id = p.role_id
           WHERE p.id = '00000000-0000-0000-0000-0000000000c1') = 'Warehouse Worker',
    'FAIL: manager changed a role';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- admin
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  ASSERT is_admin(), 'FAIL: admin is not admin';

  UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Manager')
   WHERE id = '00000000-0000-0000-0000-0000000000c1';
  ASSERT (SELECT r.role_name FROM profiles p JOIN m_roles r ON r.id = p.role_id
           WHERE p.id = '00000000-0000-0000-0000-0000000000c1') = 'Warehouse Manager',
    'FAIL: admin could not promote a worker';
  ASSERT EXISTS (SELECT 1 FROM t_audit_log WHERE entity_type = 'profile'
                  AND entity_id = '00000000-0000-0000-0000-0000000000c1'),
    'FAIL: role change was not audited';

  BEGIN
    UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
     WHERE id = '00000000-0000-0000-0000-0000000000c2';
    RAISE EXCEPTION 'FAIL: admin assigned a role at their own rank';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Worker')
     WHERE id = '00000000-0000-0000-0000-0000000000a2';
    RAISE EXCEPTION 'FAIL: admin demoted another admin';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Worker')
     WHERE id = auth.uid();
    RAISE EXCEPTION 'FAIL: admin changed their own role';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE profiles SET is_superadmin = true WHERE id = '00000000-0000-0000-0000-0000000000c2';
    RAISE EXCEPTION 'FAIL: admin set the superadmin flag';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Override for worker2: grant valuation read, leave the rest to the role.
  INSERT INTO t_user_access_override (user_id, feature_id, can_read, can_update)
  VALUES ('00000000-0000-0000-0000-0000000000c2', (SELECT id FROM m_features WHERE feature_key = 'valuation'), true, NULL);
  -- ...and revoke a role permission through an explicit false.
  INSERT INTO t_user_access_override (user_id, feature_id, can_create)
  VALUES ('00000000-0000-0000-0000-0000000000c2', (SELECT id FROM m_features WHERE feature_key = 'goods-receipt'), false);
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c2';
DO $$ BEGIN
  ASSERT has_permission('valuation', 'read'), 'FAIL: override did not grant read';
  ASSERT NOT has_permission('valuation', 'update'), 'FAIL: null override did not fall back to the role';
  ASSERT NOT has_permission('goods-receipt', 'create'), 'FAIL: false override did not revoke';
  ASSERT has_permission('goods-receipt', 'read'), 'FAIL: override leaked into other actions';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- master data
-- c2 is still a plain worker (only its overrides changed).
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c2';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM m_uoms) > 0, 'FAIL: worker cannot read units';
  BEGIN
    INSERT INTO m_products (code, name, owner_id) VALUES ('HACK', 'hack', (SELECT id FROM m_owners LIMIT 1));
    RAISE EXCEPTION 'FAIL: worker created a product';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO m_warehouses (code, name) VALUES ('HACK', 'hack');
    RAISE EXCEPTION 'FAIL: worker created a warehouse';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM generate_bins((SELECT id FROM m_warehouses LIMIT 1), 'A', ARRAY['A'], 1, ARRAY['A']);
    RAISE EXCEPTION 'FAIL: worker generated bins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
DO $$
DECLARE
  v_sku bigint;
  v_wh  bigint;
  v_box bigint := (SELECT id FROM m_uoms WHERE code = 'BOX');
BEGIN
  INSERT INTO m_products (code, name, owner_id) VALUES ('SMOKE', 'Smoke tee', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, barcode, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'SMOKE'), 'SMOKE-BLK-M', '899000000001', (SELECT id FROM m_uoms WHERE code = 'PCS'))
  RETURNING id INTO v_sku;

  ASSERT (SELECT factor_to_base FROM m_sku_uoms WHERE sku_id = v_sku) = 1, 'FAIL: base unit row missing';

  BEGIN
    INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base) VALUES (v_sku, v_box, 1);
    RAISE EXCEPTION 'FAIL: a non-base unit got factor 1';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base, barcode) VALUES (v_sku, v_box, 12, '899000000002');

  BEGIN
    DELETE FROM m_sku_uoms WHERE sku_id = v_sku AND factor_to_base = 1;
    RAISE EXCEPTION 'FAIL: base unit row deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE m_skus SET base_uom_id = v_box WHERE id = v_sku;
    RAISE EXCEPTION 'FAIL: base unit changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE m_skus SET barcode = '899000000002' WHERE id = v_sku;
    RAISE EXCEPTION 'FAIL: barcode reused across SKU and unit';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE m_skus SET track_expiry = true, track_batch = false WHERE id = v_sku;
    RAISE EXCEPTION 'FAIL: expiry tracked without batches';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  INSERT INTO m_warehouses (code, name) VALUES ('SMK', 'Smoke WH') RETURNING id INTO v_wh;
  ASSERT (SELECT array_agg(bin_type ORDER BY bin_type) FROM m_locations WHERE warehouse_id = v_wh)
       = ARRAY['in_transit', 'quarantine', 'receiving', 'staging'], 'FAIL: default bins missing';

  ASSERT generate_bins(v_wh, 'A', ARRAY['01', '02'], 3, ARRAY['A', 'B']) = 12, 'FAIL: generator count';
  ASSERT generate_bins(v_wh, 'A', ARRAY['01', '02'], 3, ARRAY['A', 'B']) = 0, 'FAIL: generator not idempotent';
  ASSERT EXISTS (SELECT 1 FROM m_locations WHERE full_code = 'SMK-A-02-03-B' AND level = 'bin'), 'FAIL: full code';
  -- S-shape walk: aisle 01 goes up the racks, aisle 02 comes back down.
  ASSERT (SELECT array_agg(full_code ORDER BY pick_sequence) FROM m_locations
           WHERE warehouse_id = v_wh AND bin_type = 'storage' AND code = 'A')
       = ARRAY['SMK-A-01-01-A', 'SMK-A-01-02-A', 'SMK-A-01-03-A', 'SMK-A-02-03-A', 'SMK-A-02-02-A', 'SMK-A-02-01-A'],
    'FAIL: pick sequence is not serpentine';

  BEGIN
    INSERT INTO m_locations (warehouse_id, parent_id, level, code, bin_type)
    VALUES (v_wh, (SELECT id FROM m_locations WHERE full_code = 'SMK-A'), 'bin', 'X', 'storage');
    RAISE EXCEPTION 'FAIL: bin placed directly under a zone';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE m_warehouses SET code = 'SMK2' WHERE id = v_wh;
    RAISE EXCEPTION 'FAIL: warehouse code changed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  ASSERT EXISTS (SELECT 1 FROM t_audit_log WHERE entity_type = 'products' AND action = 'insert'),
    'FAIL: product insert not audited';
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- stock ledger
-- Fixtures as the owner: a bin holding 10 units of a batch-tracked SKU.
DO $$
DECLARE
  v_wh  bigint;
  v_sku bigint;
  v_b   bigint;
BEGIN
  INSERT INTO m_warehouses (code, name) VALUES ('LED', 'Ledger WH') RETURNING id INTO v_wh;
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
  PERFORM generate_bins(v_wh, 'A', ARRAY['01'], 1, ARRAY['A', 'B'], 'storage', 10);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO m_products (code, name, owner_id) VALUES ('LEDP', 'Ledger item', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id, track_batch, track_expiry, reorder_point)
  VALUES ((SELECT id FROM m_products WHERE code = 'LEDP'), 'LEDP-1', (SELECT id FROM m_uoms WHERE code = 'PCS'), true, true, 5)
  RETURNING id INTO v_sku;
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_sku, 'B1', company_today() + 90) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_sku, 10, NULL, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-A'),
                              v_b, 5000);

  ASSERT (SELECT owner_id FROM t_stock_movements WHERE sku_id = v_sku) = (SELECT id FROM m_owners WHERE code = 'INTERNAL'),
    'FAIL: movement owner not taken from the product';

  BEGIN
    PERFORM post_stock_movement('receipt', v_sku, 1, NULL, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-B'));
    RAISE EXCEPTION 'FAIL: batch-tracked SKU moved without a batch';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM post_stock_movement('dispatch', v_sku, 11, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-A'), NULL, v_b);
    RAISE EXCEPTION 'FAIL: stock went negative';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM post_stock_movement('receipt', v_sku, 11, NULL, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-B'), v_b, 5000);
    RAISE EXCEPTION 'FAIL: bin capacity exceeded';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE m_locations SET is_active = false WHERE full_code = 'LED-A-01-01-A';
    RAISE EXCEPTION 'FAIL: bin with stock deactivated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE t_stock_movements SET qty = 1 WHERE sku_id = v_sku;
    RAISE EXCEPTION 'FAIL: movement updated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM t_stock_movements WHERE sku_id = v_sku;
    RAISE EXCEPTION 'FAIL: movement deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM post_stock_movement('adjustment', v_sku, 1, NULL, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-B'),
                                v_b, NULL, p_movement_date => company_today() + 1);
    RAISE EXCEPTION 'FAIL: movement dated in the future';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Dropping from 10 to 4 crosses the reorder point of 5 once.
  PERFORM post_stock_movement('dispatch', v_sku, 6, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-A'), NULL, v_b);
  PERFORM post_stock_movement('dispatch', v_sku, 1, (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-A'), NULL, v_b);
  ASSERT (SELECT count(*) FROM t_notifications WHERE title = 'Stok menipis: LEDP-1'
            AND user_id = '00000000-0000-0000-0000-0000000000b1') = 1,
    'FAIL: low stock not notified exactly once';
  ASSERT NOT EXISTS (SELECT 1 FROM t_notifications WHERE title = 'Stok menipis: LEDP-1'
            AND user_id = '00000000-0000-0000-0000-0000000000c2'),
    'FAIL: worker got a product alert';
END $$;

-- LEDP has moved, so its owner is fixed.
DO $$ BEGIN
  INSERT INTO m_owners (code, name, owner_type) VALUES ('SMKCLIENT', 'Smoke client', 'client');
  BEGIN
    UPDATE m_products SET owner_id = (SELECT id FROM m_owners WHERE code = 'SMKCLIENT') WHERE code = 'LEDP';
    RAISE EXCEPTION 'FAIL: owner changed after movements';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  -- EAN-13 check digit: 8991002999916 is valid, 8991002999917 is not.
  BEGIN
    UPDATE m_skus SET barcode = '8991002999917' WHERE sku_code = 'LEDP-1';
    RAISE EXCEPTION 'FAIL: bad EAN-13 accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  UPDATE m_skus SET barcode = '8991002999916' WHERE sku_code = 'LEDP-1';
  -- Decimal units only as the base unit.
  BEGIN
    INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base)
    VALUES ((SELECT id FROM m_skus WHERE sku_code = 'LEDP-1'), (SELECT id FROM m_uoms WHERE code = 'KG'), 5);
    RAISE EXCEPTION 'FAIL: decimal unit added as a pack size';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;

DO $$ BEGIN
  BEGIN
    TRUNCATE t_stock_movements CASCADE;
    RAISE EXCEPTION 'FAIL: ledger truncated';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;

-- worker3 (c3, no overrides): reads stock, never cost; cannot write the ledger or balances.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000c3';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM t_stock_balances WHERE sku_id = (SELECT id FROM m_skus WHERE sku_code = 'LEDP-1')) > 0,
    'FAIL: worker cannot see balances';
  ASSERT (SELECT count(*) FROM t_stock_movements) > 0, 'FAIL: worker cannot read the movement log';
  ASSERT (SELECT count(*) FROM m_sku_costs) = 0, 'FAIL: worker can read SKU costs';
  ASSERT (SELECT count(*) FROM t_cost_layers) = 0, 'FAIL: worker can read cost layers';
  ASSERT (SELECT count(*) FROM t_cogs_entries) = 0, 'FAIL: worker can read COGS';
  BEGIN
    INSERT INTO t_stock_movements (movement_type, sku_id, to_location_id, qty)
    VALUES ('adjustment', (SELECT id FROM m_skus WHERE sku_code = 'LEDP-1'),
            (SELECT id FROM m_locations WHERE full_code = 'LED-RCV'), 100);
    RAISE EXCEPTION 'FAIL: worker inserted a movement';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE t_stock_balances SET qty_on_hand = 999;
    INSERT INTO t_stock_balances (warehouse_id, location_id, sku_id, owner_id, qty_on_hand)
    SELECT warehouse_id, location_id, sku_id, owner_id, 999 FROM t_stock_balances LIMIT 1;
    RAISE EXCEPTION 'FAIL: worker wrote a balance';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_balances WHERE qty_on_hand = 999), 'FAIL: worker changed a balance';
  BEGIN
    PERFORM post_stock_movement('adjustment', 1, 1);
    RAISE EXCEPTION 'FAIL: worker called post_stock_movement';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- manager reads cost but cannot lock periods; admin can, and a locked date refuses movements.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM m_sku_costs) > 0, 'FAIL: manager cannot read costs';
  BEGIN
    PERFORM set_locked_until((company_today() - interval '1 month')::date);
    RAISE EXCEPTION 'FAIL: manager locked a period';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE m_settings SET company_name = 'x';
  ASSERT (SELECT company_name FROM m_settings) <> 'x', 'FAIL: manager changed settings';
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  PERFORM set_locked_until((company_today() - interval '1 month')::date);
  ASSERT (SELECT locked_until FROM m_settings) = (company_today() - interval '1 month')::date, 'FAIL: lock not stored';
  ASSERT EXISTS (SELECT 1 FROM t_audit_log WHERE entity_type = 'settings' AND detail->'after'->>'locked_until' IS NOT NULL),
    'FAIL: period lock not audited';
  BEGIN
    PERFORM set_locked_until(company_today());
    RAISE EXCEPTION 'FAIL: today locked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  -- Straight to the table is refused: the lock only moves through the RPC.
  BEGIN
    UPDATE m_settings SET locked_until = NULL;
    RAISE EXCEPTION 'FAIL: admin wrote locked_until directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$ BEGIN
  BEGIN
    PERFORM post_stock_movement('adjustment', (SELECT id FROM m_skus WHERE sku_code = 'LEDP-1'), 1, NULL,
      (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-B'), (SELECT id FROM m_batches WHERE batch_no = 'B1'),
      p_movement_date => (company_today() - interval '1 month')::date);
    RAISE EXCEPTION 'FAIL: movement posted into a locked period';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;
-- Moving the lock back is Admin only, even with valuation update.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
INSERT INTO t_user_access_override (user_id, feature_id, can_update)
VALUES ('00000000-0000-0000-0000-0000000000b1', (SELECT id FROM m_features WHERE feature_key = 'valuation'), true);
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN
  PERFORM set_locked_until((company_today() - interval '20 days')::date);
  BEGIN
    PERFORM set_locked_until((company_today() - interval '40 days')::date);
    RAISE EXCEPTION 'FAIL: non-admin moved the lock back';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DELETE FROM t_user_access_override WHERE user_id = '00000000-0000-0000-0000-0000000000b1';
SELECT set_locked_until(NULL);
RESET ROLE;

-- ---------------------------------------------------------------- integration: API keys & webhooks
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000b1';
DO $$ BEGIN
  BEGIN
    PERFORM create_api_key('m', ARRAY['stock:read']);
    RAISE EXCEPTION 'FAIL: manager created an API key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM t_webhooks) = 0, 'FAIL: manager reads webhooks';
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
CREATE TEMP TABLE smoke_keys (name text PRIMARY KEY, key text) ON COMMIT DROP;
GRANT ALL ON smoke_keys TO authenticated;
DO $$
DECLARE
  v_key text;
  v_hook jsonb;
BEGIN
  v_key := create_api_key('smoke all', ARRAY['stock:read', 'orders:write']);
  ASSERT v_key ~ '^sd_live_[A-Za-z0-9_-]{43}$', 'FAIL: key format ' || v_key;
  INSERT INTO smoke_keys VALUES ('all', v_key);
  INSERT INTO smoke_keys VALUES ('owner', create_api_key('smoke owner', ARRAY['orders:write'],
    (SELECT id FROM m_owners WHERE code = 'INTERNAL')));
  ASSERT (SELECT prefix FROM t_api_keys WHERE name = 'smoke all') = left(v_key, 12), 'FAIL: prefix';
  BEGIN
    PERFORM key_hash FROM t_api_keys;
    RAISE EXCEPTION 'FAIL: client read key_hash';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM api_authenticate('x', 'stock:read');
    RAISE EXCEPTION 'FAIL: client ran api_authenticate';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM create_webhook('http://example.com/hook', ARRAY['stock.low']);
    RAISE EXCEPTION 'FAIL: http webhook accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  v_hook := create_webhook('https://example.com/hook', ARRAY['stock.changed', 'stock.low']);
  ASSERT v_hook->>'secret' LIKE 'whsec_%', 'FAIL: webhook secret';
  BEGIN
    PERFORM 1 FROM t_webhook_secrets;
    RAISE EXCEPTION 'FAIL: client read webhook secrets';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE t_api_keys SET revoked_at = NULL;
    RAISE EXCEPTION 'FAIL: client updated an API key';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- What api-v1 does, as the service role.
DO $$
DECLARE
  v_all   text := encode(extensions.digest((SELECT key FROM smoke_keys WHERE name = 'all'), 'sha256'), 'hex');
  v_own   text := encode(extensions.digest((SELECT key FROM smoke_keys WHERE name = 'owner'), 'sha256'), 'hex');
  v_auth  jsonb;
  v_kid   bigint;
  v_r1    jsonb;
  v_r2    jsonb;
  v_d     t_webhook_deliveries;
  v_before bigint := (SELECT count(*) FROM t_sales_orders WHERE channel = 'api');
  v_hook  bigint := (SELECT id FROM t_webhooks WHERE url = 'https://example.com/hook');
BEGIN
  ASSERT api_authenticate('nope', 'stock:read')->>'status' = '401', 'FAIL: unknown key accepted';
  v_auth := api_authenticate(v_all, 'stock:read');
  ASSERT v_auth->>'status' = '200', 'FAIL: good key refused ' || v_auth;
  v_kid := (v_auth->>'key_id')::bigint;
  ASSERT api_authenticate(v_all, 'products:read')->>'status' = '403', 'FAIL: missing scope accepted';

  -- Idempotent order: the retry gets the first answer, one order exists.
  v_r1 := api_create_order(v_kid, NULL, 'idem-1', jsonb_build_object('warehouse', 'LED', 'customer_name', 'API buyer',
            'lines', jsonb_build_array(jsonb_build_object('sku', 'ledp-1', 'qty', 2))));
  ASSERT v_r1->>'status' = '201', 'FAIL: API order ' || v_r1;
  v_r2 := api_create_order(v_kid, NULL, 'idem-1', '{}');
  ASSERT v_r2 = v_r1, 'FAIL: idempotent retry differs';
  ASSERT (SELECT count(*) FROM t_sales_orders WHERE channel = 'api') = v_before + 1, 'FAIL: duplicate API order';
  ASSERT api_create_order(v_kid, NULL, 'idem-2', jsonb_build_object('warehouse', 'NOPE', 'customer_name', 'x',
           'lines', jsonb_build_array(jsonb_build_object('sku', 'LEDP-1', 'qty', 1))))->>'status' = '422', 'FAIL: bad warehouse';
  -- A key bound to one owner cannot order another owner's SKU.
  INSERT INTO m_owners (code, name, owner_type) VALUES ('APICLI', 'API client', 'client');
  INSERT INTO m_products (code, name, owner_id) VALUES ('APICLI', 'Client goods', (SELECT id FROM m_owners WHERE code = 'APICLI'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'APICLI'), 'APICLI-1', (SELECT id FROM m_uoms WHERE code = 'PCS'));
  v_r1 := api_create_order((api_authenticate(v_own, 'orders:write')->>'key_id')::bigint,
            (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'idem-3',
            jsonb_build_object('warehouse', 'LED', 'customer_name', 'x',
              'lines', jsonb_build_array(jsonb_build_object('sku', 'APICLI-1', 'qty', 1))));
  ASSERT v_r1 = jsonb_build_object('status', 422, 'error', 'SKU APICLI-1 belongs to another owner'), 'FAIL: owner scope ' || v_r1;

  -- Rate limit: 60 requests in a minute, then 429 with Retry-After.
  INSERT INTO t_api_request_log (api_key_id, method, path, status) SELECT v_kid, 'GET', '/stock', 200 FROM generate_series(1, 60);
  v_auth := api_authenticate(v_all, 'stock:read');
  ASSERT v_auth->>'status' = '429' AND (v_auth->>'retry_after')::int BETWEEN 1 AND 60, 'FAIL: rate limit ' || v_auth;

  -- Revoked keys stop working but are still identified for the log.
  UPDATE t_api_keys SET revoked_at = now() WHERE id = v_kid;
  ASSERT api_authenticate(v_all, 'stock:read') = jsonb_build_object('status', 401, 'error', 'invalid_key', 'key_id', v_kid),
    'FAIL: revoked key';

  -- Movements queue stock.changed; retries back off, the fifth failure is final.
  PERFORM post_stock_movement('adjustment', (SELECT id FROM m_skus WHERE sku_code = 'LEDP-1'), 1, NULL,
    (SELECT id FROM m_locations WHERE full_code = 'LED-A-01-01-B'), (SELECT id FROM m_batches WHERE batch_no = 'B1'));
  SELECT * INTO v_d FROM t_webhook_deliveries WHERE webhook_id = v_hook AND event = 'stock.changed' ORDER BY id DESC LIMIT 1;
  ASSERT v_d.payload->>'sku' = 'LEDP-1', 'FAIL: stock.changed payload ' || v_d.payload;
  ASSERT (SELECT count(*) FROM claim_webhook_deliveries(50) WHERE id = v_d.id) = 1, 'FAIL: delivery not claimed';
  ASSERT (SELECT count(*) FROM claim_webhook_deliveries(50) WHERE id = v_d.id) = 0, 'FAIL: delivery claimed twice';
  PERFORM record_webhook_result(v_d.id, false, 500, 'boom');
  ASSERT (SELECT (status, attempts) FROM t_webhook_deliveries WHERE id = v_d.id) = ('pending'::text, 1),
    'FAIL: first failure';
  ASSERT (SELECT next_attempt_at BETWEEN now() + interval '50 seconds' AND now() + interval '70 seconds'
            FROM t_webhook_deliveries WHERE id = v_d.id), 'FAIL: first backoff';
  PERFORM record_webhook_result(v_d.id, false, 500, 'boom') FROM generate_series(1, 4);
  ASSERT (SELECT status FROM t_webhook_deliveries WHERE id = v_d.id) = 'failed', 'FAIL: not failed after 5';
  ASSERT (SELECT failure_streak FROM t_webhooks WHERE id = v_hook) = 1, 'FAIL: failure streak';

  -- Twenty final failures in a row switch the webhook off.
  UPDATE t_webhooks SET failure_streak = 19 WHERE id = v_hook;
  INSERT INTO t_webhook_deliveries (webhook_id, event, payload, attempts) VALUES (v_hook, 'stock.low', '{}', 4) RETURNING * INTO v_d;
  PERFORM record_webhook_result(v_d.id, false, NULL, 'timeout');
  ASSERT NOT (SELECT is_active FROM t_webhooks WHERE id = v_hook), 'FAIL: webhook not disabled';
  PERFORM enqueue_webhook_event('stock.low', '{}');
  ASSERT (SELECT count(*) FROM t_webhook_deliveries WHERE webhook_id = v_hook AND status = 'pending') = 0,
    'FAIL: disabled webhook still queued';

  PERFORM run_daily_jobs();
  PERFORM run_housekeeping();
  PERFORM dispatch_webhooks();
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  PERFORM retry_webhook_delivery((SELECT min(id) FROM t_webhook_deliveries WHERE status = 'failed'));
  BEGIN
    PERFORM run_daily_jobs();
    RAISE EXCEPTION 'FAIL: client ran the daily job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- superadmin & demo mode
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT public_demo_mode() = false, 'FAIL: anon cannot ask for demo mode';
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  BEGIN
    PERFORM superadmin_stats();
    RAISE EXCEPTION 'FAIL: admin read superadmin stats';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM superadmin_wipe_all_data();
    RAISE EXCEPTION 'FAIL: admin wiped the data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM superadmin_seed_demo_data();
    RAISE EXCEPTION 'FAIL: admin seeded demo data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM wipe_all_data();
    RAISE EXCEPTION 'FAIL: client ran the internal wipe';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL "request.jwt.claim.sub" = '';
UPDATE profiles SET is_superadmin = true WHERE id = '00000000-0000-0000-0000-0000000000a2';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a2';
DO $$ BEGIN
  ASSERT superadmin_stats() ? 'tables', 'FAIL: superadmin stats';
  ASSERT superadmin_monitor() ? 'failed_logins', 'FAIL: superadmin monitor';
END $$;
RESET ROLE;

UPDATE m_settings SET demo_mode = true;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-0000000000a1';
DO $$ BEGIN
  BEGIN
    PERFORM create_api_key('demo', ARRAY['orders:write']);
    RAISE EXCEPTION 'FAIL: demo allowed orders:write';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM create_webhook('https://attacker.example.net/hook', ARRAY['stock.low']);
    RAISE EXCEPTION 'FAIL: demo webhook to any host';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM create_webhook('https://webhook.site/abc', ARRAY['stock.low']);
END $$;
RESET ROLE;
-- lock_demo_credentials is proved through the Auth API (it fires only for supabase_auth_admin).
UPDATE m_settings SET demo_mode = false;

ROLLBACK;
\echo 'security_smoke: OK'
