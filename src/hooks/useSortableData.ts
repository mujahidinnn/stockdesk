import { useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export function useSortableData<T, K extends string>(
  items: T[],
  getValue: (item: T, key: K) => string | number,
  initialKey: K | null = null,
  initialDirection: SortDirection = "asc",
) {
  const [sortKey, setSortKey] = useState<K | null>(initialKey);
  const [direction, setDirection] = useState<SortDirection>(initialDirection);

  function toggleSort(key: K) {
    if (sortKey === key) {
      setDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    const copy = [...items];
    copy.sort((a, b) => {
      const va = getValue(a, sortKey);
      const vb = getValue(b, sortKey);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb));
      return direction === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, direction, getValue]);

  return { sorted, sortKey, direction, toggleSort };
}
