import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSetReceiptCosts, type ReceiptLine } from "@/hooks/useGoodsReceipts";

/** Kept apart from the receipt form so receivers never see costs; empty lines post at last purchase price (flagged estimate). */
export function ReceiptCostDialog({
  receiptId,
  lines,
  costs,
  label,
  open,
  onOpenChange,
}: {
  receiptId: number;
  lines: ReceiptLine[];
  costs: Map<number, number>;
  label: (l: ReceiptLine) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const save = useSetReceiptCosts();
  const [values, setValues] = useState<Record<number, string>>({});
  const value = (id: number) => values[id] ?? (costs.has(id) ? String(costs.get(id)) : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("receipts.costs.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t("receipts.costs.hint")}</p>
        <form
          id="receipt-costs"
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const payload = lines.map((l) => ({ line_id: l.id, unit_cost: value(l.id) === "" ? null : Number(value(l.id)) }));
            save.mutate({ receiptId, costs: payload }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          {lines.map((l) => (
            <label key={l.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{label(l)}</span>
              <Input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="h-10 w-36 text-right tabular-nums"
                aria-label={t("receipts.costs.perUnit", { line: label(l) })}
                value={value(l.id)}
                onChange={(e) => setValues((v) => ({ ...v, [l.id]: e.target.value }))}
              />
            </label>
          ))}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="receipt-costs" loading={save.isPending}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
