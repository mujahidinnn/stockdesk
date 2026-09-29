import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useAuth } from "@/context/auth";
import { errorMessage } from "@/lib/errorMessage";

export type GoodsReceipt = Tables<"t_goods_receipts"> & {
  m_warehouses: { code: string; name: string } | null;
  m_suppliers: { name: string } | null;
  m_customers: { name: string } | null;
  m_owners: { name: string } | null;
  t_goods_receipt_lines: { id: number }[];
};
export type ReceiptLine = Tables<"t_goods_receipt_lines">;
export type ReceiptDetail = Tables<"t_goods_receipts"> & {
  m_warehouses: { code: string; name: string } | null;
  m_suppliers: { name: string } | null;
  m_customers: { name: string } | null;
  m_owners: { name: string } | null;
  t_goods_receipt_lines: ReceiptLine[];
  t_putaway_tasks: Pick<Tables<"t_putaway_tasks">, "id" | "receipt_line_id" | "status" | "qty" | "qty_done">[];
};

const KEYS = [["goods-receipts"], ["putaway-tasks"], ["stock-balances"], ["sidebar-counts"]];

export function useGoodsReceipts(warehouseId: number | null) {
  return useQuery({
    queryKey: ["goods-receipts", "list", warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_goods_receipts")
        .select("*, m_warehouses(code, name), m_suppliers(name), m_customers(name), m_owners(name), t_goods_receipt_lines(id)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const { data, error } = await q;
      if (error) throw error;
      return data as GoodsReceipt[];
    },
  });
}

export function useGoodsReceipt(id: number | null) {
  const { canRead } = useAuth();
  const withCost = canRead("valuation");
  return useQuery({
    queryKey: ["goods-receipts", "detail", id, withCost],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_goods_receipts")
        .select("*, m_warehouses(code, name), m_suppliers(name), m_customers(name), m_owners(name), t_goods_receipt_lines(*), t_putaway_tasks(id, receipt_line_id, status, qty, qty_done)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      const receipt = data as ReceiptDetail;
      receipt.t_goods_receipt_lines.sort((a, b) => a.line_no - b.line_no);
      // Prices come from their own table, readable only with valuation access.
      const costs = new Map<number, number>();
      if (withCost && receipt.t_goods_receipt_lines.length) {
        const { data: rows, error: e2 } = await supabase
          .from("t_receipt_line_costs")
          .select("receipt_line_id, unit_cost")
          .in("receipt_line_id", receipt.t_goods_receipt_lines.map((l) => l.id));
        if (e2) throw e2;
        rows.forEach((r) => costs.set(r.receipt_line_id, Number(r.unit_cost)));
      }
      return { receipt, costs };
    },
  });
}

function useReceiptMutation<V, R = void>(fn: (v: V) => Promise<R>, message = "common.saved") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      KEYS.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success(i18n.t(message));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

async function run<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return data as NonNullable<T>;
}

export type LineInput = Omit<TablesInsert<"t_goods_receipt_lines">, "receipt_id" | "line_no" | "id"> & { id?: number };

/**
 * Saves a draft: header, then lines (removed ones deleted, others upserted).
 * Prices are entered separately (useSetReceiptCosts). Returns the receipt id.
 * ponytail: several round trips, not one transaction; a failure midway
 * leaves a half-saved draft that the user can simply save again.
 */
export const useSaveReceiptDraft = () =>
  useReceiptMutation(
    async ({
      id,
      header,
      lines,
      removedLineIds,
    }: {
      id: number | null;
      header: Omit<TablesInsert<"t_goods_receipts">, "gr_no" | "status">;
      lines: LineInput[];
      removedLineIds: number[];
    }) => {
      const receiptId = id
        ? (await run(supabase.from("t_goods_receipts").update(header).eq("id", id).select("id").single())).id
        : (await run(supabase.from("t_goods_receipts").insert(header).select("id").single())).id;

      if (removedLineIds.length) await run(supabase.from("t_goods_receipt_lines").delete().in("id", removedLineIds));
      for (const { id: lineId, ...line } of lines) {
        const row = { ...line, receipt_id: receiptId };
        if (lineId) await run(supabase.from("t_goods_receipt_lines").update(row).eq("id", lineId));
        else await run(supabase.from("t_goods_receipt_lines").insert(row));
      }
      return receiptId;
    },
  );

/** Prices per line unit for a draft; null clears a price. Needs valuation update (set_receipt_costs). */
export const useSetReceiptCosts = () =>
  useReceiptMutation((v: { receiptId: number; costs: { line_id: number; unit_cost: number | null }[] }) =>
    run(supabase.rpc("set_receipt_costs", { p_receipt_id: v.receiptId, p_costs: v.costs })),
  );

export const usePostReceipt = () =>
  useReceiptMutation((id: number) => run(supabase.rpc("post_goods_receipt", { p_id: id })), "receipts.posted");

export const useCancelReceipt = () =>
  useReceiptMutation(
    (id: number) => run(supabase.rpc("cancel_goods_receipt", { p_id: id })),
    "receipts.cancelled",
  );

export const useDeleteReceipt = () =>
  useReceiptMutation((id: number) => run(supabase.from("t_goods_receipts").delete().eq("id", id)), "common.deleted");
