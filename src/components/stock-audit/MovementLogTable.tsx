import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { LocationTag } from "@/components/common/LocationTag";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";
import type { Movement } from "@/hooks/useStockMovement";
import { useSkuLookup } from "@/hooks/useSkuLookup";

const TONE: Record<string, StatusTone> = {
  receipt: "ok", return: "ok", transfer_in: "info", qc_reject: "warn", dispatch: "info",
  adjustment: "warn", transfer_out: "info", putaway: "muted", bin_transfer: "muted", pick: "muted",
};

// Phones: drop the pin icon so the route column fits without horizontal scroll.
const tagCls = "[&>svg]:hidden sm:[&>svg]:block";

export function MovementLogTable({ rows, warehouseId }: { rows: Movement[]; warehouseId: number | null }) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  if (!rows.length) return <EmptyState icon={History} title={t("audit.noMovements")} />;

  // Sign relative to the filtered warehouse (or the company): in, out, or internal.
  const inScope = (l: Movement["from"]) => !!l && (!warehouseId || l.warehouse_id === warehouseId);
  const sign = (m: Movement) => (inScope(m.to) && !inScope(m.from) ? 1 : inScope(m.from) && !inScope(m.to) ? -1 : 0);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-3 py-2.5">{t("audit.when")}</th>
            <th className="px-3 py-2.5">{t("audit.type")}</th>
            <th className="px-3 py-2.5 hidden sm:table-cell">SKU</th>
            <th className="px-3 py-2.5">{t("audit.route")}</th>
            <th className="px-3 py-2.5 text-right">{t("audit.qty")}</th>
            <th className="px-3 py-2.5 hidden md:table-cell">{t("audit.ref")}</th>
            <th className="px-3 py-2.5 hidden md:table-cell">{t("audit.by")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const s = sign(m);
            return (
              <tr key={m.id} className="border-b border-border/40 last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {m.movement_date}
                  <span className="block text-muted-foreground">{new Date(m.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                </td>
                <td className="px-3 py-2">
                  <StatusBadge tone={TONE[m.movement_type] ?? "muted"} className="whitespace-normal sm:whitespace-nowrap">{t(`audit.types.${m.movement_type}`)}</StatusBadge>
                  <span className="mt-1 block font-mono sm:hidden">{lookup.code(m.sku_id)}</span>
                </td>
                <td className="px-3 py-2 hidden sm:table-cell">
                  <span className="font-mono">{lookup.code(m.sku_id)}</span>
                  {m.m_batches && <span className="block text-muted-foreground">{m.m_batches.batch_no}</span>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {m.from ? <LocationTag code={m.from.full_code} className={tagCls} /> : <span className="text-muted-foreground">-</span>}→
                    {m.to ? <LocationTag code={m.to.full_code} className={tagCls} /> : <span className="text-muted-foreground">-</span>}
                  </div>
                  {m.note && <span className="block text-muted-foreground">{m.note}</span>}
                </td>
                <td className={`px-3 py-2 text-right font-medium tabular-nums ${s > 0 ? "text-emerald-600" : s < 0 ? "text-rose-600" : ""}`}>
                  {s > 0 ? "+" : s < 0 ? "−" : ""}
                  {Number(m.qty).toLocaleString("id-ID", { maximumFractionDigits: 3 })}
                </td>
                <td className="px-3 py-2 font-mono hidden md:table-cell">{m.ref_no ?? "-"}</td>
                <td className="px-3 py-2 hidden md:table-cell">{m.actor?.full_name ?? t("audit.system")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
