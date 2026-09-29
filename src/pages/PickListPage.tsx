import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Ban, ClipboardList, Pencil, Plus, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessControl } from "@/components/auth/AccessControl";
import { SearchInput, SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { OrderStatusBadge } from "@/components/outbound/OrderStatusBadge";
import { SalesOrderFormDialog } from "@/components/outbound/SalesOrderFormDialog";
import { PickRouteView } from "@/components/outbound/PickRouteView";
import { useTabParam } from "@/hooks/useTabParam";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useCancelSalesOrder, useSalesOrders, type SalesOrder } from "@/hooks/useSalesOrders";
import { useGeneratePickList, usePickLists } from "@/hooks/usePickLists";
import { useSkuLookup } from "@/hooks/useSkuLookup";

const TABS = ["orders", "lists"] as const;
const ORDER_STATUSES = ["open", "allocated", "picking", "picked", "packed", "dispatched", "cancelled"] as const;
const ALLOCATABLE = new Set(["open", "allocated", "picking"]);

export default function PickListPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "orders");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
      <TabsList data-tour="picking-tabs" className="w-full justify-start">
        <TabsTrigger value="orders" className="text-xs">{t("picking.tabs.orders")}</TabsTrigger>
        <TabsTrigger value="lists" className="text-xs">{t("picking.tabs.lists")}</TabsTrigger>
      </TabsList>
      <TabsContent value="orders">
        <OrdersTab onGenerated={() => setTab("lists")} />
      </TabsContent>
      <TabsContent value="lists">
        <ListsTab />
      </TabsContent>
    </Tabs>
  );
}

function OrdersTab({ onGenerated }: { onGenerated: () => void }) {
  const { t } = useTranslation();
  const warehouseId = useWarehouseFilter();
  const { data: orders = [] } = useSalesOrders(warehouseId);
  const lookup = useSkuLookup();
  const generate = useGeneratePickList();
  const cancel = useCancelSalesOrder();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof ORDER_STATUSES)[number]>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<SalesOrder | "new" | null>(null);
  const [cancelling, setCancelling] = useState<SalesOrder | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(
      (o) => (!status || o.status === status) && (!q || `${o.so_no} ${o.customer_name} ${o.reference_no ?? ""}`.toLowerCase().includes(q)),
    );
  }, [orders, search, status]);

  const chosen = orders.filter((o) => selected.has(o.id));
  const oneWarehouse = new Set(chosen.map((o) => o.warehouse_id)).size === 1;
  const editable = (o: SalesOrder) => o.status === "open" && o.t_sales_order_lines.every((l) => Number(l.qty_allocated) + Number(l.qty_picked) === 0);
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("picking.tabs.orders")}
        count={orders.length}
        subtitle={t("orders.subtitle")}
        tour="picking-actions"
        actions={
          <AccessControl feature="pick-list" action="create">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              loading={generate.isPending}
              disabled={!chosen.length}
              onClick={() => {
                if (!oneWarehouse) return toast.error(t("picking.oneWarehouse"));
                generate.mutate(chosen.map((o) => o.id), {
                  onSuccess: () => {
                    setSelected(new Set());
                    onGenerated();
                  },
                });
              }}
            >
              <Route className="h-4 w-4" />
              {t("picking.generate", { count: chosen.length })}
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setForm("new")}>
              <Plus className="h-4 w-4" />
              {t("orders.new")}
            </Button>
          </AccessControl>
        }
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("orders.search")} />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel={t("common.allStatus")}
          options={ORDER_STATUSES.map((s) => ({ value: s, label: t(`orders.status.${s}`) }))}
        />
      </Toolbar>

      {!filtered.length ? (
        <EmptyState icon={ClipboardList} title={orders.length ? t("common.noResults") : t("orders.empty")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {filtered.map((o) => {
            const need = o.t_sales_order_lines.reduce((s, l) => s + Number(l.base_qty), 0);
            const got = o.t_sales_order_lines.reduce((s, l) => s + Number(l.qty_allocated) + Number(l.qty_picked), 0);
            return (
              <li key={o.id} className="flex items-start gap-3 px-3 py-3">
                <Checkbox
                  className="mt-1"
                  checked={selected.has(o.id)}
                  disabled={!ALLOCATABLE.has(o.status) || got >= need}
                  onCheckedChange={() => toggle(o.id)}
                  aria-label={t("picking.select", { no: o.so_no })}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-medium">{o.so_no}</span>
                    <OrderStatusBadge status={o.status} />
                  </div>
                  <p className="truncate text-sm">
                    {o.customer_name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {o.m_warehouses?.code} · {t(`orders.channels.${o.channel}`)} · {o.order_date}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.t_sales_order_lines.map((l) => `${lookup.code(l.sku_id)} ×${Number(l.qty)} ${lookup.uomCode(l.uom_id)}`).join(", ")}
                  </p>
                  {got > 0 && got < need && ALLOCATABLE.has(o.status) && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{t("orders.partlyAllocated", { got, need })}</p>
                  )}
                </div>
                {editable(o) && (
                  <AccessControl feature="pick-list" action="update">
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setForm(o)} aria-label={t("common.edit")}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setCancelling(o)} aria-label={t("orders.cancel")}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  </AccessControl>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <SalesOrderFormDialog order={form} onClose={() => setForm(null)} />
      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t("orders.cancelTitle", { no: cancelling?.so_no })}
        description={t("orders.cancelBody")}
        confirmLabel={t("orders.cancel")}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </div>
  );
}

function ListsTab() {
  const { t } = useTranslation();
  const warehouseId = useWarehouseFilter();
  const { data: lists = [] } = usePickLists(warehouseId);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = lists.filter((l) => showAll || l.status === "open" || l.status === "picking");
  const open = lists.find((l) => l.id === openId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("picking.tabs.lists")}
        count={visible.length}
        subtitle={t("picking.subtitle")}
        actions={
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t("picking.activeOnly") : t("picking.showAll")}
          </Button>
        }
      />
      {!visible.length ? (
        <EmptyState icon={Route} title={t("picking.empty")} description={t("picking.emptyHint")} />
      ) : (
        <ul data-tour="picking-lists" className="flex flex-col gap-2">
          {visible.map((l) => {
            const done = l.t_pick_list_lines.filter((s) => s.status !== "open").length;
            const orders = [...new Set(l.t_pick_list_lines.map((s) => s.t_sales_order_lines?.t_sales_orders?.so_no).filter(Boolean))];
            return (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(l.id)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{l.pick_no}</span>
                    <OrderStatusBadge status={l.status} ns="picking" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-primary" style={{ width: `${(done / Math.max(1, l.t_pick_list_lines.length)) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("picking.progress", { done, total: l.t_pick_list_lines.length })} · {orders.join(", ")}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <PickRouteView list={open} onClose={() => setOpenId(null)} />
    </div>
  );
}
