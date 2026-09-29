import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/common/MasterSection";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ActivityChart, type ActivityBucket } from "@/components/superadmin/ActivityChart";
import { MonitorPanels, Panel, type Monitor } from "@/components/superadmin/MonitorPanels";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { useSettings } from "@/hooks/useSettings";
import { useTabParam } from "@/hooks/useTabParam";
import { errorMessage } from "@/lib/errorMessage";

interface Stats {
  tables: Record<string, number>;
  accounts: { id: string; full_name: string | null; email: string; role: string | null; is_superadmin: boolean; banned: boolean; last_sign_in_at: string | null }[];
  recent_audit: { id: number; action: string; entity_type: string; entity_id: string; created_at: string; actor: string | null }[];
  activity: ActivityBucket[];
}

const TABS = ["stats", "monitor", "maintenance"] as const;
const when = (d: unknown) => (d ? new Date(String(d)).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "-");

function rpc<T>(fn: "superadmin_stats" | "superadmin_monitor") {
  return async () => {
    const { data, error } = await supabase.rpc(fn);
    if (error) throw error;
    return data as unknown as T;
  };
}

/** Hidden page for the platform owner; every RPC it calls refuses non-superadmins. */
export default function SuperadminPage() {
  const { t } = useTranslation();
  const { isSuperadmin, isLoading } = useAuth();
  const [tab, setTab] = useTabParam(TABS, "stats");
  const on = isSuperadmin();
  const stats = useQuery({ queryKey: ["superadmin-stats"], queryFn: rpc<Stats>("superadmin_stats"), enabled: on, refetchInterval: 30_000 });
  const monitor = useQuery({ queryKey: ["superadmin-monitor"], queryFn: rpc<Monitor>("superadmin_monitor"), enabled: on, refetchInterval: 60_000 });

  if (isLoading) return null;
  if (!on) return <Navigate to="/403" replace />;
  const tables = Object.entries(stats.data?.tables ?? {}).filter(([, n]) => n > 0);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="justify-start">
          {TABS.map((k) => (
            <TabsTrigger key={k} value={k} className="text-xs">{t(`superadmin.tabs.${k}`)}</TabsTrigger>
          ))}
        </TabsList>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { stats.refetch(); monitor.refetch(); }}>
          <RefreshCw className="h-4 w-4" />
          {t("superadmin.refresh")}
        </Button>
      </div>

      <TabsContent value="stats" className="flex flex-col gap-4">
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {tables.map(([name, n]) => (
            <div key={name} className="rounded-lg border border-border bg-card p-3">
              <p className="truncate font-mono text-[11px] text-muted-foreground">{name}</p>
              <p className="text-lg font-semibold tabular-nums">{n.toLocaleString("id-ID")}</p>
            </div>
          ))}
        </section>
        <Panel title={t("superadmin.activity")}>
          <div className="p-3"><ActivityChart buckets={stats.data?.activity ?? []} /></div>
        </Panel>
        <Panel title={t("superadmin.accounts")}>
          {(stats.data?.accounts ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
              <span className="min-w-[10rem] flex-1">
                <span className="font-medium">{a.full_name ?? "-"}</span> <span className="text-muted-foreground">{a.email}</span>
              </span>
              <span className="text-muted-foreground">{a.role ?? "-"}</span>
              {a.is_superadmin && <StatusBadge tone="danger">superadmin</StatusBadge>}
              {a.banned && <StatusBadge tone="warn">{t("superadmin.banned")}</StatusBadge>}
              <span className="w-36 text-right text-muted-foreground">{a.last_sign_in_at ? when(a.last_sign_in_at) : t("superadmin.never")}</span>
            </li>
          ))}
        </Panel>
        <Panel title={t("superadmin.recentAudit")}>
          {(stats.data?.recent_audit ?? []).map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-1.5 text-xs">
              <span className="w-36 shrink-0 text-muted-foreground">{when(a.created_at)}</span>
              <span className="min-w-0 flex-1 truncate">{a.actor ?? t("superadmin.system")} · {a.action} {a.entity_type} {a.entity_id}</span>
            </li>
          ))}
        </Panel>
      </TabsContent>

      <TabsContent value="monitor" className="grid gap-4 lg:grid-cols-2">
        {monitor.data && <MonitorPanels data={monitor.data} />}
      </TabsContent>

      <TabsContent value="maintenance">
        <Maintenance />
      </TabsContent>
    </Tabs>
  );
}

function Maintenance() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const [confirm, setConfirm] = useState<"wipe" | "seed" | null>(null);
  const [typed, setTyped] = useState("");
  const word = confirm === "seed" ? "SEED" : "WIPE";
  const run = useMutation({
    mutationFn: async (kind: "wipe" | "seed") => {
      const { data, error } =
        kind === "seed" ? await supabase.rpc("superadmin_seed_demo_data") : await supabase.rpc("superadmin_wipe_all_data");
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, kind) => {
      qc.invalidateQueries();
      toast.success(t(kind === "seed" ? "superadmin.seeded" : "superadmin.wiped"));
      setConfirm(null);
    },
    onError: (e: Error) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title={t("superadmin.tabs.maintenance")} subtitle={t("superadmin.maintenanceHint", { mode: settings?.demo_mode ? "demo" : "production" })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">{t("superadmin.seedTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("superadmin.seedBody")}</p>
          <Button variant="outline" className="h-10 gap-1.5 self-start" onClick={() => { setTyped(""); setConfirm("seed"); }}>
            <Database className="h-4 w-4" />
            {t("superadmin.seed")}
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-rose-500/40 bg-card p-4">
          <p className="text-sm font-semibold text-rose-600">{t("superadmin.wipeTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("superadmin.wipeBody")}</p>
          <Button variant="destructive" className="h-10 gap-1.5 self-start" onClick={() => { setTyped(""); setConfirm("wipe"); }}>
            <Trash2 className="h-4 w-4" />
            {t("superadmin.wipe")}
          </Button>
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !run.isPending && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{confirm === "seed" ? t("superadmin.seedTitle") : t("superadmin.wipeTitle")}</DialogTitle>
            <DialogDescription className="text-xs">{t("superadmin.typeToConfirm", { word })}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-word">{t("superadmin.confirmWord", { word })}</Label>
            <Input id="confirm-word" className="h-10 font-mono" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={run.isPending}>{t("common.cancel")}</Button>
            <Button
              variant={confirm === "wipe" ? "destructive" : "default"}
              loading={run.isPending}
              disabled={typed !== word}
              onClick={() => confirm && run.mutate(confirm)}
            >
              {run.isPending ? t("superadmin.running") : confirm === "seed" ? t("superadmin.seed") : t("superadmin.wipe")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
