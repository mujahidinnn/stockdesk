import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Minus, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/Field";
import { BatchTag } from "@/components/common/BatchTag";
import { ScanInput } from "@/components/scanner/ScanInput";
import { usePackShipment, usePickedItems } from "@/hooks/useShipments";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import type { SalesOrder } from "@/hooks/useSalesOrders";
import { resolveBarcode } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/common/QueryState";

const NONE: never[] = [];

// Scan-only: unneeded or excess scans are refused, a Box barcode counts as its base-unit content, minus undoes a mis-scan.
export function PackingPanel({ order, onClose }: { order: SalesOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  const picked = usePickedItems(order?.id ?? null);
  const { data } = picked;
  const expected = data ?? NONE;
  const pack = usePackShipment();
  const [counted, setCounted] = useState<number[]>([]);
  const [weight, setWeight] = useState("");
  const [packages, setPackages] = useState(1);
  const [dims, setDims] = useState("");

  useEffect(() => {
    setCounted(expected.map(() => 0));
    setWeight("");
    setPackages(1);
    setDims("");
  }, [order?.id, expected]);

  const add = (i: number, n: number) => setCounted((c) => c.map((v, j) => (j === i ? Math.max(0, Math.min(expected[i].qty, v + n)) : v)));

  function onScan(code: string) {
    const hit = resolveBarcode(lookup.products, code);
    // Fill the first batch of that SKU that still has room.
    const i = hit ? expected.findIndex((e, j) => e.sku_id === hit.skuId && counted[j] + hit.factor <= e.qty) : -1;
    scanFeedback(i >= 0);
    if (!hit || !expected.some((e) => e.sku_id === hit.skuId)) return toast.error(t("dispatch.notInOrder", { code }));
    if (i < 0) return toast.error(t("dispatch.tooMany", { sku: lookup.code(hit.skuId) }));
    add(i, hit.factor);
  }

  const complete = expected.length > 0 && expected.every((e, i) => counted[i] === e.qty);
  const weightKg = Number(weight);

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("dispatch.packTitle", { no: order?.so_no })}
            <span className="block text-xs font-normal text-muted-foreground">{order?.customer_name}</span>
          </DialogTitle>
        </DialogHeader>

        <ScanInput onScan={onScan} placeholder={t("dispatch.scanItem")} />

        <QueryState query={picked}>
          <ul className="flex flex-col gap-2">
            {expected.map((e, i) => {
              const done = counted[i] === e.qty;
              return (
                <li key={`${e.sku_id}-${e.batch_id}`} className={cn("rounded-lg border p-3", done ? "border-emerald-500/40 bg-emerald-500/5" : "border-border")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-sm">{lookup.code(e.sku_id)}</p>
                      <p className="truncate text-xs text-muted-foreground">{lookup.label(e.sku_id)}</p>
                    </div>
                    <p className={cn("text-lg font-semibold tabular-nums", done && "text-emerald-600 dark:text-emerald-400")}>
                      {counted[i] ?? 0}/{e.qty}
                    </p>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {e.batch_no ? <BatchTag batchNo={e.batch_no} /> : <span />}
                    <Button variant="outline" size="icon" className="h-10 w-10" onClick={() => add(i, -1)} aria-label={t("dispatch.less")}>
                      <Minus className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryState>

        <div className="grid grid-cols-3 gap-2">
          <Field label={t("dispatch.weight")}>
            <Input type="number" inputMode="decimal" min={0} step="any" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-11" />
          </Field>
          <Field label={t("dispatch.packages")}>
            <Input type="number" inputMode="numeric" min={1} value={packages} onChange={(e) => setPackages(Math.max(1, Number(e.target.value)))} className="h-11" />
          </Field>
          <Field label={t("dispatch.dimensions")}>
            <Input value={dims} onChange={(e) => setDims(e.target.value)} placeholder="40x30x20" className="h-11" />
          </Field>
        </div>

        <DialogFooter className="sticky bottom-0 z-10 -mx-1 bg-card/95 px-1 py-2 backdrop-blur">
          <Button
            className="h-12 w-full gap-2 text-base"
            loading={pack.isPending}
            disabled={!complete || !(weightKg > 0)}
            onClick={() =>
              pack.mutate(
                {
                  orderId: order!.id,
                  items: expected.map((e, i) => ({ sku_id: e.sku_id, batch_id: e.batch_id, qty: counted[i] })),
                  weightKg,
                  packages,
                  dimensions: dims.trim(),
                },
                { onSuccess: onClose },
              )
            }
          >
            <PackageCheck className="h-5 w-5" />
            {complete ? t("dispatch.pack") : t("dispatch.scanAll")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
