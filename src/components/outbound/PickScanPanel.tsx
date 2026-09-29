import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/Field";
import { ScanInput } from "@/components/scanner/ScanInput";
import type { PickStop } from "@/hooks/usePickLists";
import { useConfirmPick } from "@/hooks/usePickLists";
import { resolveBarcode, type ScanProduct } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";

// Two scans prove bin and item; a short pick needs a reason.
export function PickScanPanel({ stop, products }: { stop: PickStop; products: ScanProduct[] }) {
  const { t } = useTranslation();
  const confirm = useConfirmPick();
  // One id per stop: a line is confirmed once, so a retry after a timeout is a no-op.
  const requestId = useMemo(() => crypto.randomUUID(), [stop.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [binOk, setBinOk] = useState(false);
  const [itemOk, setItemOk] = useState(false);
  const [qty, setQty] = useState(Number(stop.qty));
  const [reason, setReason] = useState("");

  useEffect(() => {
    setBinOk(false);
    setItemOk(false);
    setQty(Number(stop.qty));
    setReason("");
  }, [stop.id, stop.qty]);

  function onScan(code: string) {
    if (!binOk) {
      const ok = code.toUpperCase() === stop.m_locations?.full_code;
      scanFeedback(ok);
      if (!ok) return toast.error(t("picking.wrongBin", { code, bin: stop.m_locations?.full_code }));
      return setBinOk(true);
    }
    const ok = resolveBarcode(products, code)?.skuId === stop.sku_id;
    scanFeedback(ok);
    if (!ok) return toast.error(t("picking.wrongItem", { code }));
    setItemOk(true);
  }

  const short = qty < Number(stop.qty);
  const canConfirm = binOk && itemOk && qty >= 0 && qty <= Number(stop.qty) && (!short || reason.trim());

  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-2 gap-2 text-xs">
        {[
          [binOk, t("picking.stepBin")],
          [itemOk, t("picking.stepItem")],
        ].map(([ok, label], i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2",
              ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground",
            )}
          >
            <CheckCircle2 className="h-4 w-4" />
            {label as string}
          </li>
        ))}
      </ol>
      {!itemOk && (
        <ScanInput key={binOk ? "item" : "bin"} onScan={onScan} placeholder={binOk ? t("picking.scanItem") : t("picking.scanBin")} />
      )}
      {itemOk && (
        <>
          <Field label={t("picking.qtyPicked")} hint={t("picking.planned", { qty: Number(stop.qty) })}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={Number(stop.qty)}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="h-11 text-base"
            />
          </Field>
          {short && (
            <Field label={t("picking.shortReason")}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("picking.shortPlaceholder")} className="h-11" />
            </Field>
          )}
        </>
      )}
      <Button
        className="sticky bottom-0 z-10 h-12 gap-2 text-base shadow-md"
        loading={confirm.isPending}
        disabled={!canConfirm}
        onClick={() => confirm.mutate({ lineId: stop.id, qty, reason: short ? reason.trim() : undefined, requestId })}
      >
        <Check className="h-5 w-5" />
        {short ? t("picking.confirmShort") : t("picking.confirm")}
      </Button>
    </div>
  );
}
