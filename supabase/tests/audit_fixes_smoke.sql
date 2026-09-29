-- Proves the 2026-09-28 audit fixes on top of the
-- demo seed. Seeds inside one transaction and rolls back, so it leaves the
-- database as it was:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/audit_fixes_smoke.sql
\set ON_ERROR_STOP on
SET client_min_messages = warning;
BEGIN;
SELECT superadmin_seed_demo_data() IS NOT NULL AS seeded;
-- role-less account reads nothing
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000d9', 'nobody@test.local');
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000d9","role":"authenticated"}';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM m_products) = 0, 'FAIL roleless products';
  ASSERT (SELECT count(*) FROM t_stock_balances) = 0, 'FAIL roleless balances';
END $$;
-- worker (agus) reads products, cannot move from staging
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $$ DECLARE b record; s bigint; BEGIN
  ASSERT (SELECT count(*) FROM m_products) > 0, 'FAIL worker products';
END $$;
RESET ROLE;
-- as manager budi: bin transfer out of staging refused
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $$ DECLARE b record; dst bigint; BEGIN
  SELECT sb.* INTO b FROM t_stock_balances sb JOIN m_locations l ON l.id = sb.location_id WHERE l.bin_type='staging' AND sb.qty_on_hand > 0 LIMIT 1;
  ASSERT b.id IS NOT NULL, 'no staging stock in seed';
  SELECT id INTO dst FROM m_locations WHERE warehouse_id=(SELECT warehouse_id FROM m_locations WHERE id=b.location_id) AND bin_type='storage' LIMIT 1;
  BEGIN
    PERFORM create_bin_transfer(b.location_id, dst, b.sku_id, b.batch_id, 1);
    RAISE EXCEPTION 'FAIL staging move allowed';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  -- partially picked list cannot be cancelled
  BEGIN
    PERFORM cancel_pick_list((SELECT pick_list_id FROM t_pick_list_lines WHERE qty_picked > 0 AND pick_list_id IN (SELECT id FROM t_pick_lists WHERE status='picking') LIMIT 1));
    RAISE EXCEPTION 'FAIL cancel after pick';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    RAISE NOTICE 'cancel refused: %', SQLERRM;
  END;
  -- client_inbound with in-house owner refused
  BEGIN
    INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id) VALUES ((SELECT min(id) FROM m_warehouses), 'client_inbound', (SELECT id FROM m_owners WHERE code='INTERNAL'));
    RAISE EXCEPTION 'FAIL client_inbound in-house';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id) VALUES ((SELECT min(id) FROM m_warehouses), 'client_inbound', (SELECT id FROM m_owners WHERE owner_type='client' LIMIT 1));
  BEGIN
    INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id) VALUES ((SELECT min(id) FROM m_warehouses), 'customer_return', (SELECT id FROM m_owners WHERE code='INTERNAL'));
    RAISE EXCEPTION 'FAIL return w/o customer';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;
-- ---------------------------------------------------------------- part 2
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
-- a worker sees no api_key audit rows and no key hash anywhere
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM t_audit_log WHERE entity_type IN ('api_key', 'role_permission', 'access_override')) = 0, 'FAIL worker reads access audit';
  ASSERT (SELECT count(*) FROM t_audit_log) > 0, 'FAIL worker reads no stock audit';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM t_audit_log WHERE detail::text LIKE '%key_hash%'), 'FAIL key hash in audit log';
  -- client stock carries no cost layers (the seed above receives and ships some)
  ASSERT NOT EXISTS (SELECT 1 FROM t_cost_layers c JOIN m_owners o ON o.id = c.owner_id WHERE o.owner_type = 'client'),
    'FAIL client cost layer';
  ASSERT EXISTS (SELECT 1 FROM t_stock_balances b JOIN m_owners o ON o.id = b.owner_id WHERE o.owner_type = 'client'),
    'no client stock in seed';
END $$;
-- an Admin cannot override another Admin; the matrix is read-only
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ DECLARE n int; BEGIN
  UPDATE t_role_permissions SET can_delete = true WHERE role_id = 2;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'FAIL role matrix writable';
  BEGIN
    INSERT INTO t_user_access_override (user_id, feature_id, can_read, can_create, can_update, can_delete)
    VALUES ('00000000-0000-4000-8000-000000000001', (SELECT id FROM m_features WHERE feature_key = 'valuation'), false, false, false, false);
    RAISE EXCEPTION 'FAIL override on a peer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- but can on a Worker
  INSERT INTO t_user_access_override (user_id, feature_id, can_read, can_create, can_update, can_delete)
  VALUES ('00000000-0000-4000-8000-000000000010', (SELECT id FROM m_features WHERE feature_key = 'valuation'), true, false, false, false)
  ON CONFLICT (user_id, feature_id) DO UPDATE SET can_read = true;
END $$;
-- rejecting a transfer variance puts the gap back at the origin with a putaway task
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $$ DECLARE l record; v_tasks int; BEGIN
  SELECT tl.*, t.from_warehouse_id INTO l FROM t_stock_transfer_lines tl JOIN t_stock_transfers t ON t.id = tl.transfer_id
   WHERE tl.variance_status = 'pending' LIMIT 1;
  ASSERT l.id IS NOT NULL, 'no pending variance in seed';
  v_tasks := (SELECT count(*) FROM t_putaway_tasks WHERE warehouse_id = l.from_warehouse_id AND status = 'open');
  PERFORM approve_transfer_variance(l.id, false);
  ASSERT (SELECT count(*) FROM t_putaway_tasks WHERE warehouse_id = l.from_warehouse_id AND status = 'open') = v_tasks + 1,
    'FAIL rejected variance made no putaway task';
END $$;
RESET ROLE;

RESET ROLE;
-- superadmin seed refused outside demo; wipe outside demo drops the public admin
UPDATE m_settings SET demo_mode = false WHERE id = 1;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000000e1', 'sa@test.local');
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
UPDATE profiles SET is_superadmin = true WHERE id = '00000000-0000-0000-0000-0000000000e1';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}';
DO $$ BEGIN
  BEGIN
    PERFORM superadmin_seed_demo_data();
    RAISE EXCEPTION 'FAIL seed on prod';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM superadmin_wipe_all_data();
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM auth.users WHERE email='admin@stockdesk.com'), 'FAIL public admin survived prod wipe';
  ASSERT EXISTS (SELECT 1 FROM auth.users WHERE email='sa@test.local'), 'FAIL superadmin wiped';
END $$;
ROLLBACK;
SELECT 'audit_fixes_smoke: OK';
