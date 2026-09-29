import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/common/Field";
import { LocationTag } from "@/components/common/LocationTag";
import { BatchTag } from "@/components/common/BatchTag";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useLocations, type Location } from "@/hooks/useLocations";
import { useCountLines, useCountReview, useRecordCount, useSubmitCount, type StockCount } from "@/hooks/useStockCounts";
import { useBatches } from "@/hooks/useBatches";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { resolveBarcode } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/common/SelectField";
import { QueryState } from "@/components/common/QueryState";

// Blind count: the system quantity is never sent to this screen.
const NO_LINES: never[] = [];

export function CountSheet({ count }: { count: StockCount }) {
  const { t } = useTranslation();
  const linesQ = useCountLines(count.id);
  const lines = linesQ.data ?? NO_LINES;
  const { data: locations = [] } = useLocations(count.warehouse_id);
  const { data: review = [] } = useCountReview(count.id, !count.blind);
  const lookup = useSkuLookup();
  const record = useRecordCount();
  const submit = useSubmitCount();
  const [bin, setBin] = useState<Location | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [found, setFound] = useState<{ skuId: number; batchId: number | null; qty: string } | null>(null);
  const { data: batches = [] } = useBatches(found?.skuId ?? null);

  // Not Map.groupBy: older Android WebViews in warehouses lack it.
  const byBin = useMemo(() => {
    const m = new Map<number, typeof lines>();
    for (const l of lines) m.set(l.location_id, [...(m.get(l.location_id) ?? []), l]);
    return m;
  }, [lines]);
  const counted = lines.filter((l) => l.counted_qty != null).length;
  const systemOf = (lineId: number) => review.find((r) => r.line_id === lineId)?.system_qty;
  const code = (id: number) => locations.find((l) => l.id === id)?.full_code ?? "?";

  function onScanBin(c: string) {
    const b = locations.find((l) => l.full_code === c.toUpperCase() && l.level === "bin");
    scanFeedback(!!b);
    if (!b) return toast.error(t("putaway.unknownBin", { code: c }));
    if (!b.is_counting) return toast.error(t("counts.binNotInCount", { code: b.full_code }));
    setBin(b);
    setFound(null);
  }

  function onScanItem(c: string) {
    const hit = resolveBarcode(lookup.products, c);
    scanFeedback(!!hit);
    if (!hit) return toast.error(t("scanner.unknown", { code: c }));
    const existing = (byBin.get(bin!.id) ?? []).find((l) => l.sku_id === hit.skuId);
    if (existing && !lookup.get(hit.skuId)?.sku.track_batch) {
      // Known line: bump its count by what was scanned (a box counts as its content).
      const cur = Number(drafts[existing.id] ?? existing.counted_qty ?? 0);
      return setDrafts((d) => ({ ...d, [existing.id]: String(cur + hit.factor) }));
    }
    setFound({ skuId: hit.skuId, batchId: null, qty: String(hit.factor) });
  }

  const save = (skuId: number, batchId: number | null, qty: string, lineId?: number) =>
    record.mutate(
      { countId: count.id, locationId: bin!.id, skuId, batchId, qty: Number(qty) },
      {
        onSuccess: () => {
          if (lineId) setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => Number(k) !== lineId)));
          else setFound(null);
        },
      },
    );

  const saving = (skuId: number, batchId: number | null) =>
    record.isPending && record.variables?.skuId === skuId && record.variables.batchId === batchId;

  return (
    <QueryState query={linesQ}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between text-sm">
          <span>{t("counts.progress", { done: counted, total: lines.length })}</span>
          {count.blind && <span className="text-xs text-muted-foreground">{t("counts.blindOn")}</span>}
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary" style={{ width: `${(counted / Math.max(1, lines.length)) * 100}%` }} />
        </div>

        <ScanInput key={bin?.id ?? "bin"} placeholder={bin ? t("counts.scanItem") : t("counts.scanBin")} onScan={bin ? onScanItem : onScanBin} />

        {bin && (
          <section className="flex flex-col gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <LocationTag code={bin.full_code} className="text-sm" />
              <Button variant="ghost" size="sm" onClick={() => setBin(null)}>
                {t("counts.otherBin")}
              </Button>
            </div>
            {(byBin.get(bin.id) ?? []).map((l) => {
              const value = drafts[l.id] ?? (l.counted_qty != null ? String(Number(l.counted_qty)) : "");
              const dirty = drafts[l.id] != null;
              const sys = systemOf(l.id);
              return (
                <div key={l.id} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 rounded-lg bg-card p-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm">{lookup.code(l.sku_id)}</p>
                    <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                      {l.m_batches && <BatchTag batchNo={l.m_batches.batch_no} expiry={l.m_batches.expiry_date} />}
                      {sys != null && <span>{t("counts.system", { qty: Number(sys) })}</span>}
                    </div>
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={value}
                    aria-label={t("counts.counted")}
                    onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                    className={cn("h-11 text-base", l.counted_qty != null && !dirty && "border-emerald-500/50")}
                  />
                  <Button
                    size="icon"
                    className="h-11 w-11"
                    variant={dirty ? "default" : "outline"}
                    loading={saving(l.sku_id, l.batch_id)}
                    disabled={value === "" || record.isPending}
                    onClick={() => save(l.sku_id, l.batch_id, value, l.id)}
                    aria-label={t("common.save")}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
            {!(byBin.get(bin.id) ?? []).length && <p className="text-xs text-muted-foreground">{t("counts.binExpectedEmpty")}</p>}

            {found && (
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-500/60 p-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("counts.foundItem", { sku: lookup.code(found.skuId) })}</p>
                {lookup.get(found.skuId)?.sku.track_batch && (
                  <Field label={t("receipts.fields.batch")}>
                    <SelectField
                      value={found.batchId ?? ""}
                      onChange={(e) => setFound({ ...found, batchId: Number(e.target.value) || null })}
                      className={selectClass}
                    >
                      <option value="">-</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batch_no}
                          {b.expiry_date ? ` · ${b.expiry_date}` : ""}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                )}
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={found.qty}
                    onChange={(e) => setFound({ ...found, qty: e.target.value })}
                    aria-label={t("counts.counted")}
                    className="h-11"
                  />
                  <Button
                    className="h-11"
                    loading={saving(found.skuId, found.batchId)}
                    disabled={record.isPending || (!!lookup.get(found.skuId)?.sku.track_batch && !found.batchId)}
                    onClick={() => save(found.skuId, found.batchId, found.qty)}
                  >
                    {t("counts.addFound")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}

        <details className="rounded-lg border border-border text-sm">
          <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">{t("counts.allLines")}</summary>
          <ul className="divide-y divide-border">
            {[...byBin].map(([locId, ls]) => (
              <li key={locId} className="flex items-center justify-between gap-2 px-3 py-2">
                <button type="button" onClick={() => setBin(locations.find((l) => l.id === locId) ?? null)}>
                  <LocationTag code={code(locId)} />
                </button>
                <span className="text-xs text-muted-foreground">
                  {ls.filter((l) => l.counted_qty != null).length}/{ls.length}
                </span>
              </li>
            ))}
          </ul>
        </details>

        <Button className="sticky bottom-4 z-10 h-12 gap-2 text-base shadow-md" loading={submit.isPending} disabled={counted < lines.length} onClick={() => submit.mutate(count.id)}>
          <Send className="h-5 w-5" />
          {counted < lines.length ? t("counts.countAllFirst", { left: lines.length - counted }) : t("counts.submit")}
        </Button>
      </div>
    </QueryState>
  );
}
