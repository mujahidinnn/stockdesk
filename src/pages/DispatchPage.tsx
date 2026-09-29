import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileText, PackageOpen, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { OrderStatusBadge } from "@/components/outbound/OrderStatusBadge";
import { PackingPanel } from "@/components/outbound/PackingPanel";
import { DispatchFormDialog } from "@/components/outbound/DispatchFormDialog";
import { printDeliveryOrder } from "@/components/outbound/DeliveryOrderPdf";
import { useTabParam } from "@/hooks/useTabParam";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useSalesOrders, type SalesOrder } from "@/hooks/useSalesOrders";
import { useShipments, type Shipment } from "@/hooks/useShipments";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useSettings } from "@/hooks/useSettings";
import { useWarehouses } from "@/hooks/useWarehouses";
import { errorMessage } from "@/lib/errorMessage";
import { courierTrackUrl } from "@/lib/couriers";

const TABS = ["pack", "dispatch", "done"] as const;

export default function DispatchPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "pack");
  const warehouseId = useWarehouseFilter();
  const { data: orders = [] } = useSalesOrders(warehouseId);
  const { data: shipments = [] } = useShipments(warehouseId);
  const { data: warehouses = [] } = useWarehouses();
  const { data: settings } = useSettings();
  const lookup = useSkuLookup();
  const [packing, setPacking] = useState<SalesOrder | null>(null);
  const [dispatching, setDispatching] = useState<Shipment | null>(null);

  const toPack = orders.filter((o) => o.status === "picked");
  const packed = shipments.filter((s) => s.status === "packed");
  const dispatched = shipments.filter((s) => s.status === "dispatched");

  const printDo = (s: Shipment) =>
    printDeliveryOrder(
      s,
      settings?.company_name ?? "StockDesk",
      warehouses.find((w) => w.id === s.warehouse_id)?.name ?? "",
      lookup,
    ).catch((e: Error) => toast.error(errorMessage(e)));

  const shipmentRow = (s: Shipment, action: React.ReactNode) => (
    <li key={s.id} className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-xs font-medium">{s.do_no}</p>
        <p className="truncate text-sm">
          {s.t_sales_orders?.customer_name}
          <span className="ml-2 text-xs text-muted-foreground">{s.t_sales_orders?.so_no}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {s.weight_kg} kg · {t("dispatch.packageCount", { count: s.packages })}
          {s.courier && ` · ${s.courier}`}
          {s.tracking_no && (
            <>
              {" · "}
              <TrackingNo courier={s.courier} no={s.tracking_no} />
            </>
          )}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => printDo(s)} aria-label={t("dispatch.printDo")}>
        <FileText className="h-4 w-4" />
      </Button>
      {action}
    </li>
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader title={t("dispatch.title")} subtitle={t("dispatch.subtitle")} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
        <TabsList data-tour="dispatch-tabs" className="w-full justify-start">
          <TabsTrigger value="pack" className="text-xs">{t("dispatch.tabs.pack", { count: toPack.length })}</TabsTrigger>
          <TabsTrigger value="dispatch" className="text-xs">{t("dispatch.tabs.dispatch", { count: packed.length })}</TabsTrigger>
          <TabsTrigger value="done" className="text-xs">{t("dispatch.tabs.done")}</TabsTrigger>
        </TabsList>

        <TabsContent value="pack">
          {!toPack.length ? (
            <EmptyState icon={PackageOpen} title={t("dispatch.nothingToPack")} description={t("dispatch.nothingToPackHint")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {toPack.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium">{o.so_no}</span>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <p className="truncate text-sm">{o.customer_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{o.ship_to}</p>
                  </div>
                  <AccessControl feature="dispatch" action="create">
                    <Button className="h-11 gap-1.5" onClick={() => setPacking(o)}>
                      <PackageOpen className="h-4 w-4" />
                      {t("dispatch.startPacking")}
                    </Button>
                  </AccessControl>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="dispatch">
          {!packed.length ? (
            <EmptyState icon={Truck} title={t("dispatch.nothingToDispatch")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {packed.map((s) =>
                shipmentRow(
                  s,
                  <AccessControl feature="dispatch" action="update">
                    <Button className="h-11 gap-1.5" onClick={() => setDispatching(s)}>
                      <Truck className="h-4 w-4" />
                      {t("dispatch.dispatch")}
                    </Button>
                  </AccessControl>,
                ),
              )}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="done">
          {!dispatched.length ? (
            <EmptyState icon={Truck} title={t("dispatch.noneDispatched")} />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
              {dispatched.map((s) => shipmentRow(s, null))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <PackingPanel
        order={packing}
        onClose={() => {
          setPacking(null);
          setTab("dispatch");
        }}
      />
      <DispatchFormDialog
        shipment={dispatching}
        onClose={() => setDispatching(null)}
        onDispatched={(s) => {
          setDispatching(null);
          printDo(s);
        }}
      />
    </div>
  );
}

/** Opens the courier's tracking page and copies the number to paste there. */
function TrackingNo({ courier, no }: { courier: string | null; no: string }) {
  const { t } = useTranslation();
  const url = courierTrackUrl(courier);
  if (!url) return <span className="font-mono">{no}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={t("dispatch.trackHint")}
      className="font-mono text-primary underline-offset-2 hover:underline"
      onClick={() =>
        navigator.clipboard
          ?.writeText(no)
          .then(() => toast.success(t("dispatch.trackingCopied", { no })))
          .catch(() => undefined)
      }
    >
      {no}
    </a>
  );
}
