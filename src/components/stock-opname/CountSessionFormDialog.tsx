import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { MultiSelectPopover } from "@/components/ui/multi-select-popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useLocations } from "@/hooks/useLocations";
import { useCategories } from "@/hooks/useCategories";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useCreateCount } from "@/hooks/useStockCounts";
import { SelectField } from "@/components/common/SelectField";

export function CountSessionFormDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const { t } = useTranslation();
  const { data: warehouses = [] } = useWarehouses();
  const { data: categories = [] } = useCategories();
  const filterWh = useWarehouseFilter();
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const { data: locations = [] } = useLocations(warehouseId);
  const [scope, setScope] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [blind, setBlind] = useState(true);
  const [note, setNote] = useState("");
  const create = useCreateCount();

  useEffect(() => {
    if (!open) return;
    setWarehouseId(filterWh ?? warehouses[0]?.id ?? null);
    setScope([]);
    setCategoryId(null);
    setBlind(true);
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("counts.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label={t("receipts.fields.warehouse")}>
            <SelectField
              value={warehouseId ?? ""}
              onChange={(e) => {
                setWarehouseId(Number(e.target.value));
                setScope([]);
              }}
              className={selectClass}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("counts.scope")}</span>
            <MultiSelectPopover
              options={locations.filter((l) => l.level !== "bin").map((l) => ({ value: l.id, label: l.full_code }))}
              selected={scope}
              onChange={setScope}
              placeholder={t("counts.wholeWarehouse")}
            />
          </div>
          <Field label={t("counts.category")}>
            <SelectField value={categoryId ?? ""} onChange={(e) => setCategoryId(Number(e.target.value) || null)} className={selectClass}>
              <option value="">{t("products.allCategories")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <Switch checked={blind} onCheckedChange={setBlind} />
            <span>
              {t("counts.blind")}
              <span className="block text-xs text-muted-foreground">{t("counts.blindHint")}</span>
            </span>
          </label>
          <Field label={t("transfers.note")}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("counts.notePlaceholder")} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="h-11"
            loading={create.isPending}
            disabled={!warehouseId}
            onClick={() =>
              create.mutate(
                { warehouseId: warehouseId!, scope, categoryId, blind, note: note.trim() },
                { onSuccess: (id) => onCreated(id as number) },
              )
            }
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
