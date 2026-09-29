-- Proves the 2026-09-29 security fixes (20260929210000, 20260929220000) on
-- top of the demo seed. One transaction, rolled back:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/security_fixes_smoke.sql
\set ON_ERROR_STOP on
SET client_min_messages = warning;
BEGIN;
SELECT superadmin_seed_demo_data() IS NOT NULL AS seeded;

-- Fixtures as the owner: budi may manage users, one stocked bin is frozen,
-- and the audit log holds a superadmin profile change.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000d9', 'nobody@test.local');
INSERT INTO t_user_access_override (user_id, feature_id, can_read, can_update)
SELECT '00000000-0000-4000-8000-000000000003', id, true, true FROM m_features WHERE feature_key = 'users';
CREATE TEMP TABLE _frozen ON COMMIT DROP AS
  SELECT sb.location_id AS id FROM t_stock_balances sb JOIN m_locations l ON l.id = sb.location_id
   WHERE sb.qty_on_hand > 0 AND l.bin_type = 'storage' AND NOT l.is_counting LIMIT 1;
GRANT SELECT ON _frozen TO authenticated;
UPDATE m_locations SET is_counting = true WHERE id = (SELECT id FROM _frozen);
INSERT INTO t_audit_log (action, entity_type, entity_id, detail)
VALUES ('update', 'profile', 'hidden', '{"after":{"is_superadmin":true}}');

-- ---------------------------------------------------------------- manager budi
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE v_line bigint; v_so bigint; n int; BEGIN
  SELECT id INTO v_line FROM t_sales_order_lines WHERE order_is_editable(order_id) LIMIT 1;
  ASSERT v_line IS NOT NULL, 'no editable order line in seed';
  BEGIN
    UPDATE t_sales_order_lines SET base_qty = 1000 WHERE id = v_line;
    RAISE EXCEPTION 'FAIL: base_qty writable';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE t_sales_order_lines SET qty = qty WHERE id = v_line;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'FAIL: qty edit refused';

  BEGIN
    UPDATE m_locations SET is_counting = false WHERE id = (SELECT id FROM _frozen);
    RAISE EXCEPTION 'FAIL: bin unfrozen by hand';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Approvers still see the frozen bin.
  ASSERT EXISTS (SELECT 1 FROM t_stock_balances WHERE location_id = (SELECT id FROM _frozen)), 'FAIL: approver lost the bin';

  INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_name, created_by)
  VALUES ((SELECT min(id) FROM m_warehouses), (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'Test',
          '00000000-0000-4000-8000-000000000005') RETURNING id INTO v_so;
  ASSERT (SELECT created_by FROM t_sales_orders WHERE id = v_so) = '00000000-0000-4000-8000-000000000003',
    'FAIL: created_by spoofed';

  -- Grants only what budi holds himself.
  INSERT INTO t_user_access_override (user_id, feature_id, can_create)
  SELECT '00000000-0000-4000-8000-000000000005', id, true FROM m_features WHERE feature_key = 'pick-list';
  BEGIN
    INSERT INTO t_user_access_override (user_id, feature_id, can_create)
    SELECT '00000000-0000-4000-8000-000000000005', id, true FROM m_features WHERE feature_key = 'integration';
    RAISE EXCEPTION 'FAIL: granted integration he lacks';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------- worker agus
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_balances WHERE location_id = (SELECT id FROM _frozen)), 'FAIL: blind count balance';
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_movements WHERE (SELECT id FROM _frozen) IN (from_location_id, to_location_id)),
    'FAIL: blind count ledger';
  ASSERT EXISTS (SELECT 1 FROM t_stock_balances), 'FAIL: worker lost every balance';
END $$;

-- ---------------------------------------------------------------- admin rina
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM t_audit_log WHERE entity_id = 'hidden'), 'FAIL: superadmin in audit log';
  ASSERT EXISTS (SELECT 1 FROM t_audit_log WHERE entity_type = 'access_override'), 'FAIL: admin lost access audit';
END $$;

-- ---------------------------------------------------------------- no role
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000d9","role":"authenticated"}';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM profiles) = 1, 'FAIL: role-less reads staff directory';
  ASSERT (SELECT count(*) FROM get_users_with_email()) = 0, 'FAIL: role-less reads user list';
END $$;

-- ---------------------------------------------------------------- banned worker
RESET ROLE;
UPDATE auth.users SET banned_until = now() + interval '1 day' WHERE id = '00000000-0000-4000-8000-000000000006';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated"}';
DO $$ BEGIN
  ASSERT NOT has_any_access() AND NOT has_permission('goods-receipt', 'read'), 'FAIL: banned token still works';
  ASSERT NOT EXISTS (SELECT 1 FROM m_products), 'FAIL: banned reads products';
END $$;

-- ---------------------------------------------------------------- anon error log, per IP
RESET ROLE;
DELETE FROM t_error_log WHERE user_id IS NULL;
SET LOCAL ROLE anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';
SET LOCAL "request.headers" = '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}';
SELECT count(log_client_error('auth.login', 'flood', NULL)) FROM generate_series(1, 25);
SET LOCAL "request.headers" = '{"cf-connecting-ip":"198.51.100.7"}';
SELECT log_client_error('auth.login', 'Invalid login credentials', '{"email":"real@x"}');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM t_error_log WHERE context->>'ip' = '203.0.113.9') = 20, 'FAIL: per-IP cap';
  ASSERT EXISTS (SELECT 1 FROM t_error_log WHERE context->>'ip' = '198.51.100.7' AND context->>'email' = 'real@x'),
    'FAIL: one flooder muted another IP';
END $$;

ROLLBACK;
\echo security_fixes_smoke: OK
