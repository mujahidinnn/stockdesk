import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { useSaveWarehouse, type Warehouse } from "@/hooks/useWarehouses";
import { SelectField } from "@/components/common/SelectField";
import { parseCoords } from "@/lib/locations";

const schema = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,10}$/, "A-Z, 0-9")),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300),
  // "lat, lng" as Google Maps copies it from a right-click on the map.
  coords: z
    .string()
    .trim()
    .refine((v) => !v || parseCoords(v) != null, "-6.2, 106.8"),
  warehouse_type: z.enum(["main", "store", "transit"]),
  is_active: z.boolean(),
});
type FormIn = z.input<typeof schema>;

export function WarehouseFormDialog({
  warehouse,
  open,
  onOpenChange,
}: {
  warehouse: Warehouse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveWarehouse();
  const form = useForm<FormIn>({ resolver: zodResolver(schema) });
  const errors = form.formState.errors;

  useEffect(() => {
    if (open)
      form.reset({
        code: warehouse?.code ?? "",
        name: warehouse?.name ?? "",
        address: warehouse?.address ?? "",
        coords: warehouse?.latitude != null ? `${warehouse.latitude}, ${warehouse.longitude}` : "",
        warehouse_type: (warehouse?.warehouse_type as FormIn["warehouse_type"]) ?? "main",
        is_active: warehouse?.is_active ?? true,
      });
  }, [open, warehouse, form]);

  const submit = form.handleSubmit((raw) => {
    const v = schema.parse(raw);
    // The code is fixed once created, so an edit never sends it.
    const { code, coords, ...rest } = v;
    const [latitude, longitude] = parseCoords(coords) ?? [null, null];
    const values = { ...rest, address: v.address || null, latitude, longitude };
    save.mutate(
      warehouse ? { id: warehouse.id, values: { ...values, code: warehouse.code } } : { values: { ...values, code } },
      { onSuccess: () => onOpenChange(false) },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{warehouse ? t("warehouses.edit") : t("warehouses.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("warehouses.fields.code")}
            error={errors.code?.message}
            hint={warehouse ? t("warehouses.codeLocked") : t("warehouses.codeHint")}
          >
            <Input {...form.register("code")} disabled={!!warehouse} className="uppercase font-mono" />
          </Field>
          <Field label={t("warehouses.fields.type")}>
            <SelectField value={form.watch("warehouse_type") ?? ""} onChange={(e) => form.setValue("warehouse_type", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })} className={selectClass}>
              {(["main", "store", "transit"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`warehouses.types.${k}`)}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label={t("warehouses.fields.name")} error={errors.name?.message} className="sm:col-span-2">
            <Input {...form.register("name")} />
          </Field>
          <Field label={t("warehouses.fields.address")} className="sm:col-span-2">
            <Input {...form.register("address")} />
          </Field>
          <Field label={t("warehouses.fields.coords")} error={errors.coords?.message} hint={t("warehouses.coordsHint")} className="sm:col-span-2">
            <Input {...form.register("coords")} placeholder="-6.144, 106.937" className="font-mono" inputMode="decimal" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v === true)} />
            {t("common.active")}
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
