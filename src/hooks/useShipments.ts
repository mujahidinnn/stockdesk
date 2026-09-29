import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { run, useOutboundMutation } from "./useOutboundMutation";

export type Shipment = Tables<"t_shipments"> & {
  t_sales_orders: Pick<Tables<"t_sales_orders">, "so_no" | "customer_name" | "ship_to" | "reference_no" | "order_date"> | null;
  t_shipment_items: (Tables<"t_shipment_items"> & { m_batches: { batch_no: string; expiry_date: string | null } | null })[];
};

export function useShipments(warehouseId: number | null) {
  return useQuery({
    queryKey: ["shipments", warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_shipments")
        .select("*, t_sales_orders(so_no, customer_name, ship_to, reference_no, order_date), t_shipment_items(*, m_batches(batch_no, expiry_date))")
        .order("packed_at", { ascending: false })
        .limit(200);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      return (await run(q)) as Shipment[];
    },
  });
}

/** What was picked for an order, per SKU and batch: the list packing is checked against. */
export function usePickedItems(orderId: number | null) {
  return useQuery({
    queryKey: ["shipments", "picked", orderId],
    enabled: orderId != null,
    queryFn: async () => {
      const rows = await run(
        supabase
          .from("t_pick_list_lines")
          .select("sku_id, batch_id, qty_picked, m_batches(batch_no, expiry_date), t_sales_order_lines!inner(order_id)")
          .eq("t_sales_order_lines.order_id", orderId!)
          .gt("qty_picked", 0),
      );
      const merged = new Map<string, { sku_id: number; batch_id: number | null; batch_no: string | null; qty: number }>();
      for (const r of rows as unknown as { sku_id: number; batch_id: number | null; qty_picked: number; m_batches: { batch_no: string } | null }[]) {
        const k = `${r.sku_id}|${r.batch_id}`;
        const cur = merged.get(k) ?? { sku_id: r.sku_id, batch_id: r.batch_id, batch_no: r.m_batches?.batch_no ?? null, qty: 0 };
        cur.qty += Number(r.qty_picked);
        merged.set(k, cur);
      }
      return [...merged.values()];
    },
  });
}

export const usePackShipment = () =>
  useOutboundMutation(
    (v: { orderId: number; items: { sku_id: number; batch_id: number | null; qty: number }[]; weightKg: number; packages: number; dimensions: string }) =>
      run(
        supabase.rpc("pack_shipment", {
          p_order_id: v.orderId,
          p_items: v.items,
          p_weight_kg: v.weightKg,
          p_packages: v.packages,
          p_dimensions: v.dimensions || undefined,
        }),
      ),
    "dispatch.packed",
  );

export const useDispatchShipment = () =>
  useOutboundMutation(
    (v: { id: number; courier: string; trackingNo: string }) =>
      run(supabase.rpc("dispatch_shipment", { p_id: v.id, p_courier: v.courier, p_tracking_no: v.trackingNo || undefined })),
    "dispatch.dispatched",
  );
