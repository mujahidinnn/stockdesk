import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/common/Field";
import { LocationTag } from "@/components/common/LocationTag";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useCompletePutaway, usePutawaySuggestions, type PutawayTask } from "@/hooks/usePutawayTasks";
import type { Location } from "@/hooks/useLocations";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";

/** One task: pick or scan the destination bin, confirm the quantity. */
export function PutawaySuggestion({
  task,
  title,
  locations,
  onClose,
}: {
  task: PutawayTask | null;
  title: string;
  locations: Location[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const remaining = task ? Number(task.qty) - Number(task.qty_done) : 0;
  const [qty, setQty] = useState(remaining);
  const [binId, setBinId] = useState<number | null>(null);
  const { data: suggestions = [], isFetching } = usePutawaySuggestions(task, qty);
  const complete = useCompletePutaway();
  // Same id until the task changes, so clicking again after a timeout cannot move stock twice.
  const requestId = useMemo(() => crypto.randomUUID(), [task?.id, task?.qty_done]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setQty(remaining);
    setBinId(task?.suggested_location_id ?? null);
  }, [task, remaining]);

  const chosen = locations.find((l) => l.id === binId);
  const offList = binId != null && !suggestions.some((s) => s.location_id === binId);

  function onScanBin(code: string) {
    const bin = locations.find(
      (l) => l.full_code === code.toUpperCase() && l.level === "bin" && (l.bin_type === "storage" || l.bin_type === "picking"),
    );
    scanFeedback(!!bin);
    if (!bin) return toast.error(t("putaway.unknownBin", { code }));
    setBinId(bin.id);
  }

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        <Field label={t("putaway.qty")} hint={t("putaway.remaining", { qty: remaining })}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            max={remaining}
            step="any"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            className="h-11 text-base"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t("putaway.suggestions")}</p>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : suggestions.length ? (
            <ul className="grid gap-2">
              {suggestions.map((s) => (
                <li key={s.location_id}>
                  <button
                    type="button"
                    onClick={() => setBinId(s.location_id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-3 text-left",
                      binId === s.location_id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50",
                    )}
                  >
                    <LocationTag code={s.full_code} />
                    <span className="text-xs text-muted-foreground">
                      {t(`putaway.rank.${s.rank}`)}
                      {s.free_qty != null && ` · ${t("putaway.free", { qty: Number(s.free_qty) })}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t("putaway.noSuggestion")}</p>
          )}
        </div>

        <ScanInput onScan={onScanBin} placeholder={t("putaway.scanBin")} autoFocus={false} />

        {chosen && (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t("putaway.target")} <LocationTag code={chosen.full_code} />
            {offList && (
              <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("putaway.offList")}
              </span>
            )}
          </p>
        )}

        <DialogFooter className="sticky bottom-0 z-10 -mx-1 bg-card/95 px-1 py-2 backdrop-blur">
          <Button
            className="h-12 w-full gap-2 text-base"
            loading={complete.isPending}
            disabled={!binId || !(qty > 0) || qty > remaining}
            onClick={() => complete.mutate({ taskId: task!.id, locationId: binId!, qty, requestId }, { onSuccess: onClose })}
          >
            <Check className="h-5 w-5" />
            {t("putaway.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
