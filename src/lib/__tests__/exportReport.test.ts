import { describe, expect, it } from "vitest";
import { safeCell } from "../exportReport";

describe("safeCell", () => {
  it("quotes text a spreadsheet would run as a formula", () => {
    for (const v of ["=SUM(A1)", "+1", "-2+3", "@cmd", "\tx", "\rx"]) expect(safeCell(v)).toBe(`'${v}`);
  });
  it("leaves plain text, numbers and empties alone", () => {
    expect(safeCell("SKU-01")).toBe("SKU-01");
    expect(safeCell("a=b")).toBe("a=b");
    expect(safeCell(-5)).toBe(-5);
    expect(safeCell(null)).toBeNull();
    expect(safeCell(undefined)).toBeNull();
  });
});
