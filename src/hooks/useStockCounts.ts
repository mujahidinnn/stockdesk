import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { run } from "./useOutboundMutation";
import { useControlMutation } from "./useControlMutation";

export type StockCount = Tables<"t_stock_counts"> & { t_stock_count_counters: { user_id: string }[] };
// system_qty is deliberately missing: clients cannot select it (column grant).
export type CountLine = Omit<Tables<"t_stock_count_lines">, "system_qty"> & {
  m_batches: { batch_no: string; expiry_date: string | null } | null;
};
const LINE_COLUMNS = "id, count_id, location_id, sku_id, batch_id, owner_id, counted_qty, counted_by, counted_at, m_batches(batch_no, expiry_date)";

export function useStockCounts(warehouseId: number | null) {
  return useQuery({
    queryKey: ["stock-counts", "list", warehouseId],
    queryFn: async () => {
      let q = supabase.from("t_stock_counts").select("*, t_stock_count_counters(user_id)").order("created_at", { ascending: false }).limit(100);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      return (await run(q)) as StockCount[];
    },
  });
}

export function useCountLines(countId: number | null) {
  return useQuery({
    queryKey: ["stock-counts", "lines", countId],
    enabled: countId != null,
    queryFn: async () => (await run(supabase.from("t_stock_count_lines").select(LINE_COLUMNS).eq("count_id", countId!))) as unknown as CountLine[],
  });
}

/** System vs counted with variance (and its value for cost readers). Blind counts: approvers only. */
export function useCountReview(countId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["stock-counts", "review", countId],
    enabled: countId != null && enabled,
    queryFn: () => run(supabase.rpc("count_review", { p_id: countId! })),
  });
}

export const useCreateCount = () =>
  useControlMutation(
    (v: { warehouseId: number; scope: number[]; categoryId: number | null; blind: boolean; note: string }) =>
      run(
        supabase
          .from("t_stock_counts")
          .insert({
            warehouse_id: v.warehouseId,
            scope_location_ids: v.scope,
            scope_category_id: v.categoryId,
            blind: v.blind,
            note: v.note || null,
          })
          .select("id")
          .single(),
      ).then((r) => r.id),
  );

export const useStartCount = () => useControlMutation((id: number) => run(supabase.rpc("start_stock_count", { p_id: id })), "counts.started");

export const useRecordCount = () =>
  useControlMutation(
    (v: { countId: number; locationId: number; skuId: number; batchId: number | null; qty: number }) =>
      run(
        supabase.rpc("record_count", {
          p_count_id: v.countId,
          p_location_id: v.locationId,
          p_sku_id: v.skuId,
          p_batch_id: v.batchId as number,
          p_qty: v.qty,
        }),
      ),
    "counts.recorded",
  );

export const useSubmitCount = () => useControlMutation((id: number) => run(supabase.rpc("submit_stock_count", { p_id: id })), "counts.submitted");

export const useApproveCount = () => useControlMutation((id: number) => run(supabase.rpc("approve_stock_count", { p_id: id })), "counts.approved");

export const useCloseCount = () =>
  useControlMutation(
    (v: { id: number; status: "rejected" | "cancelled"; reason?: string }) =>
      run(
        v.status === "rejected"
          ? supabase.rpc("reject_stock_count", { p_id: v.id, p_reason: v.reason ?? "" })
          : supabase.rpc("cancel_stock_count", { p_id: v.id }),
      ),
    "counts.closed",
  );
