import { describe, expect, it } from "vitest";
import { activityBand, expandRange, expiryBand, fillLevel, parseCoords } from "../locations";

describe("expandRange", () => {
  it("expands letter and number ranges", () => {
    expect(expandRange("A-D")).toEqual(["A", "B", "C", "D"]);
    expect(expandRange("1-3")).toEqual(["01", "02", "03"]);
    expect(expandRange("8-10")).toEqual(["08", "09", "10"]);
    expect(expandRange("d-b")).toEqual(["B", "C", "D"]);
  });

  it("accepts lists, mixes and drops duplicates", () => {
    expect(expandRange("A-B, E ,a")).toEqual(["A", "B", "E"]);
    expect(expandRange("MEZ, 1")).toEqual(["MEZ", "1"]);
  });

  it("refuses a range mixing letters and numbers", () => {
    expect(() => expandRange("A-3")).toThrow();
  });
});

it("bands bin occupancy", () => {
  expect(fillLevel(0, 100)).toBe("empty");
  expect(fillLevel(79, 100)).toBe("low");
  expect(fillLevel(80, 100)).toBe("high");
  expect(fillLevel(100, 100)).toBe("full");
  expect(fillLevel(5, null)).toBe("unknown");
});

it("bands bin expiry and pick activity", () => {
  expect(expiryBand(0, "2026-01-01", "2026-09-29", "2026-10-29")).toBe("empty");
  expect(expiryBand(5, null, "2026-09-29", "2026-10-29")).toBe("unknown");
  expect(expiryBand(5, "2026-09-28", "2026-09-29", "2026-10-29")).toBe("full");
  expect(expiryBand(5, "2026-10-29", "2026-09-29", "2026-10-29")).toBe("high");
  expect(expiryBand(5, "2026-10-30", "2026-09-29", "2026-10-29")).toBe("low");
  expect(activityBand(0, 40)).toBe(0);
  expect(activityBand(1, 40)).toBe(1);
  expect(activityBand(21, 40)).toBe(3);
  expect(activityBand(40, 40)).toBe(4);
});

it("parses coordinates pasted from Google Maps", () => {
  expect(parseCoords("-6.144, 106.937")).toEqual([-6.144, 106.937]);
  expect(parseCoords(" -7.2462,112.676 ")).toEqual([-7.2462, 112.676]);
  expect(parseCoords("-6.1 106.9")).toEqual([-6.1, 106.9]);
  expect(parseCoords("106.9, -6.1")).toBeNull(); // swapped: latitude out of range
  expect(parseCoords("95, 10")).toBeNull();
  expect(parseCoords("Jakarta")).toBeNull();
});
