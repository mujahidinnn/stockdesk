import { useMemo } from "react";
import { useProducts, type Product, type Sku } from "./useProducts";
import { useUoms } from "./useUoms";
import type { UomConversion } from "@/lib/uom";
import { attributeValues } from "@/lib/variants";

export function useSkuLookup() {
  const { data: products = [] } = useProducts();
  const { data: uoms = [] } = useUoms();
  return useMemo(() => {
    const skus = new Map<number, { sku: Sku; product: Product }>();
    for (const p of products) for (const s of p.m_skus) skus.set(s.id, { sku: s, product: p });
    const uomCode = (id: number) => uoms.find((u) => u.id === id)?.code ?? "?";
    return {
      products,
      uomCode,
      get: (skuId: number) => skus.get(skuId),
      code: (skuId: number) => skus.get(skuId)?.sku.sku_code ?? "?",
      /** Product name plus variant values, e.g. "Basic Tee · Black / M". */
      label: (skuId: number) => {
        const e = skus.get(skuId);
        if (!e) return "";
        const v = attributeValues(e.product.variant_attributes, e.sku.attributes).join(" / ");
        return v ? `${e.product.name} · ${v}` : e.product.name;
      },
      conversions: (skuId: number): UomConversion[] =>
        (skus.get(skuId)?.sku.m_sku_uoms ?? []).map((u) => ({ uomId: u.uom_id, code: uomCode(u.uom_id), factor: u.factor_to_base })),
    };
  }, [products, uoms]);
}
