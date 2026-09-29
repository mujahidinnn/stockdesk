import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { subscribeShared } from "@/lib/realtimeSubscription";
import { fetchAll } from "./useOutboundMutation";

export type StockBalance = Tables<"t_stock_balances"> & {
  m_skus: { sku_code: string } | null;
  m_batches: { batch_no: string; expiry_date: string | null } | null;
};

/** Non-zero balances per bin/SKU/batch/owner, live: any stock movement refreshes them. */
export function useStockBalances(filter: { warehouseId?: number | null; skuId?: number | null } = {}) {
  const qc = useQueryClient();

  useEffect(
    () =>
      subscribeShared("stock-balances", (ch) =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: "t_stock_balances" }, () =>
          qc.invalidateQueries({ queryKey: ["stock-balances"] }),
        ),
      ),
    [qc],
  );

  return useQuery({
    queryKey: ["stock-balances", filter.warehouseId ?? null, filter.skuId ?? null],
    queryFn: async () =>
      (await fetchAll((from, to) => {
        let q = supabase
          .from("t_stock_balances")
          .select("*, m_skus(sku_code), m_batches(batch_no, expiry_date)")
          .gt("qty_on_hand", 0);
        if (filter.warehouseId) q = q.eq("warehouse_id", filter.warehouseId);
        if (filter.skuId) q = q.eq("sku_id", filter.skuId);
        return q.order("id").range(from, to);
      })) as StockBalance[],
  });
}

export function qtyByLocation(balances: StockBalance[]) {
  const m = new Map<number, number>();
  for (const b of balances) m.set(b.location_id, (m.get(b.location_id) ?? 0) + Number(b.qty_on_hand));
  return m;
}
