import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { subscribeShared } from "@/lib/realtimeSubscription";
import { errorMessage } from "@/lib/errorMessage";

export type PutawayTask = Tables<"t_putaway_tasks"> & {
  m_batches: { batch_no: string; expiry_date: string | null } | null;
  t_goods_receipts: { gr_no: string } | null;
  from: { full_code: string } | null;
  suggested: { full_code: string } | null;
};

export function usePutawayTasks(warehouseId: number | null) {
  const qc = useQueryClient();
  useEffect(
    () =>
      subscribeShared("putaway-tasks", (ch) =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: "t_putaway_tasks" }, () =>
          qc.invalidateQueries({ queryKey: ["putaway-tasks"] }),
        ),
      ),
    [qc],
  );
  return useQuery({
    queryKey: ["putaway-tasks", warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_putaway_tasks")
        .select(
          "*, m_batches(batch_no, expiry_date), t_goods_receipts(gr_no), from:m_locations!t_putaway_tasks_from_location_id_fkey(full_code), suggested:m_locations!t_putaway_tasks_suggested_location_id_fkey(full_code)",
        )
        .eq("status", "open")
        .order("created_at");
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as PutawayTask[];
    },
  });
}

export function usePutawaySuggestions(task: PutawayTask | null, qty: number) {
  return useQuery({
    queryKey: ["putaway-suggest", task?.id, qty],
    enabled: !!task && qty > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("suggest_putaway_bins", {
        p_sku_id: task!.sku_id,
        p_qty: qty,
        p_warehouse_id: task!.warehouse_id,
        p_batch_id: task!.batch_id ?? undefined,
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useCompletePutaway() {
  const qc = useQueryClient();
  return useMutation({
    // The caller keeps one id per confirm: a retried request finds its movement instead of moving stock twice.
    mutationFn: async (v: { taskId: number; locationId: number; qty: number; requestId: string }) => {
      const { error } = await supabase.rpc("complete_putaway", {
        p_task_id: v.taskId,
        p_location_id: v.locationId,
        p_qty: v.qty,
        p_request_id: v.requestId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const k of ["putaway-tasks", "stock-balances", "goods-receipts", "sidebar-counts", "putaway-suggest"])
        qc.invalidateQueries({ queryKey: [k] });
      toast.success(i18n.t("putaway.done"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}
