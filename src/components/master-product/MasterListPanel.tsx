import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessControl } from "@/components/auth/AccessControl";
import { SearchInput, SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, selectClass } from "@/components/common/Field";
import { useDeleteMasterItem, useMasterList, useSaveMasterItem, type MasterTable } from "@/hooks/useMasterList";
import { SelectField } from "@/components/common/SelectField";

export type MasterField = "contact_name" | "phone" | "email" | "address" | "owner_type";

const schema = z.object({
  code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(120),
  owner_type: z.enum(["in_house", "client"]).optional(),
  contact_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(""), z.string().trim().email()]).optional(),
  address: z.string().trim().max(300).optional(),
  is_active: z.boolean(),
});
type FormValues = z.input<typeof schema>;

// Loose row shape: the five tables share code/name/is_active, the rest is optional.
type Row = { id: number; code: string; name: string; is_active: boolean } & Partial<Record<MasterField, string | null>>;

export function MasterListPanel({
  table,
  icon,
  title,
  subtitle,
  fields,
}: {
  table: MasterTable;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  fields: MasterField[];
}) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useMasterList(table);
  const rows = data as unknown as Row[];
  const save = useSaveMasterItem(table);
  const remove = useDeleteMasterItem(table);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.code} ${r.name} ${r.contact_name ?? ""}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema) });

  function open(row: Row | "new") {
    const r = row === "new" ? null : row;
    form.reset({
      code: r?.code ?? "",
      name: r?.name ?? "",
      owner_type: fields.includes("owner_type") ? ((r?.owner_type as "in_house" | "client") ?? "client") : undefined,
      contact_name: r?.contact_name ?? "",
      phone: r?.phone ?? "",
      email: r?.email ?? "",
      address: r?.address ?? "",
      is_active: r?.is_active ?? true,
    });
    setEditing(row);
  }

  const submit = form.handleSubmit((raw) => {
    const v = schema.parse(raw);
    const values: Record<string, unknown> = { code: v.code, name: v.name, is_active: v.is_active };
    for (const f of fields) values[f] = v[f] || null;
    save.mutate(
      { id: editing !== "new" && editing ? editing.id : undefined, values },
      { onSuccess: () => setEditing(null) },
    );
  });

  const extraCols = fields.filter((f) => f !== "address");

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={title}
        count={rows.length}
        subtitle={subtitle}
        actions={
          <AccessControl feature="master-product" action="create">
            <Button size="sm" onClick={() => open("new")} className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              {t("common.add")}
            </Button>
          </AccessControl>
        }
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("common.search")} />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-4 py-3 font-semibold">{t("master.fields.code")}</th>
              <th className="px-4 py-3 font-semibold">{t("master.fields.name")}</th>
              {extraCols.map((f) => (
                <th key={f} className="px-4 py-3 font-semibold hidden md:table-cell">
                  {t(`master.fields.${f}`)}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold">{t("common.status")}</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-secondary/40">
                <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2.5">{r.name}</td>
                {extraCols.map((f) => (
                  <td key={f} className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                    {f === "owner_type" ? t(`master.ownerType.${r.owner_type}`) : (r[f] ?? "-")}
                  </td>
                ))}
                <td className="px-4 py-2.5">
                  <StatusBadge tone={r.is_active ? "ok" : "muted"}>
                    {r.is_active ? t("common.active") : t("common.inactive")}
                  </StatusBadge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    <AccessControl feature="master-product" action="update">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => open(r)} aria-label={t("common.edit")}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </AccessControl>
                    <AccessControl feature="master-product" action="delete">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleting(r)} aria-label={t("common.delete")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AccessControl>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && filtered.length === 0 && (
          <EmptyState icon={icon} title={rows.length ? t("common.noResults") : t("master.emptyList")} />
        )}
      </div>

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              {editing === "new" ? t("common.add") : t("common.edit")} · {title}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <Field label={t("master.fields.code")} error={form.formState.errors.code?.message}>
              <Input {...form.register("code")} className="uppercase font-mono" autoFocus />
            </Field>
            <Field label={t("master.fields.name")} error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} />
            </Field>
            {fields.includes("owner_type") && (
              <Field label={t("master.fields.owner_type")}>
                <SelectField
                  value={form.watch("owner_type") ?? ""} onChange={(e) => form.setValue("owner_type", e.target.value as never, { shouldDirty: true, shouldValidate: form.formState.isSubmitted })}
                  className={selectClass}
                >
                  <option value="in_house">{t("master.ownerType.in_house")}</option>
                  <option value="client">{t("master.ownerType.client")}</option>
                </SelectField>
              </Field>
            )}
            {(["contact_name", "phone", "email"] as const)
              .filter((f) => fields.includes(f))
              .map((f) => (
                <Field key={f} label={t(`master.fields.${f}`)} error={form.formState.errors[f]?.message}>
                  <Input {...form.register(f)} type={f === "email" ? "email" : "text"} />
                </Field>
              ))}
            {fields.includes("address") && (
              <Field label={t("master.fields.address")} className="sm:col-span-2">
                <Input {...form.register("address")} />
              </Field>
            )}
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
              {t("common.active")}
            </label>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" loading={save.isPending}>
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmationModal
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("common.delete")}
        description={t("master.deleteConfirm", { name: deleting?.name })}
        isPending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

