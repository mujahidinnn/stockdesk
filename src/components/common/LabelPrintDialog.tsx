import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { printLabels, type LabelItem, type LabelKind, type LabelPaper } from "@/lib/labels";
import { SelectField } from "@/components/common/SelectField";

/** Shared by SKU and bin labels: choose barcode or QR and how many copies of each. */
export function LabelPrintDialog({
  items,
  open,
  onOpenChange,
  defaultKind,
  fileName,
}: {
  items: LabelItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: LabelKind;
  fileName: string;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<LabelKind>(defaultKind);
  const [paper, setPaper] = useState<LabelPaper>("a4");
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      await printLabels(items.flatMap((i) => Array(copies).fill(i)), kind, fileName, paper);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{t("labels.title", { count: items.length })}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={t("labels.kind")}>
            <SelectField value={kind} onChange={(e) => setKind(e.target.value as LabelKind)} className={selectClass}>
              <option value="barcode">{t("labels.barcode")}</option>
              <option value="qr">{t("labels.qr")}</option>
            </SelectField>
          </Field>
          <Field label={t("labels.paper")}>
            <SelectField value={paper} onChange={(e) => setPaper(e.target.value as LabelPaper)} className={selectClass}>
              <option value="a4">{t("labels.paperA4")}</option>
              <option value="thermal">{t("labels.paperThermal")}</option>
            </SelectField>
          </Field>
          <Field label={t("labels.copies")} hint={paper === "a4" ? t("labels.sheetHint") : undefined}>
            <Input type="number" min={1} max={50} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={print} loading={busy} disabled={!items.length} className="gap-1.5">
            <Printer className="w-4 h-4" />
            {t("labels.print")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
