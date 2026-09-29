import { useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Plus, RotateCw, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { SecretOnceDialog } from "./SecretOnceDialog";
import { WebhookDeliveriesTable } from "./WebhookDeliveriesTable";
import { useAuth } from "@/context/auth";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useRotateWebhookSecret,
  useUpdateWebhook,
  useWebhooks,
  WEBHOOK_EVENTS,
  type Webhook,
} from "@/hooks/useIntegration";

export function WebhooksPanel() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const { data: hooks = [] } = useWebhooks();
  const create = useCreateWebhook();
  const rotate = useRotateWebhookSecret();
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://");
  const [events, setEvents] = useState<string[]>(["stock.low"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [history, setHistory] = useState<Webhook | null>(null);
  const validUrl = /^https:\/\/[^/?#@\s]+/.test(url.trim());

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("integration.hooks.title")}
        count={hooks.length}
        subtitle={t("integration.hooks.subtitle")}
        tour="integration-hooks"
        actions={
          <AccessControl feature="integration" action="create">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("integration.hooks.new")}
            </Button>
          </AccessControl>
        }
      />
      {!hooks.length ? (
        <EmptyState icon={WebhookIcon} title={t("integration.hooks.empty")} action={
            <AccessControl feature="integration" action="create">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("integration.hooks.new")}
              </Button>
            </AccessControl>
          } />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-all font-mono text-xs font-medium">{h.url}</p>
                <p className="text-xs text-muted-foreground">{h.events.join(", ")}</p>
                {h.disabled_reason && !h.is_active && (
                  <p className="text-xs text-rose-600">{t("integration.hooks.autoDisabled")}</p>
                )}
              </div>
              <Switch
                checked={h.is_active}
                disabled={!canUpdate("integration") || update.isPending}
                aria-label={t("integration.hooks.active")}
                onCheckedChange={(v) =>
                  update.mutate({ id: h.id, values: v ? { is_active: true, failure_streak: 0, disabled_reason: null } : { is_active: false } })
                }
              />
              <Button variant="ghost" size="icon" className="h-10 w-10" aria-label={t("integration.hooks.history")} onClick={() => setHistory(h)}>
                <History className="h-4 w-4" />
              </Button>
              <AccessControl feature="integration" action="update">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={t("integration.hooks.rotate")}
                  onClick={() => rotate.mutate(h.id, { onSuccess: (s) => setSecret(s) })}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </AccessControl>
              <AccessControl feature="integration" action="delete">
                <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive" aria-label={t("common.delete")} onClick={() => setDeleting(h)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AccessControl>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
        <summary className="cursor-pointer text-sm font-medium">{t("integration.hooks.verifyTitle")}</summary>
        <p className="mt-2 text-muted-foreground">{t("integration.hooks.verifyBody")}</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-secondary/60 p-3 font-mono text-[11px]">{`X-StockDesk-Signature: t=1700000000,v1=<hex>
v1 = HMAC_SHA256(secret, t + "." + rawBody)`}</pre>
      </details>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{t("integration.hooks.new")}</DialogTitle>
          </DialogHeader>
          <form
            id="webhook-form"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(
                { url: url.trim(), events },
                {
                  onSuccess: (r) => {
                    setOpen(false);
                    setUrl("https://");
                    setSecret(r.secret);
                  },
                },
              );
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hook-url">URL</Label>
              <Input
                id="hook-url"
                type="url"
                inputMode="url"
                className={`h-10 ${url.length > 8 && !validUrl ? "border-rose-500" : ""}`}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("integration.hooks.urlHint")}</p>
            </div>
            <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-sm font-medium">{t("integration.hooks.events")}</legend>
              {WEBHOOK_EVENTS.map((ev) => (
                <Label key={ev} className="flex items-center gap-2 font-normal">
                  <Checkbox checked={events.includes(ev)} onCheckedChange={(v) => setEvents((cur) => (v ? [...cur, ev] : cur.filter((x) => x !== ev)))} />
                  <span className="font-mono text-xs">{ev}</span>
                </Label>
              ))}
            </fieldset>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="webhook-form" loading={create.isPending} disabled={!validUrl || !events.length}>
              {t("integration.hooks.new")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SecretOnceDialog title={t("integration.hooks.secretTitle")} value={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("integration.hooks.deleteTitle")}
        description={deleting?.url ?? ""}
        confirmLabel={t("common.delete")}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
      <WebhookDeliveriesTable hook={history} onClose={() => setHistory(null)} />
    </div>
  );
}
