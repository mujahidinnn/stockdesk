import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionHeader } from "@/components/common/MasterSection";
import { MovementFilters } from "@/components/stock-audit/MovementFilters";
import { MovementLogTable } from "@/components/stock-audit/MovementLogTable";
import { StockCardTable } from "@/components/stock-audit/StockCardTable";
import { AuditLogTable } from "@/components/stock-audit/AuditLogTable";
import { useTabParam } from "@/hooks/useTabParam";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useStockCard, useStockMovements, type MovementFilters as Filters } from "@/hooks/useStockMovement";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { BookOpen } from "lucide-react";

const TABS = ["movements", "card", "audit"] as const;
const iso = (d: Date) => d.toLocaleDateString("en-CA");

export default function StockAuditPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "movements");
  const warehouseId = useWarehouseFilter();
  const lookup = useSkuLookup();
  const [filters, setFilters] = useState<Filters>({ from: iso(new Date(Date.now() - 30 * 86_400_000)), to: iso(new Date()) });
  const [page, setPage] = useState(1);
  const { data } = useStockMovements({ ...filters, warehouseId }, page);
  const { data: card = [] } = useStockCard(filters.skuId ?? null, filters.from, filters.to, warehouseId);
  const { data: audit = [] } = useAuditLog(200, { from: filters.from, to: filters.to });
  const update = (f: Filters) => {
    setFilters(f);
    setPage(1);
  };
  const baseUom = filters.skuId ? lookup.conversions(filters.skuId).find((c) => c.factor === 1)?.code ?? "" : "";

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
        <TabsList data-tour="audit-tabs" className="w-full justify-start">
          <TabsTrigger value="movements" className="text-xs">{t("audit.tabs.movements")}</TabsTrigger>
          <TabsTrigger value="card" className="text-xs">{t("audit.tabs.card")}</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">{t("audit.tabs.audit")}</TabsTrigger>
        </TabsList>
        <div data-tour="audit-filters">
          <MovementFilters value={filters} onChange={update} withType={tab === "movements"} />
        </div>

        <TabsContent value="movements" className="flex flex-col gap-3">
          <MovementLogTable rows={data?.rows ?? []} warehouseId={warehouseId} />
          {data && (
            <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
          )}
        </TabsContent>
        <TabsContent value="card">
          {filters.skuId ? (
            <StockCardTable rows={card} uom={baseUom} />
          ) : (
            <EmptyState icon={BookOpen} title={t("audit.pickSku")} description={t("audit.pickSkuHint")} />
          )}
        </TabsContent>
        <TabsContent value="audit">
          <AuditLogTable rows={audit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
