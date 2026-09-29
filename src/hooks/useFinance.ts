import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database, TablesUpdate } from "@/integrations/supabase/types";
import i18n from "@/lib/i18n";
import { run } from "./useOutboundMutation";
import { errorMessage } from "@/lib/errorMessage";

type Fn<K extends keyof Database["public"]["Functions"]> = Database["public"]["Functions"][K]["Returns"];
export type ValuationRow = Fn<"stock_valuation">[number];
export type CogsRow = Fn<"cogs_report">[number];
export type EstimatedLine = Fn<"estimated_receipt_lines">[number];
export type Method = "fifo" | "average";

export interface DashboardSummary {
  asset_value: number | null;
  active_skus: number;
  below_reorder: { sku_code: string; name: string; on_hand: number; reorder_point: number; reorder_qty: number }[];
  expiring: { batch_no: string; sku_code: string; expiry_date: string; qty: number }[];
  putaway_pending: number;
  pick_lists_today: number;
  count_accuracy: number | null;
  value_trend: { date: string; value: number }[] | null;
  movers: {
    fast: { sku_code: string; out_qty: number }[];
    slow: { sku_code: string; out_qty: number; on_hand: number }[];
    turnover: { category: string; out_qty: number; on_hand: number; turnover: number | null }[];
  };
  out_of_stock: number;
  dispatched_today: number | null;
  flow: { date: string; in_qty: number; out_qty: number }[];
  /** Null where the caller cannot open that page. */
  queue: Record<QueueKey, number | null>;
  utilization: { code: string; name: string; bins: number; used: number; fill_pct: number | null }[];
  recent: { id: number; movement_type: string; sku_code: string; qty: number; ref_no: string | null; created_at: string; actor: string | null }[] | null;
  cogs_month: number | null;
  locked_until: string | null;
}

export type QueueKey =
  | "receipt_drafts"
  | "orders_open"
  | "pick_lists_open"
  | "to_pack"
  | "to_dispatch"
  | "in_transit"
  | "variances"
  | "counts_active"
  | "counts_submitted"
  | "estimated_costs"
  | "webhooks_failed";

export function useDashboardSummary(warehouseId: number | null) {
  return useQuery({
    queryKey: ["dashboard", warehouseId],
    queryFn: async () =>
      (await run(supabase.rpc("dashboard_summary", { p_warehouse_id: warehouseId ?? undefined }))) as unknown as DashboardSummary,
    refetchInterval: 5 * 60_000,
  });
}

export function useStockValuation(asOf: string, method: Method, warehouseId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["valuation", asOf, method, warehouseId],
    enabled,
    queryFn: () => run(supabase.rpc("stock_valuation", { p_as_of: asOf, p_method: method, p_warehouse_id: warehouseId ?? undefined })),
  });
}

export function useCogs(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ["cogs", from, to],
    enabled,
    queryFn: () => run(supabase.rpc("cogs_report", { p_from: from, p_to: to })),
  });
}

export function useEstimatedReceipts() {
  return useQuery({ queryKey: ["valuation", "estimates"], queryFn: () => run(supabase.rpc("estimated_receipt_lines")) });
}

/** Finance writes change values everywhere, so they refresh every money-shaped query. */
function useFinanceMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      ["valuation", "cogs", "dashboard", "settings", "sidebar-counts"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast.success(i18n.t("common.saved"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

export const useRevalueReceipt = () =>
  useFinanceMutation((v: { lineId: number; unitCost: number }) =>
    run(supabase.rpc("revalue_receipt", { p_receipt_line_id: v.lineId, p_unit_cost: v.unitCost })),
  );

/** Books are closed up to and including this date; null unlocks everything (Admin only). */
export const useSetLockedUntil = () =>
  useFinanceMutation((date: string | null) => run(supabase.rpc("set_locked_until", { p_date: date as string })));

export const useUpdateSettings = () =>
  useFinanceMutation((v: TablesUpdate<"m_settings">) => run(supabase.from("m_settings").update(v).eq("id", 1).select()));
