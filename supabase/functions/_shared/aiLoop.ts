// Provider-agnostic model loop. Runs in the Edge Function only; no Deno APIs, no URL imports, no fetch.
import { getTool, validateParams, NAV } from "./aiCatalog.ts";
import { guardText } from "./aiGuard.ts";

export type Call = { name: string; args: Record<string, unknown> };
export type LoopMessage =
  | { role: "user" | "model"; text?: string; calls?: Call[] }
  | { role: "tool"; results: { name: string; response: unknown }[] };

export interface LoopDeps {
  callModel(history: LoopMessage[]): Promise<{ text?: string; calls: Call[] }>;
  runReadTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  allowed: Set<string>;
  /** Pages navigate may point at for this user. */
  pages: Set<string>;
  lang: "id" | "en";
}

export interface AssistantContent {
  text: string;
  choices: { label: string; reply: string }[];
  links: { path: string; label: string }[];
}

const MAX_STEPS = 5;
const TOO_COMPLEX = {
  id: "Permintaan terlalu rumit, coba dipecah menjadi beberapa perintah.",
  en: "That request is too complex, try splitting it into smaller ones.",
};

export async function runAiLoop(history: LoopMessage[], deps: LoopDeps): Promise<AssistantContent> {
  const h = [...history];
  const failures = new Map<string, number>();
  const out: AssistantContent = { text: "", choices: [], links: [] };
  const finish = (text: string) => {
    out.text = guardText(text, deps.lang).text;
    return out;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await deps.callModel(h);
    const calls = res.calls ?? [];
    h.push({ role: "model", text: res.text, calls });
    if (!calls.length) return finish(res.text ?? "");

    const results: { name: string; response: unknown }[] = [];
    let terminal = false;
    // Read tools only look things up, so one turn's reads run side by side.
    await Promise.all(calls.map(async (call, i) => {
      const fail = (error: string) => (results[i] = { name: call.name, response: { error } });
      const t = getTool(call.name);
      if (!t || !deps.allowed.has(call.name)) return fail(`tool ${call.name} is not available`);

      const v = validateParams(t, call.args);
      if ("error" in v) {
        const n = (failures.get(t.name) ?? 0) + 1;
        failures.set(t.name, n);
        return fail(n >= 2 ? `FINAL: ${v.error}` : v.error);
      }
      const p = v.params;

      if (t.name === "ask_choice") {
        out.choices = (p.options as string[]).map((o) => ({ label: o, reply: o }));
        res.text = p.question;
        terminal = true;
        return (results[i] = { name: call.name, response: { ok: true } });
      }
      if (t.name === "navigate") {
        if (!deps.pages.has(p.page)) return fail(`the ${p.page} page is not available to this user; do not offer a button for it`);
        out.links.push({ path: NAV[p.page].path, label: p.label });
        return (results[i] = { name: call.name, response: { ok: true, note: "The button is shown. Now answer in text." } });
      }
      try {
        results[i] = { name: call.name, response: { data: await deps.runReadTool(t.name, p) } };
      } catch (e) {
        fail(e instanceof Error ? e.message : "tool failed");
      }
    }));

    const dead = results.find((r) => (r.response as { error?: string }).error?.startsWith("FINAL: "));
    if (dead) {
      const msg = (dead.response as { error: string }).error.slice(7);
      return finish(deps.lang === "id" ? `Data belum lengkap untuk ${dead.name}: ${msg}` : `Missing details for ${dead.name}: ${msg}`);
    }
    if (terminal) return finish(res.text ?? "");
    h.push({ role: "tool", results });
  }
  return finish(TOO_COMPLEX[deps.lang]);
}

// Past turns go back to the model as plain text; tool results are never replayed.
export function renderHistory(rows: { role: "user" | "assistant"; content: { text?: unknown } }[]): LoopMessage[] {
  return rows.map(({ role, content }) => ({ role: role === "user" ? "user" : "model", text: String(content?.text ?? "") }));
}
