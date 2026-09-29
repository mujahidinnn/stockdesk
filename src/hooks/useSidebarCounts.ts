import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWarehouseFilter } from "./useWarehouseFilter";

/** Sidebar badges for the active warehouse from one light RPC; keys are nav badge keys. */
export function useSidebarCounts() {
  const warehouseId = useWarehouseFilter();
  return useQuery({
    queryKey: ["sidebar-counts", warehouseId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sidebar_counts", { p_warehouse_id: warehouseId ?? undefined });
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
    refetchInterval: 60_000,
  });
}
