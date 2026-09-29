import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocationTag } from "@/components/common/LocationTag";
import { useReceiveTransfer, type StockTransfer } from "@/hooks/useStockTransfers";
import { useSkuLookup } from "@/hooks/useSkuLookup";

// Less than sent needs a reason and goes to a manager.
export function ReceiveTransferDialog({ transfer, onClose }: { transfer: StockTransfer | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  const receive = useReceiveTransfer();
  const [rows, setRows] = useState<Record<number, { qty: number; reason: string }>>({});
  const lines = transfer?.t_stock_transfer_lines ?? [];

  useEffect(() => {
    setRows(Object.fromEntries(lines.map((l) => [l.id, { qty: Number(l.qty), reason: "" }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transfer?.id]);

  const invalid = lines.some((l) => {
    const r = rows[l.id];
    return !r || r.qty < 0 || r.qty > Number(l.qty) || (r.qty < Number(l.qty) && !r.reason.trim());
  });

  return (
    <Dialog open={!!transfer} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("transfers.receiveTitle", { no: transfer?.transfer_no })}</DialogTitle>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {lines.map((l) => {
            const r = rows[l.id] ?? { qty: 0, reason: "" };
            const short = r.qty < Number(l.qty);
            return (
              <li key={l.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{lookup.code(l.sku_id)}</p>
                    <p className="truncate text-xs text-muted-foreground">{lookup.label(l.sku_id)}</p>
                  </div>
                  {l.from && <LocationTag code={l.from.full_code} />}
                </div>
                <div className="mt-2 grid grid-cols-[7rem_1fr] gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={Number(l.qty)}
                    step="any"
                    value={r.qty}
                    aria-label={t("transfers.qtyReceived")}
                    onChange={(e) => setRows((s) => ({ ...s, [l.id]: { ...r, qty: Number(e.target.value) } }))}
                    className="h-11"
                  />
                  <Input
                    value={r.reason}
                    disabled={!short}
                    placeholder={short ? t("transfers.reasonPlaceholder") : t("transfers.sent", { qty: Number(l.qty) })}
                    aria-label={t("transfers.reason")}
                    onChange={(e) => setRows((s) => ({ ...s, [l.id]: { ...r, reason: e.target.value } }))}
                    className="h-11"
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button
            className="h-12 w-full gap-2 text-base"
            loading={receive.isPending}
            disabled={invalid}
            onClick={() =>
              receive.mutate(
                {
                  id: transfer!.id,
                  lines: lines.map((l) => ({ line_id: l.id, qty_received: rows[l.id].qty, reason: rows[l.id].reason.trim() || undefined })),
                },
                { onSuccess: onClose },
              )
            }
          >
            <PackageCheck className="h-5 w-5" />
            {t("transfers.confirmReceive")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
