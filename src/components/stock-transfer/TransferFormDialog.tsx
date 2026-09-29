import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useStockBalances } from "@/hooks/useStockBalances";
import { useCreateTransfer } from "@/hooks/useStockTransfers";
import { useLocations } from "@/hooks/useLocations";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { SelectField } from "@/components/common/SelectField";

type Line = { key: string; balanceId: number | null; qty: number };

export function TransferFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: warehouses = [] } = useWarehouses();
  const [fromWh, setFromWh] = useState<number | null>(null);
  const [toWh, setToWh] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const { data: balances = [] } = useStockBalances({ warehouseId: fromWh });
  const { data: locations = [] } = useLocations(fromWh);
  const lookup = useSkuLookup();
  const create = useCreateTransfer();

  useEffect(() => {
    if (!open) return;
    setFromWh(warehouses[0]?.id ?? null);
    setToWh(warehouses[1]?.id ?? null);
    setNote("");
    setLines([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = useMemo(() => {
    const code = (id: number) => locations.find((l) => l.id === id)?.full_code ?? "?";
    return balances
        .filter((b) => Number(b.qty_on_hand) - Number(b.qty_reserved) > 0)
        .filter((b) => ["storage", "picking"].includes(locations.find((l) => l.id === b.location_id)?.bin_type ?? ""))
        .map((b) => ({
          id: b.id,
          free: Number(b.qty_on_hand) - Number(b.qty_reserved),
          label: `${code(b.location_id)} · ${b.m_skus?.sku_code}${b.m_batches ? ` · ${b.m_batches.batch_no}` : ""}`,
          b,
        }));
  }, [balances, locations]);
  const bad = (l: Line) => {
    const o = options.find((x) => x.id === l.balanceId);
    return !o || !(l.qty > 0) || l.qty > o.free;
  };
  const invalid = !fromWh || !toWh || fromWh === toWh || !lines.length || lines.some(bad);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t("transfers.newInter")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("transfers.fromWarehouse")}>
            <SelectField
              value={fromWh ?? ""}
              disabled={lines.length > 0}
              onChange={(e) => setFromWh(Number(e.target.value))}
              className={selectClass}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label={t("transfers.toWarehouse")} error={fromWh === toWh ? t("transfers.sameWarehouse") : undefined}>
            <SelectField value={toWh ?? ""} onChange={(e) => setToWh(Number(e.target.value))} className={selectClass}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label={t("transfers.note")} className="sm:col-span-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <ol className="flex flex-col gap-2">
          {lines.map((l) => {
            const o = options.find((x) => x.id === l.balanceId);
            return (
              <li key={l.key} className="grid grid-cols-[1fr_6rem_auto] gap-2">
                <SelectField
                  value={l.balanceId ?? ""}
                  aria-label={t("transfers.source")}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x) =>
                        x.key === l.key ? { ...x, balanceId: Number(e.target.value), qty: options.find((p) => p.id === Number(e.target.value))?.free ?? 0 } : x,
                      ),
                    )
                  }
                  className={selectClass}
                >
                  <option value="">{t("transfers.pickSource")}</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.free})
                    </option>
                  ))}
                </SelectField>
                <Input
                  type="number"
                  min={0}
                  max={o?.free}
                  step="any"
                  value={l.qty}
                  aria-label={t("transfers.qty")}
                  aria-invalid={!!o && l.qty > o.free}
                  className={o && l.qty > o.free ? "border-destructive" : undefined}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Number(e.target.value) } : x)))}
                />
                <Button variant="ghost" size="icon" aria-label={t("common.delete")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                {o && <p className="col-span-3 -mt-1 text-xs text-muted-foreground">{lookup.label(o.b.sku_id)}</p>}
              </li>
            );
          })}
        </ol>
        <Button variant="outline" className="h-11 w-full gap-1.5 sm:w-fit" onClick={() => setLines((ls) => [...ls, { key: crypto.randomUUID(), balanceId: null, qty: 0 }])}>
          <Plus className="h-4 w-4" />
          {t("receipts.addLine")}
        </Button>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11"
            loading={create.isPending}
            disabled={invalid}
            onClick={() =>
              create.mutate(
                {
                  fromWh: fromWh!,
                  toWh: toWh!,
                  note: note.trim(),
                  lines: lines.map((l) => {
                    const b = options.find((x) => x.id === l.balanceId)!.b;
                    return { sku_id: b.sku_id, batch_id: b.batch_id, from_location_id: b.location_id, qty: l.qty };
                  }),
                },
                { onSuccess: onClose },
              )
            }
          >
            {t("transfers.saveDraft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
