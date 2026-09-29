import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { errorMessage } from "@/lib/errorMessage";

const KEYS = ["sales-orders", "pick-lists", "shipments", "stock-balances", "sidebar-counts"];

/** Outbound actions touch orders, pick lists, shipments and stock at once, so they refresh all of them. */
export function useOutboundMutation<V, R = unknown>(fn: (v: V) => Promise<R>, message = "common.saved") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(i18n.t(message));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

export async function run<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return data as NonNullable<T>;
}

/** Every row of a query, fetched in pages: the API returns at most 1000 rows
 *  per request. The query must have a stable order. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, size = 1000) {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const batch = await run(page(from, from + size - 1));
    rows.push(...batch);
    if (batch.length < size) return rows;
  }
}
