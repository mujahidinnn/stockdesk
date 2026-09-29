import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { VariantMatrixGenerator } from "./VariantMatrixGenerator";
import { buildVariants, type VariantAxis } from "@/lib/variants";
import { useCategories } from "@/hooks/useCategories";
import { useOwners } from "@/hooks/useOwners";
import { useUoms } from "@/hooks/useUoms";
import { useCreateProduct, useUpdateProduct, type Product } from "@/hooks/useProducts";
import { SelectField } from "@/components/common/SelectField";

const qty = z.coerce.number().min(0);
const schema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_]*$/, "A-Z, 0-9, _")),
  name: z.string().trim().min(1).max(160),
  category_id: z.coerce.number().int().positive().nullable().catch(null),
  owner_id: z.coerce.number().int().positive(),
  description: z.string().trim().max(1000).optional(),
  is_active: z.boolean(),
  base_uom_id: z.coerce.number().int().positive(),
  track_batch: z.boolean(),
  track_expiry: z.boolean(),
  safety_stock: qty,
  reorder_point: qty,
  reorder_qty: qty,
});
type FormIn = z.input<typeof schema>;

export function ProductFormDialog({
  product,
  open,
  onOpenChange,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: categories = [] } = useCategories();
  const { data: owners = [] } = useOwners();
  const { data: uoms = [] } = useUoms();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [axes, setAxes] = useState<VariantAxis[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const form = useForm<FormIn>({ resolver: zodResolver(schema) });
  const isNew = !product;

  useEffect(() => {
    if (!open) return;
    form.reset({
      code: product?.code ?? "",
      name: product?.name ?? "",
      category_id: product?.category_id ?? null,
      owner_id: product?.owner_id ?? owners.find((o) => o.owner_type === "in_house")?.id ?? owners[0]?.id,
      description: product?.description ?? "",
      is_active: product?.is_active ?? true,
      base_uom_id: uoms.find((u) => u.code === "PCS")?.id ?? uoms[0]?.id,
      track_batch: false,
      track_expiry: false,
      safety_stock: 0,
      reorder_point: 0,
      reorder_qty: 0,
    });
    setAxes(isNew ? [{ name: "color", values: [] }, { name: "size", values: [] }] : []);
    setExcluded(new Set());
  }, [open, product, owners, uoms, form, isNew]);

  const trackExpiry = form.watch("track_expiry");
  const errors = form.formState.errors;

  const submit = form.handleSubmit((raw) => {
    const v = schema.parse(raw);
    const header = {
      code: v.code,
      name: v.name,
      category_id: v.category_id,
      owner_id: v.owner_id,
      description: v.description || null,
      is_active: v.is_active,
    };
    const close = { onSuccess: () => onOpenChange(false) };
    if (product) return update.mutate({ id: product.id, values: header }, close);

    const combos = buildVariants(v.code, axes).filter((c) => !excluded.has(c.skuCode));
    create.mutate(
      {
        product: { ...header, variant_attributes: Object.keys(combos[0]?.attributes ?? {}) },
        skus: combos.map((c) => ({
          sku_code: c.skuCode,
          attributes: c.attributes,
          base_uom_id: v.base_uom_id,
          // Expiry is recorded per batch, so it implies batch tracking.
          track_batch: v.track_batch || v.track_expiry,
          track_expiry: v.track_expiry,
          safety_stock: v.safety_stock,
          reorder_point: v.reorder_point,
          reorder_qty: v.reorder_qty,
        })),
      },
      close,
    );
  });

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{isNew ? t("products.new") : t("products.edit")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("products.fields.code")} error={errors.code?.message}>
              <Input {...form.register("code")} className="uppercase font-mono" autoFocus={isNew} />
            </Field>
            <Field label={t("products.fields.name")} error={errors.name?.message}>
              <Input {...form.register("name")} />
            </Field>
            <Field label={t("products.fields.category")}>
              <SelectField value={form.watch("category_id") ?? ""} onChange={(e) => form.setValue("category_id", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} className={selectClass}>
                <option value="">-</option>
                {categories.filter((c) => c.is_active || c.id === product?.category_id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t("products.fields.owner")} hint={t("products.ownerHint")}>
              <SelectField value={form.watch("owner_id") ?? ""} onChange={(e) => form.setValue("owner_id", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} className={selectClass}>
                {owners.filter((o) => o.is_active || o.id === product?.owner_id).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {t(`master.ownerType.${o.owner_type}`)}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t("products.fields.description")} className="sm:col-span-2">
              <Textarea rows={2} {...form.register("description")} />
            </Field>
            {!isNew && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v === true)} />
                {t("common.active")}
              </label>
            )}
          </div>

          {isNew && (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">{t("products.variants.title")}</h3>
                <VariantMatrixGenerator
                  productCode={form.watch("code")}
                  axes={axes}
                  onAxesChange={setAxes}
                  excluded={excluded}
                  onExcludedChange={setExcluded}
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">{t("products.skuDefaults")}</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label={t("products.fields.baseUom")} hint={t("products.baseUomHint")}>
                    <SelectField value={form.watch("base_uom_id") ?? ""} onChange={(e) => form.setValue("base_uom_id", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} className={selectClass}>
                      {uoms.filter((u) => u.is_active).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.code} · {u.name}
                        </option>
                      ))}
                    </SelectField>
                  </Field>
                  <Field label={t("products.fields.safety_stock")}>
                    <Input type="number" min={0} step="any" {...form.register("safety_stock")} />
                  </Field>
                  <Field label={t("products.fields.reorder_point")}>
                    <Input type="number" min={0} step="any" {...form.register("reorder_point")} />
                  </Field>
                  <Field label={t("products.fields.reorder_qty")}>
                    <Input type="number" min={0} step="any" {...form.register("reorder_qty")} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.watch("track_batch") || trackExpiry}
                      disabled={trackExpiry}
                      onCheckedChange={(v) => form.setValue("track_batch", v === true)}
                    />
                    {t("products.fields.trackBatch")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={trackExpiry} onCheckedChange={(v) => form.setValue("track_expiry", v === true)} />
                    {t("products.fields.trackExpiry")}
                  </label>
                </div>
              </section>
            </>
          )}

          <DialogFooter>
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
