import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { run } from "./useOutboundMutation";
import { useControlMutation } from "./useControlMutation";

export type TransferLine = Tables<"t_stock_transfer_lines"> & {
  from: { full_code: string } | null;
  to: { full_code: string } | null;
  m_batches: { batch_no: string } | null;
};
export type StockTransfer = Tables<"t_stock_transfers"> & { t_stock_transfer_lines: TransferLine[] };

export function useStockTransfers(type: "bin_to_bin" | "inter_warehouse", warehouseId: number | null) {
  return useQuery({
    queryKey: ["stock-transfers", type, warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_stock_transfers")
        .select(
          "*, t_stock_transfer_lines(*, from:m_locations!t_stock_transfer_lines_from_location_id_fkey(full_code), to:m_locations!t_stock_transfer_lines_to_location_id_fkey(full_code), m_batches(batch_no))",
        )
        .eq("transfer_type", type)
        .order("created_at", { ascending: false })
        .limit(type === "bin_to_bin" ? 30 : 100);
      if (warehouseId) q = q.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`);
      return (await run(q)) as unknown as StockTransfer[];
    },
  });
}

export const useBinTransfer = () =>
  useControlMutation(
    (v: { fromId: number; toId: number; skuId: number; batchId: number | null; qty: number; note: string }) =>
      run(
        supabase.rpc("create_bin_transfer", {
          p_from_location_id: v.fromId,
          p_to_location_id: v.toId,
          p_sku_id: v.skuId,
          p_batch_id: v.batchId as number,
          p_qty: v.qty,
          p_note: v.note || undefined,
        }),
      ),
    "transfers.moved",
  );

export type DraftTransferLine = { sku_id: number; batch_id: number | null; from_location_id: number; qty: number };

export const useCreateTransfer = () =>
  useControlMutation(async (v: { fromWh: number; toWh: number; note: string; lines: DraftTransferLine[] }) => {
    const t = await run(
      supabase
        .from("t_stock_transfers")
        .insert({ transfer_type: "inter_warehouse", from_warehouse_id: v.fromWh, to_warehouse_id: v.toWh, note: v.note || null })
        .select("id")
        .single(),
    );
    await run(supabase.from("t_stock_transfer_lines").insert(v.lines.map((l) => ({ ...l, transfer_id: t.id }))));
    return t.id;
  });

export const useSendTransfer = () =>
  useControlMutation((id: number) => run(supabase.rpc("send_transfer", { p_id: id })), "transfers.sent");

export const useReceiveTransfer = () =>
  useControlMutation(
    (v: { id: number; lines: { line_id: number; qty_received: number; reason?: string }[] }) =>
      run(supabase.rpc("receive_transfer", { p_id: v.id, p_lines: v.lines })),
    "transfers.received",
  );

export const useDecideVariance = () =>
  useControlMutation(
    (v: { lineId: number; approve: boolean }) => run(supabase.rpc("approve_transfer_variance", { p_line_id: v.lineId, p_approve: v.approve })),
    "transfers.decided",
  );

export const useCancelTransfer = () =>
  useControlMutation(
    (id: number) => run(supabase.rpc("cancel_stock_transfer", { p_id: id })),
    "transfers.cancelled",
  );
