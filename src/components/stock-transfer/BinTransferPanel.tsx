import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/common/Field";
import { LocationTag } from "@/components/common/LocationTag";
import { BatchTag } from "@/components/common/BatchTag";
import { QtyWithUom } from "@/components/common/QtyWithUom";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useLocations, type Location } from "@/hooks/useLocations";
import { useStockBalances } from "@/hooks/useStockBalances";
import { useBinTransfer } from "@/hooks/useStockTransfers";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";

export function BinTransferPanel({ warehouseId }: { warehouseId: number }) {
  const { t } = useTranslation();
  const { data: locations = [] } = useLocations(warehouseId);
  const { data: balances = [] } = useStockBalances({ warehouseId });
  const lookup = useSkuLookup();
  const move = useBinTransfer();
  const [from, setFrom] = useState<Location | null>(null);
  const [balanceId, setBalanceId] = useState<number | null>(null);
  const [to, setTo] = useState<Location | null>(null);
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");

  // Receiving, staging and in-transit stock belongs to a task, shipment or transfer (the RPC refuses them too).
  const findBin = (code: string, types: string[]) =>
    locations.find((l) => l.full_code === code.toUpperCase() && l.level === "bin" && types.includes(l.bin_type ?? ""));
  const inBin = balances.filter((b) => b.location_id === from?.id && Number(b.qty_on_hand) - Number(b.qty_reserved) > 0);
  const chosen = inBin.find((b) => b.id === balanceId);
  const free = chosen ? Number(chosen.qty_on_hand) - Number(chosen.qty_reserved) : 0;

  function reset() {
    setFrom(null);
    setBalanceId(null);
    setTo(null);
    setQty(0);
    setNote("");
  }

  return (
    <div className="flex flex-col gap-3">
      {!from ? (
        <ScanInput
          placeholder={t("transfers.scanFrom")}
          onScan={(code) => {
            const bin = findBin(code, ["storage", "picking", "quarantine"]);
            scanFeedback(!!bin);
            if (!bin) return toast.error(t("putaway.unknownBin", { code }));
            setFrom(bin);
          }}
        />
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">{t("transfers.from")}</span>
          <LocationTag code={from.full_code} />
          <Button variant="ghost" size="sm" onClick={reset}>
            {t("transfers.change")}
          </Button>
        </div>
      )}

      {from && (
        <ul className="flex flex-col gap-2">
          {inBin.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => {
                  setBalanceId(b.id);
                  setQty(Number(b.qty_on_hand) - Number(b.qty_reserved));
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left",
                  balanceId === b.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
                )}
              >
                <span className="min-w-0">
                  <span className="block font-mono text-sm">{b.m_skus?.sku_code}</span>
                  {b.m_batches && <BatchTag batchNo={b.m_batches.batch_no} expiry={b.m_batches.expiry_date} />}
                </span>
                <QtyWithUom qty={Number(b.qty_on_hand) - Number(b.qty_reserved)} conversions={lookup.conversions(b.sku_id)} />
              </button>
            </li>
          ))}
          {!inBin.length && <p className="text-sm text-muted-foreground">{t("transfers.binEmpty")}</p>}
        </ul>
      )}

      {chosen && (
        <>
          <Field label={t("transfers.qty")} hint={t("putaway.remaining", { qty: free })}>
            <Input type="number" inputMode="decimal" min={0} max={free} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-11" />
          </Field>
          <ArrowDown className="mx-auto h-5 w-5 text-muted-foreground" />
          {to ? (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">{t("transfers.to")}</span>
              <LocationTag code={to.full_code} />
              <Button variant="ghost" size="sm" onClick={() => setTo(null)}>
                {t("transfers.change")}
              </Button>
            </div>
          ) : (
            <ScanInput
              autoFocus={false}
              placeholder={t("transfers.scanTo")}
              onScan={(code) => {
                const bin = findBin(code, ["storage", "picking"]);
                const ok = !!bin && bin.id !== from!.id;
                scanFeedback(ok);
                if (!ok) return toast.error(t("putaway.unknownBin", { code }));
                setTo(bin!);
              }}
            />
          )}
          <Field label={t("transfers.note")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-11" />
          </Field>
          <Button
            className="h-12 gap-2 text-base"
            loading={move.isPending}
            disabled={!to || !(qty > 0) || qty > free}
            onClick={() =>
              move.mutate(
                { fromId: from!.id, toId: to!.id, skuId: chosen.sku_id, batchId: chosen.batch_id, qty, note: note.trim() },
                { onSuccess: reset },
              )
            }
          >
            <Check className="h-5 w-5" />
            {t("transfers.move")}
          </Button>
        </>
      )}
    </div>
  );
}
