-- Proves the costing in post_stock_movement() against the same fixture as
-- src/lib/__tests__/valuation.test.ts. Runs in one transaction and rolls back:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/stock_valuation_smoke.sql
--
--   in 100 @ 10,000 · in 50 @ 12,000 · out 120 · in 30 @ 11,000 · out 40
--   FIFO COGS 1,240,000 then 470,000, closing 20 units = 220,000
--   AVG  COGS 1,280,000 then 433,333.34, closing 20 x 10,833.3334 = 216,666.67
-- Then: valuation as of past dates, COGS report, consignment, snapshots,
-- receipt revaluation and what a Worker may see.

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  v_wh    bigint;
  v_rcv   bigint;
  v_sku   bigint;
  v_out1  bigint;
  v_out2  bigint;
  v_cost  m_sku_costs;
BEGIN
  INSERT INTO m_warehouses (code, name) VALUES ('VALSMK', 'Valuation smoke') RETURNING id INTO v_wh;
  SELECT id INTO v_rcv FROM m_locations WHERE warehouse_id = v_wh AND code = 'RCV';
  INSERT INTO m_products (code, name, owner_id) VALUES ('VALSMK', 'Valuation smoke', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'VALSMK'), 'VALSMK-1', (SELECT id FROM m_uoms WHERE code = 'PCS'))
  RETURNING id INTO v_sku;

  PERFORM post_stock_movement('receipt', v_sku, 100, NULL, v_rcv, p_unit_cost => 10000);
  PERFORM post_stock_movement('receipt', v_sku, 50, NULL, v_rcv, p_unit_cost => 12000);
  v_out1 := post_stock_movement('dispatch', v_sku, 120, v_rcv, NULL);
  PERFORM post_stock_movement('receipt', v_sku, 30, NULL, v_rcv, p_unit_cost => 11000);
  v_out2 := post_stock_movement('dispatch', v_sku, 40, v_rcv, NULL);

  ASSERT (SELECT (cost_fifo, cost_average) FROM t_cogs_entries WHERE movement_id = v_out1) = (1240000.00::numeric(18,2), 1280000.00::numeric(18,2)),
    format('FAIL: first COGS %s', (SELECT (cost_fifo, cost_average)::text FROM t_cogs_entries WHERE movement_id = v_out1));
  ASSERT (SELECT (cost_fifo, cost_average) FROM t_cogs_entries WHERE movement_id = v_out2) = (470000.00::numeric(18,2), 433333.34::numeric(18,2)),
    format('FAIL: second COGS %s', (SELECT (cost_fifo, cost_average)::text FROM t_cogs_entries WHERE movement_id = v_out2));
  ASSERT (SELECT kind FROM t_cogs_entries WHERE movement_id = v_out1) = 'sale', 'FAIL: dispatch is not a sale';

  SELECT * INTO v_cost FROM m_sku_costs WHERE sku_id = v_sku;
  ASSERT v_cost.avg_cost = 10833.3334, format('FAIL: average %s', v_cost.avg_cost);
  ASSERT v_cost.last_cost = 11000, 'FAIL: last cost';
  ASSERT (SELECT sum(qty_remaining * unit_cost) FROM t_cost_layers WHERE sku_id = v_sku) = 220000,
    'FAIL: FIFO closing value';
  ASSERT round(20 * v_cost.avg_cost, 2) = 216666.67, 'FAIL: average closing value';

  -- Layers and balances agree on quantity.
  ASSERT (SELECT sum(qty_remaining) FROM t_cost_layers WHERE sku_id = v_sku)
       = (SELECT sum(qty_on_hand) FROM t_stock_balances WHERE sku_id = v_sku),
    'FAIL: layers and balances disagree';

  -- An internal move changes nothing about cost.
  PERFORM post_stock_movement('putaway', v_sku, 5, v_rcv, (SELECT id FROM m_locations WHERE warehouse_id = v_wh AND code = 'STG'));
  ASSERT (SELECT count(*) FROM t_cogs_entries WHERE sku_id = v_sku) = 2, 'FAIL: internal move booked COGS';
  ASSERT (SELECT count(*) FROM t_cost_layers WHERE sku_id = v_sku) = 3, 'FAIL: internal move added a layer';

  -- A found-stock adjustment without a cost comes in at the running average,
  -- and a loss is booked as an adjustment, not a sale.
  PERFORM post_stock_movement('adjustment', v_sku, 2, NULL, v_rcv);
  ASSERT (SELECT unit_cost FROM t_cost_layers WHERE sku_id = v_sku ORDER BY id DESC LIMIT 1) = 10833.3334,
    'FAIL: uncosted inbound not priced at the average';
  v_out1 := post_stock_movement('adjustment', v_sku, 1, v_rcv, NULL);
  ASSERT (SELECT kind FROM t_cogs_entries WHERE movement_id = v_out1) = 'adjustment', 'FAIL: loss booked as a sale';

  -- Emptying the SKU resets the average for the next receipt.
  PERFORM post_stock_movement('dispatch', v_sku, (SELECT qty_on_hand FROM t_stock_balances WHERE sku_id = v_sku AND location_id = v_rcv), v_rcv, NULL);
  PERFORM post_stock_movement('dispatch', v_sku, 5, (SELECT id FROM m_locations WHERE warehouse_id = v_wh AND code = 'STG'), NULL);
  ASSERT (SELECT avg_cost FROM m_sku_costs WHERE sku_id = v_sku) = 0, 'FAIL: average not reset when empty';
END $$;

-- As-of valuation replays the same fixture with dates, one step every two days:
--   as of step 2: 150 units, FIFO 1,600,000, AVG 150 x 10,666.6667 = 1,600,000.01
--   as of step 3: 30 units,  FIFO 360,000,   AVG 30 x 10,666.6667 = 320,000.00
--   as of step 5: 20 units,  FIFO 220,000,   AVG 216,666.67
-- Client-owned stock has quantity but no value, and never counts as an asset.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000fa01', 'val-admin@test.local');
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-00000000fa01';
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000fa01';

DO $$
DECLARE
  d       date := company_today();
  v_wh    bigint;
  v_rcv   bigint;
  v_sku   bigint;
  v_cli   bigint;
  v_rev   bigint;
  v_gr    bigint;
  v_line  bigint;
  v_before numeric;
BEGIN
  INSERT INTO m_warehouses (code, name) VALUES ('ASOF', 'As-of smoke') RETURNING id INTO v_wh;
  SELECT id INTO v_rcv FROM m_locations WHERE warehouse_id = v_wh AND code = 'RCV';
  INSERT INTO m_products (code, name, owner_id) VALUES ('ASOF', 'As-of smoke', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'ASOF'), 'ASOF-1', (SELECT id FROM m_uoms WHERE code = 'PCS'))
  RETURNING id INTO v_sku;

  PERFORM post_stock_movement('receipt', v_sku, 100, NULL, v_rcv, p_unit_cost => 10000, p_movement_date => d - 10);
  PERFORM post_stock_movement('receipt', v_sku, 50, NULL, v_rcv, p_unit_cost => 12000, p_movement_date => d - 8);
  PERFORM post_stock_movement('dispatch', v_sku, 120, v_rcv, NULL, p_movement_date => d - 6);
  PERFORM post_stock_movement('receipt', v_sku, 30, NULL, v_rcv, p_unit_cost => 11000, p_movement_date => d - 4);
  PERFORM post_stock_movement('dispatch', v_sku, 40, v_rcv, NULL, p_movement_date => d - 2);

  ASSERT (SELECT (qty, value) FROM stock_valuation(d - 8, 'fifo', v_wh)) = (150::numeric, 1600000::numeric), 'FAIL: FIFO as of step 2';
  ASSERT (SELECT value FROM stock_valuation(d - 8, 'average', v_wh)) = 1600000.01, 'FAIL: AVG as of step 2';
  ASSERT (SELECT (qty, value) FROM stock_valuation(d - 6, 'fifo', v_wh)) = (30::numeric, 360000::numeric), 'FAIL: FIFO as of step 3';
  ASSERT (SELECT value FROM stock_valuation(d - 6, 'average', v_wh)) = 320000, 'FAIL: AVG as of step 3';
  ASSERT (SELECT value FROM stock_valuation(d, 'fifo', v_wh)) = 220000, 'FAIL: FIFO today';
  ASSERT (SELECT value FROM stock_valuation(d, 'average', v_wh)) = 216666.67, 'FAIL: AVG today';
  ASSERT NOT EXISTS (SELECT 1 FROM stock_valuation(d - 11, 'fifo', v_wh)), 'FAIL: stock before the first receipt';

  -- COGS report sums what the ledger booked.
  ASSERT (SELECT (qty, cost_fifo, cost_average) FROM cogs_report(d - 10, d) WHERE sku_code = 'ASOF-1' AND kind = 'sale')
       = (160::numeric, 1710000::numeric, 1713333.34::numeric), 'FAIL: COGS report';

  -- Consignment: quantity yes, value no.
  INSERT INTO m_owners (code, name, owner_type) VALUES ('ASOFCLI', 'Client', 'client') RETURNING id INTO v_cli;
  INSERT INTO m_products (code, name, owner_id) VALUES ('ASOFCLI', 'Client goods', v_cli);
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'ASOFCLI'), 'ASOFCLI-1', (SELECT id FROM m_uoms WHERE code = 'PCS'))
  RETURNING id INTO v_cli;
  PERFORM post_stock_movement('receipt', v_cli, 7, NULL, v_rcv, p_unit_cost => 99999);
  ASSERT (SELECT (qty, value IS NULL, unit_cost IS NULL) FROM stock_valuation(d, 'fifo', v_wh) WHERE sku_id = v_cli)
       = (7::numeric, true, true), 'FAIL: consignment has a value';
  ASSERT (dashboard_summary(v_wh)->>'asset_value')::numeric
       = (SELECT sum(value) FROM stock_valuation(d, (SELECT valuation_method FROM m_settings), v_wh)), 'FAIL: dashboard asset value';
  ASSERT NOT EXISTS (SELECT 1 FROM cogs_report(d - 10, d) WHERE sku_code = 'ASOFCLI-1'), 'FAIL: consignment in COGS';

  -- The daily snapshot equals the report for that date, in-house only.
  PERFORM snapshot_stock_value(d - 6);
  PERFORM snapshot_stock_value(d);
  ASSERT (SELECT total_value FROM t_stock_value_snapshots WHERE snapshot_date = d - 6 AND warehouse_id = v_wh)
       = (SELECT sum(value) FROM stock_valuation(d - 6, NULL, v_wh)), 'FAIL: snapshot differs from the report';
  ASSERT (SELECT count(*) FROM t_stock_value_snapshots WHERE snapshot_date = d AND warehouse_id = v_wh) = 1,
    'FAIL: consignment snapshotted';
  ASSERT jsonb_array_length(dashboard_summary(v_wh)->'value_trend') = 1, 'FAIL: trend ignores snapshots before today';

  -- Revaluation: 10 received with no price (estimate at 0), 4 dispatched, then
  -- priced at 5,000. The 4 gone become 20,000 revaluation COGS; the 6 left
  -- carry the new cost.
  INSERT INTO m_products (code, name, owner_id) VALUES ('ASOFREV', 'Revalue me', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'ASOFREV'), 'ASOFREV-1', (SELECT id FROM m_uoms WHERE code = 'PCS'))
  RETURNING id INTO v_rev;
  INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id) VALUES (v_wh, 'production', (SELECT id FROM m_owners WHERE code = 'INTERNAL'))
  RETURNING id INTO v_gr;
  INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received)
  VALUES (v_gr, v_rev, (SELECT id FROM m_uoms WHERE code = 'PCS'), 10) RETURNING id INTO v_line;
  PERFORM post_goods_receipt(v_gr);
  ASSERT (SELECT is_estimate FROM t_cost_layers WHERE sku_id = v_rev), 'FAIL: uncosted receipt not an estimate';
  ASSERT (SELECT count(*) FROM estimated_receipt_lines() WHERE receipt_line_id = v_line) = 1, 'FAIL: estimate not listed';
  PERFORM post_stock_movement('dispatch', v_rev, 4, v_rcv, NULL);
  v_before := (SELECT sum(value) FROM stock_valuation(d, 'fifo', v_wh));

  PERFORM revalue_receipt(v_line, 5000);
  ASSERT (SELECT (qty, cost_fifo) FROM t_cogs_entries WHERE receipt_line_id = v_line) = (4::numeric, 20000::numeric),
    'FAIL: revaluation of goods already gone';
  ASSERT (SELECT (qty_remaining, unit_cost, is_estimate) FROM t_cost_layers WHERE sku_id = v_rev) = (6::numeric, 5000::numeric, false),
    'FAIL: layer not repriced';
  ASSERT (SELECT avg_cost FROM m_sku_costs WHERE sku_id = v_rev) = 5000, 'FAIL: average not repriced';
  ASSERT (SELECT sum(value) FROM stock_valuation(d, 'fifo', v_wh)) = v_before + 30000, 'FAIL: stock value after revaluation';
  ASSERT (SELECT value FROM stock_valuation(d, 'average', v_wh) WHERE sku_id = v_rev) = 30000, 'FAIL: average value after revaluation';
  ASSERT NOT EXISTS (SELECT 1 FROM estimated_receipt_lines() WHERE receipt_line_id = v_line), 'FAIL: estimate still listed';

  -- Product import: creates, then updates on a second run; one bad row undoes all.
  ASSERT import_products('[
    {"row":2,"product_code":"IMP","product_name":"Imported","owner_code":"INTERNAL","sku_code":"IMP-RED","attributes":{"color":"RED"},"base_uom":"PCS","reorder_point":5},
    {"row":3,"product_code":"IMP","product_name":"Imported","owner_code":"INTERNAL","sku_code":"IMP-BLUE","attributes":{"color":"BLUE"},"base_uom":"PCS"}
  ]') = 2, 'FAIL: import count';
  PERFORM import_products('[{"row":2,"product_code":"IMP","product_name":"Imported 2","owner_code":"INTERNAL","sku_code":"IMP-RED","attributes":{"color":"RED"},"base_uom":"PCS","reorder_point":9}]');
  ASSERT (SELECT (p.name, s.reorder_point, p.variant_attributes) FROM m_skus s JOIN m_products p ON p.id = s.product_id WHERE s.sku_code = 'IMP-RED')
       = ('Imported 2'::text, 9::numeric(14,3), '{color}'::text[]), 'FAIL: import update';
  BEGIN
    PERFORM import_products('[
      {"row":2,"product_code":"IMP2","product_name":"New","owner_code":"INTERNAL","sku_code":"IMP2-1","base_uom":"PCS"},
      {"row":3,"product_code":"IMP3","product_name":"Bad","owner_code":"NOPE","sku_code":"IMP3-1","base_uom":"PCS"}
    ]');
    RAISE EXCEPTION 'FAIL: bad row imported';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'Row 3: unknown owner NOPE', 'FAIL: import error ' || SQLERRM;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM m_products WHERE code = 'IMP2'), 'FAIL: import not all or nothing';
END $$;

-- A Worker sees the dashboard without money and cannot open the reports.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000fa02', 'val-worker@test.local');
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Worker')
 WHERE id = '00000000-0000-0000-0000-00000000fa02';
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000fa02';
DO $$
BEGIN
  ASSERT dashboard_summary() ? 'active_skus', 'FAIL: worker has no dashboard';
  ASSERT dashboard_summary()->'asset_value' = 'null'::jsonb, 'FAIL: worker sees asset value';
  ASSERT dashboard_summary()->'value_trend' = 'null'::jsonb, 'FAIL: worker sees the value trend';
  BEGIN
    PERFORM stock_valuation();
    RAISE EXCEPTION 'FAIL: worker read valuation';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM snapshot_stock_value();
    RAISE EXCEPTION 'FAIL: worker ran the snapshot job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM t_avg_cost_log), 'FAIL: worker reads the average history';
  BEGIN
    PERFORM import_products('[]');
    RAISE EXCEPTION 'FAIL: worker imported products';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
\echo 'stock_valuation_smoke: OK'
