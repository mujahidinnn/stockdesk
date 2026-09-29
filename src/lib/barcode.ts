export interface ScanProduct {
  id: number;
  m_skus: {
    id: number;
    sku_code: string;
    barcode: string | null;
    base_uom_id: number;
    m_sku_uoms: { uom_id: number; factor_to_base: number; barcode: string | null }[];
  }[];
}

export interface ScanHit {
  productId: number;
  skuId: number;
  uomId: number;
  factor: number;
}

/**
 * Resolves a scanned code to a SKU and the unit it stands for: a packaging
 * barcode (Box) gives that unit, the SKU barcode or the SKU code gives the
 * base unit. The database keeps barcodes unique, so the first hit is the only one.
 */
export function resolveBarcode(products: ScanProduct[], raw: string): ScanHit | null {
  const code = normalizeScan(raw);
  if (!code) return null;
  const upper = code.toUpperCase();
  for (const p of products)
    for (const s of p.m_skus) {
      const unit = s.m_sku_uoms.find((u) => u.barcode === code);
      if (unit) return { productId: p.id, skuId: s.id, uomId: unit.uom_id, factor: unit.factor_to_base };
      if (s.barcode === code || s.sku_code === upper) return { productId: p.id, skuId: s.id, uomId: s.base_uom_id, factor: 1 };
    }
  return null;
}

/** Scanner input as typed: drops the Enter/Tab suffix, GS1 group separators
 *  and other control characters a wedge scanner may send, plus outer spaces. */
// eslint-disable-next-line no-control-regex -- stripping control characters is the point
export const normalizeScan = (raw: string) => raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();

/** EAN-13: 13 digits whose last one is the mod-10 check digit (weights 1,3). */
export function isValidEan13(code: string) {
  if (!/^\d{13}$/.test(code)) return false;
  const sum = [...code.slice(0, 12)].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}
