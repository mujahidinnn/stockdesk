/** One unit of a SKU and how many base units it holds (base unit = 1). */
export interface UomConversion {
  uomId: number;
  code: string;
  factor: number;
}

export interface UomPart {
  uom: string;
  qty: number;
}

// Quantities are numeric(14,3) in the database.
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;

function find(uomId: number, conversions: UomConversion[]) {
  const c = conversions.find((x) => x.uomId === uomId);
  if (!c) throw new Error(`Unit ${uomId} is not set up for this SKU`);
  return c;
}

export const toBase = (qty: number, uomId: number, conversions: UomConversion[]) =>
  roundQty(qty * find(uomId, conversions).factor);

/** Largest unit first, e.g. 291 pcs with Box=144, Pack=12 -> 2 Box 3 Pcs. Decimals stay on the base unit. */
export function fromBase(baseQty: number, conversions: UomConversion[]): UomPart[] {
  const units = [...conversions].sort((a, b) => b.factor - a.factor);
  const base = units.at(-1);
  if (!base) return [];
  const sign = baseQty < 0 ? -1 : 1;
  let rest = roundQty(Math.abs(baseQty));
  const parts: UomPart[] = [];
  for (const u of units.slice(0, -1)) {
    const n = Math.floor(rest / u.factor);
    if (n > 0) parts.push({ uom: u.code, qty: sign * n });
    rest = roundQty(rest - n * u.factor);
  }
  if (rest > 0 || parts.length === 0) parts.push({ uom: base.code, qty: sign * rest });
  return parts;
}

export const formatBreakdown = (parts: UomPart[], locale = "id-ID") =>
  parts
    .map((p) => `${p.qty.toLocaleString(locale, { maximumFractionDigits: 3 })} ${p.uom}`)
    .join(" ");

export type ConversionError = "noBase" | "badFactor" | "duplicateUnit" | "duplicateFactor";

/** Mirrors the database rules on m_sku_uoms so the form can say what is wrong before saving. */
export function validateConversions(conversions: UomConversion[], baseUomId: number): ConversionError[] {
  const errors = new Set<ConversionError>();
  const base = conversions.find((c) => c.uomId === baseUomId);
  if (!base || base.factor !== 1) errors.add("noBase");
  for (const c of conversions) {
    if (!Number.isInteger(c.factor) || c.factor < 1) errors.add("badFactor");
    if (c.uomId !== baseUomId && c.factor === 1) errors.add("duplicateFactor");
  }
  if (new Set(conversions.map((c) => c.uomId)).size !== conversions.length) errors.add("duplicateUnit");
  if (new Set(conversions.map((c) => c.factor)).size !== conversions.length) errors.add("duplicateFactor");
  return [...errors];
}
