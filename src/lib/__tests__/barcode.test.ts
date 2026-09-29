import { expect, it } from "vitest";
import { isValidEan13, normalizeScan, resolveBarcode, type ScanProduct } from "../barcode";

const PCS = 1, BOX = 3;
const products: ScanProduct[] = [
  {
    id: 10,
    m_skus: [
      {
        id: 100,
        sku_code: "TEE-BLACK-M",
        barcode: "8991001",
        base_uom_id: PCS,
        m_sku_uoms: [
          { uom_id: PCS, factor_to_base: 1, barcode: null },
          { uom_id: BOX, factor_to_base: 144, barcode: "18991001" },
        ],
      },
    ],
  },
];

it("resolves a packaging barcode to that unit", () => {
  expect(resolveBarcode(products, "18991001")).toEqual({ productId: 10, skuId: 100, uomId: BOX, factor: 144 });
});

it("resolves the SKU barcode or SKU code to the base unit", () => {
  expect(resolveBarcode(products, " 8991001 ")).toEqual({ productId: 10, skuId: 100, uomId: PCS, factor: 1 });
  expect(resolveBarcode(products, "tee-black-m")?.skuId).toBe(100);
});

it("returns null for unknown or empty codes", () => {
  expect(resolveBarcode(products, "0000")).toBeNull();
  expect(resolveBarcode(products, "  ")).toBeNull();
});

it("validates the EAN-13 check digit", () => {
  expect(isValidEan13("8992761111114")).toBe(false);
  expect(isValidEan13("8992761111113")).toBe(true);
  expect(isValidEan13("4006381333931")).toBe(true);
  expect(isValidEan13("400638133393")).toBe(false);
  expect(isValidEan13("400638133393A")).toBe(false);
});

it("strips what a wedge scanner adds around the code", () => {
  expect(normalizeScan(" 4006381333931\r\n")).toBe("4006381333931");
  expect(normalizeScan("\u001d0104006381333931\t")).toBe("0104006381333931");
});
