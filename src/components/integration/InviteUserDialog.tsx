import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilterSelect } from "@/components/common/FilterSelect";
import { useCreateUser } from "@/hooks/useUsers";
import type { Role } from "@/lib/types";

// Same rule as create-user and the Auth password requirements.
const PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMPTY = { email: "", full_name: "", password: "", role_id: "" };

/** Creates an account with a role below the caller's (create-user re-checks the rank). */
export function InviteUserDialog({ open, onOpenChange, roles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: Role[] }) {
  const { t } = useTranslation();
  const create = useCreateUser();
  const [form, setForm] = useState(EMPTY);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("integration.users.invite")}</DialogTitle>
        </DialogHeader>
        <form
          id="invite-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { email: form.email.trim(), full_name: form.full_name.trim(), password: form.password, role_id: Number(form.role_id) },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  setForm(EMPTY);
                },
              },
            );
          }}
        >
          {(["full_name", "email", "password"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <Label htmlFor={`invite-${k}`}>{t(`integration.users.fields.${k}`)}</Label>
              <Input
                id={`invite-${k}`}
                type={k === "email" ? "email" : k === "password" ? "password" : "text"}
                autoComplete={k === "password" ? "new-password" : "off"}
                className="h-10"
                required
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("integration.users.passwordRule")}</p>
          <div className="flex flex-col gap-1.5">
            <Label>{t("integration.users.fields.role")}</Label>
            <FilterSelect
              value={form.role_id || undefined}
              onChange={(v) => setForm({ ...form, role_id: v ?? "" })}
              allLabel={t("integration.users.pickRole")}
              aria-label={t("integration.users.fields.role")}
              options={roles.map((r) => ({ value: String(r.id), label: r.role_name }))}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button type="submit" form="invite-form" loading={create.isPending} disabled={!form.role_id || !PASSWORD.test(form.password)}>
            {t("integration.users.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
