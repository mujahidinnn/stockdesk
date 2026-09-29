import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { rupiah } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { TrendingUp } from "lucide-react";


/** Month-end snapshots plus today's live value. */
export function ValuationTrendChart({ points }: { points: { date: string; value: number }[] }) {
  const { t, i18n } = useTranslation();
  const compact = (n: number) => n.toLocaleString(i18n.language, { notation: "compact", maximumFractionDigits: 1 });
  const month = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{t("dashboard.trend")}</p>
      <p className="text-xs text-muted-foreground">{t("dashboard.trendHint")}</p>
      {points.length < 2 ? (
        <EmptyState size="sm" icon={TrendingUp} title={t("dashboard.trendEmpty")} className="py-10" />
      ) : (
        <ChartContainer config={{ value: { label: t("dashboard.assetValue"), color: "hsl(var(--primary))" } }} className="mt-3 aspect-auto h-56 w-full">
          <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickFormatter={month} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={compact} tickLine={false} axisLine={false} width={48} />
            <ChartTooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? <ChartTip title={month(payload[0].payload.date)} value={rupiah(Number(payload[0].value))} /> : null
              }
            />
            <Area dataKey="value" type="monotone" stroke="var(--color-value)" fill="var(--color-value)" fillOpacity={0.12} strokeWidth={2} />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

export function ChartTip({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
      <p className="text-muted-foreground">{title}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
