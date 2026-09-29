import { describe, expect, it } from "vitest";
import { rankPutawayBins, type BinState } from "../putaway";

// Same layout as the putaway part of supabase/tests/stock_flow_smoke.sql.
const APPAREL = 1;
const FOOD = 2;
const bin = (code: string, p: Partial<BinState>): BinState => ({
  id: code.charCodeAt(1),
  code,
  binType: "storage",
  isActive: true,
  allowedCategoryIds: [],
  maxQty: 100,
  maxWeightKg: null,
  pickSequence: 50,
  usedQty: 0,
  usedWeightKg: 0,
  holdsSame: false,
  ...p,
});
export const BINS: BinState[] = [
  bin("B1", { pickSequence: 40, usedQty: 50, holdsSame: true }),
  bin("B2", { pickSequence: 20, allowedCategoryIds: [APPAREL] }),
  bin("B3", { pickSequence: 10 }),
  bin("B4", { pickSequence: 5, usedQty: 10 }),
  bin("B5", { pickSequence: 1, allowedCategoryIds: [FOOD] }),
  bin("B6", { pickSequence: 2, usedQty: 95, holdsSame: true }),
  bin("B7", { pickSequence: 3, isActive: false }),
  bin("B8", { pickSequence: 4, binType: "staging", maxQty: null }),
];
const tee = { id: 1, batchId: null, categoryId: APPAREL, weightKg: 0.3 };

describe("rankPutawayBins", () => {
  it("prefers the same SKU, then empty bins that fit, then the nearest bin", () => {
    const r = rankPutawayBins(tee, 20, BINS);
    expect(r.map((b) => [b.code, b.rank])).toEqual([
      ["B1", 1],
      ["B3", 2],
      ["B2", 2],
      ["B4", 3],
    ]);
  });

  it("drops full, wrong-category, inactive and non-storage bins", () => {
    const codes = rankPutawayBins(tee, 20, BINS).map((b) => b.code);
    expect(codes).not.toContain("B5");
    expect(codes).not.toContain("B6");
    expect(codes).not.toContain("B7");
    expect(codes).not.toContain("B8");
  });

  it("respects the weight limit", () => {
    const heavy = [bin("B1", { maxWeightKg: 5, usedWeightKg: 0 })];
    expect(rankPutawayBins({ ...tee, weightKg: 0.3 }, 20, heavy)).toHaveLength(0);
    expect(rankPutawayBins({ ...tee, weightKg: 0.25 }, 20, heavy)).toHaveLength(1);
  });

  it("treats unlimited bins as always fitting", () => {
    expect(rankPutawayBins(tee, 10_000, [bin("B9", { maxQty: null })])[0].freeQty).toBeNull();
  });
});
