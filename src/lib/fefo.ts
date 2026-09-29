// Reference copy of the allocation and walk order in generate_pick_list();
// the SQL is the source of truth.

export interface StockSlot {
  balanceId: number;
  batchId: number | null;
  expiry: string | null; // YYYY-MM-DD
  receivedAt: string | null;
  free: number;
  /** Storage or picking bin that is active and not being counted. */
  pickable: boolean;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  level: string;
  pickSequence: number;
}

const nullsLast = (a: string | null, b: string | null) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : 1);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * FEFO for expiry-tracked SKUs (earliest expiry first), FIFO otherwise
 * (oldest receipt first), then the nearest bin. Non-pickable stock and
 * batches expiring before today + minShelfLifeDays are never offered.
 * `short` is what could not be covered.
 */
export function allocateFefo(slots: StockSlot[], qtyNeeded: number, today: string, trackExpiry: boolean, minShelfLifeDays = 0) {
  const earliest = addDays(today, minShelfLifeDays);
  const order = slots
    .filter((s) => s.pickable && s.free > 0 && !(s.expiry && s.expiry < earliest))
    .sort(
      (a, b) =>
        (trackExpiry ? nullsLast(a.expiry, b.expiry) : 0) ||
        nullsLast(a.receivedAt, b.receivedAt) ||
        a.pickSequence - b.pickSequence ||
        a.balanceId - b.balanceId,
    );
  const picks: { slot: StockSlot; qty: number }[] = [];
  let rest = qtyNeeded;
  for (const slot of order) {
    if (rest <= 0) break;
    const qty = Math.min(rest, slot.free);
    picks.push({ slot, qty });
    rest = Math.round((rest - qty) * 1000) / 1000;
  }
  return { picks, short: Math.max(0, rest) };
}

type RouteStop = Pick<StockSlot, "zone" | "aisle" | "rack" | "level" | "pickSequence">;

/** Serpentine walk: aisles in order, racks up in odd aisles and back down in even ones. Dock bins last. */
export function sortPickRoute<T extends RouteStop>(stops: T[]): T[] {
  const aisles = [...new Set(stops.filter((s) => s.aisle != null).map((s) => `${s.zone}|${s.aisle}`))].sort();
  const rank = (s: T) => (s.aisle == null ? Infinity : aisles.indexOf(`${s.zone}|${s.aisle}`) + 1);
  return [...stops].sort((a, b) => {
    const z = nullsLast(a.zone, b.zone);
    if (z) return z;
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const dir = ra % 2 === 1 ? 1 : -1;
    return dir * nullsLast(a.rack, b.rack) || nullsLast(a.level, b.level) || a.pickSequence - b.pickSequence;
  });
}
