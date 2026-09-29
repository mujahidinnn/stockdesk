import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { subscribeShared } from "@/lib/realtimeSubscription";
import { run, useOutboundMutation } from "./useOutboundMutation";

export type PickStop = Tables<"t_pick_list_lines"> & {
  m_locations: { full_code: string } | null;
  m_batches: { batch_no: string; expiry_date: string | null } | null;
  t_sales_order_lines: { order_id: number; t_sales_orders: { so_no: string; customer_name: string } | null } | null;
};
export type PickList = Tables<"t_pick_lists"> & { t_pick_list_lines: PickStop[] };

export function usePickLists(warehouseId: number | null) {
  const qc = useQueryClient();
  useEffect(
    () =>
      subscribeShared("pick-list-lines", (ch) =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: "t_pick_list_lines" }, () =>
          qc.invalidateQueries({ queryKey: ["pick-lists"] }),
        ),
      ),
    [qc],
  );
  return useQuery({
    queryKey: ["pick-lists", warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_pick_lists")
        .select(
          "*, t_pick_list_lines(*, m_locations(full_code), m_batches(batch_no, expiry_date), t_sales_order_lines(order_id, t_sales_orders(so_no, customer_name)))",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const data = (await run(q)) as PickList[];
      data.forEach((p) => p.t_pick_list_lines.sort((a, b) => a.seq - b.seq));
      return data;
    },
  });
}

export const useGeneratePickList = () =>
  useOutboundMutation(
    (orderIds: number[]) => run(supabase.rpc("generate_pick_list", { p_order_ids: orderIds })),
    "picking.generated",
  );

export const useConfirmPick = () =>
  useOutboundMutation(
    (v: { lineId: number; qty: number; reason?: string; requestId: string }) =>
      run(
        supabase.rpc("confirm_pick_line", {
          p_line_id: v.lineId,
          p_qty: v.qty,
          p_short_reason: v.reason,
          p_request_id: v.requestId,
        }),
      ),
    "picking.confirmed",
  );

export const useCancelPickList = () =>
  useOutboundMutation((id: number) => run(supabase.rpc("cancel_pick_list", { p_id: id })), "picking.cancelled");
