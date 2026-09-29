import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowDownToLine, CalendarClock, ClipboardCheck, ListChecks, Package, PackageX, Receipt, Truck, Wallet } from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ValuationTrendChart } from "@/components/dashboard/ValuationTrendChart";
import { FastSlowMovingChart } from "@/components/dashboard/FastSlowMovingChart";
import { CriticalStockCard } from "@/components/dashboard/CriticalStockCard";
import { ExpiringSoonCard } from "@/components/dashboard/ExpiringSoonCard";
import { TurnoverChart } from "@/components/dashboard/TurnoverChart";
import { FlowChart } from "@/components/dashboard/FlowChart";
import { WorkQueueCard } from "@/components/dashboard/WorkQueueCard";
import { UtilizationCard } from "@/components/dashboard/UtilizationCard";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { WarehouseNetworkMap } from "@/components/dashboard/WarehouseNetworkMap";
import { useAuth } from "@/context/auth";
import { PageFallback } from "@/components/layout/PageFallback";
import { useDashboardSummary } from "@/hooks/useFinance";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useSettings } from "@/hooks/useSettings";
import { rupiah } from "@/lib/utils";

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { canRead } = useAuth();
  const warehouseId = useWarehouseFilter();
  const { data: s } = useDashboardSummary(warehouseId);
  const { data: settings } = useSettings();
  if (!s) return <PageFallback />;

  const today = new Date().toLocaleDateString("en-CA");
  const money = s.asset_value != null;
  const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex flex-col gap-4">
      <div data-tour="dashboard-stats" className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {money && <StatsCard label={t("dashboard.assetValue")} value={rupiah(Number(s.asset_value))} icon={Wallet} to={canRead("valuation") ? "/valuation" : undefined} />}
        {money && (
          <StatsCard
            label={t("dashboard.cogsMonth")}
            value={rupiah(Number(s.cogs_month))}
            icon={Receipt}
            to="/valuation?tab=cogs"
            hint={s.locked_until ? t("dashboard.lockedUntil", { date: dateLabel(s.locked_until) }) : undefined}
          />
        )}
        <StatsCard label={t("dashboard.activeSkus")} value={s.active_skus} icon={Package} to="/products" />
        <StatsCard label={t("dashboard.outOfStock")} value={s.out_of_stock} icon={PackageX} tone={s.out_of_stock ? "danger" : undefined} to="/products" />
        <StatsCard label={t("dashboard.belowReorder")} value={s.below_reorder.length} icon={AlertTriangle} tone={s.below_reorder.length ? "danger" : undefined} />
        <StatsCard
          label={t("dashboard.expiring", { days: settings?.expiry_warning_days ?? 30 })}
          value={s.expiring.length}
          icon={CalendarClock}
          tone={s.expiring.length ? "warn" : undefined}
        />
        <StatsCard label={t("dashboard.putawayPending")} value={s.putaway_pending} icon={ArrowDownToLine} to="/inbound/putaway" />
        <StatsCard label={t("dashboard.pickListsToday")} value={s.pick_lists_today} icon={ListChecks} to="/outbound/pick-lists?tab=lists" />
        {s.dispatched_today != null && (
          <StatsCard label={t("dashboard.dispatchedToday")} value={s.dispatched_today} icon={Truck} to="/outbound/dispatch?tab=done" />
        )}
        <StatsCard label={t("dashboard.countAccuracy")} value={s.count_accuracy == null ? "-" : `${s.count_accuracy}%`} icon={ClipboardCheck} to="/opname" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FlowChart flow={s.flow} />
        {money ? (
          <ValuationTrendChart points={[...(s.value_trend ?? []), { date: today, value: Number(s.asset_value) }]} />
        ) : (
          <FastSlowMovingChart movers={s.movers} />
        )}
      </div>

      <WarehouseNetworkMap />

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkQueueCard queue={s.queue} />
        <CriticalStockCard rows={s.below_reorder} />
        <ExpiringSoonCard rows={s.expiring} today={today} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {money && <FastSlowMovingChart movers={s.movers} />}
        <TurnoverChart rows={s.movers.turnover} />
        {!money && <UtilizationCard rows={s.utilization} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {money && <UtilizationCard rows={s.utilization} />}
        {s.recent && <RecentActivityCard rows={s.recent} />}
      </div>
    </div>
  );
}
