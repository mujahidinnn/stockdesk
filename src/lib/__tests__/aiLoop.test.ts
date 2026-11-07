import { describe, expect, it } from "vitest";
import { runAiLoop, type Call } from "../../../supabase/functions/_shared/aiLoop";
import { AI_TOOLS, isSafePath } from "../../../supabase/functions/_shared/aiCatalog";
import { guardText } from "../../../supabase/functions/_shared/aiGuard";

const model = (...turns: { text?: string; calls?: Call[] }[]) => {
  let i = 0;
  return async () => ({ calls: [], ...turns[Math.min(i++, turns.length - 1)] });
};
const deps = (callModel: ReturnType<typeof model>, extra = {}) => ({
  callModel, runReadTool: async () => [{ code: "A" }], lang: "en" as const,
  allowed: new Set(AI_TOOLS.map((t) => t.name)), pages: new Set(["dashboard", "putaway"]), ...extra,
});

describe("aiLoop", () => {
  it("reads, then answers", async () => {
    const out = await runAiLoop([], deps(model({ calls: [{ name: "find_warehouses", args: {} }] }, { text: "done" })));
    expect(out.text).toBe("done");
  });
  it("offers a button only for allowed pages", async () => {
    const out = await runAiLoop([], deps(model(
      { calls: [{ name: "navigate", args: { page: "putaway", label: "Open" } }, { name: "navigate", args: { page: "users", label: "x" } }] },
      { text: "ok" })));
    expect(out.links).toEqual([{ path: "/inbound/putaway", label: "Open" }]);
  });
  it("refuses tools outside the allowed set and stops after two bad calls", async () => {
    const bad = { calls: [{ name: "sales_orders", args: { status: "nope" } }] };
    const out = await runAiLoop([], deps(model(bad, bad, bad), { allowed: new Set(["sales_orders"]) }));
    expect(out.text).toMatch(/Missing details/);
  });
  it("ask_choice ends the loop with buttons", async () => {
    const out = await runAiLoop([], deps(model({ calls: [{ name: "ask_choice", args: { question: "Which?", options: ["A", "B"] } }] })));
    expect(out.choices.map((c) => c.reply)).toEqual(["A", "B"]);
  });
  it("replaces code blocks and rejects unsafe paths", () => {
    expect(guardText("```x```", "en").replaced).toBe(true);
    expect(isSafePath("/products")).toBe(true);
    expect(isSafePath("//evil.com")).toBe(false);
    expect(isSafePath("/nope")).toBe(false);
  });
});
