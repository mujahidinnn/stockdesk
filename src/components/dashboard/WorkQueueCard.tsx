import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { ListCard } from "./ListCard";
import type { DashboardSummary, QueueKey } from "@/hooks/useFinance";

const ROUTES: Record<QueueKey, string> = {
  receipt_drafts: "/inbound/receipts",
  orders_open: "/outbound/pick-lists?tab=orders",
  pick_lists_open: "/outbound/pick-lists?tab=lists",
  to_pack: "/outbound/dispatch?tab=pack",
  to_dispatch: "/outbound/dispatch?tab=dispatch",
  in_transit: "/transfers?tab=inter",
  variances: "/transfers?tab=inter",
  counts_active: "/opname",
  counts_submitted: "/opname",
  estimated_costs: "/valuation?tab=costs",
  webhooks_failed: "/settings/integration?tab=webhooks",
};

/** A list, not a chart: the counts are different kinds of work. */
export function WorkQueueCard({ queue }: { queue: DashboardSummary["queue"] }) {
  const { t } = useTranslation();
  const rows = (Object.keys(ROUTES) as QueueKey[]).filter((k) => Number(queue[k]) > 0);
  return (
    <ListCard title={t("dashboard.queue")} hint={t("dashboard.queueHint")} empty={t("dashboard.queueEmpty")}>
      {rows.map((k) => (
        <li key={k}>
          <Link to={ROUTES[k]} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-secondary/50">
            <span className="truncate">{t(`dashboard.queueItems.${k}`)}</span>
            <span className="flex items-center gap-1">
              <span className="min-w-6 rounded-md bg-primary/10 px-1.5 py-0.5 text-center font-semibold tabular-nums text-primary">{queue[k]}</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}
