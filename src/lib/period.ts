import { format } from "date-fns";

export type PeriodType = "daily" | "monthly" | "yearly";

function periodPrefix(type: PeriodType, date: Date): string {
  if (type === "daily") return format(date, "yyyy-MM-dd");
  if (type === "monthly") return format(date, "yyyy-MM");
  return format(date, "yyyy");
}

export function filterByPeriod<T extends { date: string }>(
  records: T[],
  type: PeriodType,
  date: Date,
): T[] {
  const prefix = periodPrefix(type, date);
  return records.filter((r) => r.date.startsWith(prefix));
}

/** True when `date` (YYYY-MM-DD) is on or before the lock date; nothing is locked without one. */
export const isLocked = (date: string, lockedUntil: string | null | undefined) => !!lockedUntil && date <= lockedUntil;
