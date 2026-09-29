import type { Product, Sku } from "@/hooks/useProducts";
import type { ReceiptLine } from "@/hooks/useGoodsReceipts";

/** One editable receipt line in the form; quantities are in the chosen unit. */
export interface DraftLine {
  key: string;
  id?: number;
  sku_id: number | null;
  uom_id: number | null;
  qty_received: number;
  qty_rejected: number;
  reject_reason: string;
  batch_no: string;
  mfg_date: string;
  expiry_date: string;
}

export const newLine = (patch: Partial<DraftLine> = {}): DraftLine => ({
  key: crypto.randomUUID(),
  sku_id: null,
  uom_id: null,
  qty_received: 1,
  qty_rejected: 0,
  reject_reason: "",
  batch_no: "",
  mfg_date: "",
  expiry_date: "",
  ...patch,
});

export const fromSaved = (l: ReceiptLine): DraftLine =>
  newLine({
    id: l.id,
    sku_id: l.sku_id,
    uom_id: l.uom_id,
    qty_received: Number(l.qty_received),
    qty_rejected: Number(l.qty_rejected),
    reject_reason: l.reject_reason ?? "",
    batch_no: l.batch_no ?? "",
    mfg_date: l.mfg_date ?? "",
    expiry_date: l.expiry_date ?? "",
  });

export type LineProblem = "sku" | "qty" | "reject" | "reason" | "batch" | "expiry";

/** What stops a line from posting; the database checks the same things again. */
export function lineProblems(l: DraftLine, sku: Sku | undefined): LineProblem[] {
  const p: LineProblem[] = [];
  if (!sku || !l.uom_id) p.push("sku");
  if (!(l.qty_received > 0)) p.push("qty");
  if (l.qty_rejected < 0 || l.qty_rejected > l.qty_received) p.push("reject");
  if (l.qty_rejected > 0 && !l.reject_reason.trim()) p.push("reason");
  if (sku?.track_batch && !l.batch_no.trim()) p.push("batch");
  if (sku?.track_expiry && !l.expiry_date) p.push("expiry");
  return p;
}

export const skuIndex = (products: Product[]) =>
  new Map(products.flatMap((p) => p.m_skus.map((s) => [s.id, { product: p, sku: s }] as const)));
