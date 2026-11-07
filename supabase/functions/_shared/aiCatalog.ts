// Shared AI tool catalog. Imported by the Edge Function and the browser, so no Deno APIs and no URL imports.
// Read-only on purpose: every stock change goes through the ledger RPCs behind the normal pages.
import { z } from "zod";

// page -> path and the feature a user needs to read before the button is offered
export const NAV: Record<string, { path: string; feature: string | null }> = {
  dashboard: { path: "/", feature: null },
  products: { path: "/products", feature: "master-product" },
  warehouses: { path: "/warehouses", feature: "master-warehouse" },
  receipts: { path: "/inbound/receipts", feature: "goods-receipt" },
  putaway: { path: "/inbound/putaway", feature: "putaway" },
  pick_lists: { path: "/outbound/pick-lists", feature: "pick-list" },
  dispatch: { path: "/outbound/dispatch", feature: "dispatch" },
  transfers: { path: "/transfers", feature: "stock-transfer" },
  opname: { path: "/opname", feature: "stock-opname" },
  audit: { path: "/audit", feature: "stock-audit" },
  valuation: { path: "/valuation", feature: "valuation" },
  export: { path: "/export", feature: "export" },
  integration: { path: "/settings/integration", feature: "integration" },
  users: { path: "/settings/integration?tab=users", feature: "users" },
  profile: { path: "/settings/profile", feature: null },
};

export interface AiTool {
  name: string;
  /** Feature the user needs `read` on to get this tool; null = login is enough (RLS still applies). */
  feature: string | null;
  description: string;
  schema: z.ZodObject;
  /** Ends the loop after this call (the answer is the UI element itself). */
  terminal?: boolean;
}

const id = z.number().int();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const range = { from: date.optional(), to: date.optional() };

const tool = (name: string, feature: string | null, description: string, shape: z.ZodRawShape = {}): AiTool =>
  ({ name, feature, description, schema: z.object(shape) });

export const AI_TOOLS: AiTool[] = [
  tool("find_skus", "master-product", "Search SKUs by code, barcode or product name. Returns id, code, name, reorder point.", { query: z.string().min(1) }),
  tool("find_warehouses", null, "List warehouses with id, code and name."),
  tool("stock_levels", null, "Stock per SKU and warehouse: on hand, reserved, available. Filter by sku_id and/or warehouse_id; with neither it returns the largest balances.", {
    sku_id: id.optional(), warehouse_id: id.optional(),
  }),
  tool("overview", "dashboard", "Warehouse snapshot: active and out-of-stock SKUs, SKUs below reorder point, expiring batches, open work queue, asset value when the user may see money.", {
    warehouse_id: id.optional(),
  }),
  tool("sales_orders", "pick-list", "Sales orders filtered by status and order date range.", {
    status: z.enum(["open", "allocated", "picking", "picked", "packed", "dispatched", "cancelled"]).optional(), ...range,
  }),
  tool("goods_receipts", "goods-receipt", "Goods receipts filtered by status and receipt date range.", {
    status: z.enum(["draft", "received", "putaway_done", "cancelled"]).optional(), ...range,
  }),
  tool("putaway_tasks", "putaway", "Putaway tasks, open ones by default.", {
    status: z.enum(["open", "done", "cancelled"]).optional(), warehouse_id: id.optional(),
  }),
  tool("transfers", "stock-transfer", "Stock transfers filtered by status.", {
    status: z.enum(["draft", "in_transit", "received", "done", "cancelled"]).optional(),
  }),
  tool("stock_counts", "stock-opname", "Stock opname counts filtered by status.", {
    status: z.enum(["draft", "counting", "submitted", "approved", "rejected", "cancelled"]).optional(),
  }),
  tool("movements", "stock-audit", "Stock movement log filtered by SKU, type and date range, newest first.", {
    sku_id: id.optional(), ...range,
    type: z.enum(["receipt", "putaway", "pick", "dispatch", "transfer_out", "transfer_in", "bin_transfer", "adjustment", "qc_reject", "return"]).optional(),
  }),
  tool("navigate", null, "Return a button that opens an app page. Use it for anything you cannot do yourself (any change to stock, documents, users, integration) and for details. Pick the page from the list; never write a URL.", {
    page: z.enum(Object.keys(NAV) as [string, ...string[]]), label: z.string().min(1).max(80),
  }),
  { ...tool("ask_choice", null, "Ask the user to pick one option when the request is ambiguous.", {
    question: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(6),
  }), terminal: true },
];

export const getTool = (name: string): AiTool | undefined => AI_TOOLS.find((t) => t.name === name);

export function validateParams(
  t: AiTool,
  params: unknown,
): { params: Record<string, any> } | { error: string } { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = t.schema.safeParse(params);
  if (r.success) return { params: r.data as Record<string, unknown> };
  return { error: r.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ") };
}

const SAFE_PATHS = new Set(Object.values(NAV).map((n) => n.path.split("?")[0]));

/** Browser-side check before a link from the server becomes a button. */
export function isSafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  return SAFE_PATHS.has(path.split(/[?#]/)[0]);
}
