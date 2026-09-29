import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Grid3x3, MapPin, Pencil, Plus, Printer, Warehouse as WarehouseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LocationTag } from "@/components/common/LocationTag";
import { WarehouseFormDialog } from "@/components/master-warehouse/WarehouseFormDialog";
import { BinFormDialog, type LocationLevel } from "@/components/master-warehouse/BinFormDialog";
import { BinGeneratorDialog } from "@/components/master-warehouse/BinGeneratorDialog";
import { LocationTree } from "@/components/master-warehouse/LocationTree";
import { BinGridView, type BinMapMode } from "@/components/master-warehouse/BinGridView";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LabelPrintDialog } from "@/components/common/LabelPrintDialog";
import { useWarehouses, type Warehouse } from "@/hooks/useWarehouses";
import { useBinPickCounts, useDeleteLocation, useLocations, type Location } from "@/hooks/useLocations";
import { usePickLists } from "@/hooks/usePickLists";
import { useSettings } from "@/hooks/useSettings";
import { useAuth } from "@/context/auth";
import { format, addDays } from "date-fns";
import { setWarehouseFilter, useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useCategories } from "@/hooks/useCategories";
import { qtyByLocation, useStockBalances, type StockBalance } from "@/hooks/useStockBalances";
import { cn } from "@/lib/utils";

export default function MasterWarehousePage() {
  const { t } = useTranslation();
  const { data: warehouses = [] } = useWarehouses();
  const filterId = useWarehouseFilter();
  const warehouse = warehouses.find((w) => w.id === filterId) ?? warehouses[0] ?? null;
  const { data: locations = [] } = useLocations(warehouse?.id);
  const { data: categories = [] } = useCategories();
  const remove = useDeleteLocation();
  const { data: balances = [] } = useStockBalances({ warehouseId: warehouse?.id });
  const occupancy = useMemo(() => qtyByLocation(balances), [balances]);
  const { canRead } = useAuth();
  const { data: settings } = useSettings();
  const [mapMode, setMapMode] = useState<BinMapMode>("fill");
  const [routeId, setRouteId] = useState<number | null>(null);
  const { data: pickCounts } = useBinPickCounts(warehouse?.id, mapMode === "activity");
  const { data: pickLists = [] } = usePickLists(warehouse?.id ?? null);
  const openPickLists = useMemo(() => pickLists.filter((p) => p.status === "open" || p.status === "picking"), [pickLists]);
  const mapData = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const expiry = new Map<number, string>();
    for (const b of balances) {
      const e = b.m_batches?.expiry_date;
      if (e && (!expiry.has(b.location_id) || e < expiry.get(b.location_id)!)) expiry.set(b.location_id, e);
    }
    const route = new Map<number, number>();
    openPickLists.find((p) => p.id === routeId)?.t_pick_list_lines.forEach((l, i) => {
      if (!route.has(l.location_id)) route.set(l.location_id, i + 1);
    });
    return {
      mode: mapMode,
      occupancy,
      expiry,
      today,
      warnUntil: format(addDays(new Date(), settings?.expiry_warning_days ?? 30), "yyyy-MM-dd"),
      picks: pickCounts ?? new Map<number, number>(),
      route,
    };
  }, [balances, occupancy, mapMode, pickCounts, openPickLists, routeId, settings?.expiry_warning_days]);

  const [whDialog, setWhDialog] = useState<{ warehouse: Warehouse | null } | null>(null);
  const [nodeDialog, setNodeDialog] = useState<{ location: Location | null; parent: Location | null; level: LocationLevel } | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const selected = locations.find((l) => l.id === selectedId) ?? null;

  // Labels cover the selected node's bins, or the one selected bin.
  const labelBins = useMemo(() => {
    if (!selected) return [];
    if (selected.level === "bin") return [selected];
    return locations.filter((l) => l.level === "bin" && l.full_code.startsWith(`${selected.full_code}-`));
  }, [locations, selected]);

  const stats = {
    bins: locations.filter((l) => l.level === "bin").length,
    storage: locations.filter((l) => l.bin_type === "storage" || l.bin_type === "picking").length,
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title={t("warehouses.title")}
        count={warehouses.length}
        subtitle={t("warehouses.subtitle")}
        actions={
          <AccessControl feature="master-warehouse" action="create">
            <Button size="sm" onClick={() => setWhDialog({ warehouse: null })} className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t("warehouses.new")}
            </Button>
          </AccessControl>
        }
      />

      {warehouses.length === 0 ? (
        <EmptyState icon={WarehouseIcon} title={t("warehouses.empty")} description={t("warehouses.emptyHint")} action={
            <AccessControl feature="master-warehouse" action="create">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setWhDialog({ warehouse: null })}>
                <Plus className="h-4 w-4" />
                {t("warehouses.new")}
              </Button>
            </AccessControl>
          } />
      ) : (
        <>
          <div data-tour="warehouses-list" className="flex gap-2 overflow-x-auto pb-1">
            {warehouses.map((w) => (
              <button
                key={w.id}
                onClick={() => {
                  setWarehouseFilter(w.id);
                  setSelectedId(null);
                  setRouteId(null);
                }}
                className={cn(
                  "min-w-44 rounded-xl border px-4 py-3 text-left transition-colors",
                  w.id === warehouse?.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/50",
                )}
              >
                <p className="font-mono text-xs text-muted-foreground">{w.code}</p>
                <p className="text-sm font-medium truncate">{w.name}</p>
                <div className="mt-1 flex gap-1">
                  <StatusBadge tone="info">{t(`warehouses.types.${w.warehouse_type}`)}</StatusBadge>
                  {!w.is_active && <StatusBadge tone="muted">{t("common.inactive")}</StatusBadge>}
                </div>
              </button>
            ))}
          </div>

          {warehouse && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
              <section data-tour="warehouses-tree" className="rounded-xl border border-border bg-card p-3 flex flex-col gap-3 min-w-0">
                <div className="flex items-center justify-between gap-2 px-1">
                  <div>
                    <p className="text-sm font-semibold">{warehouse.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("warehouses.binCount", { bins: stats.bins, storage: stats.storage })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <AccessControl feature="master-warehouse" action="update">
                      <Button size="icon" variant="ghost" onClick={() => setWhDialog({ warehouse })} aria-label={t("common.edit")}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </AccessControl>
                    <AccessControl feature="master-warehouse" action="create">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setNodeDialog({ location: null, parent: null, level: "zone" })}
                        aria-label={t("warehouses.addNode", { level: t("warehouses.levels.zone") })}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setGeneratorOpen(true)} aria-label={t("warehouses.generator.title")}>
                        <Grid3x3 className="w-4 h-4" />
                      </Button>
                    </AccessControl>
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto">
                  <LocationTree
                    locations={locations}
                    selectedId={selectedId}
                    onSelect={(l) => setSelectedId(l.id)}
                    onAdd={(parent, level) => setNodeDialog({ location: null, parent, level })}
                    onEdit={(l) => setNodeDialog({ location: l, parent: locations.find((p) => p.id === l.parent_id) ?? null, level: l.level as LocationLevel })}
                    onDelete={setDeleting}
                  />
                </div>
              </section>

              <section data-tour="warehouses-grid" className="rounded-xl border border-border bg-card p-4 flex flex-col gap-4 min-w-0">
                {selected ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <LocationTag code={selected.full_code} />
                      {selected.bin_type && <StatusBadge tone="info">{t(`warehouses.binTypes.${selected.bin_type}`)}</StatusBadge>}
                      {selected.max_qty && (
                        <span className="text-xs text-muted-foreground">
                          {t("warehouses.fields.maxQty")}: {selected.max_qty}
                        </span>
                      )}
                      {selected.allowed_category_ids.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {categories.filter((c) => selected.allowed_category_ids.includes(c.id)).map((c) => c.name).join(", ")}
                        </span>
                      )}
                    </div>
                    <Button size="sm" variant="outline" disabled={!labelBins.length} onClick={() => setLabelsOpen(true)} className="h-8 gap-1.5">
                      <Printer className="w-3.5 h-3.5" />
                      {t("labels.printCount", { count: labelBins.length })}
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {t("warehouses.selectHint")}
                  </p>
                )}
                {selected?.level === "bin" && (
                  <BinContents
                    rows={balances.filter((b) => b.location_id === selected.id)}
                    maxQty={selected.max_qty}
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg border border-border bg-segment p-0.5">
                    {(["fill", "expiry", ...(canRead("stock-audit") ? (["activity"] as const) : [])] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMapMode(m)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                          mapMode === m ? "border border-border bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(`warehouses.map.modes.${m}`)}
                      </button>
                    ))}
                  </div>
                  {openPickLists.length > 0 && (
                    <Select value={routeId ? String(routeId) : "none"} onValueChange={(v) => setRouteId(v === "none" ? null : Number(v))}>
                      <SelectTrigger className="h-8 w-auto min-w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("warehouses.map.noRoute")}</SelectItem>
                        {openPickLists.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {t("warehouses.map.route", { no: p.pick_no, count: p.t_pick_list_lines.length })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <BinGridView
                  locations={locations}
                  focus={selected}
                  data={mapData}
                  selectedId={selectedId}
                  onSelect={(l) => setSelectedId(l.id)}
                />
              </section>
            </div>
          )}
        </>
      )}

      <WarehouseFormDialog open={whDialog != null} warehouse={whDialog?.warehouse ?? null} onOpenChange={(o) => !o && setWhDialog(null)} />
      {warehouse && nodeDialog && (
        <BinFormDialog
          open
          warehouseId={warehouse.id}
          location={nodeDialog.location}
          parent={nodeDialog.parent}
          level={nodeDialog.level}
          onOpenChange={(o) => !o && setNodeDialog(null)}
        />
      )}
      {warehouse && <BinGeneratorDialog open={generatorOpen} onOpenChange={setGeneratorOpen} warehouseId={warehouse.id} />}
      <DeleteConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("common.delete")}
        description={t("warehouses.deleteConfirm", { code: deleting?.full_code })}
        isPending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              if (deleting.id === selectedId) setSelectedId(null);
              setDeleting(null);
            },
          })
        }
      />
      <LabelPrintDialog
        open={labelsOpen}
        onOpenChange={setLabelsOpen}
        defaultKind="qr"
        fileName={`label-bin-${selected?.full_code ?? ""}.pdf`}
        items={labelBins.map((b) => ({ value: b.full_code, title: warehouse?.name ?? "", subtitle: t(`warehouses.binTypes.${b.bin_type}`) }))}
      />
    </div>
  );
}

function BinContents({ rows, maxQty }: { rows: StockBalance[]; maxQty: number | null }) {
  const { t } = useTranslation();
  const total = rows.reduce((s, r) => s + Number(r.qty_on_hand), 0);
  return (
    <div className="rounded-lg border border-border text-xs">
      <p className="border-b border-border px-3 py-2 text-muted-foreground">
        {t("warehouses.contents", { qty: total.toLocaleString("id-ID"), max: maxQty ?? "∞" })}
      </p>
      {rows.length ? (
        <table className="w-full">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 font-mono">{r.m_skus?.sku_code}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {r.m_batches ? `${r.m_batches.batch_no}${r.m_batches.expiry_date ? ` · exp ${r.m_batches.expiry_date}` : ""}` : "-"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.qty_on_hand).toLocaleString("id-ID")}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {Number(r.qty_reserved) > 0 && t("warehouses.reserved", { qty: Number(r.qty_reserved).toLocaleString("id-ID") })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-3 text-muted-foreground">{t("warehouses.binEmpty")}</p>
      )}
    </div>
  );
}
