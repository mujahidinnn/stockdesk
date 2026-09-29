import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip } from "@/components/ui/chart";
import { ChartTip } from "@/components/dashboard/ValuationTrendChart";

export interface ActivityBucket {
  hour: string;
  kind: "audit" | "movement";
  n: number;
}

export function ActivityChart({ buckets }: { buckets: ActivityBucket[] }) {
  const { t, i18n } = useTranslation();
  const data = useMemo(() => {
    const rows = new Map<string, { day: string; audit: number; movement: number }>();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA");
      rows.set(day, { day, audit: 0, movement: 0 });
    }
    for (const b of buckets) {
      const row = rows.get(new Date(b.hour).toLocaleDateString("en-CA"));
      if (row) row[b.kind] += b.n;
    }
    return [...rows.values()];
  }, [buckets]);
  const label = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(i18n.language, { day: "numeric", month: "short" });

  return (
    <ChartContainer
      config={{
        movement: { label: t("superadmin.movements"), color: "hsl(var(--primary))" },
        audit: { label: t("superadmin.auditEvents"), color: "hsl(38 92% 50%)" },
      }}
      className="aspect-auto h-56 w-full"
    >
      <BarChart data={data} margin={{ left: 0, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickFormatter={label} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <ChartTooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <ChartTip
                title={label(String(payload[0].payload.day))}
                value={`${t("superadmin.movements")}: ${payload[0].payload.movement} · ${t("superadmin.auditEvents")}: ${payload[0].payload.audit}`}
              />
            ) : null
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="movement" stackId="a" fill="var(--color-movement)" />
        <Bar dataKey="audit" stackId="a" fill="var(--color-audit)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
