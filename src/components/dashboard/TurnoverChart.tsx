import { useTranslation } from "react-i18next";
import { Activity } from "lucide-react";
import type { DashboardSummary } from "@/hooks/useFinance";
import { qtyText } from "@/lib/utils";
import { BarListChart } from "./BarListChart";

/** Units out in 90 days per unit on hand now, per category. */
export function TurnoverChart({ rows }: { rows: DashboardSummary["movers"]["turnover"] }) {
  const { t } = useTranslation();
  const bars = rows
    .filter((c) => c.turnover != null)
    .map((c) => ({
      key: c.category,
      label: c.category,
      value: Number(c.turnover),
      display: `${c.turnover}×`,
      tip: [`${t("dashboard.outQty")}: ${qtyText(Number(c.out_qty))}`, `${t("dashboard.onHand")}: ${qtyText(Number(c.on_hand))}`],
    }));
  return (
    <BarListChart
      title={t("dashboard.turnover")}
      hint={t("dashboard.turnoverHint")}
      rows={bars}
      empty={t("dashboard.noMovement")}
      emptyIcon={Activity}
      labelWidth={130}
    />
  );
}
