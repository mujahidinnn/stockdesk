import { useTranslation } from "react-i18next";
import type { Location } from "@/hooks/useLocations";
import { activityBand, expiryBand, fillLevel, type Fill } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { LayoutGrid } from "lucide-react";

export type BinMapMode = "fill" | "expiry" | "activity";

const FILL: Record<Fill, string> = {
  empty: "bg-secondary text-muted-foreground",
  low: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  high: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
  full: "bg-rose-500/20 text-rose-700 dark:text-rose-400",
  unknown: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
};
const ACTIVITY = [
  FILL.empty,
  "bg-primary/10 text-primary",
  "bg-primary/25 text-primary",
  "bg-primary/50 text-primary-foreground",
  "bg-primary text-primary-foreground",
];

export interface BinMapData {
  mode: BinMapMode;
  occupancy: Map<number, number>;
  expiry: Map<number, string>;
  today: string;
  warnUntil: string;
  /** Picks per bin id over the last 30 days. */
  picks: Map<number, number>;
  /** Stop number per bin id for the highlighted pick list; empty = no route. */
  route: Map<number, number>;
}

// Whole warehouse when nothing (or a dock bin) is focused.
export function BinGridView({
  locations,
  focus,
  data,
  selectedId,
  onSelect,
}: {
  locations: Location[];
  focus: Location | null;
  data: BinMapData;
  selectedId: number | null;
  onSelect: (l: Location) => void;
}) {
  const { t } = useTranslation();
  const { mode, occupancy, expiry, picks, route } = data;
  const byId = new Map(locations.map((l) => [l.id, l]));
  const up = (l: Location | undefined, level: string): Location | undefined =>
    !l || l.level === level ? l : up(byId.get(l.parent_id ?? -1), level);
  const numeric = (a: Location, b: Location) => a.full_code.localeCompare(b.full_code, undefined, { numeric: true });

  const focusAisles =
    !focus || route.size
      ? []
      : focus.level === "zone"
        ? locations.filter((l) => l.parent_id === focus.id)
        : [up(focus, "aisle")].filter((a): a is Location => !!a);
  const whole = !focusAisles.length;
  const aisles = (whole ? locations.filter((l) => l.level === "aisle") : focusAisles).sort(numeric);
  const docks = whole ? locations.filter((l) => l.level === "bin" && l.parent_id == null).sort(numeric) : [];
  const maxPicks = Math.max(0, ...picks.values());

  if (!aisles.length && !docks.length)
    return <EmptyState size="sm" icon={LayoutGrid} title={t("warehouses.gridHint")} className="py-10" />;

  const tone = (bin: Location) => {
    const qty = occupancy.get(bin.id) ?? 0;
    if (mode === "activity") return ACTIVITY[activityBand(picks.get(bin.id) ?? 0, maxPicks)];
    if (mode === "expiry") return FILL[expiryBand(qty, expiry.get(bin.id), data.today, data.warnUntil)];
    return FILL[fillLevel(qty, bin.max_qty)];
  };

  const cell = (bin: Location, label: string, className: string) => {
    const qty = occupancy.get(bin.id) ?? 0;
    const stop = route.get(bin.id);
    const detail = [
      `${qty}${bin.max_qty ? ` / ${bin.max_qty}` : ""}`,
      expiry.get(bin.id) && `exp ${expiry.get(bin.id)}`,
      picks.get(bin.id) && t("warehouses.map.picks", { count: picks.get(bin.id) }),
    ].filter(Boolean);
    return (
      <button
        onClick={() => onSelect(bin)}
        title={`${bin.full_code} · ${detail.join(" · ")}`}
        className={cn(
          "relative rounded-md text-[10px] font-mono transition-shadow",
          className,
          tone(bin),
          (!bin.is_active || (route.size > 0 && !stop)) && "opacity-30",
          selectedId === bin.id && "ring-2 ring-primary",
        )}
      >
        {label}
        {stop != null && (
          <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[9px] text-background">
            {stop}
          </span>
        )}
      </button>
    );
  };

  const legend: [string, string][] =
    mode === "activity"
      ? [
          [ACTIVITY[0], t("warehouses.map.activity.none")],
          [ACTIVITY[1], t("warehouses.map.activity.low")],
          [ACTIVITY[4], t("warehouses.map.activity.high")],
        ]
      : mode === "expiry"
        ? (["full", "high", "low", "unknown", "empty"] as const).map((f) => [FILL[f], t(`warehouses.map.expiry.${f}`)])
        : (["empty", "low", "high", "full"] as const).map((f) => [FILL[f], t(`warehouses.fill.${f}`)]);

  return (
    <div className="flex flex-col gap-5">
      {docks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-2">
          <span className="px-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t("warehouses.map.dock")}</span>
          {docks.map((d) => (
            <div key={d.id}>{cell(d, d.code, "h-8 px-2.5")}</div>
          ))}
        </div>
      )}
      {aisles.map((aisle) => {
        const racks = locations.filter((l) => l.parent_id === aisle.id).sort(numeric);
        const levels = [...new Set(racks.flatMap((r) => locations.filter((b) => b.parent_id === r.id).map((b) => b.code)))]
          .sort()
          .reverse();
        return (
          <div key={aisle.id}>
            <p className="mb-2 text-xs font-semibold font-mono">{aisle.full_code}</p>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1">
                <tbody>
                  {levels.map((lv) => (
                    <tr key={lv}>
                      <th className="pr-1 text-[10px] font-normal text-muted-foreground">{lv}</th>
                      {racks.map((r) => {
                        const bin = locations.find((b) => b.parent_id === r.id && b.code === lv);
                        return <td key={r.id}>{bin && cell(bin, r.code, "h-9 w-11")}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {legend.map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded", cls)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
