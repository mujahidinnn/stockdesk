import { describe, expect, it } from "vitest";
import { consumeFifo, movingAverage, replayCosting, revaluationSplit, valueOnHand, type CostMove } from "../valuation";

// Same fixture as supabase/tests/stock_valuation_smoke.sql; the two must agree.
export const FIXTURE: CostMove[] = [
  { kind: "in", qty: 100, unitCost: 10000 },
  { kind: "in", qty: 50, unitCost: 12000 },
  { kind: "out", qty: 120 },
  { kind: "in", qty: 30, unitCost: 11000 },
  { kind: "out", qty: 40 },
];

describe("valuation", () => {
  it("FIFO consumes across layers, oldest first", () => {
    const r = consumeFifo(
      [
        { qty: 100, unitCost: 10000 },
        { qty: 50, unitCost: 12000 },
      ],
      120,
    );
    expect(r.cogs).toBe(1_240_000);
    expect(r.remainingLayers).toEqual([{ qty: 30, unitCost: 12000 }]);
  });

  it("refuses to issue more than the layers hold", () => {
    expect(() => consumeFifo([{ qty: 5, unitCost: 1 }], 6)).toThrow(/short by 1/);
  });

  it("keeps a moving average across several receipts", () => {
    const a1 = movingAverage(0, 0, 100, 10000);
    const a2 = movingAverage(100, a1, 50, 12000);
    expect(a1).toBe(10000);
    expect(a2).toBe(10666.6667);
    expect(movingAverage(30, a2, 30, 11000)).toBe(10833.3334);
  });

  it("values empty stock at zero", () => {
    expect(valueOnHand([])).toBe(0);
    expect(valueOnHand({ qty: 0, avgCost: 999 })).toBe(0);
  });

  it("keeps decimal quantities exact to 3 places", () => {
    const r = consumeFifo([{ qty: 0.3, unitCost: 1000 }], 0.1 + 0.2);
    expect(r.cogs).toBe(300);
    expect(r.remainingLayers).toEqual([]);
    expect(valueOnHand([{ qty: 2.5, unitCost: 1234.5678 }])).toBe(3086.42);
  });

  it("replays the shared fixture for both methods", () => {
    const r = replayCosting(FIXTURE);
    expect(r.cogs).toEqual([
      { fifo: 1_240_000, average: 1_280_000 },
      { fifo: 470_000, average: 433_333.34 },
    ]);
    expect(r.qty).toBe(20);
    expect(r.value).toEqual({ fifo: 220_000, average: 216_666.67 });
  });
});

describe("revaluationSplit", () => {
  it("splits a correction between stock on hand and what already went out", () => {
    // 10 in at 1000, 4 already issued; the real cost was 1200.
    expect(revaluationSplit({ qtyIn: 10, qtyRemaining: 6, unitCost: 1000 }, 1200)).toEqual({ onHand: 1200, cogs: 800 });
  });
  it("goes negative when the cost comes down", () => {
    expect(revaluationSplit({ qtyIn: 5, qtyRemaining: 5, unitCost: 1000 }, 900)).toEqual({ onHand: -500, cogs: 0 });
  });
});
