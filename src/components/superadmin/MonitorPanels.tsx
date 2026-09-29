import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type Row = Record<string, string | number | boolean | null>;
export type Monitor = Record<"failed_logins" | "inactive_accounts" | "access_changes" | "api_keys" | "webhooks" | "storage" | "errors", Row[]>;

const when = (d: unknown) => (d ? new Date(String(d)).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

export function Panel({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const { t } = useTranslation();
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="rounded-xl border border-border bg-card">
      <p className="border-b border-border px-4 py-2.5 text-sm font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 text-xs font-normal text-muted-foreground">({count})</span>}
      </p>
      {empty ? <p className="px-4 py-4 text-xs text-muted-foreground">{t("superadmin.nothing")}</p> : <ul className="divide-y divide-border/60">{children}</ul>}
    </section>
  );
}

export function MonitorPanels({ data }: { data: Monitor }) {
  const { t } = useTranslation();
  return (
    <>
      {(Object.keys(data) as (keyof Monitor)[]).map((k) => (
        <Panel key={k} title={t(`superadmin.monitor.${k}`)} count={data[k].length}>
          {data[k].slice(0, 20).map((r, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 px-4 py-1.5 text-xs">
              {Object.entries(r).map(([col, v]) => (
                <span key={col} className={col.endsWith("_at") ? "text-muted-foreground" : ""}>
                  {col.endsWith("_at") ? when(v) : col === "bytes" ? `${(Number(v) / 1024 / 1024).toFixed(1)} MB` : String(v ?? "-")}
                </span>
              ))}
            </li>
          ))}
        </Panel>
      ))}
    </>
  );
}
