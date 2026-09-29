/**
 * Expands a layout spec the way people write it on a warehouse plan:
 * "A-D" -> A,B,C,D; "1-3" -> 01,02,03; "A,C,F" -> A,C,F; mixed "A-B,E".
 * Numbers are zero-padded to the width of the longest one (min 2).
 */
export function expandRange(spec: string): string[] {
  const out: string[] = [];
  for (const raw of spec.split(",")) {
    const part = raw.trim().toUpperCase();
    if (!part) continue;
    const m = part.match(/^([A-Z]|\d+)\s*-\s*([A-Z]|\d+)$/);
    if (!m) {
      out.push(part.replace(/[^A-Z0-9]/g, ""));
      continue;
    }
    const [, a, b] = m;
    if (/\d/.test(a) && /\d/.test(b)) {
      const width = Math.max(2, a.length, b.length);
      for (let n = Math.min(+a, +b); n <= Math.max(+a, +b); n++) out.push(String(n).padStart(width, "0"));
    } else if (/[A-Z]/.test(a) && /[A-Z]/.test(b)) {
      const [lo, hi] = [a.charCodeAt(0), b.charCodeAt(0)].sort((x, y) => x - y);
      for (let c = lo; c <= hi; c++) out.push(String.fromCharCode(c));
    } else {
      throw new Error(`Cannot mix letters and numbers in "${part}"`);
    }
  }
  return [...new Set(out.filter(Boolean))];
}

export type Fill = "empty" | "low" | "high" | "full" | "unknown";

/** Occupancy band for the bin grid colors: empty, < 80%, >= 80%, full. */
export function fillLevel(qty: number, maxQty: number | null): Fill {
  if (qty <= 0) return "empty";
  if (!maxQty) return "unknown";
  const r = qty / maxQty;
  return r >= 1 ? "full" : r >= 0.8 ? "high" : "low";
}

/** Earliest-expiry band, reusing the fill colors: expired = full, within the warning window = high. */
export function expiryBand(qty: number, expiry: string | null | undefined, today: string, warnUntil: string): Fill {
  if (qty <= 0) return "empty";
  if (!expiry) return "unknown";
  return expiry < today ? "full" : expiry <= warnUntil ? "high" : "low";
}

/** Pick-count band relative to the busiest bin: quarters of the max. */
export function activityBand(picks: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (picks <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((picks / max) * 4)) as 1 | 2 | 3 | 4;
}

/** "lat, lng" as Google Maps copies it; null when malformed or out of range. */
export function parseCoords(v: string): [number, number] | null {
  const m = v.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const [lat, lng] = [Number(m[1]), Number(m[2])];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
