import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessControl } from "@/components/auth/AccessControl";
import { LocationTag } from "@/components/common/LocationTag";
import { useAuth } from "@/context/auth";
import { useLocations } from "@/hooks/useLocations";
import { useApproveCount, useCloseCount, useCountReview, type StockCount } from "@/hooks/useStockCounts";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/common/QueryState";

export function VarianceApprovalPanel({ count }: { count: StockCount }) {
  const { t } = useTranslation();
  const { user, canRead } = useAuth();
  const review = useCountReview(count.id, !count.blind || count.status !== "counting" || canRead("stock-approval"));
  const rows = review.data ?? [];
  const { data: locations = [] } = useLocations(count.warehouse_id);
  const lookup = useSkuLookup();
  const approve = useApproveCount();
  const close = useCloseCount();
  const [reason, setReason] = useState("");
  // Whoever counted or submitted may not decide (guard_approval_self).
  const own = count.submitted_by === user?.id || count.t_stock_count_counters.some((c) => c.user_id === user?.id);
  const diffs = rows.filter((r) => Number(r.variance) !== 0);
  const total = rows.reduce((s, r) => s + Number(r.variance_value ?? 0), 0);
  const withValue = rows.some((r) => r.variance_value != null);
  const fmt = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

  return (
    <QueryState query={review}>
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {t("counts.varianceSummary", { lines: diffs.length, total: rows.length })}
          {withValue && <span className={cn("ml-2 font-semibold", total < 0 ? "text-rose-600" : "text-emerald-600")}>Rp {fmt(total)}</span>}
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2">{t("counts.bin")}</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">{t("counts.systemCol")}</th>
                <th className="px-3 py-2 text-right">{t("counts.counted")}</th>
                <th className="px-3 py-2 text-right">{t("counts.variance")}</th>
                {withValue && <th className="px-3 py-2 text-right">{t("counts.value")}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line_id} className={cn("border-b border-border/40", Number(r.variance) !== 0 && "bg-amber-500/5")}>
                  <td className="px-3 py-2">
                    <LocationTag code={locations.find((l) => l.id === r.location_id)?.full_code ?? "?"} />
                  </td>
                  <td className="px-3 py-2 font-mono">{lookup.code(r.sku_id)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(r.system_qty))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(r.counted_qty))}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", Number(r.variance) < 0 && "text-rose-600", Number(r.variance) > 0 && "text-emerald-600")}>
                    {Number(r.variance) > 0 ? "+" : ""}
                    {fmt(Number(r.variance))}
                  </td>
                  {withValue && <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(r.variance_value ?? 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {count.status === "submitted" && (
          <AccessControl feature="stock-approval" action="update">
            {own ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{t("counts.ownCount")}</p>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("counts.rejectReason")} className="h-11 sm:flex-1" />
                <Button
                  variant="outline"
                  className="h-11 gap-1.5"
                  loading={close.isPending}
                  disabled={!reason.trim()}
                  onClick={() => close.mutate({ id: count.id, status: "rejected", reason: reason.trim() })}
                >
                  <X className="h-4 w-4" />
                  {t("counts.reject")}
                </Button>
                <Button className="h-11 gap-1.5" loading={approve.isPending} onClick={() => approve.mutate(count.id)}>
                  <Check className="h-4 w-4" />
                  {t("counts.approve")}
                </Button>
              </div>
            )}
          </AccessControl>
        )}
      </div>
    </QueryState>
  );
}
