import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field, selectClass } from "@/components/common/Field";
import { SkuPicker } from "@/components/common/SkuPicker";
import { QcCheckPanel } from "./QcCheckPanel";
import type { Product } from "@/hooks/useProducts";
import { lineProblems, skuIndex, type DraftLine } from "./receiptLine";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/common/SelectField";

/** Editable receipt lines as cards: one column on phones, denser on wide screens. */
export function ReceiptLinesTable({
  lines,
  products,
  uomCode,
  showProblems,
  onChange,
  onRemove,
}: {
  lines: DraftLine[];
  products: Product[];
  uomCode: (id: number) => string;
  showProblems: boolean;
  onChange: (key: string, patch: Partial<DraftLine>) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useTranslation();
  const index = skuIndex(products);

  return (
    <ol className="flex flex-col gap-3">
      {lines.map((l, i) => {
        const entry = l.sku_id ? index.get(l.sku_id) : undefined;
        const sku = entry?.sku;
        const problems = showProblems ? lineProblems(l, sku) : [];
        const bad = (p: string) => problems.includes(p as never);
        return (
          <li key={l.key} className={cn("rounded-xl border bg-card p-3", problems.length ? "border-destructive/60" : "border-border")}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => onRemove(l.key)} aria-label={t("common.delete")}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <Field label={t("receipts.fields.sku")} error={bad("sku") ? t("receipts.problems.sku") : undefined}>
                  <SkuPicker
                    products={products}
                    value={l.sku_id}
                    onChange={(skuId) => onChange(l.key, { sku_id: skuId, uom_id: index.get(skuId)?.sku.base_uom_id ?? null })}
                  />
                </Field>
              </div>
              <Field label={t("receipts.fields.uom")}>
                <SelectField
                  value={l.uom_id ?? ""}
                  onChange={(e) => onChange(l.key, { uom_id: Number(e.target.value) })}
                  className={cn(selectClass, "h-10")}
                  disabled={!sku}
                >
                  {[...(sku?.m_sku_uoms ?? [])]
                    .sort((a, b) => a.factor_to_base - b.factor_to_base)
                    .map((u) => (
                      <option key={u.uom_id} value={u.uom_id}>
                        {uomCode(u.uom_id)}
                        {u.factor_to_base > 1 ? ` (${u.factor_to_base})` : ""}
                      </option>
                    ))}
                </SelectField>
              </Field>
              <Field label={t("receipts.fields.qty")} error={bad("qty") ? t("receipts.problems.qty") : undefined}>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={l.qty_received}
                  onChange={(e) => onChange(l.key, { qty_received: Number(e.target.value) })}
                  className="h-10"
                />
              </Field>

              <div className="sm:col-span-3">
                <QcCheckPanel
                  rejected={l.qty_rejected}
                  reason={l.reject_reason}
                  onChange={(patch) => onChange(l.key, patch)}
                />
                {(bad("reject") || bad("reason")) && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {bad("reject") ? t("receipts.problems.reject") : t("receipts.problems.reason")}
                  </p>
                )}
              </div>

              {(sku?.track_batch || l.batch_no) && (
                <>
                  <Field label={t("receipts.fields.batch")} error={bad("batch") ? t("receipts.problems.batch") : undefined}>
                    <Input
                      value={l.batch_no}
                      onChange={(e) => onChange(l.key, { batch_no: e.target.value.toUpperCase() })}
                      className="h-10 font-mono uppercase"
                    />
                  </Field>
                  <Field label={t("receipts.fields.mfgDate")}>
                    <Input type="date" value={l.mfg_date} onChange={(e) => onChange(l.key, { mfg_date: e.target.value })} className="h-10" />
                  </Field>
                  <Field label={t("receipts.fields.expiryDate")} error={bad("expiry") ? t("receipts.problems.expiry") : undefined}>
                    <Input
                      type="date"
                      value={l.expiry_date}
                      onChange={(e) => onChange(l.key, { expiry_date: e.target.value })}
                      className="h-10"
                    />
                  </Field>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
