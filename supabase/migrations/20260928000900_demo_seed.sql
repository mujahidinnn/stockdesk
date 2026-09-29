-- Acts as p_user on p_date for every RPC that follows in this transaction.
CREATE FUNCTION public.demo_act(p_date date, p_user uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM set_config('stockdesk.today', COALESCE(p_date::text, ''), true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user::text, ''), true);
END;
$$;

-- Stock a pick list could take right now: storage bins, not expired.
CREATE FUNCTION public.demo_free(p_wh bigint, p_sku bigint) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(sum(sb.qty_on_hand - sb.qty_reserved), 0)
    FROM t_stock_balances sb
    JOIN m_locations l ON l.id = sb.location_id
    LEFT JOIN m_batches mb ON mb.id = sb.batch_id
   WHERE sb.warehouse_id = p_wh AND sb.sku_id = p_sku AND l.bin_type IN ('storage', 'picking')
     AND l.is_active AND NOT l.is_counting AND (mb.expiry_date IS NULL OR mb.expiry_date >= company_today());
$$;

CREATE FUNCTION public.demo_ean13(p12 text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT p12 || ((10 - (SELECT sum(substr(p12, i, 1)::int * CASE WHEN i % 2 = 0 THEN 3 ELSE 1 END)
                          FROM generate_series(1, 12) i) % 10) % 10)::text;
$$;

-- Lines: [{sku, uom, qty, cost, batch, expiry, rejected, reason}], cost per line unit (null = no price yet).
-- Source follows the arguments: customer return, client inbound, production (no supplier) or supplier.
CREATE FUNCTION public.demo_receive(p_wh bigint, p_supplier bigint, p_owner bigint, p_user uuid, p_lines jsonb,
                                    p_putaway boolean DEFAULT true, p_ref text DEFAULT NULL,
                                    p_customer bigint DEFAULT NULL) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_gr   bigint;
  v_line bigint;
  l      jsonb;
  t      t_putaway_tasks;
  v_rest numeric;
  v_take numeric;
BEGIN
  INSERT INTO t_goods_receipts (warehouse_id, source_type, supplier_id, customer_id, owner_id, reference_no)
  VALUES (p_wh, CASE WHEN p_customer IS NOT NULL THEN 'customer_return'
                     WHEN (SELECT owner_type FROM m_owners WHERE id = p_owner) = 'client' THEN 'client_inbound'
                     WHEN p_supplier IS NULL THEN 'production' ELSE 'supplier' END,
          p_supplier, p_customer, p_owner, p_ref)
  RETURNING id INTO v_gr;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received, qty_rejected, reject_reason, batch_no, expiry_date)
    VALUES (v_gr, (l->>'sku')::bigint, (SELECT id FROM m_uoms WHERE code = COALESCE(l->>'uom', 'PCS')), (l->>'qty')::numeric,
            COALESCE((l->>'rejected')::numeric, 0), l->>'reason', l->>'batch', (l->>'expiry')::date)
    RETURNING id INTO v_line;
    IF l->>'cost' IS NOT NULL THEN
      INSERT INTO t_receipt_line_costs (receipt_line_id, unit_cost) VALUES (v_line, (l->>'cost')::numeric);
    END IF;
  END LOOP;
  PERFORM post_goods_receipt(v_gr);
  IF p_putaway THEN
    FOR t IN SELECT * FROM t_putaway_tasks WHERE receipt_id = v_gr AND status = 'open' ORDER BY id LOOP
      v_rest := t.qty;
      WHILE v_rest > 0 LOOP
        v_take := least(v_rest, 300);
        PERFORM complete_putaway(t.id, COALESCE(
          (SELECT location_id FROM suggest_putaway_bins(t.sku_id, v_take, p_wh, t.batch_id) LIMIT 1),
          (SELECT id FROM m_locations WHERE warehouse_id = p_wh AND bin_type = 'storage' AND is_active ORDER BY pick_sequence LIMIT 1)),
          v_take);
        v_rest := v_rest - v_take;
      END LOOP;
    END LOOP;
  END IF;
  RETURN v_gr;
END;
$$;

-- p_stage: open | picking (half picked) | packed | dispatched. Lines: [{sku, qty}] in base units.
CREATE FUNCTION public.demo_order(p_wh bigint, p_owner bigint, p_customer bigint, p_lines jsonb, p_stage text,
                                  p_manager uuid, p_worker uuid) RETURNS bigint
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_so    bigint;
  v_pl    bigint;
  v_sh    bigint;
  v_items jsonb;
  l       jsonb;
  stop    t_pick_list_lines;
  v_today date := company_today();
BEGIN
  PERFORM demo_act(v_today, p_manager);
  INSERT INTO t_sales_orders (warehouse_id, owner_id, customer_id, customer_name, ship_to, channel, reference_no)
  SELECT p_wh, p_owner, c.id, c.name, c.address, (ARRAY['manual', 'marketplace', 'pos'])[1 + floor(random() * 3)::int],
         'PO-' || to_char(v_today, 'YYMMDD') || '-' || lpad((floor(random() * 900) + 100)::text, 3, '0')
    FROM m_customers c WHERE c.id = p_customer
  RETURNING id INTO v_so;
  FOR l IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO t_sales_order_lines (order_id, sku_id, uom_id, qty)
    SELECT v_so, s.id, s.base_uom_id, (l->>'qty')::numeric FROM m_skus s WHERE s.id = (l->>'sku')::bigint;
  END LOOP;
  IF p_stage = 'open' THEN
    RETURN v_so;
  END IF;

  v_pl := generate_pick_list(ARRAY[v_so]);
  PERFORM demo_act(v_today, p_worker);
  FOR stop IN SELECT * FROM t_pick_list_lines WHERE pick_list_id = v_pl ORDER BY seq LOOP
    EXIT WHEN p_stage = 'picking' AND stop.seq > 1;
    PERFORM confirm_pick_line(stop.id, stop.qty);
  END LOOP;
  IF p_stage = 'picking' THEN
    RETURN v_so;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('sku_id', pl.sku_id, 'batch_id', pl.batch_id, 'qty', pl.qty_picked)) INTO v_items
    FROM t_pick_list_lines pl WHERE pl.pick_list_id = v_pl AND pl.qty_picked > 0;
  v_sh := pack_shipment(v_so, v_items, round((0.5 + random() * 8)::numeric, 1), 1 + floor(random() * 3)::int);
  IF p_stage = 'dispatched' THEN
    PERFORM dispatch_shipment(v_sh, (ARRAY['JNE', 'SiCepat', 'J&T', 'AnterAja'])[1 + floor(random() * 4)::int],
                              'RS' || to_char(v_today, 'YYMMDD') || lpad(v_so::text, 5, '0'));
  END IF;
  RETURN v_so;
END;
$$;

-- Replays six months through the app's RPCs, moving "today" back day by day. Safe to run again.
-- Every demo password is Demo123! (admin@stockdesk.com: Admin123!).
CREATE FUNCTION public.seed_demo_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  -- Fixed ids keep demo URLs and screenshots stable.
  u_admin uuid; u_rina uuid; u_budi uuid; u_sari uuid; u_agus uuid; u_dimas uuid;
  u_putri uuid; u_yusuf uuid; u_lina uuid; u_reza uuid;
  v_workers uuid[];
  v_today date := (now() AT TIME ZONE COALESCE((SELECT timezone FROM m_settings), 'Asia/Jakarta'))::date;
  d       date;
  v_in    bigint := (SELECT id FROM m_owners WHERE code = 'INTERNAL');
  v_cli   bigint;
  v_jkt   bigint;
  v_sby   bigint;
  v_sup   bigint[];
  v_cus   bigint[];
  v_cat   jsonb := '{}';
  p       record;
  v_sku   bigint;
  v_pool  bigint[] := '{}';
  v_lines jsonb;
  i       integer;
  v_id    bigint;
  v_tr    bigint;
  v_sc    bigint;
  v_tz    text;
  v_key   text;
  v_hook  bigint;
BEGIN
  -- No signed-in user means the SQL editor (API roles without a user have no EXECUTE).
  IF auth.uid() IS NOT NULL AND NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  PERFORM setseed(0.42);
  PERFORM wipe_all_data();
  -- From here on auth.uid() is whoever demo_act() names, never the caller.
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM demo_act(NULL, NULL);
  UPDATE m_settings SET demo_mode = true, company_name = 'StockDesk', valuation_method = 'fifo', expiry_warning_days = 30 WHERE id = 1;
  v_tz := (SELECT timezone FROM m_settings);

  u_admin := ensure_default_admin();
  u_rina  := upsert_login('00000000-0000-4000-8000-000000000002', 'rina@stockdesk.demo', 'Demo123!', 'Rina Wulandari', 'Admin');
  u_budi  := upsert_login('00000000-0000-4000-8000-000000000003', 'budi@stockdesk.demo', 'Demo123!', 'Budi Santoso', 'Warehouse Manager');
  u_sari  := upsert_login('00000000-0000-4000-8000-000000000004', 'sari@stockdesk.demo', 'Demo123!', 'Sari Handayani', 'Warehouse Manager');
  u_agus  := upsert_login('00000000-0000-4000-8000-000000000005', 'agus@stockdesk.demo', 'Demo123!', 'Agus Pratama', 'Warehouse Worker');
  u_dimas := upsert_login('00000000-0000-4000-8000-000000000006', 'dimas@stockdesk.demo', 'Demo123!', 'Dimas Saputra', 'Warehouse Worker');
  u_putri := upsert_login('00000000-0000-4000-8000-000000000007', 'putri@stockdesk.demo', 'Demo123!', 'Putri Maharani', 'Warehouse Worker');
  u_yusuf := upsert_login('00000000-0000-4000-8000-000000000008', 'yusuf@stockdesk.demo', 'Demo123!', 'Yusuf Hidayat', 'Warehouse Worker');
  u_lina  := upsert_login('00000000-0000-4000-8000-000000000009', 'lina@stockdesk.demo', 'Demo123!', 'Lina Kusuma', 'Warehouse Worker');
  u_reza  := upsert_login('00000000-0000-4000-8000-000000000010', 'reza@stockdesk.demo', 'Demo123!', 'Reza Firmansyah', 'Warehouse Worker');
  v_workers := ARRAY[u_agus, u_dimas, u_putri, u_lina];

  INSERT INTO m_owners (code, name, owner_type, contact_name, phone, email)
  VALUES ('KOSMETIKA', 'PT Kosmetika Nusantara', 'client', 'Maya Anggraini', '021-5550188', 'gudang@kosmetika.example')
  RETURNING id INTO v_cli;

  FOR p IN SELECT * FROM (VALUES ('SNACK', 'Makanan Ringan'), ('DRINK', 'Minuman'), ('BODY', 'Perawatan Tubuh'),
                                 ('COSM', 'Kosmetik'), ('FASH', 'Fashion'), ('ELEC', 'Elektronik Kecil'),
                                 ('ATK', 'Alat Tulis'), ('HOME', 'Rumah Tangga')) AS c(code, name) LOOP
    INSERT INTO m_categories (code, name) VALUES (p.code, p.name) RETURNING id INTO v_id;
    v_cat := v_cat || jsonb_build_object(p.code, v_id);
  END LOOP;

  WITH s AS (
    INSERT INTO m_suppliers (code, name, contact_name, phone, address) VALUES
      ('SUP-IND', 'PT Indo Pangan Sejahtera', 'Hendra', '021-4600111', 'Kawasan Industri Pulogadung, Jakarta'),
      ('SUP-TIRTA', 'CV Tirta Segar', 'Wati', '021-8890222', 'Bekasi, Jawa Barat'),
      ('SUP-SEHAT', 'PT Sehat Bersih Abadi', 'Joko', '031-7430333', 'Rungkut, Surabaya'),
      ('SUP-GAYA', 'Konveksi Gaya Muda', 'Nina', '022-6010444', 'Cigondewang, Bandung'),
      ('SUP-TEKNO', 'PT Tekno Aksesori', 'Andi', '021-6250555', 'Mangga Dua, Jakarta')
    RETURNING id)
  SELECT array_agg(id ORDER BY id) INTO v_sup FROM s;
  WITH c AS (
    INSERT INTO m_customers (code, name, contact_name, phone, address) VALUES
      ('TK-MAJU', 'Toko Maju Jaya', 'Pak Rudi', '0812-1000-201', 'Jl. Pemuda 12, Jakarta Timur'),
      ('MM-BERKAH', 'Minimarket Berkah', 'Bu Sinta', '0812-1000-202', 'Jl. Raya Bogor 88, Depok'),
      ('WR-BARU', 'Warung Sumber Baru', 'Pak Darto', '0812-1000-203', 'Jl. Kenari 5, Tangerang'),
      ('OL-SHOPEE', 'Toko Online StockDesk', 'Admin Toko', '0812-1000-204', 'Gudang JKT (ambil kurir)'),
      ('KP-KARYA', 'Koperasi Karyawan Karya', 'Bu Lestari', '0812-1000-205', 'Jl. Industri 3, Cikarang'),
      ('HT-SEJUK', 'Hotel Sejuk Asri', 'Pak Bayu', '0812-1000-206', 'Jl. Puncak 21, Bogor')
    RETURNING id)
  SELECT array_agg(id ORDER BY id) INTO v_cus FROM c;

  -- Manager rights for the bin generator.
  PERFORM demo_act(v_today - 181, u_budi);
  INSERT INTO m_warehouses (code, name, address) VALUES ('JKT', 'Gudang Utama Jakarta', 'Jl. Cakung Cilincing Km 3, Jakarta Utara')
  RETURNING id INTO v_jkt;
  INSERT INTO m_warehouses (code, name, address) VALUES ('SBY', 'Gudang Surabaya', 'Jl. Margomulyo 44, Surabaya')
  RETURNING id INTO v_sby;
  PERFORM generate_bins(v_jkt, 'AMB', ARRAY['A', 'B', 'C', 'D'], 5, ARRAY['1', '2', '3'], 'storage', 400);
  PERFORM generate_bins(v_jkt, 'CLD', ARRAY['A'], 3, ARRAY['1', '2'], 'storage', 300);
  PERFORM generate_bins(v_jkt, 'FST', ARRAY['A'], 4, ARRAY['1'], 'storage', 600);
  PERFORM generate_bins(v_sby, 'AMB', ARRAY['A', 'B'], 3, ARRAY['1', '2'], 'storage', 400);

  -- Catalogue: kind f = batch + expiry, v = variants, p = plain; weight = daily demand share.
  CREATE TEMP TABLE demo_cat (code text, name text, cat text, owner text, kind text, cost numeric, shelf int,
                              box int, weight int, target int, variants text[], barcode text) ON COMMIT DROP;
  INSERT INTO demo_cat VALUES
    ('KRP-SNG', 'Keripik Singkong Balado 70g', 'SNACK', 'in', 'f', 6500, 180, 24, 9, 480, NULL, NULL),
    ('KCG-ATM', 'Kacang Atom 100g', 'SNACK', 'in', 'f', 7200, 240, 24, 6, 360, NULL, NULL),
    ('BSK-CKL', 'Biskuit Cokelat 120g', 'SNACK', 'in', 'f', 8900, 270, 24, 7, 360, NULL, NULL),
    ('WFR-VNL', 'Wafer Vanila 150g', 'SNACK', 'in', 'f', 9500, 300, 20, 3, 160, NULL, NULL),
    ('MIE-GRG', 'Mie Goreng Instan', 'SNACK', 'in', 'f', 2900, 240, 40, 10, 600, NULL, NULL),
    ('TEH-MLT', 'Teh Melati 350ml', 'DRINK', 'in', 'f', 3800, 270, 24, 10, 600, NULL, NULL),
    ('KOP-SSU', 'Kopi Susu Kaleng 240ml', 'DRINK', 'in', 'f', 7600, 365, 24, 8, 480, NULL, NULL),
    ('AIR-MNR', 'Air Mineral 600ml', 'DRINK', 'in', 'f', 2100, 540, 24, 10, 720, NULL, NULL),
    ('JUS-JRK', 'Jus Jeruk 250ml', 'DRINK', 'in', 'f', 5400, 120, 24, 4, 240, NULL, NULL),
    ('SUS-UHT', 'Susu UHT Full Cream 1L', 'DRINK', 'in', 'f', 17800, 180, 12, 6, 240, NULL, NULL),
    ('SAB-MND', 'Sabun Mandi Batang 85g', 'BODY', 'in', 'f', 4200, 720, 48, 6, 480, NULL, NULL),
    ('SHP-HRB', 'Sampo Herbal 170ml', 'BODY', 'in', 'f', 18500, 720, 24, 4, 192, NULL, NULL),
    ('PSG-GGI', 'Pasta Gigi 120g', 'BODY', 'in', 'f', 11200, 720, 36, 5, 288, NULL, NULL),
    ('LTN-TBH', 'Losion Tubuh 200ml', 'BODY', 'in', 'f', 24800, 540, 24, 2, 96, NULL, NULL),
    ('KAOS-BSC', 'Kaos Basic Katun', 'FASH', 'in', 'v', 38000, NULL, 1, 1, 30, ARRAY['HITAM', 'PUTIH', 'NAVY'], NULL),
    ('CLN-CHN', 'Celana Chino', 'FASH', 'in', 'v', 115000, NULL, 1, 1, 15, ARRAY['KREM', 'HITAM'], NULL),
    ('PWB-10K', 'Power Bank 10000mAh', 'ELEC', 'in', 'p', 165000, NULL, 10, 2, 60, NULL, '899100200001'),
    ('KBL-USBC', 'Kabel USB-C 1m', 'ELEC', 'in', 'p', 23000, NULL, 20, 4, 160, NULL, '899100200002'),
    ('EAR-BT', 'Earbuds Bluetooth', 'ELEC', 'in', 'p', 210000, NULL, 10, 1, 40, NULL, '899100200003'),
    ('LMP-LED', 'Lampu LED 9W', 'ELEC', 'in', 'p', 18500, NULL, 24, 3, 144, NULL, '899100200004'),
    ('CHG-20W', 'Charger 20W', 'ELEC', 'in', 'p', 89000, NULL, 10, 0, 0, NULL, '899100200005'),
    ('PLP-HTM', 'Pulpen Hitam', 'ATK', 'in', 'p', 2300, NULL, 12, 5, 360, NULL, NULL),
    ('BKU-A5', 'Buku Tulis A5 38 Lembar', 'ATK', 'in', 'p', 5200, NULL, 20, 2, 120, NULL, NULL),
    ('SPN-CCI', 'Spons Cuci Piring', 'HOME', 'in', 'p', 3100, NULL, 24, 3, 240, NULL, NULL),
    ('DTG-CAIR', 'Deterjen Cair 800ml', 'HOME', 'in', 'f', 21500, 720, 12, 4, 144, NULL, NULL),
    ('TSU-WJH', 'Tisu Wajah 250 Lembar', 'HOME', 'in', 'p', 9800, NULL, 24, 5, 240, NULL, NULL),
    ('KLP-MCF', 'Kain Lap Microfiber', 'HOME', 'in', 'p', 12500, NULL, 12, 0, 0, NULL, NULL),
    ('SRM-WJH', 'Serum Wajah 30ml', 'COSM', 'cli', 'f', NULL, 540, 24, 0, 120, NULL, NULL),
    ('BDK-CMP', 'Bedak Compact', 'COSM', 'cli', 'f', NULL, 720, 24, 0, 96, NULL, NULL),
    ('LIP-MTT', 'Lipstik Matte', 'COSM', 'cli', 'v', NULL, NULL, 24, 0, 60, ARRAY['MERAH', 'NUDE', 'PINK'], NULL);

  FOR p IN SELECT * FROM demo_cat LOOP
    INSERT INTO m_products (code, name, category_id, owner_id, variant_attributes)
    VALUES (replace(p.code, '-', '_'), p.name, (v_cat->>p.cat)::bigint, CASE WHEN p.owner = 'in' THEN v_in ELSE v_cli END,
            CASE WHEN p.kind = 'v' AND p.cat = 'FASH' THEN ARRAY['warna', 'ukuran'] WHEN p.kind = 'v' THEN ARRAY['shade'] ELSE '{}' END)
    RETURNING id INTO v_id;
    IF p.kind = 'v' AND p.cat = 'FASH' THEN
      INSERT INTO m_skus (product_id, sku_code, attributes, base_uom_id, weight_kg)
      SELECT v_id, p.code || '-' || c || '-' || z, jsonb_build_object('warna', c, 'ukuran', z), (SELECT id FROM m_uoms WHERE code = 'PCS'), 0.3
        FROM unnest(p.variants) c, unnest(CASE WHEN p.code = 'CLN-CHN' THEN ARRAY['30', '32', '34'] ELSE ARRAY['S', 'M', 'L'] END) z;
    ELSIF p.kind = 'v' THEN
      INSERT INTO m_skus (product_id, sku_code, attributes, base_uom_id, track_batch)
      SELECT v_id, p.code || '-' || c, jsonb_build_object('shade', c), (SELECT id FROM m_uoms WHERE code = 'PCS'), true
        FROM unnest(p.variants) c;
    ELSE
      INSERT INTO m_skus (product_id, sku_code, barcode, base_uom_id, track_batch, track_expiry, safety_stock, reorder_point, reorder_qty)
      VALUES (v_id, p.code, CASE WHEN p.barcode IS NOT NULL THEN demo_ean13(p.barcode) END, (SELECT id FROM m_uoms WHERE code = 'PCS'),
              p.kind = 'f', p.kind = 'f', round(p.target * 0.1), round(p.target * 0.25), p.target / 2)
      RETURNING id INTO v_sku;
      IF p.box > 1 THEN
        INSERT INTO m_sku_uoms (sku_id, uom_id, factor_to_base) VALUES (v_sku, (SELECT id FROM m_uoms WHERE code = 'BOX'), p.box);
      END IF;
      FOR i IN 1 .. p.weight LOOP
        v_pool := v_pool || v_sku;
      END LOOP;
    END IF;
  END LOOP;
  -- Fashion sells slowly but steadily.
  v_pool := v_pool || ARRAY(SELECT s.id FROM m_skus s JOIN m_products pr ON pr.id = s.product_id
                              WHERE pr.code IN ('KAOS_BSC', 'CLN_CHN') ORDER BY s.id);

  -- Base cost per piece, and the stock level weekly replenishment aims for, per SKU.
  CREATE TEMP TABLE demo_sku ON COMMIT DROP AS
  SELECT s.id, s.sku_code, c.kind, c.cost, c.shelf, c.box, c.target, c.owner, s.track_batch
    FROM m_skus s JOIN m_products pr ON pr.id = s.product_id JOIN demo_cat c ON replace(c.code, '-', '_') = pr.code;

  d := v_today - 180;
  -- Opening stock: JKT gets everything that sells, SBY a smaller FMCG range.
  PERFORM demo_act(d, u_agus);
  SELECT jsonb_agg(jsonb_build_object('sku', id, 'qty', target, 'cost', cost,
                   'batch', CASE WHEN track_batch THEN 'B' || to_char(d, 'YYMMDD') END,
                   'expiry', CASE WHEN kind = 'f' THEN d + shelf END))
    INTO v_lines FROM demo_sku WHERE owner = 'in' AND target > 0;
  PERFORM demo_receive(v_jkt, v_sup[1], v_in, u_agus, v_lines, true, 'PO-OPEN-JKT');
  SELECT jsonb_agg(jsonb_build_object('sku', id, 'qty', ceil(target / 4.0 / box) * box, 'cost', cost,
                   'batch', 'B' || to_char(d, 'YYMMDD'), 'expiry', d + shelf))
    INTO v_lines FROM demo_sku WHERE owner = 'in' AND kind = 'f';
  PERFORM demo_act(d, u_lina);
  PERFORM demo_receive(v_sby, v_sup[3], v_in, u_lina, v_lines, true, 'PO-OPEN-SBY');
  -- Consignment stock arrives without a price: it is the client's, not ours.
  PERFORM demo_act(d + 2, u_agus);
  SELECT jsonb_agg(jsonb_build_object('sku', id, 'qty', target, 'batch', 'K' || to_char(d + 2, 'YYMMDD'),
                   'expiry', CASE WHEN kind = 'f' THEN d + 2 + shelf END))
    INTO v_lines FROM demo_sku WHERE owner = 'cli';
  PERFORM demo_receive(v_jkt, NULL, v_cli, u_agus, v_lines, true, 'KOS-001');

  FOR d IN SELECT generate_series(v_today - 91, v_today, interval '1 day')::date LOOP
    -- Monday: replenish every fast SKU back to its target, at a price that moves.
    IF extract(isodow FROM d) = 1 THEN
      PERFORM demo_act(d, (ARRAY[u_agus, u_dimas])[1 + floor(random() * 2)::int]);
      SELECT jsonb_agg(x) INTO v_lines FROM (
        SELECT jsonb_build_object('sku', ds.id, 'uom', CASE WHEN ds.box > 1 THEN 'BOX' ELSE 'PCS' END,
                 'qty', ceil((ds.target - q.on_hand) / ds.box::numeric),
                 'cost', round(ds.cost * ds.box * (0.9 + random() * 0.22) / 100) * 100,
                 'batch', CASE WHEN ds.track_batch THEN 'B' || to_char(d, 'YYMMDD') END,
                 'expiry', CASE WHEN ds.kind = 'f' THEN d + ds.shelf END) AS x
          FROM demo_sku ds
          CROSS JOIN LATERAL (SELECT COALESCE(sum(qty_on_hand), 0) AS on_hand FROM t_stock_balances
                               WHERE sku_id = ds.id AND warehouse_id = v_jkt) q
         WHERE ds.owner = 'in' AND ds.kind <> 'v' AND ds.target > 0
           AND q.on_hand < ds.target * CASE WHEN d > v_today - 7 THEN 1 ELSE 0.7 END
           -- Stock running low on purpose for the dashboard.
           AND ds.sku_code NOT IN ('LTN-TBH', 'EAR-BT', 'WFR-VNL', 'BKU-A5', 'JUS-JRK')) y;
      IF v_lines IS NOT NULL THEN
        -- The last Monday leaves its putaway to the team (3 tasks pending).
        IF d > v_today - 7 THEN
          v_lines := (SELECT jsonb_agg(e) FROM (SELECT e FROM jsonb_array_elements(v_lines) e LIMIT 3) z);
        END IF;
        PERFORM demo_receive(v_jkt, v_sup[1 + floor(random() * 3)::int], v_in, (ARRAY[u_agus, u_dimas])[1 + floor(random() * 2)::int],
                             v_lines, d <= v_today - 7, 'PO-' || to_char(d, 'YYMMDD'));
      END IF;
    END IF;

    IF d = v_today - 49 THEN
      PERFORM demo_act(d, u_dimas);
      PERFORM demo_receive(v_jkt, v_sup[3], v_in, u_dimas, jsonb_build_array(jsonb_build_object(
        'sku', (SELECT id FROM demo_sku WHERE sku_code = 'SAB-MND'), 'qty', 96, 'rejected', 6, 'reason', 'Kemasan penyok',
        'cost', 4300, 'batch', 'B' || to_char(d, 'YYMMDD'), 'expiry', d + 720)), true, 'PO-QC-01');
    ELSIF d = v_today - 40 THEN
      PERFORM demo_act(d, u_dimas);
      PERFORM demo_receive(v_jkt, v_sup[2], v_in, u_dimas, jsonb_build_array(jsonb_build_object(
        'sku', (SELECT id FROM demo_sku WHERE sku_code = 'SUS-UHT'), 'qty', 12, 'rejected', 12, 'reason', 'Suhu kiriman tidak sesuai',
        'cost', 17800, 'batch', 'QC-EXP', 'expiry', d + 30)), true, 'PO-QC-02');
    ELSIF d = v_today - 10 THEN
      -- Invoice not in yet: posted without a price, waiting for Finance.
      PERFORM demo_act(d, u_agus);
      PERFORM demo_receive(v_jkt, v_sup[3], v_in, u_agus, jsonb_build_array(jsonb_build_object(
        'sku', (SELECT id FROM demo_sku WHERE sku_code = 'PSG-GGI'), 'uom', 'BOX', 'qty', 2,
        'batch', 'B' || to_char(d, 'YYMMDD'), 'expiry', d + 720)), true, 'PO-NOINV');
    END IF;
    IF d IN (v_today - 84, v_today - 28) THEN
      PERFORM demo_act(d, u_agus);
      SELECT jsonb_agg(jsonb_build_object('sku', id, 'qty', 12, 'cost', round(cost * (0.95 + random() * 0.1) / 100) * 100))
        INTO v_lines FROM demo_sku WHERE kind = 'v' AND owner = 'in';
      PERFORM demo_receive(v_jkt, v_sup[4], v_in, u_agus, v_lines, true, 'PO-FASH-' || to_char(d, 'YYMMDD'));
    END IF;

    -- Inter-warehouse transfers: one done, one short and waiting, one on the road.
    IF d IN (v_today - 30, v_today - 5, v_today - 1) THEN
      PERFORM demo_act(d, u_budi);
      INSERT INTO t_stock_transfers (transfer_type, from_warehouse_id, to_warehouse_id, note)
      VALUES ('inter_warehouse', v_jkt, v_sby, CASE d WHEN v_today - 30 THEN 'Isi ulang elektronik SBY'
                                                     WHEN v_today - 5 THEN 'Kiriman ATK' ELSE 'Kiriman mingguan' END)
      RETURNING id INTO v_tr;
      INSERT INTO t_stock_transfer_lines (transfer_id, sku_id, from_location_id, qty)
      SELECT v_tr, x.sku_id, x.location_id, least(x.qty_on_hand - x.qty_reserved, 10)
        FROM (SELECT DISTINCT ON (b.sku_id) b.sku_id, b.location_id, b.qty_on_hand, b.qty_reserved
                FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id JOIN demo_sku ds ON ds.id = b.sku_id
               WHERE b.warehouse_id = v_jkt AND l.bin_type = 'storage' AND ds.kind = 'p' AND b.qty_on_hand - b.qty_reserved >= 10
                 AND ds.sku_code IN (CASE d WHEN v_today - 5 THEN 'PLP-HTM' ELSE 'KBL-USBC' END,
                                     CASE d WHEN v_today - 5 THEN 'BKU-A5' ELSE 'LMP-LED' END, 'TSU-WJH')
               ORDER BY b.sku_id, b.qty_on_hand DESC) x;
      PERFORM send_transfer(v_tr);
      IF d < v_today - 1 THEN
        PERFORM demo_act(d, u_sari);
        PERFORM receive_transfer(v_tr, (SELECT jsonb_agg(jsonb_build_object('line_id', id,
                  'qty_received', CASE WHEN d = v_today - 5 AND row_number = 1 THEN qty - 2 ELSE qty END,
                  'reason', CASE WHEN d = v_today - 5 AND row_number = 1 THEN 'Dua pak basah di truk' END))
                FROM (SELECT l.*, row_number() OVER (ORDER BY l.id) FROM t_stock_transfer_lines l WHERE l.transfer_id = v_tr) z));
        PERFORM demo_act(d, u_lina);
        PERFORM complete_putaway(t.id, (SELECT id FROM m_locations WHERE warehouse_id = v_sby AND bin_type = 'storage' ORDER BY pick_sequence LIMIT 1), t.qty)
           FROM t_putaway_tasks t WHERE t.warehouse_id = v_sby AND t.status = 'open';
      END IF;
    END IF;

    -- Last month's count on aisle JKT-AMB-A: approved with a small variance.
    IF d = v_today - 35 THEN
      PERFORM demo_act(d, u_putri);
      INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
      VALUES (v_jkt, 'Opname bulanan lorong A', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'JKT-AMB-A')])
      RETURNING id INTO v_sc;
      PERFORM start_stock_count(v_sc);
      PERFORM record_count(v_sc, l.location_id, l.sku_id, l.batch_id,
                           greatest(0, l.system_qty + CASE row_number WHEN 1 THEN -2 WHEN 3 THEN 1 ELSE 0 END))
         FROM (SELECT cl.*, row_number() OVER (ORDER BY cl.id) FROM t_stock_count_lines cl WHERE cl.count_id = v_sc) l;
      PERFORM submit_stock_count(v_sc);
      PERFORM demo_act(d, u_sari);
      PERFORM approve_stock_count(v_sc);
    END IF;

    -- Sales: every day before today, three to five orders; the client ships weekly.
    IF d >= v_today - 60 AND d < v_today THEN
      FOR i IN 1 .. 3 + floor(random() * 3)::int LOOP
        PERFORM demo_act(d, u_budi);
        SELECT jsonb_agg(jsonb_build_object('sku', sku, 'qty', qty)) INTO v_lines FROM (
          SELECT sku, least(demo_free(v_jkt, sku), 2 + floor(random() * 14)) AS qty
            FROM (SELECT DISTINCT v_pool[1 + floor(random() * array_length(v_pool, 1))::int] AS sku
                    FROM generate_series(1, 1 + floor(random() * 3)::int)) picks) x
         WHERE qty > 0;
        IF v_lines IS NOT NULL THEN
          PERFORM demo_order(v_jkt, v_in, v_cus[1 + floor(random() * 6)::int], v_lines, 'dispatched', u_budi,
                             v_workers[1 + floor(random() * 4)::int]);
        END IF;
      END LOOP;
      IF extract(isodow FROM d) = 3 THEN
        SELECT jsonb_agg(jsonb_build_object('sku', id, 'qty', least(demo_free(v_jkt, id), 6))) INTO v_lines
          FROM demo_sku WHERE owner = 'cli' AND demo_free(v_jkt, id) > 0 AND random() < 0.6;
        IF v_lines IS NOT NULL THEN
          PERFORM demo_order(v_jkt, v_cli, v_cus[4], v_lines, 'dispatched', u_sari, v_workers[1 + floor(random() * 4)::int]);
        END IF;
      END IF;
    END IF;
  END LOOP;

  d := v_today;
  FOR i IN 1 .. 5 LOOP
    SELECT jsonb_agg(jsonb_build_object('sku', sku, 'qty', least(demo_free(v_jkt, sku), 3 + floor(random() * 8)))) INTO v_lines
      FROM (SELECT DISTINCT v_pool[1 + floor(random() * array_length(v_pool, 1))::int] AS sku FROM generate_series(1, 2)) x
     WHERE demo_free(v_jkt, sku) > 0;
    CONTINUE WHEN v_lines IS NULL;
    PERFORM demo_act(d, u_budi);
    PERFORM demo_order(v_jkt, v_in, v_cus[1 + (i % 6)], v_lines,
                       CASE i WHEN 4 THEN 'picking' WHEN 5 THEN 'packed' ELSE 'open' END, u_budi, u_dimas);
  END LOOP;

  -- Today's count in SBY: submitted, one line over and one under, waiting for a manager.
  PERFORM demo_act(d, u_lina);
  INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
  VALUES (v_sby, 'Cek lorong A Surabaya', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'SBY-AMB-A')])
  RETURNING id INTO v_sc;
  PERFORM start_stock_count(v_sc);
  PERFORM record_count(v_sc, l.location_id, l.sku_id, l.batch_id,
                       greatest(0, l.system_qty + CASE row_number WHEN 1 THEN 3 WHEN 2 THEN -4 ELSE 0 END))
     FROM (SELECT cl.*, row_number() OVER (ORDER BY cl.id) FROM t_stock_count_lines cl WHERE cl.count_id = v_sc) l;
  PERFORM submit_stock_count(v_sc);

  -- Dashboard conditions: batches expiring in 5, 20 and 45 days, the rejected milk already expired.
  UPDATE m_batches b SET expiry_date = v_today + x.days
    FROM (SELECT DISTINCT ON (s.sku_code) bt.id, CASE s.sku_code WHEN 'JUS-JRK' THEN 5 WHEN 'KRP-SNG' THEN 20 ELSE 45 END AS days
            FROM m_batches bt JOIN m_skus s ON s.id = bt.sku_id
            JOIN t_stock_balances sb ON sb.batch_id = bt.id AND sb.qty_on_hand > 0
           WHERE s.sku_code IN ('JUS-JRK', 'KRP-SNG', 'KOP-SSU') ORDER BY s.sku_code, bt.expiry_date) x
   WHERE b.id = x.id;
  UPDATE m_batches SET expiry_date = v_today - 3 WHERE batch_no = 'QC-EXP';
  -- Five SKUs under their reorder point, two sold out.
  UPDATE m_skus s SET reorder_point = q.on_hand + 40, reorder_qty = 120
    FROM (SELECT sku_id, sum(qty_on_hand) AS on_hand FROM t_stock_balances GROUP BY sku_id) q
   WHERE q.sku_id = s.id AND s.sku_code IN ('LTN-TBH', 'EAR-BT', 'WFR-VNL', 'BKU-A5', 'JUS-JRK');
  UPDATE m_skus SET reorder_point = 20, reorder_qty = 60 WHERE sku_code IN ('CHG-20W', 'KLP-MCF');

  PERFORM demo_act(NULL, NULL);
  FOR d IN SELECT generate_series(v_today - 180, v_today, interval '1 day')::date LOOP
    PERFORM snapshot_stock_value(d);
  END LOOP;
  -- Books closed up to the end of the month before last.
  PERFORM demo_act(NULL, u_rina);
  PERFORM set_locked_until((date_trunc('month', v_today) - interval '1 month' - interval '1 day')::date);

  v_key := create_api_key('ERP Kantor Pusat', ARRAY['stock:read', 'products:read']);
  v_id := (SELECT id FROM t_api_keys WHERE name = 'ERP Kantor Pusat');
  v_key := create_api_key('Marketplace lama', ARRAY['stock:read']);
  PERFORM revoke_api_key((SELECT id FROM t_api_keys WHERE name = 'Marketplace lama'));
  INSERT INTO t_api_request_log (api_key_id, method, path, status, created_at)
  SELECT v_id, 'GET', CASE WHEN g % 3 = 0 THEN '/products' ELSE '/stock' END, 200, now() - g * interval '37 minutes'
    FROM generate_series(1, 60) g;
  UPDATE t_api_keys SET last_used_at = now() - interval '37 minutes' WHERE id = v_id;
  v_hook := (create_webhook('https://webhook.site/stockdesk-demo', ARRAY['stock.low', 'shipment.dispatched', 'count.approved'])->>'id')::bigint;
  INSERT INTO t_webhook_deliveries (webhook_id, event, payload, status, attempts, next_attempt_at, last_status_code, last_error, created_at, delivered_at)
  SELECT v_hook, CASE WHEN g % 4 = 0 THEN 'stock.low' ELSE 'shipment.dispatched' END,
         jsonb_build_object('demo', true, 'n', g),
         CASE WHEN g IN (3, 11) THEN 'failed' ELSE 'success' END, CASE WHEN g IN (3, 11) THEN 5 ELSE 1 END, now(),
         CASE WHEN g IN (3, 11) THEN 502 ELSE 200 END, CASE WHEN g IN (3, 11) THEN 'Bad Gateway' END,
         now() - g * interval '5 hours', CASE WHEN g NOT IN (3, 11) THEN now() - g * interval '5 hours' END
    FROM generate_series(1, 14) g;

  PERFORM demo_act(NULL, u_admin);
  INSERT INTO t_user_access_override (user_id, feature_id, is_override_active, can_create, can_read, can_update, can_delete)
  VALUES (u_putri, (SELECT id FROM m_features WHERE feature_key = 'valuation'), true, false, true, false, false);
  UPDATE auth.users SET banned_until = now() + interval '100 years' WHERE id = u_reza;
  UPDATE auth.users u SET last_sign_in_at = now() - x.ago
    FROM (VALUES (u_admin, interval '2 hours'), (u_rina, interval '5 hours'), (u_budi, interval '20 minutes'),
                 (u_sari, interval '1 day'), (u_agus, interval '45 minutes'), (u_dimas, interval '3 hours'),
                 (u_putri, interval '2 days'), (u_yusuf, interval '41 days'), (u_lina, interval '6 hours'),
                 (u_reza, interval '60 days')) AS x(id, ago)
   WHERE u.id = x.id;
  PERFORM demo_act(NULL, NULL);
  PERFORM run_daily_jobs();
  INSERT INTO t_notifications (user_id, title, body, link)
  SELECT id, 'Putaway menunggu', '3 barang dari penerimaan Senin belum disimpan ke rak.', '/inbound/putaway'
    FROM unnest(v_workers) id;
  INSERT INTO t_notifications (user_id, title, body, link)
  SELECT id, 'Opname menunggu persetujuan', 'Cek lorong A Surabaya sudah diajukan Lina.', '/opname' FROM unnest(ARRAY[u_budi, u_sari]) id;

  -- Everything above ran at now(); spread it over its own dates (triggers off: posted rows are otherwise frozen).
  ALTER TABLE t_stock_movements DISABLE TRIGGER USER;
  ALTER TABLE t_goods_receipts DISABLE TRIGGER USER;
  ALTER TABLE t_sales_orders DISABLE TRIGGER USER;
  ALTER TABLE t_pick_lists DISABLE TRIGGER USER;
  ALTER TABLE t_shipments DISABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks DISABLE TRIGGER USER;
  ALTER TABLE t_stock_counts DISABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers DISABLE TRIGGER USER;
  UPDATE t_stock_movements SET created_at = least(now(), (movement_date + time '08:00' + (id % 480) * interval '1 minute') AT TIME ZONE v_tz)
   WHERE movement_date < v_today;
  UPDATE t_goods_receipts SET created_at = (receipt_date + time '08:10') AT TIME ZONE v_tz,
                              posted_at = (receipt_date + time '09:30') AT TIME ZONE v_tz WHERE receipt_date < v_today;
  UPDATE t_putaway_tasks t SET created_at = (r.receipt_date + time '09:30') AT TIME ZONE v_tz,
                               completed_at = CASE WHEN t.status = 'done' THEN (r.receipt_date + time '11:00') AT TIME ZONE v_tz END
    FROM t_goods_receipts r WHERE r.id = t.receipt_id AND r.receipt_date < v_today;
  UPDATE t_sales_orders SET created_at = (order_date + time '07:30' + (id % 240) * interval '1 minute') AT TIME ZONE v_tz
   WHERE order_date < v_today;
  UPDATE t_pick_lists pl SET created_at = (o.order_date + time '10:00') AT TIME ZONE v_tz,
                             completed_at = CASE WHEN pl.status = 'done' THEN (o.order_date + time '11:30') AT TIME ZONE v_tz END
    FROM (SELECT DISTINCT ON (pll.pick_list_id) pll.pick_list_id, so.order_date
            FROM t_pick_list_lines pll JOIN t_sales_order_lines sol ON sol.id = pll.order_line_id
            JOIN t_sales_orders so ON so.id = sol.order_id) o
   WHERE o.pick_list_id = pl.id AND o.order_date < v_today;
  UPDATE t_shipments sh SET packed_at = (o.order_date + time '13:00') AT TIME ZONE v_tz,
                            dispatched_at = CASE WHEN sh.status = 'dispatched' THEN (o.order_date + time '15:30') AT TIME ZONE v_tz END
    FROM t_sales_orders o WHERE o.id = sh.order_id AND o.order_date < v_today;
  UPDATE t_stock_counts SET created_at = ((v_today - 35) + time '07:00') AT TIME ZONE v_tz,
                            started_at = ((v_today - 35) + time '07:15') AT TIME ZONE v_tz,
                            submitted_at = ((v_today - 35) + time '10:40') AT TIME ZONE v_tz,
                            decided_at = ((v_today - 35) + time '13:05') AT TIME ZONE v_tz
   WHERE status = 'approved';
  UPDATE t_stock_transfers t SET created_at = (m.d + time '08:00') AT TIME ZONE v_tz, sent_at = (m.d + time '09:00') AT TIME ZONE v_tz,
                                 received_at = CASE WHEN t.received_at IS NOT NULL THEN (m.d + time '16:00') AT TIME ZONE v_tz END
    FROM (SELECT ref_id, min(movement_date) AS d FROM t_stock_movements WHERE movement_type = 'transfer_out' GROUP BY ref_id) m
   WHERE m.ref_id = t.id;
  ALTER TABLE t_stock_movements ENABLE TRIGGER USER;
  ALTER TABLE t_goods_receipts ENABLE TRIGGER USER;
  ALTER TABLE t_sales_orders ENABLE TRIGGER USER;
  ALTER TABLE t_pick_lists ENABLE TRIGGER USER;
  ALTER TABLE t_shipments ENABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks ENABLE TRIGGER USER;
  ALTER TABLE t_stock_counts ENABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers ENABLE TRIGGER USER;

  PERFORM demo_act(NULL, NULL);
  RETURN jsonb_build_object(
    'skus', (SELECT count(*) FROM m_skus),
    'movements', (SELECT count(*) FROM t_stock_movements),
    'orders', (SELECT count(*) FROM t_sales_orders),
    'accounts', (SELECT count(*) FROM auth.users WHERE email LIKE '%@stockdesk.demo'));
END;
$$;

-- Fills every menu seed_demo_data() leaves empty and dates every row relative to the seed day.
-- Every date stays after the period lock (end of the month before last), so back-dated posts are allowed.
CREATE FUNCTION public.seed_demo_extras_core() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  u_admin uuid := (SELECT id FROM auth.users WHERE email = 'admin@stockdesk.com');
  u_budi  uuid := '00000000-0000-4000-8000-000000000003';
  u_sari  uuid := '00000000-0000-4000-8000-000000000004';
  u_agus  uuid := '00000000-0000-4000-8000-000000000005';
  u_dimas uuid := '00000000-0000-4000-8000-000000000006';
  u_putri uuid := '00000000-0000-4000-8000-000000000007';
  u_lina  uuid := '00000000-0000-4000-8000-000000000009';
  v_tz    text := (SELECT timezone FROM m_settings WHERE id = 1);
  v_today date := (now() AT TIME ZONE COALESCE((SELECT timezone FROM m_settings WHERE id = 1), 'Asia/Jakarta'))::date;
  v_base  timestamptz;
  v_in    bigint := (SELECT id FROM m_owners WHERE code = 'INTERNAL');
  v_cli   bigint := (SELECT id FROM m_owners WHERE code = 'KOSMETIKA');
  v_jkt   bigint := (SELECT id FROM m_warehouses WHERE code = 'JKT');
  d       date;
  i       integer;
  v_id    bigint;
  v_sc    bigint;
  b       record;
  t       text;
BEGIN
  v_base := ((v_today - 181) + time '08:00') AT TIME ZONE v_tz;

  -- Customer return: one cable arrived broken and goes to quarantine.
  d := v_today - 12;
  PERFORM demo_act(d, u_agus);
  PERFORM demo_receive(v_jkt, NULL, v_in, u_agus, jsonb_build_array(
    jsonb_build_object('sku', (SELECT id FROM m_skus WHERE sku_code = 'KBL-USBC'), 'qty', 4, 'rejected', 1,
                       'reason', 'Kabel putus, retur dari toko', 'cost', 23000),
    jsonb_build_object('sku', (SELECT id FROM m_skus WHERE sku_code = 'LMP-LED'), 'qty', 3, 'cost', 18500)),
    true, 'RET-' || to_char(d, 'YYMMDD'), (SELECT id FROM m_customers WHERE code = 'TK-MAJU'));

  -- In-house repack counts as production.
  d := v_today - 18;
  PERFORM demo_act(d, u_dimas);
  PERFORM demo_receive(v_jkt, NULL, v_in, u_dimas, jsonb_build_array(
    jsonb_build_object('sku', (SELECT id FROM m_skus WHERE sku_code = 'SPN-CCI'), 'qty', 120, 'cost', 3000)),
    true, 'PRD-' || to_char(d, 'YYMMDD'));

  -- Second consignment delivery from the client.
  d := v_today - 8;
  PERFORM demo_act(d, u_agus);
  PERFORM demo_receive(v_jkt, NULL, v_cli, u_agus, (
    SELECT jsonb_agg(jsonb_build_object('sku', s.id, 'qty', 48, 'batch', 'K' || to_char(d, 'YYMMDD'), 'expiry', d + 540))
      FROM m_skus s WHERE s.sku_code IN ('SRM-WJH', 'BDK-CMP')), true, 'KOS-002');

  -- Supplier cancelled before the truck left.
  d := v_today - 3;
  PERFORM demo_act(d, u_agus);
  INSERT INTO t_goods_receipts (warehouse_id, source_type, supplier_id, owner_id, reference_no, note)
  VALUES (v_jkt, 'supplier', (SELECT id FROM m_suppliers WHERE code = 'SUP-TIRTA'), v_in, 'PO-' || to_char(d, 'YYMMDD') || '-B',
          'Supplier batal kirim, stok mereka habis')
  RETURNING id INTO v_id;
  INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received)
  SELECT v_id, id, base_uom_id, 48 FROM m_skus WHERE sku_code = 'JUS-JRK';
  PERFORM cancel_goods_receipt(v_id);

  -- Today's delivery is being keyed in.
  PERFORM demo_act(v_today, u_dimas);
  INSERT INTO t_goods_receipts (warehouse_id, source_type, supplier_id, owner_id, reference_no, note)
  VALUES (v_jkt, 'supplier', (SELECT id FROM m_suppliers WHERE code = 'SUP-TEKNO'), v_in, 'PO-' || to_char(v_today, 'YYMMDD') || '-E',
          'Truk tiba siang, cek fisik dulu')
  RETURNING id INTO v_id;
  INSERT INTO t_goods_receipt_lines (receipt_id, sku_id, uom_id, qty_received)
  SELECT v_id, id, base_uom_id, CASE sku_code WHEN 'EAR-BT' THEN 20 ELSE 10 END FROM m_skus WHERE sku_code IN ('EAR-BT', 'PWB-10K');

  -- Order cancelled before picking.
  d := v_today - 6;
  PERFORM demo_act(d, u_budi);
  v_id := demo_order(v_jkt, v_in, (SELECT id FROM m_customers WHERE code = 'HT-SEJUK'),
                     jsonb_build_array(jsonb_build_object('sku', (SELECT id FROM m_skus WHERE sku_code = 'AIR-MNR'), 'qty', 24)),
                     'open', u_budi, u_dimas);
  PERFORM cancel_sales_order(v_id);

  -- Bin to bin: fast movers to the FST zone.
  FOR i IN 1 .. 3 LOOP
    d := v_today - (ARRAY[6, 3, 1])[i];
    PERFORM demo_act(d, u_budi);
    SELECT bl.location_id, bl.sku_id, bl.batch_id, least(bl.qty_on_hand - bl.qty_reserved, 12) AS qty INTO b
      FROM t_stock_balances bl JOIN m_locations l ON l.id = bl.location_id JOIN m_skus s ON s.id = bl.sku_id
     WHERE bl.warehouse_id = v_jkt AND l.bin_type = 'storage' AND l.full_code NOT LIKE 'JKT-FST-%'
       AND s.sku_code = (ARRAY['MIE-GRG', 'TEH-MLT', 'AIR-MNR'])[i] AND bl.qty_on_hand - bl.qty_reserved >= 12
     ORDER BY bl.qty_on_hand DESC LIMIT 1;
    CONTINUE WHEN b IS NULL;
    PERFORM create_bin_transfer(b.location_id,
      (SELECT id FROM m_locations WHERE warehouse_id = v_jkt AND full_code LIKE 'JKT-FST-%' AND level = 'bin' ORDER BY pick_sequence OFFSET i - 1 LIMIT 1),
      b.sku_id, b.batch_id, b.qty, 'Pindah ke zona fast moving');
  END LOOP;

  -- Aisle B two weeks ago: too far off, sent back.
  d := v_today - 15;
  PERFORM demo_act(d, u_putri);
  INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
  VALUES (v_jkt, 'Opname lorong B', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'JKT-AMB-B')])
  RETURNING id INTO v_sc;
  PERFORM start_stock_count(v_sc);
  PERFORM record_count(v_sc, l.location_id, l.sku_id, l.batch_id,
                       greatest(0, l.system_qty + CASE row_number WHEN 1 THEN -18 WHEN 2 THEN 12 ELSE 0 END))
     FROM (SELECT cl.*, row_number() OVER (ORDER BY cl.id) FROM t_stock_count_lines cl WHERE cl.count_id = v_sc) l;
  PERFORM submit_stock_count(v_sc);
  PERFORM demo_act(d, u_sari);
  PERFORM reject_stock_count(v_sc, 'Selisih terlalu besar, hitung ulang lorong B');

  -- Cold room right now: half counted.
  PERFORM demo_act(v_today, u_dimas);
  INSERT INTO t_stock_counts (warehouse_id, note, scope_location_ids)
  VALUES (v_jkt, 'Cek ruang dingin', ARRAY[(SELECT id FROM m_locations WHERE full_code = 'JKT-CLD')])
  RETURNING id INTO v_sc;
  PERFORM start_stock_count(v_sc);
  PERFORM record_count(v_sc, l.location_id, l.sku_id, l.batch_id, l.system_qty)
     FROM (SELECT cl.*, row_number() OVER (ORDER BY cl.id) FROM t_stock_count_lines cl WHERE cl.count_id = v_sc) l
    WHERE l.row_number % 2 = 1;

  -- Back-dated stock changes the daily value from the earliest one on.
  PERFORM demo_act(NULL, NULL);
  FOR d IN SELECT generate_series(v_today - 18, v_today, interval '1 day')::date LOOP
    PERFORM snapshot_stock_value(d);
  END LOOP;

  INSERT INTO t_error_log (user_id, source, message, context, created_at) VALUES
    (u_agus, 'client', 'Failed to fetch', jsonb_build_object('route', '/inbound/putaway', 'online', false), now() - interval '26 hours'),
    (u_dimas, 'client', 'Camera permission denied', jsonb_build_object('route', '/outbound/pick', 'scanner', true), now() - interval '9 hours'),
    (u_lina, 'client', 'Bin SBY-AMB-C-01 not found', jsonb_build_object('route', '/opname'), now() - interval '4 hours'),
    (NULL, 'webhook', 'Bad Gateway from https://webhook.site/stockdesk-demo', jsonb_build_object('status', 502), now() - interval '55 minutes');

  -- The first replay spread its documents; do it again for the ones above, then date everything still at now().
  ALTER TABLE t_stock_movements DISABLE TRIGGER USER;
  ALTER TABLE t_goods_receipts DISABLE TRIGGER USER;
  ALTER TABLE t_sales_orders DISABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks DISABLE TRIGGER USER;
  ALTER TABLE t_stock_counts DISABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers DISABLE TRIGGER USER;
  UPDATE t_stock_movements SET created_at = least(now(), (movement_date + time '08:00' + (id % 480) * interval '1 minute') AT TIME ZONE v_tz)
   WHERE movement_date < v_today;
  UPDATE t_goods_receipts SET created_at = (receipt_date + time '08:10') AT TIME ZONE v_tz,
                              posted_at = CASE WHEN posted_at IS NOT NULL THEN (receipt_date + time '09:30') AT TIME ZONE v_tz END,
                              updated_at = (receipt_date + time '09:30') AT TIME ZONE v_tz
   WHERE receipt_date < v_today;
  UPDATE t_putaway_tasks t SET created_at = (r.receipt_date + time '09:30') AT TIME ZONE v_tz,
                               completed_at = CASE WHEN t.status = 'done' THEN (r.receipt_date + time '11:00') AT TIME ZONE v_tz END
    FROM t_goods_receipts r WHERE r.id = t.receipt_id AND r.receipt_date < v_today;
  UPDATE t_sales_orders SET created_at = (order_date + time '07:30' + (id % 240) * interval '1 minute') AT TIME ZONE v_tz,
                            updated_at = (order_date + time '15:30') AT TIME ZONE v_tz
   WHERE order_date < v_today;
  UPDATE t_stock_counts SET created_at = ((v_today - 15) + time '07:00') AT TIME ZONE v_tz,
                            started_at = ((v_today - 15) + time '07:20') AT TIME ZONE v_tz,
                            submitted_at = ((v_today - 15) + time '11:10') AT TIME ZONE v_tz,
                            decided_at = ((v_today - 15) + time '14:00') AT TIME ZONE v_tz
   WHERE status = 'rejected';
  UPDATE t_stock_transfers t SET created_at = (m.d + time '08:00') AT TIME ZONE v_tz, sent_at = (m.d + time '09:00') AT TIME ZONE v_tz,
                                 received_at = CASE WHEN t.received_at IS NOT NULL THEN (m.d + time '16:00') AT TIME ZONE v_tz END
    FROM (SELECT ref_id, min(movement_date) AS d FROM t_stock_movements
           WHERE movement_type IN ('transfer_out', 'bin_transfer') GROUP BY ref_id) m
   WHERE m.ref_id = t.id AND m.d < v_today;
  ALTER TABLE t_stock_movements ENABLE TRIGGER USER;
  ALTER TABLE t_goods_receipts ENABLE TRIGGER USER;
  ALTER TABLE t_sales_orders ENABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks ENABLE TRIGGER USER;
  ALTER TABLE t_stock_counts ENABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers ENABLE TRIGGER USER;

  -- Master data was set up the week before opening stock.
  FOREACH t IN ARRAY ARRAY['m_owners', 'm_categories', 'm_suppliers', 'm_customers', 'm_warehouses', 'm_locations',
                           'm_products', 'm_skus', 'm_sku_uoms', 'profiles'] LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER USER', t);
    EXECUTE format('UPDATE %I SET created_at = $1 + random() * interval ''9 hours'' WHERE created_at > $1', t) USING v_base;
    EXECUTE format('UPDATE %I SET updated_at = created_at WHERE updated_at > $1', t) USING v_base;
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER USER', t);
  END LOOP;
  UPDATE auth.users SET created_at = v_base WHERE email LIKE '%@stockdesk.demo' OR id = u_admin;
  -- A batch is born with its first movement.
  UPDATE m_batches mb SET created_at = m.at, updated_at = m.at
    FROM (SELECT batch_id, min(created_at) AS at FROM t_stock_movements WHERE batch_id IS NOT NULL GROUP BY batch_id) m
   WHERE m.batch_id = mb.id;
  UPDATE t_api_keys SET created_at = now() - interval '60 days' WHERE revoked_at IS NULL;
  UPDATE t_api_keys SET created_at = now() - interval '150 days' WHERE revoked_at IS NOT NULL;
  UPDATE t_webhooks SET created_at = now() - interval '45 days', updated_at = now() - interval '45 days' WHERE id IS NOT NULL;
  UPDATE t_user_access_override SET created_at = now() - interval '10 days', updated_at = now() - interval '10 days' WHERE id IS NOT NULL;
  -- Notifications arrive through the day; the older half is read.
  UPDATE t_notifications n SET created_at = now() - x.rn * interval '47 minutes', is_read = x.rn > 6
    FROM (SELECT id, row_number() OVER (ORDER BY id DESC) AS rn FROM t_notifications) x WHERE x.id = n.id;

  ALTER TABLE t_audit_log DISABLE TRIGGER USER;
  UPDATE t_audit_log a SET created_at = CASE
           WHEN a.action = 'insert' OR a.entity_type IN ('profile', 'settings') THEN v_base + random() * interval '9 hours'
           WHEN a.entity_type = 'api_key' THEN now() - interval '150 days'
           ELSE now() - random() * interval '15 days' END
   WHERE a.created_at > now() - interval '1 hour';
  ALTER TABLE t_audit_log ENABLE TRIGGER USER;
END;
$$;

-- Pins JKT and SBY (coordinates come only from the seed), adds stores BDG/SMG/DPS stocked by transfers
-- (one truck per store still on the road) and selling over the counter, and leaves one pick list open in JKT.
CREATE FUNCTION public.seed_demo_finish() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  u_budi  uuid := '00000000-0000-4000-8000-000000000003';
  u_sari  uuid := '00000000-0000-4000-8000-000000000004';
  u_dimas uuid := '00000000-0000-4000-8000-000000000006';
  u_lina  uuid := '00000000-0000-4000-8000-000000000009';
  v_today date := company_today();
  v_tz    text := COALESCE((SELECT timezone FROM m_settings WHERE id = 1), 'Asia/Jakarta');
  v_in    bigint := (SELECT id FROM m_owners WHERE code = 'INTERNAL');
  v_jkt   bigint := (SELECT id FROM m_warehouses WHERE code = 'JKT');
  v_wh    bigint;
  v_tr    bigint;
  v_lines jsonb;
  v_orders bigint[];
  v_stores bigint[] := '{}';
  v_opened integer[] := '{}';
  st      record;
  r       record;
  d       date;
BEGIN
  UPDATE m_warehouses w SET latitude = p.lat, longitude = p.lng
    FROM (VALUES ('JKT', -6.144000, 106.937000), ('SBY', -7.246200, 112.676000)) AS p(code, lat, lng)
   WHERE w.code = p.code;

  -- plan: [days ago, source warehouse, note, still on the road?]
  FOR st IN SELECT * FROM (VALUES
      ('BDG', 'Toko Bandung', 'Jl. Soekarno-Hatta 590, Bandung', -6.940600, 107.628000, 22,
       '[[21, "JKT", "Stok awal toko", false], [12, "SBY", "Kiriman dari Surabaya", false],
         [7, "JKT", "Isi ulang mingguan", false], [1, "JKT", "Isi ulang mingguan", true]]'::jsonb),
      ('SMG', 'Toko Semarang', 'Jl. Majapahit 212, Semarang', -7.001000, 110.447000, 16,
       '[[15, "SBY", "Stok awal toko", false], [9, "JKT", "Kiriman dari Jakarta", false],
         [4, "SBY", "Isi ulang mingguan", false], [2, "SBY", "Isi ulang mingguan", true]]'::jsonb),
      ('DPS', 'Toko Denpasar', 'Jl. By Pass Ngurah Rai 88, Denpasar', -8.690000, 115.215000, 10,
       '[[9, "SBY", "Stok awal toko", false], [7, "JKT", "Kiriman dari Jakarta", false],
         [5, "SBY", "Kiriman dari Surabaya", false], [4, "JKT", "Kiriman dari Jakarta", true]]'::jsonb))
    AS x(code, name, address, lat, lng, opened, plan) LOOP
    PERFORM demo_act(v_today - st.opened, u_budi);
    INSERT INTO m_warehouses (code, name, address, warehouse_type, latitude, longitude)
    VALUES (st.code, st.name, st.address, 'store', st.lat, st.lng)
    RETURNING id INTO v_wh;
    v_stores := v_stores || v_wh;
    v_opened := v_opened || st.opened;
    PERFORM generate_bins(v_wh, 'TKO', ARRAY['A', 'B'], 4, ARRAY['1', '2'], 'storage', 150);

    FOR r IN SELECT v_today - (e->>0)::int AS d, (SELECT id FROM m_warehouses WHERE code = e->>1) AS src,
                    e->>2 AS note, (e->>3)::boolean AS moving
               FROM jsonb_array_elements(st.plan) e LOOP
      PERFORM demo_act(r.d, u_budi);
      INSERT INTO t_stock_transfers (transfer_type, from_warehouse_id, to_warehouse_id, note)
      VALUES ('inter_warehouse', r.src, v_wh, r.note)
      RETURNING id INTO v_tr;
      INSERT INTO t_stock_transfer_lines (transfer_id, sku_id, batch_id, from_location_id, qty)
      SELECT v_tr, x.sku_id, x.batch_id, x.location_id, 12
        FROM (SELECT DISTINCT ON (b.sku_id) b.sku_id, b.batch_id, b.location_id, b.qty_on_hand - b.qty_reserved AS free
                FROM t_stock_balances b JOIN m_locations l ON l.id = b.location_id
               WHERE b.warehouse_id = r.src AND b.owner_id = v_in AND l.bin_type = 'storage' AND l.is_active AND NOT l.is_counting
                 AND b.qty_on_hand - b.qty_reserved >= 30
               ORDER BY b.sku_id, b.qty_on_hand DESC) x
       ORDER BY x.free DESC, random()
       LIMIT CASE WHEN r.src = v_jkt THEN 5 ELSE 3 END;
      IF NOT FOUND THEN
        DELETE FROM t_stock_transfers WHERE id = v_tr;
        CONTINUE;
      END IF;
      PERFORM send_transfer(v_tr);
      CONTINUE WHEN r.moving;

      PERFORM demo_act(r.d, u_sari);
      PERFORM receive_transfer(v_tr, (SELECT jsonb_agg(jsonb_build_object('line_id', id, 'qty_received', qty))
                                        FROM t_stock_transfer_lines WHERE transfer_id = v_tr));
      PERFORM demo_act(r.d, u_lina);
      PERFORM complete_putaway(t.id, bins.id, t.qty - t.qty_done)
         FROM (SELECT t.*, row_number() OVER (ORDER BY t.id) AS n FROM t_putaway_tasks t
                WHERE t.warehouse_id = v_wh AND t.status = 'open') t
         -- Emptiest bins first, so the shelves fill up evenly.
         JOIN (SELECT l.id, row_number() OVER (ORDER BY COALESCE(q.qty, 0), l.pick_sequence) AS n
                 FROM m_locations l
                 LEFT JOIN (SELECT location_id, sum(qty_on_hand) AS qty FROM t_stock_balances GROUP BY location_id) q
                        ON q.location_id = l.id
                WHERE l.warehouse_id = v_wh AND l.bin_type = 'storage') bins
           ON bins.n = 1 + (t.n - 1) % 16;
    END LOOP;

    -- Counter sales: a few dispatched over the past week, two waiting today.
    FOREACH d IN ARRAY ARRAY[v_today - 6, v_today - 4, v_today - 3, v_today - 2, v_today, v_today] LOOP
      SELECT jsonb_agg(jsonb_build_object('sku', sku_id, 'qty', least(free, 1 + floor(random() * 4)))) INTO v_lines
        FROM (SELECT sku_id, demo_free(v_wh, sku_id) AS free
                FROM (SELECT DISTINCT sku_id FROM t_stock_balances WHERE warehouse_id = v_wh AND qty_on_hand > 0) s
               ORDER BY random() LIMIT 2) x
       WHERE free > 0;
      CONTINUE WHEN v_lines IS NULL;
      PERFORM demo_act(d, u_budi);
      PERFORM demo_order(v_wh, v_in, (SELECT id FROM m_customers ORDER BY random() LIMIT 1), v_lines,
                         CASE WHEN d = v_today THEN 'open' ELSE 'dispatched' END, u_budi, u_dimas);
    END LOOP;
  END LOOP;

  -- Everything above was stamped with the seed's own now(); date it like seed_demo_extras_core does.
  ALTER TABLE t_stock_movements DISABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers DISABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks DISABLE TRIGGER USER;
  ALTER TABLE t_sales_orders DISABLE TRIGGER USER;
  ALTER TABLE m_warehouses DISABLE TRIGGER USER;
  ALTER TABLE m_locations DISABLE TRIGGER USER;
  UPDATE t_stock_movements SET created_at = (movement_date + time '08:00' + (id % 480) * interval '1 minute') AT TIME ZONE v_tz
   WHERE created_at = now() AND movement_date < v_today;
  UPDATE t_stock_transfers t SET created_at = (m.d + time '08:00') AT TIME ZONE v_tz, sent_at = (m.d + time '09:00') AT TIME ZONE v_tz,
                                 received_at = CASE WHEN t.received_at IS NOT NULL THEN (m.d + time '16:00') AT TIME ZONE v_tz END
    FROM (SELECT ref_id, min(movement_date) AS d FROM t_stock_movements WHERE movement_type = 'transfer_out' GROUP BY ref_id) m
   WHERE m.ref_id = t.id AND t.to_warehouse_id = ANY (v_stores);
  UPDATE t_putaway_tasks t SET created_at = m.created_at - interval '40 minutes', completed_at = m.created_at
    FROM t_stock_movements m
   WHERE m.ref_type = 'putaway_task' AND m.ref_id = t.id AND t.warehouse_id = ANY (v_stores);
  UPDATE t_sales_orders SET created_at = (order_date + time '10:00' + (id % 300) * interval '1 minute') AT TIME ZONE v_tz,
                            updated_at = (order_date + time '15:30') AT TIME ZONE v_tz
   WHERE warehouse_id = ANY (v_stores) AND order_date < v_today;
  UPDATE t_pick_lists p SET created_at = o.created_at + interval '20 minutes', completed_at = o.created_at + interval '45 minutes'
    FROM t_sales_orders o
   WHERE p.warehouse_id = ANY (v_stores) AND o.warehouse_id = p.warehouse_id AND o.order_date < v_today
     AND o.id = (SELECT ol.order_id FROM t_pick_list_lines pl JOIN t_sales_order_lines ol ON ol.id = pl.order_line_id
                  WHERE pl.pick_list_id = p.id LIMIT 1);
  UPDATE t_shipments s SET packed_at = o.created_at + interval '1 hour', dispatched_at = o.created_at + interval '4 hours'
    FROM t_sales_orders o WHERE o.id = s.order_id AND o.warehouse_id = ANY (v_stores) AND o.order_date < v_today;
  UPDATE m_warehouses w SET created_at = ((v_today - o.days) + time '10:00') AT TIME ZONE v_tz,
                            updated_at = ((v_today - o.days) + time '10:00') AT TIME ZONE v_tz
    FROM unnest(v_stores, v_opened) AS o(id, days) WHERE w.id = o.id;
  UPDATE m_locations l SET created_at = ((v_today - o.days) + time '10:05') AT TIME ZONE v_tz,
                           updated_at = ((v_today - o.days) + time '10:05') AT TIME ZONE v_tz
    FROM unnest(v_stores, v_opened) AS o(id, days) WHERE l.warehouse_id = o.id;
  ALTER TABLE t_stock_movements ENABLE TRIGGER USER;
  ALTER TABLE t_stock_transfers ENABLE TRIGGER USER;
  ALTER TABLE t_putaway_tasks ENABLE TRIGGER USER;
  ALTER TABLE t_sales_orders ENABLE TRIGGER USER;
  ALTER TABLE m_warehouses ENABLE TRIGGER USER;
  ALTER TABLE m_locations ENABLE TRIGGER USER;

  v_orders := ARRAY(SELECT id FROM t_sales_orders WHERE warehouse_id = v_jkt AND status = 'open' ORDER BY id LIMIT 2);
  IF cardinality(v_orders) > 0 THEN
    PERFORM demo_act(v_today, u_sari);
    PERFORM generate_pick_list(v_orders);
  END IF;
  PERFORM demo_act(NULL, NULL);
  -- The morning job's warning for trucks still on the road.
  PERFORM notify_late_transfers();
END;
$$;

-- Runs right after seed_demo_data().
CREATE FUNCTION public.seed_demo_extras() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  PERFORM seed_demo_extras_core();
  PERFORM seed_demo_finish();
END;
$$;

-- From the app the seed is only queued: it outlasts the 8s statement_timeout of authenticated, which a
-- function cannot raise. run_queued_demo_seed() then runs it as postgres.
CREATE FUNCTION public.superadmin_seed_demo_data() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- No signed-in user means the SQL editor, which may turn a deployment into a demo and has no timeout.
  IF auth.uid() IS NULL THEN
    v_result := seed_demo_data();
    PERFORM seed_demo_extras();
    RETURN v_result;
  END IF;
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin only' USING errcode = '42501';
  END IF;
  IF NOT COALESCE((SELECT demo_mode FROM m_settings WHERE id = 1), false) THEN
    RAISE EXCEPTION 'Demo data can only be seeded on a demo deployment' USING errcode = '42501';
  END IF;
  UPDATE m_settings SET demo_seed_requested_at = now() WHERE id = 1;
  RETURN jsonb_build_object('queued', true);
END;
$$;

CREATE FUNCTION public.run_queued_demo_seed() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT demo_seed_requested_at FROM m_settings WHERE id = 1) IS NULL THEN
    RETURN;
  END IF;
  UPDATE m_settings SET demo_seed_requested_at = NULL WHERE id = 1;
  -- A failed seed rolls back alone and is logged; the flag stays cleared so it never loops.
  BEGIN
    PERFORM seed_demo_data();
    PERFORM seed_demo_extras();
  EXCEPTION WHEN others THEN
    INSERT INTO t_error_log (source, message, context)
    VALUES ('seed', SQLERRM, jsonb_build_object('sqlstate', SQLSTATE));
  END;
END;
$$;

-- Permanent: never let this job unschedule itself, pg_cron keeps firing a job that does so from inside its run.
DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'stockdesk-seed-demo';
  PERFORM cron.schedule('stockdesk-seed-demo', '* * * * *', 'SELECT public.run_queued_demo_seed()');
END $$;

REVOKE EXECUTE ON FUNCTION public.superadmin_seed_demo_data() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.demo_act(date, uuid), public.demo_free(bigint, bigint), public.demo_ean13(text),
  public.demo_receive(bigint, bigint, bigint, uuid, jsonb, boolean, text, bigint),
  public.demo_order(bigint, bigint, bigint, jsonb, text, uuid, uuid),
  public.seed_demo_data(), public.seed_demo_extras_core(), public.seed_demo_finish(), public.seed_demo_extras(),
  public.run_queued_demo_seed()
  FROM PUBLIC, anon, authenticated;
