import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { ChartTip } from "./ValuationTrendChart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardSummary } from "@/hooks/useFinance";
import { qtyText } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { Activity } from "lucide-react";

/** Top 10 by quantity dispatched in 90 days, or the 10 in-stock SKUs that moved least. */
export function FastSlowMovingChart({ movers }: { movers: DashboardSummary["movers"] }) {
  const { t } = useTranslation();
  const [view, setView] = useState<"fast" | "slow">("fast");
  const rows = movers[view];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{t("dashboard.movers")}</p>
          <p className="text-xs text-muted-foreground">{t("dashboard.moversHint")}</p>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "fast" | "slow")}>
          <TabsList className="h-8">
            <TabsTrigger value="fast" className="text-xs">{t("dashboard.fast")}</TabsTrigger>
            <TabsTrigger value="slow" className="text-xs">{t("dashboard.slow")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {!rows.length ? (
        <EmptyState size="sm" icon={Activity} title={t("dashboard.noMovement")} className="py-10" />
      ) : (
        <ChartContainer
          config={{ out_qty: { label: t("dashboard.outQty"), color: view === "fast" ? "hsl(var(--primary))" : "hsl(38 92% 50%)" } }}
          className="mt-3 aspect-auto w-full"
          style={{ height: rows.length * 26 + 16 }}
        >
          <BarChart data={rows.map((r) => ({ ...r, label: qtyText(Number(r.out_qty)) }))} layout="vertical" margin={{ left: 0, right: 48 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="sku_code" width={96} tickLine={false} axisLine={false} className="font-mono" />
            <ChartTooltip
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as (typeof rows)[number] & { on_hand?: number }) : null;
                if (!r) return null;
                const out = `${t("dashboard.outQty")}: ${qtyText(Number(r.out_qty))}`;
                return <ChartTip title={r.sku_code} value={r.on_hand == null ? out : `${out} · ${t("dashboard.onHand")}: ${qtyText(Number(r.on_hand))}`} />;
              }}
            />
            <Bar dataKey="out_qty" fill="var(--color-out_qty)" radius={3} minPointSize={2}>
              <LabelList dataKey="label" position="right" className="fill-foreground text-[11px] tabular-nums" />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}
