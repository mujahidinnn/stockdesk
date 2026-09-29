import { z } from "zod";
import type { Product } from "@/hooks/useProducts";
import { brandSheet, newWorkbook, saveWorkbook } from "./exportBrand";
import { safeCell } from "./exportReport";

// Column keys are the sheet headers, the same in every language, so an
// exported file can be edited and imported back as is.
export const PRODUCT_COLUMNS = [
  "product_code", "product_name", "category_code", "owner_code", "sku_code", "variant", "base_uom", "barcode",
  "track_batch", "track_expiry", "safety_stock", "reorder_point", "reorder_qty", "weight_kg", "is_active",
] as const;

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export interface ImportRowError {
  row: number;
  message: string;
}

const code = (re: RegExp) => z.string().trim().toUpperCase().regex(re);
const num = z.preprocess((v) => (v === "" || v == null ? 0 : Number(v)), z.number().min(0));
const bool = z.preprocess((v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "" ? undefined : ["true", "1", "ya", "yes", "y"].includes(s) ? true : ["false", "0", "tidak", "no", "n"].includes(s) ? false : v;
}, z.boolean().optional());

const rowSchema = z
  .object({
    product_code: code(/^[A-Z0-9][A-Z0-9_]*$/),
    product_name: z.string().trim().min(1),
    category_code: z.string().trim().toUpperCase(),
    owner_code: z.string().trim().toUpperCase().min(1),
    sku_code: code(/^[A-Z0-9][A-Z0-9_-]*$/),
    variant: z.string().trim(),
    base_uom: z.string().trim().toUpperCase().min(1),
    barcode: z.string().trim().regex(/^[0-9A-Za-z-]*$/),
    track_batch: bool,
    track_expiry: bool,
    safety_stock: num,
    reorder_point: num,
    reorder_qty: num,
    weight_kg: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().min(0).nullable()),
    is_active: bool,
  })
  .refine((r) => !r.track_expiry || r.track_batch, { message: "track_expiry needs track_batch", path: ["track_expiry"] });

export type ImportRow = Omit<z.infer<typeof rowSchema>, "variant"> & { row: number; attributes: Record<string, string> };

/** "color=Red; size=M" -> { color: "RED", size: "M" }. Values are uppercased like variant codes. */
export function parseVariant(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of text.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [k, v, ...rest] = part.split("=").map((s) => s.trim());
    if (!k || !v || rest.length) return null;
    out[k.toLowerCase()] = v.toUpperCase();
  }
  return out;
}

export function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "").trim();
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result ?? "").trim();
  return String(v).trim();
}

/** Validates sheet rows (header row first, anywhere in the sheet). Row numbers are the sheet's. */
export function validateProductRows(sheet: unknown[][]): { valid: ImportRow[]; errors: ImportRowError[] } {
  const head = sheet.findIndex((cells) => cellText(cells[0]) === PRODUCT_COLUMNS[0]);
  if (head < 0) return { valid: [], errors: [{ row: 1, message: `Header row starting with "${PRODUCT_COLUMNS[0]}" not found` }] };
  const idx = PRODUCT_COLUMNS.map((c) => sheet[head].findIndex((h) => cellText(h) === c));
  const missing = PRODUCT_COLUMNS.filter((_, i) => idx[i] < 0 && i < 7);
  if (missing.length) return { valid: [], errors: [{ row: head + 1, message: `Missing columns: ${missing.join(", ")}` }] };

  const valid: ImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  sheet.slice(head + 1).forEach((cells, i) => {
    const row = head + i + 2;
    if (cells.every((c) => cellText(c) === "")) return;
    const raw = Object.fromEntries(PRODUCT_COLUMNS.map((c, j) => [c, idx[j] < 0 ? "" : cellText(cells[idx[j]])]));
    const r = rowSchema.safeParse(raw);
    if (!r.success) {
      const issue = r.error.issues[0];
      return errors.push({ row, message: `${String(issue.path[0] ?? "")}: ${issue.message}` });
    }
    const attributes = parseVariant(r.data.variant);
    if (!attributes) return errors.push({ row, message: 'variant: use "name=value; name=value"' });
    if (seen.has(r.data.sku_code)) return errors.push({ row, message: `sku_code ${r.data.sku_code} appears twice` });
    seen.add(r.data.sku_code);
    const { variant: _variant, ...rest } = r.data;
    valid.push({ ...rest, row, attributes });
  });
  if (valid.length + errors.length > MAX_IMPORT_ROWS) errors.unshift({ row: 0, message: `More than ${MAX_IMPORT_ROWS} rows` });
  return { valid, errors };
}

export async function readSheet(file: File): Promise<unknown[][]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const rows: unknown[][] = [];
  // exceljs values[0] is always empty; keep blank rows so numbers match the sheet.
  ws?.eachRow({ includeEmpty: true }, (row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
}

export async function exportProducts(
  products: Product[],
  names: { category: (id: number | null) => string; owner: (id: number) => string; uom: (id: number) => string },
  company: string,
) {
  const { wb, logo } = await newWorkbook(company);
  const ws = wb.addWorksheet("Products");
  ws.columns = PRODUCT_COLUMNS.map((c) => ({ header: c, width: c.includes("name") ? 28 : 16 }));
  for (const p of products)
    for (const s of p.m_skus)
      ws.addRow(
        [
          p.code, p.name, names.category(p.category_id), names.owner(p.owner_id), s.sku_code,
          Object.entries((s.attributes ?? {}) as Record<string, string>).map(([k, v]) => `${k}=${v}`).join("; "),
          names.uom(s.base_uom_id), s.barcode ?? "", s.track_batch, s.track_expiry, Number(s.safety_stock),
          Number(s.reorder_point), Number(s.reorder_qty), s.weight_kg == null ? null : Number(s.weight_kg), s.is_active,
        ].map((v) => (typeof v === "boolean" ? v : safeCell(v))),
      );
  brandSheet(wb, ws, { company, title: "Master Produk & SKU", logo });
  await saveWorkbook(wb, `products-${new Date().toLocaleDateString("en-CA")}.xlsx`);
}
