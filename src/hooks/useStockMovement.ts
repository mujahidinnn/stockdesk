import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { run } from "./useOutboundMutation";

export type Movement = Tables<"t_stock_movements"> & {
  m_batches: { batch_no: string } | null;
  from: { full_code: string; warehouse_id: number } | null;
  to: { full_code: string; warehouse_id: number } | null;
  actor: { full_name: string | null } | null;
};

export interface MovementFilters {
  from: string;
  to: string;
  warehouseId?: number | null;
  skuId?: number | null;
  type?: string;
  refNo?: string;
  userId?: string;
  batchNo?: string;
}

const PAGE = 50;

const SELECT =
  "*, m_batches(batch_no), from:m_locations!t_stock_movements_from_location_id_fkey(full_code, warehouse_id), to:m_locations!t_stock_movements_to_location_id_fkey(full_code, warehouse_id), actor:profiles!t_stock_movements_created_by_fkey(full_name)";

/** The filtered ledger query, newest first; callers add paging. Wrapped so
 *  awaiting the setup does not also run the query. */
export async function movementsQuery(f: MovementFilters) {
  let q = supabase.from("t_stock_movements").select(SELECT, { count: "exact" }).gte("movement_date", f.from).lte("movement_date", f.to);
  if (f.skuId) q = q.eq("sku_id", f.skuId);
  if (f.type) q = q.eq("movement_type", f.type);
  if (f.userId) q = q.eq("created_by", f.userId);
  if (f.refNo?.trim()) q = q.ilike("ref_no", `%${f.refNo.trim()}%`);
  if (f.batchNo?.trim()) {
    const ids = (await run(supabase.from("m_batches").select("id").ilike("batch_no", `%${f.batchNo.trim()}%`).limit(500))).map((b) => b.id);
    q = q.in("batch_id", ids.length ? ids : [-1]);
  }
  // ponytail: filters by the warehouse's bin ids in the URL; fine for a few
  // thousand bins, move to an RPC if a warehouse grows far beyond that.
  if (f.warehouseId) {
    const ids = (await run(supabase.from("m_locations").select("id").eq("warehouse_id", f.warehouseId))).map((l) => l.id);
    q = q.or(`from_location_id.in.(${ids.join(",")}),to_location_id.in.(${ids.join(",")})`);
  }
  return { q: q.order("movement_date", { ascending: false }).order("id", { ascending: false }) };
}

export function useStockMovements(f: MovementFilters, page: number) {
  return useQuery({
    queryKey: ["movements", f, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await (await movementsQuery(f)).q.range((page - 1) * PAGE, page * PAGE - 1);
      if (error) throw error;
      return { rows: data as unknown as Movement[], total: count ?? 0, pageSize: PAGE };
    },
  });
}

export function useStockCard(skuId: number | null, from: string, to: string, warehouseId: number | null) {
  return useQuery({
    queryKey: ["movements", "card", skuId, from, to, warehouseId],
    enabled: skuId != null,
    queryFn: () =>
      run(
        supabase.rpc("stock_card", {
          p_sku_id: skuId!,
          p_from: from,
          p_to: to,
          p_warehouse_id: warehouseId ?? undefined,
        }),
      ),
  });
}
