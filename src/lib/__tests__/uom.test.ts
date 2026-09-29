import { describe, expect, it } from "vitest";
import { formatBreakdown, fromBase, roundQty, toBase, validateConversions, type UomConversion } from "../uom";

const PCS = 1, PACK = 2, BOX = 3, KG = 4, SACK = 5;
const tee: UomConversion[] = [
  { uomId: PCS, code: "Pcs", factor: 1 },
  { uomId: PACK, code: "Pack", factor: 12 },
  { uomId: BOX, code: "Box", factor: 144 },
];
const rice: UomConversion[] = [
  { uomId: KG, code: "Kg", factor: 1 },
  { uomId: SACK, code: "Sack", factor: 25 },
];

describe("uom", () => {
  it("converts nested units to base units", () => {
    expect(toBase(2, BOX, tee)).toBe(288);
    expect(toBase(3, PACK, tee)).toBe(36);
    expect(toBase(5, PCS, tee)).toBe(5);
  });

  it("breaks base units back into the largest units that fit", () => {
    expect(fromBase(291, tee)).toEqual([
      { uom: "Box", qty: 2 },
      { uom: "Pcs", qty: 3 },
    ]);
    expect(fromBase(300, tee)).toEqual([
      { uom: "Box", qty: 2 },
      { uom: "Pack", qty: 1 },
    ]);
    expect(fromBase(0, tee)).toEqual([{ uom: "Pcs", qty: 0 }]);
    expect(formatBreakdown(fromBase(291, tee))).toBe("2 Box 3 Pcs");
  });

  it("keeps decimal remainders on the base unit (kg)", () => {
    expect(fromBase(52.5, rice)).toEqual([
      { uom: "Sack", qty: 2 },
      { uom: "Kg", qty: 2.5 },
    ]);
    expect(toBase(1.5, SACK, rice)).toBe(37.5);
    expect(formatBreakdown(fromBase(52.5, rice))).toBe("2 Sack 2,5 Kg");
  });

  it("rounds to 3 decimals like numeric(14,3)", () => {
    expect(toBase(0.1 + 0.2, KG, rice)).toBe(0.3);
    expect(fromBase(1.23456, rice)).toEqual([{ uom: "Kg", qty: 1.235 }]);
    expect(fromBase(-30, rice)).toEqual([
      { uom: "Sack", qty: -1 },
      { uom: "Kg", qty: -5 },
    ]);
  });

  it("rejects units the SKU does not have", () => {
    expect(() => toBase(1, SACK, tee)).toThrow();
  });

  it("validates a conversion set", () => {
    expect(validateConversions(tee, PCS)).toEqual([]);
    expect(validateConversions(tee, PACK)).toContain("noBase");
    expect(validateConversions([...tee, { uomId: SACK, code: "Sack", factor: 0 }], PCS)).toContain("badFactor");
    expect(validateConversions([...tee, { uomId: SACK, code: "Sack", factor: 2.5 }], PCS)).toContain("badFactor");
    expect(validateConversions([...tee, { uomId: BOX, code: "Box", factor: 100 }], PCS)).toContain("duplicateUnit");
    expect(validateConversions([...tee, { uomId: SACK, code: "Sack", factor: 12 }], PCS)).toContain("duplicateFactor");
  });
});

it("rounds quantities to 3 decimals like numeric(14,3)", () => {
  expect(roundQty(0.1 + 0.2)).toBe(0.3);
  expect(roundQty(1.23456)).toBe(1.235);
});
