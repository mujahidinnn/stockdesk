import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { run } from "./useOutboundMutation";

/** Batches of one SKU, newest expiry last. */
export function useBatches(skuId: number | null) {
  return useQuery({
    queryKey: ["batches", skuId],
    enabled: skuId != null,
    queryFn: () =>
      run(supabase.from("m_batches").select("id, batch_no, expiry_date").eq("sku_id", skuId!).order("expiry_date", { nullsFirst: false })),
  });
}
