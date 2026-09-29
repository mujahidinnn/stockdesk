import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { CheckCircle2 } from "lucide-react";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DashboardSummary } from "@/hooks/useFinance";
import { qtyText } from "@/lib/utils";
import { StatusLegend } from "./BarListChart";

const OUT = "hsl(var(--rose))";
const LOW = "hsl(var(--amber))";
const ROP = "hsl(var(--muted-foreground) / 0.25)";
const BAR = 14;

/** Bars are on-hand relative to each SKU's own reorder point, so SKUs of any size compare. */
export function CriticalStockCard({ rows }: { rows: DashboardSummary["below_reorder"] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const data = rows.slice(0, 10).map((r) => ({
    ...r,
    on_hand: Number(r.on_hand),
    reorder_point: Number(r.reorder_point),
    track: 100,
    fill_pct: Math.min(100, (100 * Number(r.on_hand)) / Number(r.reorder_point)),
    label: `${qtyText(Number(r.on_hand))} / ${qtyText(Number(r.reorder_point))}`,
  }));
  return (
    <div data-tour="dashboard-critical" className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{t("dashboard.criticalStock")}</p>
      <p className="text-xs text-muted-foreground">{t("dashboard.criticalHint", { count: rows.length })}</p>
      {!data.length ? (
        <EmptyState size="sm" icon={CheckCircle2} title={t("dashboard.noCritical")} className="py-10" />
      ) : (
        <>
          <ChartContainer config={{ on_hand: { label: t("dashboard.onHand") } }} className="mt-3 aspect-auto w-full" style={{ height: data.length * 30 + 8 }}>
            {/* barGap = -BAR lays the on-hand bar over the reorder-point bar. */}
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 84 }} barSize={BAR} barGap={-BAR}>
              <XAxis type="number" hide domain={[0, 100]} />
              <YAxis type="category" dataKey="sku_code" width={80} tickLine={false} axisLine={false} interval={0} className="font-mono" />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                  if (!r) return null;
                  return (
                    <div className="max-w-64 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-mono font-medium">{r.sku_code}</p>
                      <p className="truncate text-muted-foreground">{r.name}</p>
                      <p className="tabular-nums">{t("dashboard.onHand")}: {qtyText(r.on_hand)}</p>
                      <p className="tabular-nums text-muted-foreground">
                        {t("dashboard.reorderAt", { rop: qtyText(r.reorder_point), qty: qtyText(Number(r.reorder_qty)) })}
                      </p>
                    </div>
                  );
                }}
              />
              {/* The label sits at the reorder point's end, clear of both bars. */}
              <Bar dataKey="track" fill={ROP} radius={4} isAnimationActive={false}>
                <LabelList dataKey="label" position="right" className="fill-foreground text-[11px] tabular-nums" />
              </Bar>
              <Bar
                dataKey="fill_pct"
                radius={4}
                minPointSize={3}
                className="cursor-pointer"
                onClick={() => navigate("/products")}
              >
                {data.map((r) => <Cell key={r.sku_code} fill={r.on_hand <= 0 ? OUT : LOW} />)}
              </Bar>
            </BarChart>
          </ChartContainer>
          <StatusLegend
            items={[
              { color: LOW, label: t("dashboard.legendOnHand") },
              { color: ROP, label: t("dashboard.legendRop") },
              { color: OUT, label: t("dashboard.legendOut") },
            ]}
          />
        </>
      )}
    </div>
  );
}
