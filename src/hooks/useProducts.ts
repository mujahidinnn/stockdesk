import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { fetchAll } from "./useOutboundMutation";
import { errorMessage } from "@/lib/errorMessage";

export type SkuUom = Tables<"m_sku_uoms">;
export type Sku = Tables<"m_skus"> & { m_sku_uoms: SkuUom[] };
export type Product = Tables<"m_products"> & { m_skus: Sku[] };

const KEY = ["products"];

export function useProducts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      (await fetchAll((from, to) =>
        supabase.from("m_products").select("*, m_skus(*, m_sku_uoms(*))").order("code").order("id").range(from, to),
      )) as Product[],
  });
}

function useProductMutation<V>(fn: (v: V) => Promise<void>, key: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["products", key],
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // One id so a save that runs two mutations shows one toast.
      toast.success(i18n.t("common.saved"), { id: "products-saved" });
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });
}

async function run(q: PromiseLike<{ error: unknown }>) {
  const { error } = await q;
  if (error) throw error;
}

export type NewSku = Omit<TablesInsert<"m_skus">, "product_id">;

/** Creates the product and its generated variant SKUs in one transaction. */
export const useCreateProduct = () =>
  useProductMutation(
    ({ product, skus }: { product: TablesInsert<"m_products">; skus: NewSku[] }) =>
      run(supabase.rpc("create_product_with_skus", { payload: { product, skus } as unknown as Json })),
    "create",
  );

export const useUpdateProduct = () =>
  useProductMutation(
    ({ id, values }: { id: number; values: TablesUpdate<"m_products"> }) =>
      run(supabase.from("m_products").update(values).eq("id", id)),
    "update",
  );

export const useAddSku = () =>
  useProductMutation((sku: TablesInsert<"m_skus">) => run(supabase.from("m_skus").insert(sku)), "add-sku");

export const useUpdateSku = () =>
  useProductMutation(
    ({ id, values }: { id: number; values: TablesUpdate<"m_skus"> }) =>
      run(supabase.from("m_skus").update(values).eq("id", id)),
    "update-sku",
  );

/** Replaces the non-base units of a SKU with the given set. The base row is managed by the database. */
export const useSaveSkuUoms = () =>
  useProductMutation(
    async ({ sku, units }: { sku: Sku; units: { uom_id: number; factor_to_base: number; barcode: string | null }[] }) => {
      const keep = new Set(units.map((u) => u.uom_id));
      const stale = sku.m_sku_uoms.filter((u) => u.uom_id !== sku.base_uom_id && !keep.has(u.uom_id));
      if (stale.length) await run(supabase.from("m_sku_uoms").delete().in("id", stale.map((u) => u.id)));
      if (units.length)
        await run(
          supabase
            .from("m_sku_uoms")
            .upsert(units.map((u) => ({ ...u, sku_id: sku.id })), { onConflict: "sku_id,uom_id" }),
        );
    },
    "save-uoms",
  );
