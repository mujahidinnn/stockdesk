import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { run } from "@/hooks/useOutboundMutation";
import { useAuth } from "@/context/auth";
import { StatusBadge } from "@/components/common/StatusBadge";
import { cn } from "@/lib/utils";
import type { NetworkFlow, NetworkNode } from "./networkMap";

/** Warehouses on a real map, sized by stock, with inter-warehouse transfers as lines. */
export function WarehouseNetworkMap() {
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const el = useRef<HTMLDivElement>(null);
  const focus = useRef<((id: number) => void) | undefined>(undefined);
  const [active, setActive] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ["warehouse-network"],
    queryFn: async () =>
      (await run(supabase.rpc("warehouse_network"))) as unknown as {
        warehouses: NetworkNode[];
        transfers: NetworkFlow[];
      },
    refetchInterval: 5 * 60_000,
  });
  const pinned =
    data?.warehouses.filter((w) => w.lat != null && w.lng != null) ?? [];
  const unpinned = data?.warehouses.filter((w) => w.lat == null) ?? [];

  useEffect(() => {
    const nodes =
      data?.warehouses.filter((w) => w.lat != null && w.lng != null) ?? [];
    if (!el.current || !nodes.length) return;
    const fmt = (n: number) => Number(n).toLocaleString("id-ID");
    let cleanup: ReturnType<typeof import("./networkMap").mountNetworkMap> | undefined;
    let gone = false;
    import("./networkMap").then(({ mountNetworkMap }) => {
      if (gone || !el.current) return;
      cleanup = mountNetworkMap(el.current, nodes, data!.transfers, {
        nodeLines: (w) => [
          t("dashboard.network.stock", { qty: fmt(w.qty), skus: w.skus }),
          t("dashboard.binsUsed", { used: w.bins_used, bins: w.bins }),
          t("dashboard.network.openOrders", { count: w.open_orders }),
        ],
        flowLines: (f) =>
          [
            f.in_transit > 0
              ? t("dashboard.network.inTransit", {
                  count: f.in_transit,
                  qty: fmt(f.in_transit_qty),
                })
              : "",
            f.received_30d > 0
              ? t("dashboard.network.received", { count: f.received_30d })
              : "",
          ].filter(Boolean),
      });
      focus.current = cleanup.focus;
    });
    return () => {
      gone = true;
      focus.current = undefined;
      cleanup?.destroy();
    };
  }, [data, t]);

  if (!data?.warehouses.length) return null;

  const fmt = (n: number) => Number(n).toLocaleString("id-ID");
  const incoming = (id: number) =>
    data.transfers
      .filter((f) => f.to_id === id)
      .reduce((n, f) => n + f.in_transit, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col rounded-xl border border-border bg-card lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              {t("dashboard.network.title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("dashboard.network.hint")}
            </p>
          </div>
        </div>
        {pinned.length ? (
          // Grows with the warehouse list beside it; MapLibre follows the container size.
          <div className="relative min-h-80 flex-1 sm:min-h-[26rem]">
            <div className="absolute inset-0 overflow-hidden rounded-b-xl">
              {/* MapLibre forces position: relative on its container, so it gets a wrapper to fill. */}
              <div ref={el} className="h-full w-full" />
            </div>
            <ul className="pointer-events-none absolute bottom-3 left-3 z-10 grid gap-1.5 rounded-lg border border-border bg-card/90 px-3 py-2 text-[11px] text-foreground shadow-sm backdrop-blur">
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary bg-primary/40" />
                {t("dashboard.network.legendMain")}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary bg-card" />
                {t("dashboard.network.legendStore")}
              </li>
              <li className="flex items-center gap-2">
                <span className="flex w-3.5 items-end justify-center gap-px">
                  <span className="h-1.5 w-1.5 rounded-full border border-primary" />
                  <span className="h-2.5 w-2.5 rounded-full border border-primary" />
                </span>
                {t("dashboard.network.legendSize")}
              </li>
              <li className="flex items-center gap-2">
                <span className="h-0.5 w-3.5 bg-primary" />
                {t("dashboard.network.legendDone")}
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3.5 border-t-2 border-dashed border-amber-500" />
                {t("dashboard.network.legendMoving")}
              </li>
            </ul>
          </div>
        ) : null}
        {unpinned.length > 0 && (
          <p className="px-4 py-3 text-xs text-muted-foreground">
            {t("dashboard.network.unpinned", {
              codes: unpinned.map((w) => w.code).join(", "),
            })}{" "}
            {canRead("master-warehouse") && (
              <Link to="/warehouses" className="text-primary hover:underline">
                {t("dashboard.network.setPins")}
              </Link>
            )}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">
            {t("dashboard.network.listTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.network.listHint")}
          </p>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {data.warehouses.map((w) => {
            const pct = w.bins ? Math.round((100 * w.bins_used) / w.bins) : 0;
            const inbound = incoming(w.id);
            return (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={w.lat == null}
                  onClick={() => {
                    setActive(w.id);
                    focus.current?.(w.id);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-1.5 px-4 py-3 text-left text-xs transition-colors hover:bg-secondary/50 disabled:cursor-default disabled:opacity-60",
                    active === w.id && "bg-primary/5",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="font-mono font-semibold">{w.code}</span>{" "}
                      · {w.name}
                    </span>
                    <StatusBadge tone={w.type === "main" ? "info" : "muted"}>
                      {t(`warehouses.types.${w.type}`)}
                    </StatusBadge>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground tabular-nums">
                    <span>
                      {t("dashboard.network.stock", {
                        qty: fmt(w.qty),
                        skus: w.skus,
                      })}
                    </span>
                    <span>
                      {t("dashboard.network.openOrders", {
                        count: w.open_orders,
                      })}
                    </span>
                    {inbound > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {t("dashboard.network.incoming", { count: inbound })}
                      </span>
                    )}
                  </span>
                  <span
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                    title={t("dashboard.binsUsed", {
                      used: w.bins_used,
                      bins: w.bins,
                    })}
                  >
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
