-- Walks stock through the warehouse the way people do, as the roles that do
-- it, through RLS and the RPCs. Runs in one transaction and rolls back:
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/stock_flow_smoke.sql
-- Inbound: receipt, QC, putaway. Outbound: order, FEFO pick list, picking,
-- packing, dispatch. Control: transfers, stock opname, stock card.

\set ON_ERROR_STOP on
SET client_min_messages = warning;
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000f001', 'flow-manager@test.local'),
  ('00000000-0000-0000-0000-00000000f002', 'flow-worker@test.local'),
  ('00000000-0000-0000-0000-00000000f003', 'flow-manager2@test.local'),
  ('00000000-0000-0000-0000-00000000f004', 'flow-admin@test.local');
SET LOCAL "request.jwt.claims" = '{"role":"service_role"}';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Manager')
 WHERE id IN ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f003');
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Warehouse Worker')
 WHERE id = '00000000-0000-0000-0000-00000000f002';
UPDATE profiles SET role_id = (SELECT id FROM m_roles WHERE role_name = 'Admin')
 WHERE id = '00000000-0000-0000-0000-00000000f004';
SET LOCAL "request.jwt.claims" = '';

-- ---------------------------------------------------------------- master data (manager)
-- Bin layout matches BINS in src/lib/__tests__/putaway.test.ts.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f001';
DO $$
DECLARE
  v_wh   bigint;
  v_rack bigint;
  v_app  bigint;
  v_food bigint;
BEGIN
  INSERT INTO m_categories (code, name) VALUES ('FLOWAPP', 'Apparel') RETURNING id INTO v_app;
  INSERT INTO m_categories (code, name) VALUES ('FLOWFOOD', 'Food') RETURNING id INTO v_food;
  INSERT INTO m_suppliers (code, name) VALUES ('FLOWSUP', 'Flow supplier');
  INSERT INTO m_warehouses (code, name) VALUES ('FLOW', 'Flow WH') RETURNING id INTO v_wh;
  PERFORM generate_bins(v_wh, 'Z', ARRAY['01'], 1, ARRAY['X']);
  v_rack := (SELECT parent_id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-X');
  INSERT INTO m_locations (warehouse_id, parent_id, level, code, bin_type, max_qty, pick_sequence, allowed_category_ids, is_active) VALUES
    (v_wh, v_rack, 'bin', 'B1', 'storage', 100, 40, '{}', true),
    (v_wh, v_rack, 'bin', 'B2', 'storage', 100, 20, ARRAY[v_app], true),
    (v_wh, v_rack, 'bin', 'B3', 'storage', 100, 10, '{}', true),
    (v_wh, v_rack, 'bin', 'B4', 'storage', 100, 5, '{}', true),
    (v_wh, v_rack, 'bin', 'B5', 'storage', 100, 1, ARRAY[v_food], true),
    (v_wh, v_rack, 'bin', 'B6', 'storage', 100, 2, '{}', true),
    (v_wh, v_rack, 'bin', 'B7', 'storage', 100, 3, '{}', false);
  -- The generated bin X would otherwise be the nearest empty bin.
  UPDATE m_locations SET is_active = false WHERE full_code = 'FLOW-Z-01-01-X';

  INSERT INTO m_products (code, name, owner_id, category_id)
  VALUES ('FLOWTEE', 'Flow tee', (SELECT id FROM m_owners WHERE code = 'INTERNAL'), v_app);
  INSERT INTO m_skus (product_id, sku_code, base_uom_id, track_batch, track_expiry)
  VALUES ((SELECT id FROM m_products WHERE code = 'FLOWTEE'), 'FLOWTEE-1', (SELECT id FROM m_uoms WHERE code = 'PCS'), true, true);
  INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base)
  VALUES ((SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1'), (SELECT id FROM m_uoms WHERE code = 'BOX'), 12);

  INSERT INTO m_products (code, name, owner_id) VALUES ('FLOWOTHER', 'Other', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'FLOWOTHER'), 'FLOWOTHER-1', (SELECT id FROM m_uoms WHERE code = 'PCS'));
END $$;
RESET ROLE;

-- Opening stock (owner): B1 holds 50 of the same batch, B4 10 of another SKU, B6 95 of the same batch.
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1');
  v_b   bigint;
BEGIN
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_sku, 'LOT-A', company_today() + 180) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_sku, 50, NULL, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B1'), v_b, 1000);
  PERFORM post_stock_movement('receipt', v_sku, 95, NULL, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B6'), v_b, 1000);
  PERFORM post_stock_movement('receipt', (SELECT id FROM m_skus WHERE sku_code = 'FLOWOTHER-1'), 10, NULL,
                              (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B4'), NULL, 500);
END $$;

-- ---------------------------------------------------------------- goods receipt (worker types, manager prices)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$
DECLARE
  v_gr bigint;
BEGIN
  INSERT INTO t_goods_receipts (warehouse_id, supplier_id, owner_id, reference_no)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'FLOW'), (SELECT id FROM m_suppliers WHERE code = 'FLOWSUP'),
          (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'PO-1')
  RETURNING id INTO v_gr;
  ASSERT (SELECT gr_no FROM t_goods_receipts WHERE id = v_gr) ~ '^GR/\d{4}/\d{2}/\d{4}$', 'FAIL: receipt number format';

  -- 24 pieces arrive, 4 fail QC. The lower-case batch number gets normalised to LOT-A.
  INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received, qty_rejected, reject_reason, batch_no, expiry_date)
  VALUES (v_gr, (SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1'), (SELECT id FROM m_uoms WHERE code = 'PCS'),
          24, 4, 'Torn packaging', 'lot-a', company_today() + 180);

  BEGIN
    INSERT INTO t_receipt_line_costs (receipt_line_id, unit_cost)
    VALUES ((SELECT id FROM t_goods_receipt_lines WHERE receipt_id = v_gr), 1);
    RAISE EXCEPTION 'FAIL: worker priced a receipt line';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM set_receipt_costs(v_gr, jsonb_build_array(jsonb_build_object(
      'line_id', (SELECT id FROM t_goods_receipt_lines WHERE receipt_id = v_gr), 'unit_cost', 1)));
    RAISE EXCEPTION 'FAIL: worker priced a receipt line through the RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Prices take valuation update: the manager (read only) is refused, the admin enters them.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f001';
DO $$ BEGIN
  PERFORM set_receipt_costs((SELECT id FROM t_goods_receipts WHERE reference_no = 'PO-1'), '[]');
  RAISE EXCEPTION 'FAIL: manager entered receipt prices';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f004';
SELECT set_receipt_costs(r.id, jsonb_agg(jsonb_build_object('line_id', l.id, 'unit_cost', 1300)))
  FROM t_goods_receipt_lines l JOIN t_goods_receipts r ON r.id = l.receipt_id WHERE r.reference_no = 'PO-1' GROUP BY r.id;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$
DECLARE
  v_gr   bigint := (SELECT id FROM t_goods_receipts WHERE reference_no = 'PO-1');
  v_sku  bigint := (SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1');
  v_task t_putaway_tasks;
BEGIN
  ASSERT (SELECT count(*) FROM t_receipt_line_costs) = 0, 'FAIL: worker can read receipt prices';
  PERFORM post_goods_receipt(v_gr);

  ASSERT (SELECT status FROM t_goods_receipts WHERE id = v_gr) = 'received', 'FAIL: status after posting';
  ASSERT (SELECT qty_on_hand FROM t_stock_balances WHERE sku_id = v_sku
           AND location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-RCV')) = 20, 'FAIL: accepted qty in RCV';
  ASSERT (SELECT qty_on_hand FROM t_stock_balances WHERE sku_id = v_sku
           AND location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-QRN')) = 4, 'FAIL: rejects in quarantine';
  -- The batch number was normalised and reused, not duplicated.
  ASSERT (SELECT count(*) FROM m_batches WHERE sku_id = v_sku) = 1, 'FAIL: batch duplicated';

  -- Posted receipts are frozen.
  UPDATE t_goods_receipts SET reference_no = 'EDITED' WHERE id = v_gr;
  ASSERT (SELECT reference_no FROM t_goods_receipts WHERE id = v_gr) = 'PO-1', 'FAIL: posted receipt edited';
  UPDATE t_goods_receipt_lines SET qty_received = 999 WHERE receipt_id = v_gr;
  ASSERT (SELECT qty_received FROM t_goods_receipt_lines WHERE receipt_id = v_gr) = 24, 'FAIL: posted line edited';
  BEGIN
    PERFORM post_goods_receipt(v_gr);
    RAISE EXCEPTION 'FAIL: receipt posted twice';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Suggestions match rankPutawayBins(): B1 (same batch), B3 and B2 (empty, by pick order), B4.
  ASSERT (SELECT array_agg(full_code ORDER BY rank, pick_sequence)
            FROM suggest_putaway_bins(v_sku, 20, (SELECT id FROM m_warehouses WHERE code = 'FLOW'),
                                      (SELECT id FROM m_batches WHERE sku_id = v_sku)))
       = ARRAY['FLOW-Z-01-01-B1', 'FLOW-Z-01-01-B3', 'FLOW-Z-01-01-B2', 'FLOW-Z-01-01-B4'],
    'FAIL: putaway suggestion order';

  SELECT * INTO v_task FROM t_putaway_tasks WHERE receipt_id = v_gr;
  ASSERT v_task.qty = 20 AND v_task.suggested_location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B1'),
    'FAIL: task not created with the top suggestion';

  BEGIN
    PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B5'), 5);
    RAISE EXCEPTION 'FAIL: put into a bin for another category';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B6'), 10);
    RAISE EXCEPTION 'FAIL: bin overfilled';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B3'), 21);
    RAISE EXCEPTION 'FAIL: put away more than received';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Split: 15 where suggested, 5 into another bin the worker picked.
  PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B1'), 15,
                           '00000000-0000-4000-8000-0000000000aa');
  ASSERT (SELECT status FROM t_putaway_tasks WHERE id = v_task.id) = 'open', 'FAIL: partial putaway closed the task';
  -- The same scan sent twice (network retry) moves stock once.
  PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B1'), 15,
                           '00000000-0000-4000-8000-0000000000aa');
  ASSERT (SELECT qty_done FROM t_putaway_tasks WHERE id = v_task.id) = 15, 'FAIL: retried putaway counted twice';
  ASSERT (SELECT count(*) FROM t_stock_movements WHERE request_id = '00000000-0000-4000-8000-0000000000aa') = 1,
    'FAIL: retried putaway posted twice';
  PERFORM complete_putaway(v_task.id, (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B3'), 5);
  SELECT * INTO v_task FROM t_putaway_tasks WHERE id = v_task.id;
  ASSERT v_task.status = 'done' AND v_task.actual_location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B3'),
    'FAIL: task not closed with the actual bin';
  ASSERT (SELECT status FROM t_goods_receipts WHERE id = v_gr) = 'putaway_done', 'FAIL: receipt not closed after putaway';
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_balances WHERE sku_id = v_sku AND qty_on_hand > 0
                       AND location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-RCV')),
    'FAIL: receiving bin not emptied';
  ASSERT (SELECT qty_on_hand FROM t_stock_balances WHERE sku_id = v_sku
           AND location_id = (SELECT id FROM m_locations WHERE full_code = 'FLOW-Z-01-01-B1')) = 65, 'FAIL: B1 total';
END $$;
RESET ROLE;

-- The received price per piece became the cost layer; the rejects too.
DO $$ BEGIN
  ASSERT (SELECT array_agg(l.unit_cost ORDER BY l.id) FROM t_cost_layers l JOIN m_skus s ON s.id = l.sku_id
           WHERE s.sku_code = 'FLOWTEE-1') = ARRAY[1000, 1000, 1300, 1300]::numeric[],
    'FAIL: receipt cost not booked';
END $$;

-- A priced line in another unit converts to cost per base unit: 1 box at 12,000 = 1,000 per piece.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f004';
DO $$
DECLARE
  v_gr bigint;
BEGIN
  INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id, reference_no)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'FLOW'), 'production', (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'PROD-1')
  RETURNING id INTO v_gr;
  INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received, batch_no, expiry_date)
  VALUES (v_gr, (SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1'), (SELECT id FROM m_uoms WHERE code = 'BOX'), 1,
          'LOT-B', company_today() + 30);
  PERFORM set_receipt_costs(v_gr, (SELECT jsonb_agg(jsonb_build_object('line_id', id, 'unit_cost', 12000))
                                     FROM t_goods_receipt_lines WHERE receipt_id = v_gr));

  BEGIN
    INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received)
    VALUES (v_gr, (SELECT id FROM m_skus WHERE sku_code = 'FLOWTEE-1'), (SELECT id FROM m_uoms WHERE code = 'PCS'), 1);
    PERFORM post_goods_receipt(v_gr);
    RAISE EXCEPTION 'FAIL: batch-tracked line posted without a batch';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  PERFORM post_goods_receipt(v_gr);
  ASSERT (SELECT unit_cost FROM t_cost_layers ORDER BY id DESC LIMIT 1) = 1000, 'FAIL: box price not converted per piece';
  ASSERT (SELECT base_qty_accepted FROM t_goods_receipt_lines WHERE receipt_id = v_gr) = 12, 'FAIL: base quantity';
END $$;

-- Status only moves through RPCs: a direct update is refused, cancel_goods_receipt
-- works on a draft, and a cancelled receipt is no longer editable or deletable.
DO $$
DECLARE
  v_gr bigint;
BEGIN
  INSERT INTO t_goods_receipts (warehouse_id, source_type, owner_id, reference_no)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'FLOW'), 'production', (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'CANCEL-1')
  RETURNING id INTO v_gr;
  BEGIN
    UPDATE t_goods_receipts SET status = 'received' WHERE id = v_gr;
    RAISE EXCEPTION 'FAIL: receipt status changed directly';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM cancel_goods_receipt(v_gr);
  ASSERT (SELECT status FROM t_goods_receipts WHERE id = v_gr) = 'cancelled', 'FAIL: receipt not cancelled';
  BEGIN
    DELETE FROM t_goods_receipts WHERE id = v_gr;
    RAISE EXCEPTION 'FAIL: cancelled receipt deleted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

-- ---------------------------------------------------------------- outbound
-- Stock and layout match MILK in src/lib/__tests__/fefo.test.ts (dates relative to today).
DO $$
DECLARE
  v_wh   bigint;
  v_milk bigint;
  v_soap bigint;
  v_b    bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f001', true);
  INSERT INTO m_warehouses (code, name) VALUES ('OUT', 'Outbound WH') RETURNING id INTO v_wh;
  PERFORM generate_bins(v_wh, 'Z', ARRAY['01', '02'], 3, ARRAY['A']);
  PERFORM set_config('request.jwt.claim.sub', '', true);

  INSERT INTO m_products (code, name, owner_id) VALUES ('MILK', 'Milk', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id, track_batch, track_expiry)
  VALUES ((SELECT id FROM m_products WHERE code = 'MILK'), 'MILK-1L', (SELECT id FROM m_uoms WHERE code = 'PCS'), true, true)
  RETURNING id INTO v_milk;
  INSERT INTO m_products (code, name, owner_id) VALUES ('SOAP', 'Soap', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id, track_batch)
  VALUES ((SELECT id FROM m_products WHERE code = 'SOAP'), 'SOAP-1', (SELECT id FROM m_uoms WHERE code = 'PCS'), true)
  RETURNING id INTO v_soap;

  -- The expired batch is received while still in date, as it would have been.
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_milk, 'OLD', company_today() + 5) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_milk, 10, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-01-01-A'), v_b, 9000);
  UPDATE m_batches SET expiry_date = company_today() - 1 WHERE id = v_b;
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_milk, 'SOON', company_today() + 10) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_milk, 5, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-02-03-A'), v_b, 9000);
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_milk, 'LATE', company_today() + 60) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_milk, 20, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-01-02-A'), v_b, 9000);
  INSERT INTO m_batches (sku_id, batch_no, expiry_date) VALUES (v_milk, 'MID', company_today() + 30) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_milk, 8, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-02-01-A'), v_b, 9000);

  -- Soap, FIFO: the older receipt sits further down the aisle.
  INSERT INTO m_batches (sku_id, batch_no, received_at) VALUES (v_soap, 'S-NEW', company_today() - 5) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_soap, 10, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-01-01-A'), v_b, 2000);
  INSERT INTO m_batches (sku_id, batch_no, received_at) VALUES (v_soap, 'S-OLD', company_today() - 20) RETURNING id INTO v_b;
  PERFORM post_stock_movement('receipt', v_soap, 4, NULL, (SELECT id FROM m_locations WHERE full_code = 'OUT-Z-01-03-A'), v_b, 2000);
END $$;

-- Workers pick but do not create orders or pick lists.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$ BEGIN
  BEGIN
    INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_name)
    VALUES ((SELECT id FROM m_warehouses WHERE code = 'OUT'), (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'x');
    RAISE EXCEPTION 'FAIL: worker created a sales order';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f001';
DO $$
DECLARE
  v_so1  bigint;
  v_so2  bigint;
  v_pl   bigint;
BEGIN
  INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_name, reference_no)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'OUT'), (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'Toko A', 'SO-A')
  RETURNING id INTO v_so1;
  INSERT INTO t_sales_order_lines (order_id, sku_id, uom_id, qty) VALUES
    (v_so1, (SELECT id FROM m_skus WHERE sku_code = 'MILK-1L'), (SELECT id FROM m_uoms WHERE code = 'PCS'), 25),
    (v_so1, (SELECT id FROM m_skus WHERE sku_code = 'SOAP-1'), (SELECT id FROM m_uoms WHERE code = 'PCS'), 6);
  ASSERT (SELECT so_no FROM t_sales_orders WHERE id = v_so1) ~ '^SO/\d{4}/\d{2}/\d{4}$', 'FAIL: order number';

  v_pl := generate_pick_list(ARRAY[v_so1]);

  -- FEFO for milk (expired skipped), FIFO for soap, then the serpentine walk.
  ASSERT (SELECT array_agg(l.full_code || ':' || s.sku_code || ':' || pl.qty::int ORDER BY pl.seq)
            FROM t_pick_list_lines pl JOIN m_locations l ON l.id = pl.location_id JOIN m_skus s ON s.id = pl.sku_id
           WHERE pl.pick_list_id = v_pl)
       = ARRAY['OUT-Z-01-01-A:SOAP-1:2', 'OUT-Z-01-02-A:MILK-1L:12', 'OUT-Z-01-03-A:SOAP-1:4',
               'OUT-Z-02-03-A:MILK-1L:5', 'OUT-Z-02-01-A:MILK-1L:8'],
    format('FAIL: allocation or route %s', (SELECT array_agg(l.full_code || ':' || pl.qty::int ORDER BY pl.seq)
            FROM t_pick_list_lines pl JOIN m_locations l ON l.id = pl.location_id WHERE pl.pick_list_id = v_pl)::text);
  ASSERT (SELECT status FROM t_sales_orders WHERE id = v_so1) = 'allocated', 'FAIL: order not allocated';
  ASSERT (SELECT sum(qty_reserved) FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id WHERE s.sku_code = 'MILK-1L') = 25,
    'FAIL: milk not reserved';

  -- A second order competes for the same milk: it only gets what is still free.
  INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_name, reference_no)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'OUT'), (SELECT id FROM m_owners WHERE code = 'INTERNAL'), 'Toko B', 'SO-B')
  RETURNING id INTO v_so2;
  INSERT INTO t_sales_order_lines (order_id, sku_id, uom_id, qty)
  VALUES (v_so2, (SELECT id FROM m_skus WHERE sku_code = 'MILK-1L'), (SELECT id FROM m_uoms WHERE code = 'PCS'), 20);
  PERFORM generate_pick_list(ARRAY[v_so2]);
  ASSERT (SELECT qty_allocated FROM t_sales_order_lines WHERE order_id = v_so2) = 8, 'FAIL: double allocation';
  ASSERT (SELECT status FROM t_sales_orders WHERE id = v_so2) = 'open', 'FAIL: short order should stay open';
  BEGIN
    PERFORM generate_pick_list(ARRAY[v_so2]);
    RAISE EXCEPTION 'FAIL: allocated stock that is not free';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Cancelling order B's pick list gives its 8 units back.
  PERFORM cancel_pick_list((SELECT DISTINCT pick_list_id FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id WHERE ol.order_id = v_so2));
  ASSERT (SELECT sum(qty_reserved) FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id WHERE s.sku_code = 'MILK-1L') = 25,
    'FAIL: cancel did not release the reservation';
END $$;
RESET ROLE;

-- The worker walks the route.
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$
DECLARE
  v_pl bigint := (SELECT pl.pick_list_id FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id
                   JOIN t_sales_orders o ON o.id = ol.order_id WHERE o.reference_no = 'SO-A' LIMIT 1);
  stop record;
BEGIN
  BEGIN
    PERFORM generate_pick_list(ARRAY[(SELECT id FROM t_sales_orders WHERE reference_no = 'SO-B')]);
    RAISE EXCEPTION 'FAIL: worker generated a pick list';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM confirm_pick_line((SELECT id FROM t_pick_list_lines WHERE pick_list_id = v_pl AND seq = 5), 6);
    RAISE EXCEPTION 'FAIL: short pick without a reason';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  FOR stop IN SELECT * FROM t_pick_list_lines WHERE pick_list_id = v_pl ORDER BY seq LOOP
    IF stop.seq = 5 THEN
      PERFORM confirm_pick_line(stop.id, 6, 'Two cartons dented');
    ELSE
      PERFORM confirm_pick_line(stop.id, stop.qty, NULL, md5(stop.id::text)::uuid);
      -- A retry of the same scan is a no-op, not an error and not a second pick.
      PERFORM confirm_pick_line(stop.id, stop.qty, NULL, md5(stop.id::text)::uuid);
      ASSERT (SELECT count(*) FROM t_stock_movements WHERE request_id = md5(stop.id::text)::uuid) = 1,
        'FAIL: retried pick posted twice';
    END IF;
  END LOOP;

  ASSERT (SELECT status FROM t_pick_lists WHERE id = v_pl) = 'done', 'FAIL: pick list not done';
  ASSERT (SELECT status FROM t_sales_orders WHERE reference_no = 'SO-A') = 'picked', 'FAIL: order not picked';
  ASSERT (SELECT sum(qty_reserved) FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id
           WHERE s.sku_code IN ('MILK-1L', 'SOAP-1')) = 0, 'FAIL: reservations left after picking';
  ASSERT (SELECT sum(qty_on_hand) FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           WHERE l.full_code = 'OUT-STG') = 29, 'FAIL: staging should hold 23 milk + 6 soap';
  -- The 2 short units stay in their bin, free again.
  ASSERT (SELECT qty_on_hand - qty_reserved FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           WHERE l.full_code = 'OUT-Z-02-01-A') = 2, 'FAIL: short units not released';
END $$;

-- Packing must match the picks exactly, then dispatch takes the stock out.
DO $$
DECLARE
  v_so  bigint := (SELECT id FROM t_sales_orders WHERE reference_no = 'SO-A');
  v_sh  bigint;
  v_items jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('sku_id', pl.sku_id, 'batch_id', pl.batch_id, 'qty', pl.qty_picked))
    INTO v_items
    FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id
   WHERE ol.order_id = v_so AND pl.qty_picked > 0;
  BEGIN
    PERFORM pack_shipment(v_so, v_items || jsonb_build_array(jsonb_build_object('sku_id', (SELECT id FROM m_skus WHERE sku_code = 'SOAP-1'), 'batch_id', NULL, 'qty', 1)), 4.5);
    RAISE EXCEPTION 'FAIL: packed an item that was not picked';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  v_sh := pack_shipment(v_so, v_items, 4.5, 2, '40x30x20');
  ASSERT (SELECT do_no FROM t_shipments WHERE id = v_sh) ~ '^DO/\d{4}/\d{2}/\d{4}$', 'FAIL: delivery order number';
  ASSERT (SELECT status FROM t_sales_orders WHERE id = v_so) = 'packed', 'FAIL: order not packed';

  BEGIN
    PERFORM dispatch_shipment(v_sh, '  ');
    RAISE EXCEPTION 'FAIL: dispatched without a courier';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM dispatch_shipment(v_sh, 'JNE', 'JNE123');
  ASSERT (SELECT status FROM t_sales_orders WHERE id = v_so) = 'dispatched', 'FAIL: order not dispatched';
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
                      WHERE l.full_code = 'OUT-STG' AND b.qty_on_hand > 0), 'FAIL: staging not emptied';
  ASSERT (SELECT sum(qty_on_hand) FROM t_stock_balances b JOIN m_skus s ON s.id = b.sku_id WHERE s.sku_code = 'MILK-1L') = 20,
    'FAIL: milk left should be 43 - 23';
END $$;
RESET ROLE;

-- COGS was booked as sales; staff cannot see it, the ledger can.
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM t_cogs_entries c JOIN t_stock_movements m ON m.id = c.movement_id
           WHERE m.ref_type = 'shipment' AND c.kind = 'sale') >= 2, 'FAIL: dispatch booked no COGS';
END $$;

-- ---------------------------------------------------------------- control: transfers
DO $$
DECLARE
  v_w1 bigint;
  v_w2 bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f001', true);
  INSERT INTO m_warehouses (code, name) VALUES ('CTL1', 'Control 1') RETURNING id INTO v_w1;
  INSERT INTO m_warehouses (code, name) VALUES ('CTL2', 'Control 2') RETURNING id INTO v_w2;
  PERFORM generate_bins(v_w1, 'A', ARRAY['01'], 3, ARRAY['A']);
  PERFORM generate_bins(v_w2, 'A', ARRAY['01'], 3, ARRAY['A']);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO m_products (code, name, owner_id) VALUES ('CTLP', 'Control item', (SELECT id FROM m_owners WHERE code = 'INTERNAL'));
  INSERT INTO m_skus (product_id, sku_code, base_uom_id)
  VALUES ((SELECT id FROM m_products WHERE code = 'CTLP'), 'CTLP-1', (SELECT id FROM m_uoms WHERE code = 'PCS'));
  PERFORM post_stock_movement('receipt', (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1'), 30, NULL,
                              (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'), NULL, 1000);
END $$;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1');
BEGIN
  PERFORM create_bin_transfer((SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'),
                              (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-02-A'), v_sku, NULL, 5, 'Consolidate');
  ASSERT (SELECT qty_on_hand FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           WHERE l.full_code = 'CTL1-A-01-02-A' AND b.sku_id = v_sku) = 5, 'FAIL: bin to bin';
  BEGIN
    PERFORM create_bin_transfer((SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'),
                                (SELECT id FROM m_locations WHERE full_code = 'CTL2-A-01-01-A'), v_sku, NULL, 1);
    RAISE EXCEPTION 'FAIL: bin to bin crossed warehouses';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    INSERT INTO t_stock_transfers (transfer_type, from_warehouse_id, to_warehouse_id)
    VALUES ('inter_warehouse', (SELECT id FROM m_warehouses WHERE code = 'CTL1'), (SELECT id FROM m_warehouses WHERE code = 'CTL2'));
    RAISE EXCEPTION 'FAIL: worker created an inter-warehouse transfer';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f001';
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1');
  v_tr  bigint;
BEGIN
  INSERT INTO t_stock_transfers (transfer_type, from_warehouse_id, to_warehouse_id, note)
  VALUES ('inter_warehouse', (SELECT id FROM m_warehouses WHERE code = 'CTL1'), (SELECT id FROM m_warehouses WHERE code = 'CTL2'), 'Rebalance')
  RETURNING id INTO v_tr;
  INSERT INTO t_stock_transfer_lines (transfer_id, sku_id, from_location_id, qty)
  VALUES (v_tr, v_sku, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'), 10);
  PERFORM send_transfer(v_tr);
  ASSERT (SELECT qty_on_hand FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           WHERE l.full_code = 'CTL1-TRANSIT' AND b.sku_id = v_sku) = 10, 'FAIL: nothing in transit';
  ASSERT (SELECT sum(qty_on_hand) FROM t_stock_balances WHERE sku_id = v_sku) = 30, 'FAIL: transfer changed the total';

  BEGIN
    PERFORM receive_transfer(v_tr, jsonb_build_array(jsonb_build_object('line_id', (SELECT id FROM t_stock_transfer_lines WHERE transfer_id = v_tr), 'qty_received', 8)));
    RAISE EXCEPTION 'FAIL: short receipt without a reason';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM receive_transfer(v_tr, jsonb_build_array(jsonb_build_object(
    'line_id', (SELECT id FROM t_stock_transfer_lines WHERE transfer_id = v_tr), 'qty_received', 8, 'reason', 'Two lost on the truck')));
  ASSERT (SELECT qty_on_hand FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           WHERE l.full_code = 'CTL2-RCV' AND b.sku_id = v_sku) = 8, 'FAIL: not received at destination';
  ASSERT EXISTS (SELECT 1 FROM t_putaway_tasks t JOIN m_warehouses w ON w.id = t.warehouse_id
                  WHERE w.code = 'CTL2' AND t.sku_id = v_sku AND t.qty = 8), 'FAIL: no putaway task at destination';
  ASSERT (SELECT variance_status FROM t_stock_transfer_lines WHERE transfer_id = v_tr) = 'pending', 'FAIL: variance not pending';

  BEGIN
    PERFORM approve_transfer_variance((SELECT id FROM t_stock_transfer_lines WHERE transfer_id = v_tr), true);
    RAISE EXCEPTION 'FAIL: receiver approved their own variance';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f003';
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1');
BEGIN
  PERFORM approve_transfer_variance((SELECT l.id FROM t_stock_transfer_lines l JOIN t_stock_transfers t ON t.id = l.transfer_id
                                     WHERE t.note = 'Rebalance'), true);
  ASSERT NOT EXISTS (SELECT 1 FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
                      WHERE l.full_code = 'CTL1-TRANSIT' AND b.sku_id = v_sku AND b.qty_on_hand > 0), 'FAIL: transit not written off';
  ASSERT (SELECT sum(qty_on_hand) FROM t_stock_balances WHERE sku_id = v_sku) = 28, 'FAIL: company total after write-off';
END $$;
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT c.kind FROM t_cogs_entries c JOIN t_stock_movements m ON m.id = c.movement_id
           JOIN m_skus s ON s.id = m.sku_id WHERE s.sku_code = 'CTLP-1') = 'adjustment', 'FAIL: write-off not costed as adjustment';
END $$;

-- ---------------------------------------------------------------- control: stock opname
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1');
  v_sc  bigint;
BEGIN
  INSERT INTO t_stock_counts (warehouse_id, note) VALUES ((SELECT id FROM m_warehouses WHERE code = 'CTL1'), 'Monthly') RETURNING id INTO v_sc;
  PERFORM start_stock_count(v_sc);
  ASSERT (SELECT count(*) FROM t_stock_count_lines WHERE count_id = v_sc) = 2, 'FAIL: snapshot lines';

  -- Counting bins are frozen.
  BEGIN
    PERFORM create_bin_transfer((SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'),
                                (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-03-A'), v_sku, NULL, 1);
    RAISE EXCEPTION 'FAIL: moved stock out of a bin being counted';
  EXCEPTION WHEN object_in_use THEN NULL;
  END;
  -- Blind: the worker cannot read system quantities, not even the column.
  BEGIN
    PERFORM * FROM count_review(v_sc);
    RAISE EXCEPTION 'FAIL: counter saw system quantities';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM system_qty FROM t_stock_count_lines WHERE count_id = v_sc;
    RAISE EXCEPTION 'FAIL: counter read system_qty';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM record_count(v_sc, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-01-A'), v_sku, NULL, 14);
  BEGIN
    PERFORM submit_stock_count(v_sc);
    RAISE EXCEPTION 'FAIL: submitted with uncounted lines';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  PERFORM record_count(v_sc, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-02-A'), v_sku, NULL, 5);
  PERFORM record_count(v_sc, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-03-A'), v_sku, NULL, 2);
  PERFORM submit_stock_count(v_sc);
  BEGIN
    PERFORM approve_stock_count(v_sc);
    RAISE EXCEPTION 'FAIL: worker approved a count';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f002';
DO $$ BEGIN
  ASSERT NOT has_permission('stock-approval', 'update'), 'FAIL: worker holds stock-approval';
  PERFORM approve_stock_count((SELECT id FROM t_stock_counts WHERE note = 'Monthly'));
  RAISE EXCEPTION 'FAIL: worker approved a count';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-00000000f001';
DO $$
DECLARE
  v_sku bigint := (SELECT id FROM m_skus WHERE sku_code = 'CTLP-1');
  v_sc  bigint := (SELECT id FROM t_stock_counts WHERE note = 'Monthly');
  v_own bigint;
  v_other bigint;
BEGIN
  ASSERT (SELECT array_agg(variance ORDER BY location_id) FROM count_review(v_sc)) = ARRAY[-1, 0, 2]::numeric[],
    'FAIL: count variances';
  ASSERT (SELECT sum(variance_value) FROM count_review(v_sc)) = 1000, 'FAIL: variance value';
  PERFORM approve_stock_count(v_sc);
  ASSERT (SELECT sum(qty_on_hand) FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
           JOIN m_warehouses w ON w.id = l.warehouse_id WHERE w.code = 'CTL1' AND b.sku_id = v_sku) = 21, 'FAIL: adjusted stock';
  ASSERT NOT EXISTS (SELECT 1 FROM m_locations l JOIN m_warehouses w ON w.id = l.warehouse_id WHERE w.code = 'CTL1' AND l.is_counting),
    'FAIL: bins still locked';

  -- A manager who submits their own count cannot approve it.
  INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'CTL1'), 'Self', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-02-A')])
  RETURNING id INTO v_own;
  PERFORM start_stock_count(v_own);
  PERFORM record_count(v_own, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-02-A'), v_sku, NULL, 5);
  PERFORM submit_stock_count(v_own);
  BEGIN
    PERFORM approve_stock_count(v_own);
    RAISE EXCEPTION 'FAIL: submitter approved their own count';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Someone who counted (without submitting) cannot approve either.
  INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
  VALUES ((SELECT id FROM m_warehouses WHERE code = 'CTL1'), 'Counted', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-03-A')])
  RETURNING id INTO v_other;
  PERFORM start_stock_count(v_other);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f003', true);
  PERFORM record_count(v_other, (SELECT id FROM m_locations WHERE full_code = 'CTL1-A-01-03-A'), v_sku, NULL, 2);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f001', true);
  PERFORM submit_stock_count(v_other);
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f003', true);
  BEGIN
    PERFORM approve_stock_count(v_other);
    RAISE EXCEPTION 'FAIL: counter approved the count';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  -- f003 did not count the first one: rejecting it is fine, and unlocks its bin.
  PERFORM reject_stock_count(v_own, 'Recount aisle');
  ASSERT (SELECT status FROM t_stock_counts WHERE id = v_own) = 'rejected', 'FAIL: count not rejected';
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f001', true);

  -- Stock card for CTL1: 30 in, 10 sent out, count -1 and +2 = 21; bin moves inside the warehouse left out.
  ASSERT (SELECT balance FROM stock_card(v_sku, company_today() - 30, company_today(),
                                         (SELECT id FROM m_warehouses WHERE code = 'CTL1'))
           ORDER BY movement_date DESC, movement_id DESC NULLS LAST LIMIT 1) = 21, 'FAIL: stock card closing balance';
  ASSERT NOT EXISTS (SELECT 1 FROM stock_card(v_sku, company_today() - 30, company_today(),
                                             (SELECT id FROM m_warehouses WHERE code = 'CTL1'))
                      WHERE movement_type = 'bin_transfer'), 'FAIL: internal move on the stock card';
END $$;
RESET ROLE;

ROLLBACK;
\echo 'stock_flow_smoke: OK'
