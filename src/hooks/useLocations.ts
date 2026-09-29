import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";

export type Location = Tables<"m_locations">;

export function useLocations(warehouseId: number | null | undefined) {
  return useQuery({
    queryKey: ["locations", warehouseId],
    enabled: warehouseId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_locations")
        .select("*")
        .eq("warehouse_id", warehouseId!)
        .order("pick_sequence")
        .order("full_code");
      if (error) throw error;
      return data;
    },
  });
}

/** Picks out of each bin in the last 30 days (empty without stock-audit read). */
export function useBinPickCounts(warehouseId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["bin-pick-counts", warehouseId],
    enabled: warehouseId != null && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bin_pick_counts", { p_warehouse_id: warehouseId! });
      if (error) throw error;
      return new Map(data.map((r) => [r.location_id, Number(r.picks)]));
    },
  });
}

function useLocationMutation<V>(fn: (v: V) => Promise<unknown>, key: string, message = "common.saved") {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["locations", key],
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success(i18n.t(message));
    },
    onError: (e: Error & { code?: string }) =>
      toast.error(errorMessage(e)),
  });
}

async function run<T>(q: PromiseLike<{ data: T; error: unknown }>) {
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export const useCreateLocation = () =>
  useLocationMutation((v: TablesInsert<"m_locations">) => run(supabase.from("m_locations").insert(v)), "create");

export const useUpdateLocation = () =>
  useLocationMutation(
    ({ id, values: v }: { id: number; values: TablesUpdate<"m_locations"> }) =>
      run(supabase.from("m_locations").update(v).eq("id", id)),
    "update",
  );

export const useDeleteLocation = () =>
  useLocationMutation((id: number) => run(supabase.from("m_locations").delete().eq("id", id)), "delete", "common.deleted");

export interface GenerateBinsInput {
  warehouseId: number;
  zone: string;
  aisles: string[];
  racks: number;
  levels: string[];
  binType: "storage" | "picking";
  maxQty: number | null;
  maxWeightKg: number | null;
}

export const useGenerateBins = () =>
  useLocationMutation(
    (v: GenerateBinsInput) =>
      run(
        supabase.rpc("generate_bins", {
          p_warehouse_id: v.warehouseId,
          p_zone: v.zone,
          p_aisles: v.aisles,
          p_racks: v.racks,
          p_levels: v.levels,
          p_bin_type: v.binType,
          p_max_qty: v.maxQty ?? undefined,
          p_max_weight_kg: v.maxWeightKg ?? undefined,
        }),
      ),
    "generate",
    "warehouses.binsGenerated",
  );
