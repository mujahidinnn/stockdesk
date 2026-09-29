import { useTranslation } from "react-i18next";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowLeftRight } from "lucide-react";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DashboardSummary } from "@/hooks/useFinance";
import { qtyText } from "@/lib/utils";

// Categorical slots 1 and 2 (blue, orange), stepped per theme; checked for colour-blind separation.
const CONFIG = {
  in_qty: { theme: { light: "#2a78d6", dark: "#3987e5" } },
  out_qty: { theme: { light: "#eb6834", dark: "#d95926" } },
};

/** Units received vs dispatched per day, last 30 days. */
export function FlowChart({ flow }: { flow: DashboardSummary["flow"] }) {
  const { t, i18n } = useTranslation();
  const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const config = {
    in_qty: { ...CONFIG.in_qty, label: t("dashboard.flowIn") },
    out_qty: { ...CONFIG.out_qty, label: t("dashboard.flowOut") },
  };
  const empty = !flow.some((f) => Number(f.in_qty) > 0 || Number(f.out_qty) > 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{t("dashboard.flow")}</p>
      <p className="text-xs text-muted-foreground">{t("dashboard.flowHint")}</p>
      {empty ? (
        <EmptyState size="sm" icon={ArrowLeftRight} title={t("dashboard.noMovement")} className="py-10" />
      ) : (
        <ChartContainer config={config} className="mt-3 aspect-auto h-56 w-full">
          <LineChart data={flow} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={day} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={(n: number) => n.toLocaleString(i18n.language, { notation: "compact" })} tickLine={false} axisLine={false} width={40} />
            <ChartTooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as DashboardSummary["flow"][number] | undefined) : undefined;
                if (!r) return null;
                return (
                  <div className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
                    <p className="text-muted-foreground">{day(r.date)}</p>
                    <p className="tabular-nums">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--color-in_qty)]" />
                      {t("dashboard.flowIn")}: <span className="font-medium">{qtyText(Number(r.in_qty))}</span>
                    </p>
                    <p className="tabular-nums">
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--color-out_qty)]" />
                      {t("dashboard.flowOut")}: <span className="font-medium">{qtyText(Number(r.out_qty))}</span>
                    </p>
                  </div>
                );
              }}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line dataKey="in_qty" type="monotone" stroke="var(--color-in_qty)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line dataKey="out_qty" type="monotone" stroke="var(--color-out_qty)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  );
}
