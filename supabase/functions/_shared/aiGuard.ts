export const REFUSAL_ID = "Saya hanya bisa membantu urusan StockDesk.";
export const REFUSAL_EN = "I can only help with StockDesk.";

const MAX_LEN = 1500;
const INJECTION_RE = /abaikan (semua )?instruksi|ignore (all )?previous|system prompt|instruksi sistem|kamu sekarang (adalah)?|you are now/i;
const ID_WORDS = /\b(yang|untuk|dan|saya|apakah|tolong|hari|ini|minggu|stok|barang|gudang|berapa)\b/i;

// ponytail: keyword heuristic, misses short or mixed prompts; upgrade to a model call if it matters
export function detectLang(prompt: string): "id" | "en" {
  return ID_WORDS.test(prompt) ? "id" : "en";
}

export function guardText(text: string, lang: "id" | "en"): { text: string; replaced: boolean } {
  if (text.includes("```") || text.length > MAX_LEN) {
    return { text: lang === "id" ? REFUSAL_ID : REFUSAL_EN, replaced: true };
  }
  return { text, replaced: false };
}

// Flags only, never blocks: pattern matches are for evaluation.
export function injectionFlags(prompt: string): string[] {
  return INJECTION_RE.test(prompt) ? ["injection_pattern"] : [];
}
