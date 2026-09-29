import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { useGenerateBins } from "@/hooks/useLocations";
import { expandRange } from "@/lib/locations";
import { SelectField } from "@/components/common/SelectField";

export function BinGeneratorDialog({
  warehouseId,
  open,
  onOpenChange,
}: {
  warehouseId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const generate = useGenerateBins();
  const [zone, setZone] = useState("A");
  const [aisles, setAisles] = useState("01-04");
  const [racks, setRacks] = useState(10);
  const [levels, setLevels] = useState("A-D");
  const [binType, setBinType] = useState<"storage" | "picking">("storage");
  const [maxQty, setMaxQty] = useState("");
  const [maxWeight, setMaxWeight] = useState("");

  let parsed: { aisles: string[]; levels: string[] } | null = null;
  let error: string | null = null;
  try {
    parsed = { aisles: expandRange(aisles), levels: expandRange(levels) };
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const total = parsed ? parsed.aisles.length * racks * parsed.levels.length : 0;
  const tooBig = !parsed || !parsed.aisles.length || !parsed.levels.length || racks < 1 || racks > 99 || parsed.aisles.length > 52 || parsed.levels.length > 26;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || tooBig) return;
    generate.mutate(
      {
        warehouseId,
        zone: zone.trim().toUpperCase(),
        aisles: parsed.aisles,
        racks,
        levels: parsed.levels,
        binType,
        maxQty: maxQty ? Number(maxQty) : null,
        maxWeightKg: maxWeight ? Number(maxWeight) : null,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("warehouses.generator.title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t("warehouses.generator.zone")}>
            <Input value={zone} onChange={(e) => setZone(e.target.value)} className="uppercase font-mono" required />
          </Field>
          <Field label={t("warehouses.generator.aisles")} hint={t("warehouses.generator.rangeHint")}>
            <Input value={aisles} onChange={(e) => setAisles(e.target.value)} className="uppercase font-mono" required />
          </Field>
          <Field label={t("warehouses.generator.racks")}>
            <Input type="number" min={1} max={99} value={racks} onChange={(e) => setRacks(Number(e.target.value))} />
          </Field>
          <Field label={t("warehouses.generator.levels")} hint={t("warehouses.generator.rangeHint")}>
            <Input value={levels} onChange={(e) => setLevels(e.target.value)} className="uppercase font-mono" required />
          </Field>
          <Field label={t("warehouses.fields.binType")}>
            <SelectField value={binType} onChange={(e) => setBinType(e.target.value as "storage" | "picking")} className={selectClass}>
              <option value="storage">{t("warehouses.binTypes.storage")}</option>
              <option value="picking">{t("warehouses.binTypes.picking")}</option>
            </SelectField>
          </Field>
          <Field label={t("warehouses.fields.maxQty")}>
            <Input type="number" min={0} step="any" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
          </Field>
          <Field label={t("warehouses.fields.maxWeight")}>
            <Input type="number" min={0} step="any" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} />
          </Field>
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            {error ??
              t("warehouses.generator.preview", {
                total,
                example: parsed?.aisles[0] && parsed.levels[0] ? `${zone.toUpperCase()}-${parsed.aisles[0]}-01-${parsed.levels[0]}` : "-",
              })}
          </p>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={generate.isPending} disabled={tooBig}>
              {t("warehouses.generator.run")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
