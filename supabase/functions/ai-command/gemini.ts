// Gemini generateContent over REST with function calling.
import { z } from "zod";
import type { AiTool } from "../_shared/aiCatalog.ts";
import type { Call, LoopMessage } from "../_shared/aiLoop.ts";

export class ModelBusy extends Error {}
export class ModelBlocked extends Error {}

const BLOCK_REASONS = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"]);
const STRIP = new Set(["$schema", "additionalProperties"]);

// Gemini's Schema object rejects some JSON Schema keys, so drop them at every level.
function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).filter(([k]) => !STRIP.has(k)).map(([k, x]) => [k, clean(x)]));
  }
  return v;
}

function declaration(tool: AiTool) {
  const parameters = clean(z.toJSONSchema(tool.schema)) as { properties?: object };
  // An OBJECT with no properties is rejected; a tool without arguments omits parameters.
  const empty = !Object.keys(parameters.properties ?? {}).length;
  return { name: tool.name, description: tool.description, ...(empty ? {} : { parameters }) };
}

// Calls carry Gemini's thoughtSignature through the loop history; thinking models
// reject a resent functionCall part without it.
type SignedCall = Call & { thoughtSignature?: string };

// Gemini requires alternating roles, so a repeated role (a user prompt stored after
// model_busy, or an empty assistant row) is merged into the previous turn.
export function toContents(history: LoopMessage[]) {
  const contents: { role: "user" | "model"; parts: Record<string, unknown>[] }[] = [];
  for (const m of history) {
    let parts: Record<string, unknown>[];
    if (m.role === "tool") {
      parts = m.results.map((r) => ({ functionResponse: { name: r.name, response: r.response } }));
    } else {
      parts = m.text?.trim() ? [{ text: m.text }] : [];
      for (const c of (m.calls ?? []) as SignedCall[]) {
        parts.push({
          functionCall: { name: c.name, args: c.args },
          ...(c.thoughtSignature ? { thoughtSignature: c.thoughtSignature } : {}),
        });
      }
    }
    if (!parts.length) continue;
    const role = m.role === "model" ? "model" : "user";
    const last = contents[contents.length - 1];
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  }
  return contents;
}

export async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  history: LoopMessage[],
  tools: AiTool[],
  signal: AbortSignal,
): Promise<{ text?: string; calls: Call[] }> {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toContents(history),
    ...(tools.length ? { tools: [{ functionDeclarations: tools.map(declaration) }] } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    // Timeout and network failures are both "try again later".
    throw new ModelBusy(e instanceof Error ? e.message : "fetch failed");
  }
  if (res.status === 429 || res.status >= 500) throw new ModelBusy(`gemini ${res.status}`);
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);

  let json;
  try {
    json = await res.json();
  } catch (e) {
    // The deadline can also abort while the body is still streaming.
    throw new ModelBusy(e instanceof Error ? e.message : "read failed");
  }
  if (json.promptFeedback?.blockReason) throw new ModelBlocked(json.promptFeedback.blockReason);
  const cand = json.candidates?.[0];
  if (!cand) throw new ModelBlocked("no candidates");
  if (BLOCK_REASONS.has(cand.finishReason)) throw new ModelBlocked(cand.finishReason);

  const texts: string[] = [];
  const calls: SignedCall[] = [];
  for (const p of cand.content?.parts ?? []) {
    if (p.thought) continue;
    if (p.functionCall) {
      calls.push({
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
        ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
      });
    } else if (typeof p.text === "string") texts.push(p.text);
  }
  const text = texts.join("").trim();
  return { text: text || undefined, calls };
}
