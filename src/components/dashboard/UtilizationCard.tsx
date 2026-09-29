import { useTranslation } from "react-i18next";
import { ListCard } from "./ListCard";
import type { DashboardSummary } from "@/hooks/useFinance";

/** Storage and picking bins in use per warehouse, plus fill against bin capacity. */
export function UtilizationCard({ rows }: { rows: DashboardSummary["utilization"] }) {
  const { t } = useTranslation();
  return (
    <ListCard title={t("dashboard.utilization")} hint={t("dashboard.utilizationHint")} empty={t("dashboard.noBins")}>
      {rows.map((w) => {
        const pct = w.bins ? Math.round((100 * w.used) / w.bins) : 0;
        return (
          <li key={w.code} className="flex flex-col gap-1.5 px-4 py-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="font-mono">{w.code}</span> · {w.name}
              </span>
              <span className="tabular-nums text-muted-foreground">{t("dashboard.binsUsed", { used: w.used, bins: w.bins })}</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("dashboard.binsUsed", { used: w.used, bins: w.bins })}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            {w.fill_pct != null && <span className="text-muted-foreground">{t("dashboard.fill", { pct: w.fill_pct })}</span>}
          </li>
        );
      })}
    </ListCard>
  );
}
