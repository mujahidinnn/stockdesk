import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { DashboardSummary } from "@/hooks/useFinance";
import { qtyText } from "@/lib/utils";
import { ListCard } from "./ListCard";

const DAY = 86_400_000;

/** A list, not a chart: the reader needs which batch, when and how much, to act on it. */
export function ExpiringSoonCard({ rows, today }: { rows: DashboardSummary["expiring"]; today: string }) {
  const { t } = useTranslation();
  return (
    <ListCard title={t("dashboard.expiringSoon")} hint={t("dashboard.expiringHint", { count: rows.length })} empty={t("dashboard.noExpiring")}>
      {rows.slice(0, 8).map((r) => {
        const days = Math.round((Date.parse(r.expiry_date) - Date.parse(today)) / DAY);
        const text = days < 0 ? t("dashboard.expiredAgo", { count: -days }) : days === 0 ? t("dashboard.expiresToday") : t("dashboard.daysLeft", { count: days });
        return (
          <li key={`${r.sku_code}-${r.batch_no}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-mono font-medium">{r.sku_code}</p>
              <p className="truncate text-muted-foreground">
                {r.batch_no} · {qtyText(Number(r.qty))} · {r.expiry_date}
              </p>
            </div>
            <StatusBadge tone={days <= 0 ? "danger" : days <= 7 ? "warn" : "muted"}>{text}</StatusBadge>
          </li>
        );
      })}
    </ListCard>
  );
}
