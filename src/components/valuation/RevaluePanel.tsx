import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/context/auth";
import { useEstimatedReceipts, useRevalueReceipt } from "@/hooks/useFinance";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { qtyText, rupiah } from "@/lib/utils";

// Entering the real price revalues what is left and books the rest as COGS.
export function RevaluePanel() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const { data: lines = [] } = useEstimatedReceipts();
  const lookup = useSkuLookup();
  const revalue = useRevalueReceipt();
  const [price, setPrice] = useState<Record<number, string>>({});

  if (!lines.length) return <EmptyState icon={BadgeCheck} title={t("valuation.noEstimates")} description={t("valuation.noEstimatesHint")} />;
  return (
    <ul data-tour="valuation-estimates" className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {lines.map((l) => {
        const v = Number(price[l.receipt_line_id]);
        return (
          <li key={l.receipt_line_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-medium">
                {l.gr_no} · {lookup.code(l.sku_id)}
              </p>
              <p className="text-xs text-muted-foreground">
                {l.receipt_date} · {qtyText(Number(l.qty))} {lookup.uomCode(l.uom_id)} · {t("valuation.estimatedAt", { cost: rupiah(Number(l.unit_cost)) })}
              </p>
            </div>
            {canUpdate("valuation") && (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  revalue.mutate({ lineId: l.receipt_line_id, unitCost: v });
                }}
              >
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  className="h-10 w-32"
                  placeholder={t("valuation.pricePer", { uom: lookup.uomCode(l.uom_id) })}
                  aria-label={t("valuation.pricePer", { uom: lookup.uomCode(l.uom_id) })}
                  value={price[l.receipt_line_id] ?? ""}
                  onChange={(e) => setPrice((p) => ({ ...p, [l.receipt_line_id]: e.target.value }))}
                />
                <Button type="submit" className="h-10" loading={revalue.isPending} disabled={!price[l.receipt_line_id] || !(v >= 0)}>
                  {t("valuation.revalue")}
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
