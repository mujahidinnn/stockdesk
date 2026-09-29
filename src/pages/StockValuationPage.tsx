import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { ValuationTable, type Line } from "@/components/valuation/ValuationTable";
import { CogsTable } from "@/components/valuation/CogsTable";
import { RevaluePanel } from "@/components/valuation/RevaluePanel";
import { PeriodLockPanel } from "@/components/valuation/PeriodLockPanel";
import { useTabParam } from "@/hooks/useTabParam";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useSettings } from "@/hooks/useSettings";
import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useCogs, useStockValuation, type Method, type ValuationRow } from "@/hooks/useFinance";

type GroupBy = "sku" | "category" | "owner" | "warehouse";
const TABS = ["value", "cogs", "costs", "lock"] as const;
const GROUPS: GroupBy[] = ["sku", "category", "owner", "warehouse"];
const iso = (d: Date) => d.toLocaleDateString("en-CA");

export default function StockValuationPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "value");
  const { data: counts } = useSidebarCounts();
  const estimates = counts?.valuation ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t("valuation.title")} subtitle={t("valuation.subtitle")} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
        <TabsList data-tour="valuation-tabs" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="value" className="text-xs">{t("valuation.tabs.value")}</TabsTrigger>
          <TabsTrigger value="cogs" className="text-xs">{t("valuation.tabs.cogs")}</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs">
            {t("valuation.tabs.costs")}
            {estimates > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{estimates}</span>}
          </TabsTrigger>
          <TabsTrigger value="lock" className="text-xs">{t("valuation.tabs.lock")}</TabsTrigger>
        </TabsList>
        <TabsContent value="value">{tab === "value" && <ValueTab />}</TabsContent>
        <TabsContent value="cogs">{tab === "cogs" && <CogsTab />}</TabsContent>
        <TabsContent value="costs"><RevaluePanel /></TabsContent>
        <TabsContent value="lock"><PeriodLockPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function ValueTab() {
  const { t } = useTranslation();
  const warehouseId = useWarehouseFilter();
  const { data: settings } = useSettings();
  const [asOf, setAsOf] = useState(iso(new Date()));
  const [method, setMethod] = useState<Method>();
  const [group, setGroup] = useState<GroupBy>("sku");
  const m = method ?? (settings?.valuation_method as Method | undefined) ?? "fifo";
  const { data: rows = [], isLoading } = useStockValuation(asOf, m, warehouseId, !!settings);
  const own = rows.filter((r) => r.owner_type === "in_house");
  const client = rows.filter((r) => r.owner_type === "client");

  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <Input type="date" className="h-8 w-40 text-xs md:text-xs" value={asOf} max={iso(new Date())} onChange={(e) => e.target.value && setAsOf(e.target.value)} aria-label={t("valuation.asOf")} />
        <FilterSelect value={m} onChange={setMethod} aria-label={t("valuation.method")} options={[
          { value: "fifo", label: t("valuation.methods.fifo") },
          { value: "average", label: t("valuation.methods.average") },
        ]} />
        <FilterSelect value={group} onChange={(v) => v && setGroup(v)} aria-label={t("valuation.groupBy")} options={GROUPS.map((g) => ({ value: g, label: t(`valuation.groups.${g}`) }))} />
      </Toolbar>
      {!rows.length ? (
        <EmptyState icon={Calculator} title={isLoading ? t("common.loading") : t("valuation.empty")} />
      ) : (
        <>
          <ValuationTable lines={groupValuation(own, group)} withCost />
          {client.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">{t("valuation.consignment")}</p>
              <p className="text-xs text-muted-foreground">{t("valuation.consignmentHint")}</p>
              <ValuationTable lines={groupValuation(client, group)} withCost={false} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CogsTab() {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const now = new Date();
  const [range, setRange] = useState({ from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) });
  const { data: rows = [] } = useCogs(range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <DateRangeFilter value={range} onChange={(r) => setRange({ from: r.from ?? range.from, to: r.to ?? range.to })} />
      </Toolbar>
      {!rows.length ? (
        <EmptyState icon={Calculator} title={t("valuation.noCogs")} />
      ) : (
        <CogsTable rows={rows} method={(settings?.valuation_method as Method) ?? "fifo"} />
      )}
    </div>
  );
}

function groupValuation(rows: ValuationRow[], by: GroupBy): Line[] {
  if (by === "sku")
    return rows.map((r) => ({
      key: `${r.sku_id}-${r.owner_id}-${r.warehouse_id}`,
      label: r.sku_code,
      sub: `${r.product_name} · ${r.warehouse_code}`,
      qty: Number(r.qty),
      unitCost: r.unit_cost == null ? null : Number(r.unit_cost),
      value: r.value == null ? null : Number(r.value),
    }));
  const pick = { category: (r: ValuationRow) => r.category_name ?? "-", owner: (r: ValuationRow) => r.owner_name, warehouse: (r: ValuationRow) => r.warehouse_code }[by];
  const m = new Map<string, Line>();
  for (const r of rows) {
    const k = pick(r);
    const l = m.get(k) ?? { key: k, label: k, qty: 0, unitCost: null, value: r.value == null ? null : 0 };
    l.qty += Number(r.qty);
    if (l.value != null && r.value != null) l.value += Number(r.value);
    m.set(k, l);
  }
  return [...m.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.label.localeCompare(b.label));
}
