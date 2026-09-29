import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFeatures, useRolePermissions, useUpsertUserOverride, useUserOverrides } from "@/hooks/usePermissions";
import { resolvePermissions } from "@/lib/permissions";
import type { FeaturePermission, UserWithEmail } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QueryState } from "@/components/common/QueryState";

const CRUD = [
  ["can_create", "C"],
  ["can_read", "R"],
  ["can_update", "U"],
  ["can_delete", "D"],
] as const;
const NONE: FeaturePermission = { can_create: false, can_read: false, can_update: false, can_delete: false };

/** Per-user overrides on top of the role. Each change saves at once; the user sees it on the next page load. */
export function PermissionsDialog({ user, onClose }: { user: UserWithEmail | null; onClose: () => void }) {
  const { t } = useTranslation();
  const featuresQ = useFeatures();
  const rolePermsQ = useRolePermissions(user?.role_id);
  const overridesQ = useUserOverrides(user?.id);
  const features = featuresQ.data ?? [];
  const rolePerms = rolePermsQ.data ?? [];
  const overrides = overridesQ.data ?? [];
  const upsert = useUpsertUserOverride();
  const roleMap = resolvePermissions(features, rolePerms, []);

  const save = (featureId: number, active: boolean, perm: FeaturePermission) =>
    user && upsert.mutate({ user_id: user.id, feature_id: featureId, is_override_active: active, ...perm });

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            {user?.full_name ?? user?.email}
          </SheetTitle>
          <SheetDescription className="text-xs">{t("integration.users.permHint", { role: user?.role_name ?? "-" })}</SheetDescription>
        </SheetHeader>
        <QueryState query={[featuresQ, rolePermsQ, overridesQ]}>
          <ul className="mt-4 flex flex-col gap-2">
            {features.map((f) => {
              const role = roleMap[f.feature_key] ?? NONE;
              const o = overrides.find((x) => x.feature_id === f.id);
              const active = !!o?.is_override_active;
              const eff: FeaturePermission = active
                ? {
                    can_create: o?.can_create ?? role.can_create,
                    can_read: o?.can_read ?? role.can_read,
                    can_update: o?.can_update ?? role.can_update,
                    can_delete: o?.can_delete ?? role.can_delete,
                  }
                : role;
              return (
                <li key={f.id} className={cn("rounded-xl border p-3", active ? "border-primary/40 bg-primary/5" : "border-border")}>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{f.feature_name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{f.feature_key}</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {active ? t("integration.users.custom") : t("integration.users.roleDefault")}
                      <Switch checked={active} onCheckedChange={(v) => save(f.id, v, eff)} aria-label={`${f.feature_name} override`} />
                    </label>
                  </div>
                  <div className={cn("mt-2 grid grid-cols-4 gap-1", !active && "pointer-events-none opacity-50")}>
                    {CRUD.map(([k, short]) => (
                      <label key={k} className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs">
                        <Checkbox checked={eff[k]} disabled={!active} onCheckedChange={(v) => save(f.id, true, { ...eff, [k]: !!v })} aria-label={`${f.feature_key} ${short}`} />
                        {short}
                      </label>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </QueryState>
      </SheetContent>
    </Sheet>
  );
}
