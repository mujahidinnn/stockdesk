import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelectPopover } from "@/components/ui/multi-select-popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { useCreateLocation, useUpdateLocation, type Location } from "@/hooks/useLocations";
import { useCategories } from "@/hooks/useCategories";
import { SelectField } from "@/components/common/SelectField";

export type LocationLevel = "zone" | "aisle" | "rack" | "bin";
export const BIN_TYPES = ["storage", "picking", "receiving", "staging", "dispatch", "quarantine", "in_transit"] as const;

const optNum = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().positive().nullable());
const schema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,12}$/, "A-Z, 0-9")),
  bin_type: z.enum(BIN_TYPES),
  max_qty: optNum,
  max_weight_kg: optNum,
  pick_sequence: z.coerce.number().int().min(0),
  allowed_category_ids: z.array(z.number()),
  is_active: z.boolean(),
});
type FormIn = z.input<typeof schema>;

export function BinFormDialog({
  warehouseId,
  location,
  parent,
  level,
  open,
  onOpenChange,
}: {
  warehouseId: number;
  location: Location | null;
  parent: Location | null;
  level: LocationLevel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const form = useForm<FormIn>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;
  const isBin = level === "bin";

  useEffect(() => {
    if (open)
      form.reset({
        code: location?.code ?? "",
        bin_type: (location?.bin_type as FormIn["bin_type"]) ?? "storage",
        max_qty: location?.max_qty ?? "",
        max_weight_kg: location?.max_weight_kg ?? "",
        pick_sequence: location?.pick_sequence ?? 0,
        allowed_category_ids: location?.allowed_category_ids ?? [],
        is_active: location?.is_active ?? true,
      });
  }, [open, location, form]);

  const submit = form.handleSubmit((raw) => {
    const v = schema.parse(raw);
    const values = isBin
      ? v
      : { code: v.code, is_active: v.is_active, pick_sequence: v.pick_sequence };
    const close = { onSuccess: () => onOpenChange(false) };
    if (location) update.mutate({ id: location.id, values }, close);
    else create.mutate({ ...values, warehouse_id: warehouseId, parent_id: parent?.id ?? null, level }, close);
  });

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {location ? location.full_code : t("warehouses.addNode", { level: t(`warehouses.levels.${level}`) })}
          </DialogTitle>
          {parent && !location && <p className="text-xs text-muted-foreground font-mono">{parent.full_code}-…</p>}
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={t("warehouses.fields.code")} error={errors.code?.message}>
            <Input {...form.register("code")} className="uppercase font-mono" autoFocus />
          </Field>
          {isBin && (
            <>
              <Field label={t("warehouses.fields.binType")}>
                <SelectField value={form.watch("bin_type") ?? ""} onChange={(e) => form.setValue("bin_type", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} className={selectClass}>
                  {BIN_TYPES.filter((b) => parent || !["storage", "picking"].includes(b)).map((b) => (
                    <option key={b} value={b}>
                      {t(`warehouses.binTypes.${b}`)}
                    </option>
                  ))}
                </SelectField>
              </Field>
              <Field label={t("warehouses.fields.maxQty")} error={errors.max_qty?.message}>
                <Input type="number" min={0} step="any" {...form.register("max_qty")} />
              </Field>
              <Field label={t("warehouses.fields.maxWeight")} error={errors.max_weight_kg?.message}>
                <Input type="number" min={0} step="any" {...form.register("max_weight_kg")} />
              </Field>
              <Field label={t("warehouses.fields.pickSequence")} hint={t("warehouses.pickSequenceHint")}>
                <Input type="number" min={0} {...form.register("pick_sequence")} />
              </Field>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{t("warehouses.fields.categories")}</span>
                <MultiSelectPopover
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  selected={form.watch("allowed_category_ids")}
                  onChange={(ids) => form.setValue("allowed_category_ids", ids)}
                  placeholder={t("warehouses.anyCategory")}
                />
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <Checkbox checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v === true)} />
            {t("common.active")}
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
