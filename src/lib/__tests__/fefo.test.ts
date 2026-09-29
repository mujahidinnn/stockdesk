import { describe, expect, it } from "vitest";
import { allocateFefo, sortPickRoute, type StockSlot } from "../fefo";

// Same layout and stock as the outbound part of supabase/tests/stock_flow_smoke.sql.
const TODAY = "2026-09-28";
const slot = (id: number, aisle: string, rack: string, p: Partial<StockSlot>): StockSlot => ({
  balanceId: id,
  batchId: id,
  expiry: null,
  receivedAt: null,
  free: 0,
  pickable: true,
  zone: "Z",
  aisle,
  rack,
  level: "A",
  pickSequence: Number(aisle) * 10000 + Number(rack) * 100,
  ...p,
});
export const MILK: StockSlot[] = [
  slot(1, "01", "01", { expiry: "2026-09-27", free: 10 }), // expired
  slot(2, "02", "03", { expiry: "2026-10-08", free: 5 }), // soon
  slot(3, "01", "02", { expiry: "2026-11-27", free: 20 }), // late
  slot(4, "02", "01", { expiry: "2026-10-28", free: 8 }), // mid
];

describe("allocateFefo", () => {
  it("takes the nearest expiry first and skips expired batches", () => {
    const r = allocateFefo(MILK, 25, TODAY, true);
    expect(r.picks.map((p) => [p.slot.balanceId, p.qty])).toEqual([
      [2, 5],
      [4, 8],
      [3, 12],
    ]);
    expect(r.short).toBe(0);
  });

  it("allocates across bins and reports what is short", () => {
    const r = allocateFefo(MILK, 40, TODAY, true);
    expect(r.picks.reduce((s, p) => s + p.qty, 0)).toBe(33);
    expect(r.short).toBe(7);
  });

  it("uses FIFO by receipt date when expiry is not tracked, then the nearest bin", () => {
    const soap = [
      slot(10, "01", "01", { receivedAt: "2026-09-23", free: 10 }),
      slot(11, "01", "03", { receivedAt: "2026-09-08", free: 4 }),
      slot(12, "01", "02", { receivedAt: null, free: 9, pickSequence: 1 }),
    ];
    expect(allocateFefo(soap, 6, TODAY, false).picks.map((p) => [p.slot.balanceId, p.qty])).toEqual([
      [11, 4],
      [10, 2],
    ]);
  });

  it("skips batches that expire inside the minimum shelf life", () => {
    // 14 days from TODAY rules out the batch expiring 2026-10-08.
    const r = allocateFefo(MILK, 10, TODAY, true, 14);
    expect(r.picks.map((p) => [p.slot.balanceId, p.qty])).toEqual([
      [4, 8],
      [3, 2],
    ]);
  });

  it("ignores stock outside storage and picking bins", () => {
    const r = allocateFefo([slot(20, "01", "01", { free: 50, pickable: false })], 5, TODAY, false);
    expect(r.short).toBe(5);
  });
});

describe("sortPickRoute", () => {
  it("walks odd aisles up the racks and even aisles back down", () => {
    const stops = [MILK[1], MILK[3], MILK[2], slot(30, "02", "02", {}), slot(31, "01", "01", {})];
    expect(sortPickRoute(stops).map((s) => `${s.aisle}-${s.rack}`)).toEqual(["01-01", "01-02", "02-03", "02-02", "02-01"]);
  });

  it("puts bins outside the rack tree last", () => {
    const dock = { ...slot(40, "01", "01", {}), zone: null, aisle: null, rack: null };
    expect(sortPickRoute([dock, MILK[2]]).map((s) => s.balanceId)).toEqual([3, 40]);
  });
});
