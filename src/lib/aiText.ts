// The model answers in light markdown. Only bold and bullet lists are worth
// rendering; everything else stays plain text (no HTML, so nothing to sanitise).
export type AiSpan = { text: string; bold: boolean };
export type AiBlock = { kind: "p"; spans: AiSpan[] } | { kind: "ul" | "ol"; items: AiSpan[][] };

export function parseBold(line: string): AiSpan[] {
  return line
    .replace(/`/g, "")
    .split(/\*\*(.+?)\*\*/g)
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((s) => s.text);
}

export function parseAiText(text: string): AiBlock[] {
  const blocks: AiBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const kind = bullet ? "ul" : numbered ? "ol" : null;
    const last = blocks[blocks.length - 1];
    if (kind) {
      const spans = parseBold((bullet ?? numbered)![1]);
      if (last && last.kind === kind) last.items.push(spans);
      else blocks.push({ kind, items: [spans] });
    } else {
      blocks.push({ kind: "p", spans: parseBold(line) });
    }
  }
  return blocks;
}
