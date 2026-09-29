import { describe, expect, it } from "vitest";
import { parseVariant, PRODUCT_COLUMNS, validateProductRows } from "../productSheet";

const head = [...PRODUCT_COLUMNS];
const row = (o: Partial<Record<(typeof PRODUCT_COLUMNS)[number], unknown>>) =>
  PRODUCT_COLUMNS.map((c) => o[c] ?? "");
const base = { product_code: "tee", product_name: "Basic Tee", owner_code: "internal", sku_code: "tee-blk-m", base_uom: "pcs" };

describe("validateProductRows", () => {
  it("finds the header under a letterhead and normalizes codes", () => {
    const r = validateProductRows([["COMPANY"], [], [], [], head, row({ ...base, variant: "color=black; size=m", track_batch: "ya", reorder_point: 5 })]);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({
      row: 6,
      product_code: "TEE",
      sku_code: "TEE-BLK-M",
      owner_code: "INTERNAL",
      attributes: { color: "BLACK", size: "M" },
      track_batch: true,
      reorder_point: 5,
    });
  });

  it("reports each bad row with its sheet number", () => {
    const r = validateProductRows([
      head,
      row({ ...base, product_name: "" }),
      row({ ...base, sku_code: "TEE-2", track_expiry: true }),
      row({ ...base, sku_code: "TEE-3", reorder_point: -1 }),
      row({ ...base, sku_code: "TEE-4", variant: "color" }),
      row(base),
      row(base),
    ]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 7]);
    expect(r.valid).toHaveLength(1);
  });

  it("refuses a sheet without the header", () => {
    expect(validateProductRows([["code", "name"]]).errors[0].row).toBe(1);
  });
});

describe("parseVariant", () => {
  it("parses pairs and rejects malformed ones", () => {
    expect(parseVariant("")).toEqual({});
    expect(parseVariant("Size = xl")).toEqual({ size: "XL" });
    expect(parseVariant("a=b=c")).toBeNull();
  });
});
