import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ListCard } from "./ListCard";
import type { DashboardSummary } from "@/hooks/useFinance";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { qtyText } from "@/lib/utils";

/** The last stock movements; the full ledger is on the audit page. */
export function RecentActivityCard({ rows }: { rows: NonNullable<DashboardSummary["recent"]> }) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  return (
    <ListCard title={t("dashboard.recent")} hint={t("dashboard.recentHint")} empty={t("dashboard.noMovement")}>
      {rows.map((m) => (
        <li key={m.id}>
          <Link to="/audit" className="flex items-center justify-between gap-2 px-4 py-2 text-xs hover:bg-secondary/50">
            <span className="min-w-0">
              <span className="block truncate">
                {t(`audit.types.${m.movement_type}`)} · <span className="font-mono">{m.sku_code}</span>
              </span>
              <span className="block truncate text-muted-foreground">
                {[m.ref_no, m.actor, formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale })]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{qtyText(Number(m.qty))}</span>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}
