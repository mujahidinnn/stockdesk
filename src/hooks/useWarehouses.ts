import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";

export type Warehouse = Tables<"m_warehouses">;

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("m_warehouses").select("*").order("code");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["warehouses", "save"],
    mutationFn: async ({ id, values }: { id?: number; values: TablesInsert<"m_warehouses"> }) => {
      const { error } = id
        ? await supabase.from("m_warehouses").update(values).eq("id", id)
        : await supabase.from("m_warehouses").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
      toast.success(i18n.t("common.saved"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}
