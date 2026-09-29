import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/common/Field";
import { formatBreakdown, fromBase, validateConversions, type UomConversion } from "@/lib/uom";
import type { MasterRow } from "@/hooks/useMasterList";
import { SelectField } from "@/components/common/SelectField";

export interface UnitRow {
  uom_id: number;
  factor_to_base: number;
  barcode: string;
}

export function UomConverterPanel({
  baseUomId,
  units,
  onChange,
  uoms,
}: {
  baseUomId: number;
  units: UnitRow[];
  onChange: (units: UnitRow[]) => void;
  uoms: MasterRow<"m_uoms">[];
}) {
  const { t } = useTranslation();
  const [sample, setSample] = useState(0);
  const code = (id: number) => uoms.find((u) => u.id === id)?.code ?? "?";
  const conversions: UomConversion[] = [
    { uomId: baseUomId, code: code(baseUomId), factor: 1 },
    ...units.map((u) => ({ uomId: u.uom_id, code: code(u.uom_id), factor: u.factor_to_base })),
  ];
  const errors = validateConversions(conversions, baseUomId);
  const set = (i: number, patch: Partial<UnitRow>) => onChange(units.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  const free = uoms.filter((u) => u.is_active && u.id !== baseUomId && !units.some((x) => x.uom_id === u.id));

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {t("products.uom.baseIs", { uom: code(baseUomId) })}
      </p>
      {units.map((u, i) => (
        <div key={i} className="grid grid-cols-[1fr_6rem_1fr_auto] gap-2 items-center">
          <SelectField
            value={u.uom_id}
            onChange={(e) => set(i, { uom_id: Number(e.target.value) })}
            className={selectClass}
            aria-label={t("products.uom.unit")}
          >
            {[uoms.find((x) => x.id === u.uom_id), ...free].filter(Boolean).map((x) => (
              <option key={x!.id} value={x!.id}>
                {x!.code}
              </option>
            ))}
          </SelectField>
          <Input
            type="number"
            min={2}
            step={1}
            value={u.factor_to_base}
            onChange={(e) => set(i, { factor_to_base: Number(e.target.value) })}
            aria-label={t("products.uom.factor")}
          />
          <Input
            value={u.barcode}
            onChange={(e) => set(i, { barcode: e.target.value })}
            placeholder={t("products.fields.barcode")}
            aria-label={t("products.fields.barcode")}
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange(units.filter((_, j) => j !== i))} aria-label={t("common.delete")}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!free.length}
        onClick={() => onChange([...units, { uom_id: free[0].id, factor_to_base: 12, barcode: "" }])}
        className="gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        {t("products.uom.add")}
      </Button>

      {errors.map((e) => (
        <p key={e} className="text-[11px] text-destructive">
          {t(`products.uom.errors.${e}`)}
        </p>
      ))}

      <div className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm">
        <Input
          type="number"
          min={0}
          value={sample}
          onChange={(e) => setSample(Number(e.target.value))}
          className="h-8 w-28"
          aria-label={t("products.uom.sample")}
        />
        <span className="text-muted-foreground">{code(baseUomId)} =</span>
        <span className="font-medium tabular-nums">{errors.length ? "-" : formatBreakdown(fromBase(sample, conversions))}</span>
      </div>
    </div>
  );
}
