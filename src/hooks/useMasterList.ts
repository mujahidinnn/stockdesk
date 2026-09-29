import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errorMessage";

export type MasterTable = "m_owners" | "m_categories" | "m_uoms" | "m_suppliers" | "m_customers";
export type MasterRow<T extends MasterTable> = Tables<T>;

export function useMasterList<T extends MasterTable>(table: T) {
  return useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").order("code");
      if (error) throw error;
      return data as MasterRow<T>[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSaveMasterItem<T extends MasterTable>(table: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [table, "save"],
    mutationFn: async ({ id, values }: { id?: number; values: Partial<TablesInsert<T>> }) => {
      // The five tables share id/code/name, so one concrete type stands in for all of them.
      const t = supabase.from(table as "m_uoms");
      const q = id ? t.update(values as never).eq("id", id) : t.insert(values as never);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success(i18n.t("common.saved"));
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

export function useDeleteMasterItem(table: MasterTable) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: [table, "delete"],
    mutationFn: async (id: number) => {
      const { error } = await supabase.from(table as "m_uoms").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table] });
      toast.success(i18n.t("common.deleted"));
    },
    // A row still referenced elsewhere fails on its foreign key; say so plainly.
    onError: (e: Error & { code?: string }) =>
      toast.error(errorMessage(e)),
  });
}
