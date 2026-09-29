import { useSyncExternalStore } from "react";

// Global warehouse filter from the header, shared by every page and kept
// across reloads. null means all warehouses.
const KEY = "stockdesk.warehouse";
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setWarehouseFilter(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch {
    /* storage blocked: the filter just won't persist */
  }
  listeners.forEach((l) => l());
}

export function useWarehouseFilter() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
  );
}
