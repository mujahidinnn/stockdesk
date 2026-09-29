export interface VariantAxis {
  name: string;
  values: string[];
}

export interface VariantCombo {
  skuCode: string;
  attributes: Record<string, string>;
}

/** Upper-case letters and digits only, the shape m_skus.sku_code accepts. */
export const codePart = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Every combination of the axes, coded <PRODUCT>-<ATTR1>-<ATTR2>. Empty axes are skipped. */
export function buildVariants(productCode: string, axes: VariantAxis[]): VariantCombo[] {
  const used = axes
    .map((a) => ({ name: a.name.trim(), values: [...new Set(a.values.map((v) => v.trim()).filter(Boolean))] }))
    .filter((a) => a.name && a.values.length);
  if (!used.length) return [{ skuCode: codePart(productCode), attributes: {} }];

  let combos: Record<string, string>[] = [{}];
  for (const axis of used) combos = combos.flatMap((c) => axis.values.map((v) => ({ ...c, [axis.name]: v })));

  return combos.map((attributes) => ({
    skuCode: [productCode, ...Object.values(attributes)].map(codePart).join("-"),
    attributes,
  }));
}

/** Attribute values in the product's own order; jsonb does not keep key order. */
export const attributeValues = (variantAttributes: string[], attributes: unknown) =>
  variantAttributes.map((a) => (attributes as Record<string, string> | null)?.[a]).filter((v): v is string => !!v);
