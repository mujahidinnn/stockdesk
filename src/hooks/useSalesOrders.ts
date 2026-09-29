import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { subscribeShared } from "@/lib/realtimeSubscription";
import { run, useOutboundMutation } from "./useOutboundMutation";

export type SalesOrderLine = Tables<"t_sales_order_lines">;
export type SalesOrder = Tables<"t_sales_orders"> & {
  m_warehouses: { code: string } | null;
  t_sales_order_lines: SalesOrderLine[];
};

export function useSalesOrders(warehouseId: number | null) {
  const qc = useQueryClient();
  useEffect(
    () =>
      subscribeShared("sales-orders", (ch) =>
        ch.on("postgres_changes", { event: "*", schema: "public", table: "t_sales_orders" }, () =>
          qc.invalidateQueries({ queryKey: ["sales-orders"] }),
        ),
      ),
    [qc],
  );
  return useQuery({
    queryKey: ["sales-orders", warehouseId],
    queryFn: async () => {
      let q = supabase
        .from("t_sales_orders")
        .select("*, m_warehouses(code), t_sales_order_lines(*)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      const data = await run(q);
      return (data as SalesOrder[]).map((o) => ({
        ...o,
        t_sales_order_lines: [...o.t_sales_order_lines].sort((a, b) => a.line_no - b.line_no),
      }));
    },
  });
}

export type OrderLineInput = { id?: number; sku_id: number; uom_id: number; qty: number };

/** Header plus lines; only possible while nothing is allocated (RLS enforces it). */
export const useSaveSalesOrder = () =>
  useOutboundMutation(
    async ({
      id,
      header,
      lines,
      removedLineIds,
    }: {
      id: number | null;
      header: Omit<TablesInsert<"t_sales_orders">, "so_no" | "status">;
      lines: OrderLineInput[];
      removedLineIds: number[];
    }) => {
      const orderId = id
        ? (await run(supabase.from("t_sales_orders").update(header).eq("id", id).select("id").single())).id
        : (await run(supabase.from("t_sales_orders").insert(header).select("id").single())).id;
      if (removedLineIds.length) await run(supabase.from("t_sales_order_lines").delete().in("id", removedLineIds));
      for (const { id: lineId, ...line } of lines) {
        if (lineId) await run(supabase.from("t_sales_order_lines").update(line).eq("id", lineId));
        else await run(supabase.from("t_sales_order_lines").insert({ ...line, order_id: orderId }));
      }
      return orderId;
    },
  );

export const useCancelSalesOrder = () =>
  useOutboundMutation(
    (id: number) => run(supabase.rpc("cancel_sales_order", { p_id: id })),
    "orders.cancelled",
  );
