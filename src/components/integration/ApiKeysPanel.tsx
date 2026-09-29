import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FilterSelect } from "@/components/common/FilterSelect";
import { SecretOnceDialog } from "./SecretOnceDialog";
import { API_SCOPES, useApiKeys, useCreateApiKey, useRevokeApiKey, type ApiKey } from "@/hooks/useIntegration";
import { useOwners } from "@/hooks/useOwners";

const API_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-v1`;
const when = (d: string | null) => (d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

export function ApiKeysPanel() {
  const { t } = useTranslation();
  const { data: keys = [] } = useApiKeys();
  const { data: owners = [] } = useOwners();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["stock:read"]);
  const [owner, setOwner] = useState<string>();
  const [expires, setExpires] = useState("");
  const [shown, setShown] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const status = (k: ApiKey) =>
    k.revoked_at ? "revoked" : k.expires_at && new Date(k.expires_at) <= new Date() ? "expired" : "active";

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("integration.keys.title")}
        count={keys.length}
        subtitle={t("integration.keys.subtitle")}
        tour="integration-keys"
        actions={
          <AccessControl feature="integration" action="create">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("integration.keys.new")}
            </Button>
          </AccessControl>
        }
      />
      {!keys.length ? (
        <EmptyState icon={KeyRound} title={t("integration.keys.empty")} action={
            <AccessControl feature="integration" action="create">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("integration.keys.new")}
              </Button>
            </AccessControl>
          } />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{k.name}</span>
                  <StatusBadge tone={status(k) === "active" ? "ok" : "muted"}>{t(`integration.keys.status.${status(k)}`)}</StatusBadge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{k.prefix}…</p>
                <p className="text-xs text-muted-foreground">
                  {k.scopes.join(", ")}
                  {k.owner_id && ` · ${owners.find((o) => o.id === k.owner_id)?.name ?? ""}`} · {t("integration.keys.lastUsed")}{" "}
                  {when(k.last_used_at)}
                  {k.expires_at && ` · ${t("integration.keys.expires")} ${when(k.expires_at)}`}
                </p>
              </div>
              {!k.revoked_at && (
                <AccessControl feature="integration" action="delete">
                  <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => setRevoking(k)}>
                    {t("integration.keys.revoke")}
                  </Button>
                </AccessControl>
              )}
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">{t("integration.keys.howTo")}</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre rounded-lg bg-secondary/60 p-3 font-mono text-[11px]">{`curl ${API_BASE}/stock?sku=SKU-01 \\
  -H "Authorization: Bearer sd_live_..."

curl -X POST ${API_BASE}/orders \\
  -H "Authorization: Bearer sd_live_..." \\
  -H "Idempotency-Key: order-123" \\
  -d '{"warehouse":"JKT","customer_name":"Toko A","lines":[{"sku":"SKU-01","qty":2}]}'`}</pre>
        <p className="mt-2 text-muted-foreground">{t("integration.keys.howToNote")}</p>
      </details>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{t("integration.keys.new")}</DialogTitle>
          </DialogHeader>
          <form
            id="api-key-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { name, scopes, ownerId: owner ? Number(owner) : null, expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null },
                {
                  onSuccess: (key) => {
                    setOpen(false);
                    setName("");
                    setShown(key);
                  },
                },
              );
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-name">{t("integration.keys.name")}</Label>
              <Input id="key-name" className="h-10" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">{t("integration.keys.scopes")}</legend>
              {API_SCOPES.map((s) => (
                <Label key={s} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={scopes.includes(s)}
                    onCheckedChange={(v) => setScopes((cur) => (v ? [...cur, s] : cur.filter((x) => x !== s)))}
                  />
                  <span className="font-mono text-xs">{s}</span>
                  <span className="text-xs text-muted-foreground">{t(`integration.keys.scopeDesc.${s.replace(":", "_")}`)}</span>
                </Label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{t("integration.keys.owner")}</Label>
                <FilterSelect
                  value={owner}
                  onChange={setOwner}
                  allLabel={t("integration.keys.allOwners")}
                  aria-label={t("integration.keys.owner")}
                  options={owners.map((o) => ({ value: String(o.id), label: o.name }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key-exp">{t("integration.keys.expires")}</Label>
                <Input id="key-exp" type="date" className="h-8 w-40 text-xs md:text-xs" value={expires} min={new Date().toLocaleDateString("en-CA")} onChange={(e) => setExpires(e.target.value)} />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="api-key-form" loading={create.isPending} disabled={!name.trim() || !scopes.length}>
              {t("integration.keys.new")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SecretOnceDialog title={t("integration.keys.created")} value={shown} onClose={() => setShown(null)} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t("integration.keys.revokeTitle", { name: revoking?.name })}
        description={t("integration.keys.revokeBody")}
        confirmLabel={t("integration.keys.revoke")}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
