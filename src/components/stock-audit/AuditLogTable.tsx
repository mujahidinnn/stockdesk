import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AuditLogEntryWithActor } from "@/lib/types";

const IGNORED = new Set(["updated_at", "created_at", "created_by"]);

function summary(e: AuditLogEntryWithActor) {
  const d = (e.detail ?? {}) as { before?: Record<string, unknown>; after?: Record<string, unknown> };
  const row = d.after ?? d.before ?? {};
  const label = String(row.sku_code ?? row.code ?? row.full_code ?? row.name ?? row.period ?? e.entity_id);
  if (!d.before || !d.after) return label;
  const changed = Object.keys(d.after).filter((k) => !IGNORED.has(k) && JSON.stringify(d.before![k]) !== JSON.stringify(d.after![k]));
  return `${label}: ${changed.map((k) => `${k} ${JSON.stringify(d.before![k])} → ${JSON.stringify(d.after![k])}`).join(", ")}`;
}

export function AuditLogTable({ rows }: { rows: AuditLogEntryWithActor[] }) {
  const { t } = useTranslation();
  if (!rows.length) return <EmptyState icon={ShieldCheck} title={t("audit.noAudit")} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card text-xs">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{e.actor?.full_name ?? t("audit.system")}</span>
            <span className="rounded bg-secondary px-1.5 py-0.5">{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</span>
            <span className="text-muted-foreground">{e.entity_type}</span>
            <span className="ml-auto text-muted-foreground">{new Date(e.created_at).toLocaleString("id-ID")}</span>
          </div>
          <p className="break-all text-muted-foreground">{summary(e)}</p>
        </li>
      ))}
    </ul>
  );
}
