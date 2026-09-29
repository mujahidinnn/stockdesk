import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/EmptyState";

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Shown at the bar's end; defaults to the value. */
  display?: string;
  /** A CSS color; defaults to the primary color. */
  color?: string;
  to?: string;
  tip?: string[];
}

/** Dashboard card with a titled horizontal bar chart: one bar per row, value at the bar's end. */
export function BarListChart({
  title,
  hint,
  rows,
  empty,
  emptyIcon = CheckCircle2,
  labelWidth = 120,
  legend,
  tour,
}: {
  title: string;
  hint?: string;
  rows: BarRow[];
  empty: string;
  emptyIcon?: LucideIcon;
  labelWidth?: number;
  legend?: ReactNode;
  tour?: string;
}) {
  const navigate = useNavigate();
  return (
    <div data-tour={tour} className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {!rows.length ? (
        <EmptyState size="sm" icon={emptyIcon} title={empty} className="py-10" />
      ) : (
        <>
          <ChartContainer config={{ value: { label: title } }} className="mt-3 aspect-auto w-full" style={{ height: rows.length * 30 + 8 }}>
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 64 }}>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="label" width={labelWidth} tickLine={false} axisLine={false} interval={0} />
              <ChartTooltip
                cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                content={({ active, payload }) => {
                  const r = active ? (payload?.[0]?.payload as BarRow | undefined) : undefined;
                  if (!r) return null;
                  return (
                    <div className="max-w-64 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs shadow-md">
                      <p className="font-medium">{r.label}: <span className="tabular-nums">{r.display ?? r.value}</span></p>
                      {r.tip?.map((l) => <p key={l} className="truncate text-muted-foreground">{l}</p>)}
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={4}
                minPointSize={3}
                className={rows.some((r) => r.to) ? "cursor-pointer" : undefined}
                onClick={(d: { payload?: BarRow }) => d.payload?.to && navigate(d.payload.to)}
              >
                {rows.map((r) => <Cell key={r.key} fill={r.color ?? "hsl(var(--primary))"} />)}
                <LabelList dataKey="display" position="right" className="fill-foreground text-[11px] tabular-nums" />
              </Bar>
            </BarChart>
          </ChartContainer>
          {legend}
        </>
      )}
    </div>
  );
}

/** Colour key for status-coloured bars: swatch plus text, never colour alone. */
export function StatusLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
