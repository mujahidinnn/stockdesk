// Read tools for the AI loop. Every query runs on the caller's JWT client, so RLS decides what the AI sees.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const LIMIT = 50;
const TZ = "Asia/Jakarta";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const today = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export function weekBounds(day = today()): { from: string; to: string } {
  const d = new Date(`${day}T00:00:00Z`);
  const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const cut = (s: unknown, n = 200) => (typeof s === "string" && s.length > n ? s.slice(0, n) + "..." : s);

type Tool = (c: SupabaseClient, a: Args) => Promise<unknown>;

const TOOLS: Record<string, Tool> = {
  async find_skus(c, a) {
    const q = String(a.query).replace(/[%,()]/g, " ").trim();
    const bySku = ok(await c.from("m_skus")
      .select("id, sku_code, barcode, reorder_point, safety_stock, is_active, product:m_products(name), uom:m_uoms(code)")
      .or(`sku_code.ilike.%${q}%,barcode.eq.${q}`).limit(LIMIT)) as Row[];
    const byName = ok(await c.from("m_skus")
      .select("id, sku_code, barcode, reorder_point, safety_stock, is_active, product:m_products!inner(name), uom:m_uoms(code)")
      .ilike("m_products.name", `%${q}%`).limit(LIMIT)) as Row[];
    const seen = new Map<number, Row>();
    for (const r of [...bySku, ...byName]) seen.set(r.id, r);
    return [...seen.values()].slice(0, LIMIT).map((r) => ({
      id: r.id, code: r.sku_code, name: one(r.product as Row)?.name, uom: one(r.uom as Row)?.code,
      reorder_point: r.reorder_point, safety_stock: r.safety_stock, active: r.is_active,
    }));
  },

  async find_warehouses(c) {
    const rows = ok(await c.from("m_warehouses").select("id, code, name, warehouse_type, is_active").order("code")) as Row[];
    return rows;
  },

  async stock_levels(c, a) {
    let q = c.from("t_stock_balances")
      .select("sku_id, warehouse_id, qty_on_hand, qty_reserved, sku:m_skus(sku_code, product:m_products(name)), wh:m_warehouses(code)")
      .gt("qty_on_hand", 0).limit(2000);
    if (a.sku_id) q = q.eq("sku_id", a.sku_id);
    if (a.warehouse_id) q = q.eq("warehouse_id", a.warehouse_id);
    const rows = ok(await q) as Row[];
    // Sum bins and batches into one line per SKU and warehouse.
    const sum = new Map<string, Row>();
    for (const r of rows) {
      const k = `${r.sku_id}:${r.warehouse_id}`;
      const s = sum.get(k) ?? {
        sku_id: r.sku_id, code: one(r.sku as Row)?.sku_code, name: one(one(r.sku as Row)?.product as Row)?.name,
        warehouse_id: r.warehouse_id, warehouse: one(r.wh as Row)?.code, on_hand: 0, reserved: 0,
      };
      s.on_hand += Number(r.qty_on_hand);
      s.reserved += Number(r.qty_reserved);
      sum.set(k, s);
    }
    return [...sum.values()]
      .map((s) => ({ ...s, available: s.on_hand - s.reserved }))
      .sort((x, y) => y.on_hand - x.on_hand).slice(0, LIMIT);
  },

  async overview(c, a) {
    const s = ok(await c.rpc("dashboard_summary", { p_warehouse_id: a.warehouse_id ?? null })) as Row;
    const { asset_value, active_skus, out_of_stock, below_reorder, expiring, putaway_pending, pick_lists_today,
      dispatched_today, count_accuracy, queue, cogs_month } = s;
    return {
      asset_value, cogs_month, active_skus, out_of_stock, putaway_pending, pick_lists_today, dispatched_today,
      count_accuracy, queue,
      below_reorder: (below_reorder ?? []).slice(0, 20), below_reorder_total: (below_reorder ?? []).length,
      expiring: (expiring ?? []).slice(0, 20), expiring_total: (expiring ?? []).length,
    };
  },

  async sales_orders(c, a) {
    let q = c.from("t_sales_orders").select("id, so_no, customer_name, status, channel, order_date, warehouse:m_warehouses(code)")
      .order("id", { ascending: false }).limit(LIMIT);
    if (a.status) q = q.eq("status", a.status);
    if (a.from) q = q.gte("order_date", a.from);
    if (a.to) q = q.lte("order_date", a.to);
    return (ok(await q) as Row[]).map((r) => ({ ...r, warehouse: one(r.warehouse as Row)?.code }));
  },

  async goods_receipts(c, a) {
    let q = c.from("t_goods_receipts")
      .select("id, gr_no, status, source_type, receipt_date, reference_no, supplier:m_suppliers(name), warehouse:m_warehouses(code)")
      .order("id", { ascending: false }).limit(LIMIT);
    if (a.status) q = q.eq("status", a.status);
    if (a.from) q = q.gte("receipt_date", a.from);
    if (a.to) q = q.lte("receipt_date", a.to);
    return (ok(await q) as Row[]).map((r) => ({ ...r, supplier: one(r.supplier as Row)?.name, warehouse: one(r.warehouse as Row)?.code }));
  },

  async putaway_tasks(c, a) {
    let q = c.from("t_putaway_tasks")
      .select("id, status, qty, qty_done, created_at, sku:m_skus(sku_code), from:m_locations!t_putaway_tasks_from_location_id_fkey(full_code), suggested:m_locations!t_putaway_tasks_suggested_location_id_fkey(full_code)")
      .eq("status", a.status ?? "open").order("id").limit(LIMIT);
    if (a.warehouse_id) q = q.eq("warehouse_id", a.warehouse_id);
    return (ok(await q) as Row[]).map((r) => ({
      id: r.id, status: r.status, sku: one(r.sku as Row)?.sku_code, qty: r.qty, qty_done: r.qty_done,
      from: one(r.from as Row)?.full_code, suggested: one(r.suggested as Row)?.full_code,
    }));
  },

  async transfers(c, a) {
    let q = c.from("t_stock_transfers")
      .select("id, transfer_no, transfer_type, status, created_at, from:m_warehouses!t_stock_transfers_from_warehouse_id_fkey(code), to:m_warehouses!t_stock_transfers_to_warehouse_id_fkey(code)")
      .order("id", { ascending: false }).limit(LIMIT);
    if (a.status) q = q.eq("status", a.status);
    return (ok(await q) as Row[]).map((r) => ({ ...r, from: one(r.from as Row)?.code, to: one(r.to as Row)?.code }));
  },

  async stock_counts(c, a) {
    let q = c.from("t_stock_counts")
      .select("id, count_no, status, created_at, submitted_at, decided_at, reject_reason, warehouse:m_warehouses(code)")
      .order("id", { ascending: false }).limit(LIMIT);
    if (a.status) q = q.eq("status", a.status);
    return (ok(await q) as Row[]).map((r) => ({ ...r, reject_reason: cut(r.reject_reason), warehouse: one(r.warehouse as Row)?.code }));
  },

  async movements(c, a) {
    let q = c.from("t_stock_movements")
      .select("id, movement_date, movement_type, qty, ref_no, note, sku:m_skus(sku_code), from:m_locations!t_stock_movements_from_location_id_fkey(full_code), to:m_locations!t_stock_movements_to_location_id_fkey(full_code)")
      .order("id", { ascending: false }).limit(LIMIT);
    if (a.sku_id) q = q.eq("sku_id", a.sku_id);
    if (a.type) q = q.eq("movement_type", a.type);
    if (a.from) q = q.gte("movement_date", a.from);
    if (a.to) q = q.lte("movement_date", a.to);
    return (ok(await q) as Row[]).map((r) => ({
      id: r.id, date: r.movement_date, type: r.movement_type, qty: r.qty, ref: r.ref_no, note: cut(r.note),
      sku: one(r.sku as Row)?.sku_code, from: one(r.from as Row)?.full_code, to: one(r.to as Row)?.full_code,
    }));
  },
};

export async function runReadTool(c: SupabaseClient, name: string, args: Args): Promise<unknown> {
  const t = TOOLS[name];
  if (!t) throw new Error(`unknown tool ${name}`);
  return t(c, args);
}
