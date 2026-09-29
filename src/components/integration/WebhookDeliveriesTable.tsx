import { useTranslation } from "react-i18next";
import { RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccessControl } from "@/components/auth/AccessControl";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useDeliveries, useRetryDelivery, type Webhook } from "@/hooks/useIntegration";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/common/QueryState";


/** Delivery history of one webhook, newest first, with a resend for failed ones. */
export function WebhookDeliveriesTable({ hook, onClose }: { hook: Webhook | null; onClose: () => void }) {
  const { t } = useTranslation();
  const deliveries = useDeliveries(hook?.id ?? null);
  const rows = deliveries.data ?? [];
  const retry = useRetryDelivery();
  return (
    <Sheet open={!!hook} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-base">{t("integration.hooks.history")}</SheetTitle>
          <p className="break-all font-mono text-xs text-muted-foreground">{hook?.url}</p>
        </SheetHeader>
        <QueryState query={deliveries}>
          {!rows.length ? (
            <EmptyState size="sm" icon={Send} title={t("integration.hooks.noDeliveries")} className="py-10" />
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border">
              {rows.map((d) => (
                <li key={d.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono">#{d.id} {d.event}</span>
                      <StatusBadge status={d.status}>{t(`integration.hooks.status.${d.status}`)}</StatusBadge>
                    </div>
                    <p className="text-muted-foreground">
                      {new Date(d.created_at).toLocaleString("id-ID")} · {t("integration.hooks.attempts", { count: d.attempts })}
                      {d.last_status_code != null && ` · HTTP ${d.last_status_code}`}
                    </p>
                    {d.last_error && d.status !== "success" && <p className="truncate text-rose-600">{d.last_error}</p>}
                  </div>
                  {d.status === "failed" && (
                    <AccessControl feature="integration" action="update">
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("integration.hooks.retry")} onClick={() => retry.mutate(d.id)}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </AccessControl>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </SheetContent>
    </Sheet>
  );
}
