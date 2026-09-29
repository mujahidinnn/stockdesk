import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { MAX_IMPORT_BYTES, PRODUCT_COLUMNS, readSheet, validateProductRows, type ImportRow, type ImportRowError } from "@/lib/productSheet";
import { errorMessage } from "@/lib/errorMessage";

// One transaction: any bad row blocks the whole import.
export function ProductImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [result, setResult] = useState<{ valid: ImportRow[]; errors: ImportRowError[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = (v: boolean) => {
    if (busy) return;
    onOpenChange(v);
    if (!v) setResult(null);
  };

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setResult({ valid: [], errors: [{ row: 0, message: t("products.import.tooBig") }] });
    setBusy(true);
    try {
      setResult(validateProductRows(await readSheet(file)));
    } catch {
      setResult({ valid: [], errors: [{ row: 0, message: t("products.import.unreadable") }] });
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("import_products", { p_rows: result.valid as unknown as Json });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    qc.invalidateQueries({ queryKey: ["products"] });
    toast.success(t("products.import.done", { count: data }));
    close(false);
  }

  const ok = result && !result.errors.length && result.valid.length > 0;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("products.import.title")}</DialogTitle>
          <DialogDescription className="text-xs">{t("products.import.desc", { columns: PRODUCT_COLUMNS.slice(0, 7).join(", ") })}</DialogDescription>
        </DialogHeader>
        {!result ? (
          <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50">
            {busy ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{t("products.import.choose")}</span>
            <input type="file" accept=".xlsx" className="hidden" disabled={busy} onChange={pick} />
          </label>
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            {result.valid.length > 0 && (
              <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {t("products.import.validRows", { count: result.valid.length })}
              </p>
            )}
            {result.errors.length > 0 && (
              <>
                <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {t("products.import.fixFirst", { count: result.errors.length })}
                </p>
                <ul className="max-h-40 overflow-y-auto px-1 text-muted-foreground">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.row ? t("products.import.rowError", { row: e.row, message: e.message }) : e.message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => (result ? setResult(null) : close(false))} disabled={busy}>
            {result ? t("products.import.another") : t("common.cancel")}
          </Button>
          {ok && (
            <Button onClick={confirm} loading={busy}>
              {busy ? t("common.saving") : t("products.import.confirm", { count: result.valid.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
