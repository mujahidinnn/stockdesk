import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, RotateCcw, Shield, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchInput, SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PermissionsDialog } from "./PermissionsDialog";
import { InviteUserDialog } from "./InviteUserDialog";
import { useAuth } from "@/context/auth";
import { useRoles, useSetUserActive, useUpdateUserRole, useUsers } from "@/hooks/useUsers";
import type { UserWithEmail } from "@/lib/types";

export function UsersPanel() {
  const { t } = useTranslation();
  const { user: me, profile, canUpdate, canCreate } = useAuth();
  const { data: users = [] } = useUsers();
  const { data: roles = [] } = useRoles();
  const setRole = useUpdateUserRole();
  const setActive = useSetUserActive();
  const [search, setSearch] = useState("");
  const [perms, setPerms] = useState<UserWithEmail | null>(null);
  const [toggling, setToggling] = useState<UserWithEmail | null>(null);
  const [inviting, setInviting] = useState(false);
  // Lower rank = more power (guard_profile_role_change): only roles below mine, only people below me.
  const myRank = profile?.role?.rank ?? Infinity;
  const assignable = roles.filter((r) => r.rank > myRank);
  const banned = (u: UserWithEmail) => !!u.banned_until && new Date(u.banned_until) > new Date();
  const q = search.trim().toLowerCase();
  const list = users.filter((u) => !q || `${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("integration.users.title")}
        count={users.length}
        subtitle={t("integration.users.subtitle")}
        tour="integration-users"
        actions={
          canCreate("users") && (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setInviting(true)}>
              <UserPlus className="h-4 w-4" />
              {t("integration.users.invite")}
            </Button>
          )
        }
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("integration.users.search")} />
      </Toolbar>
      {!list.length ? (
        <EmptyState icon={Users} title={t("common.noResults")} />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {list.map((u) => {
            const self = u.id === me?.id;
            const locked = self || u.is_superadmin || (roles.find((r) => r.id === u.role_id)?.rank ?? Infinity) <= myRank;
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <div className="min-w-[12rem] flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {u.full_name ?? "-"}
                    {banned(u) && <StatusBadge tone="danger">{t("integration.users.inactive")}</StatusBadge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                {locked || !canUpdate("users") ? (
                  <span className="text-xs text-muted-foreground">{u.role_name ?? t("integration.users.noRole")}</span>
                ) : (
                  <FilterSelect
                    value={u.role_id ? String(u.role_id) : undefined}
                    onChange={(v) => setRole.mutate({ userId: u.id, roleId: v ? Number(v) : null })}
                    allLabel={t("integration.users.noRole")}
                    aria-label={t("integration.users.role", { name: u.full_name ?? u.email })}
                    options={assignable.map((r) => ({ value: String(r.id), label: r.role_name }))}
                  />
                )}
                {!locked && canUpdate("users") && (
                  <>
                    <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t("integration.users.permissions")} onClick={() => setPerms(u)}>
                      <Shield className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      aria-label={banned(u) ? t("integration.users.reactivate") : t("integration.users.deactivate")}
                      onClick={() => setToggling(u)}
                    >
                      {banned(u) ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4 text-destructive" />}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <InviteUserDialog open={inviting} onOpenChange={setInviting} roles={assignable} />
      <PermissionsDialog user={perms} onClose={() => setPerms(null)} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling && banned(toggling) ? t("integration.users.reactivateTitle", { name: toggling.full_name }) : t("integration.users.deactivateTitle", { name: toggling?.full_name })}
        description={toggling && banned(toggling) ? t("integration.users.reactivateBody") : t("integration.users.deactivateBody")}
        confirmLabel={toggling && banned(toggling) ? t("integration.users.reactivate") : t("integration.users.deactivate")}
        onConfirm={() => toggling && setActive.mutate({ userId: toggling.id, active: banned(toggling) })}
      />
    </div>
  );
}
