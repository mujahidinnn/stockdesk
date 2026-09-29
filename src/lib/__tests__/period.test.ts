import { describe, expect, it } from "vitest";
import { filterByPeriod, isLocked } from "../period";

// Every record sits on a month or year edge, which is where an off by one hides.
const records = [
  { date: "2024-12-31" },
  { date: "2025-01-01" },
  { date: "2025-05-31" },
  { date: "2025-06-01" },
  { date: "2025-06-30" },
  { date: "2025-07-01" },
];

const dates = (rows: { date: string }[]) => rows.map((r) => r.date);

describe("filterByPeriod", () => {
  it("keeps only the one day", () => {
    expect(
      dates(filterByPeriod(records, "daily", new Date(2025, 5, 30))),
    ).toEqual(["2025-06-30"]);
  });

  it("keeps the month without leaking into the neighbours", () => {
    expect(
      dates(filterByPeriod(records, "monthly", new Date(2025, 5, 15))),
    ).toEqual(["2025-06-01", "2025-06-30"]);
  });

  it("keeps the year without leaking into the neighbours", () => {
    expect(
      dates(filterByPeriod(records, "yearly", new Date(2025, 5, 15))),
    ).toEqual([
      "2025-01-01",
      "2025-05-31",
      "2025-06-01",
      "2025-06-30",
      "2025-07-01",
    ]);
  });

  it("returns nothing for a period with no records", () => {
    expect(filterByPeriod(records, "monthly", new Date(2025, 1, 10))).toEqual(
      [],
    );
  });
});

describe("isLocked", () => {
  it("locks the lock date and everything before it", () => {
    expect(isLocked("2026-07-31", "2026-07-31")).toBe(true);
    expect(isLocked("2026-06-01", "2026-07-31")).toBe(true);
    expect(isLocked("2026-08-01", "2026-07-31")).toBe(false);
  });
  it("locks nothing without a lock date", () => {
    expect(isLocked("2000-01-01", null)).toBe(false);
  });
});
