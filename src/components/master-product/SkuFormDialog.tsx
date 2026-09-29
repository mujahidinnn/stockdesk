import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { UomConverterPanel, type UnitRow } from "./UomConverterPanel";
import { useUoms } from "@/hooks/useUoms";
import { useAddSku, useSaveSkuUoms, useUpdateSku, type Product, type Sku } from "@/hooks/useProducts";
import { validateConversions } from "@/lib/uom";
import { isValidEan13 } from "@/lib/barcode";
import { SelectField } from "@/components/common/SelectField";

const num = z.coerce.number().min(0);
const optNum = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).nullable());
const schema = z.object({
  sku_code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]*$/, "A-Z, 0-9, _ -")),
  // A 13-digit barcode is an EAN-13, so its check digit must match (catches typos).
  barcode: z.string().trim().max(64).refine((v) => !/^\d{13}$/.test(v) || isValidEan13(v), "EAN-13 check digit"),
  base_uom_id: z.coerce.number().int().positive(),
  track_batch: z.boolean(),
  track_expiry: z.boolean(),
  safety_stock: num,
  reorder_point: num,
  reorder_qty: num,
  weight_kg: optNum,
  length_cm: optNum,
  width_cm: optNum,
  height_cm: optNum,
  is_active: z.boolean(),
  attributes: z.record(z.string(), z.string()),
});
type FormIn = z.input<typeof schema>;

export function SkuFormDialog({
  product,
  sku,
  open,
  onOpenChange,
}: {
  product: Product | null;
  sku: Sku | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: uoms = [] } = useUoms();
  const add = useAddSku();
  const update = useUpdateSku();
  const saveUnits = useSaveSkuUoms();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const form = useForm<FormIn>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (!open || !product) return;
    const attrs = Object.fromEntries(
      product.variant_attributes.map((a) => [a, String((sku?.attributes as Record<string, unknown>)?.[a] ?? "")]),
    );
    form.reset({
      sku_code: sku?.sku_code ?? `${product.code}-`,
      barcode: sku?.barcode ?? "",
      base_uom_id: sku?.base_uom_id ?? uoms.find((u) => u.code === "PCS")?.id ?? uoms[0]?.id,
      track_batch: sku?.track_batch ?? false,
      track_expiry: sku?.track_expiry ?? false,
      safety_stock: sku?.safety_stock ?? 0,
      reorder_point: sku?.reorder_point ?? 0,
      reorder_qty: sku?.reorder_qty ?? 0,
      weight_kg: sku?.weight_kg ?? "",
      length_cm: sku?.length_cm ?? "",
      width_cm: sku?.width_cm ?? "",
      height_cm: sku?.height_cm ?? "",
      is_active: sku?.is_active ?? true,
      attributes: attrs,
    });
    setUnits(
      (sku?.m_sku_uoms ?? [])
        .filter((u) => u.uom_id !== sku?.base_uom_id)
        .sort((a, b) => a.factor_to_base - b.factor_to_base)
        .map((u) => ({ uom_id: u.uom_id, factor_to_base: u.factor_to_base, barcode: u.barcode ?? "" })),
    );
  }, [open, product, sku, uoms, form]);

  const baseUomId = Number(form.watch("base_uom_id"));
  const trackExpiry = form.watch("track_expiry");
  const unitsInvalid =
    validateConversions(
      [{ uomId: baseUomId, code: "", factor: 1 }, ...units.map((u) => ({ uomId: u.uom_id, code: "", factor: u.factor_to_base }))],
      baseUomId,
    ).length > 0;

  const submit = form.handleSubmit(async (raw) => {
    if (!product) return;
    const v = schema.parse(raw);
    const values = {
      barcode: v.barcode || null,
      track_batch: v.track_batch || v.track_expiry,
      track_expiry: v.track_expiry,
      safety_stock: v.safety_stock,
      reorder_point: v.reorder_point,
      reorder_qty: v.reorder_qty,
      weight_kg: v.weight_kg,
      length_cm: v.length_cm,
      width_cm: v.width_cm,
      height_cm: v.height_cm,
      is_active: v.is_active,
      attributes: v.attributes,
    };
    if (!sku) {
      add.mutate(
        { ...values, product_id: product.id, sku_code: v.sku_code, base_uom_id: v.base_uom_id },
        { onSuccess: () => onOpenChange(false) },
      );
      return;
    }
    await update.mutateAsync({ id: sku.id, values });
    await saveUnits.mutateAsync({
      sku,
      units: units.map((u) => ({ ...u, barcode: u.barcode.trim() || null })),
    });
    onOpenChange(false);
  });

  const pending = add.isPending || update.isPending || saveUnits.isPending;
  const numberField = (name: "safety_stock" | "reorder_point" | "reorder_qty" | "weight_kg" | "length_cm" | "width_cm" | "height_cm") => (
    <Field key={name} label={t(`products.fields.${name}`)} error={errors[name]?.message}>
      <Input type="number" min={0} step="any" {...form.register(name)} />
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {sku ? sku.sku_code : t("products.addSku", { product: product?.name })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("products.fields.skuCode")} error={errors.sku_code?.message}>
              <Input {...form.register("sku_code")} disabled={!!sku} className="uppercase font-mono" />
            </Field>
            <Field label={t("products.fields.barcode")} error={errors.barcode?.message}>
              <Input {...form.register("barcode")} inputMode="numeric" />
            </Field>
            <Field label={t("products.fields.baseUom")} hint={sku ? t("products.baseUomLocked") : undefined}>
              <SelectField value={form.watch("base_uom_id") ?? ""} onChange={(e) => form.setValue("base_uom_id", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} disabled={!!sku} className={selectClass}>
                {uoms.filter((u) => u.is_active || u.id === sku?.base_uom_id).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code}
                  </option>
                ))}
              </SelectField>
            </Field>
            {product?.variant_attributes.map((a) => (
              <Field key={a} label={a}>
                <Input {...form.register(`attributes.${a}`)} />
              </Field>
            ))}
            {numberField("safety_stock")}
            {numberField("reorder_point")}
            {numberField("reorder_qty")}
            {numberField("weight_kg")}
            {numberField("length_cm")}
            {numberField("width_cm")}
            {numberField("height_cm")}
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={form.watch("track_batch") || trackExpiry}
                disabled={trackExpiry}
                onCheckedChange={(v) => form.setValue("track_batch", v === true)}
              />
              {t("products.fields.trackBatch")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={trackExpiry} onCheckedChange={(v) => form.setValue("track_expiry", v === true)} />
              {t("products.fields.trackExpiry")}
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v === true)} />
              {t("common.active")}
            </label>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t("products.uom.title")}</h3>
            {sku ? (
              <UomConverterPanel baseUomId={baseUomId} units={units} onChange={setUnits} uoms={uoms} />
            ) : (
              <p className="text-xs text-muted-foreground">{t("products.uom.afterSave")}</p>
            )}
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={pending} disabled={!!sku && unitsInvalid}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
