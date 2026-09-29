import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ClipboardCheck, EyeOff, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { CountSessionFormDialog } from "@/components/stock-opname/CountSessionFormDialog";
import { CountSheet } from "@/components/stock-opname/CountSheet";
import { VarianceApprovalPanel } from "@/components/stock-opname/VarianceApprovalPanel";
import { useAuth } from "@/context/auth";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCloseCount, useStartCount, useStockCounts } from "@/hooks/useStockCounts";


export default function StockOpnamePage() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const filterWh = useWarehouseFilter();
  const { data: counts = [] } = useStockCounts(filterWh);
  const { data: warehouses = [] } = useWarehouses();
  const start = useStartCount();
  const close = useCloseCount();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const open = counts.find((c) => c.id === openId) ?? null;
  const approver = canUpdate("stock-approval");

  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader
        title={t("counts.title")}
        count={counts.length}
        subtitle={t("counts.subtitle")}
        tour="counts-actions"
        actions={
          <AccessControl feature="stock-opname" action="create">
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("counts.new")}
            </Button>
          </AccessControl>
        }
      />

      {!counts.length ? (
        <EmptyState icon={ClipboardCheck} title={t("counts.empty")} description={t("counts.emptyHint")} action={
            <AccessControl feature="stock-opname" action="create">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" />
                {t("counts.new")}
              </Button>
            </AccessControl>
          } />
      ) : (
        <ul data-tour="counts-list" className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {counts.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-secondary/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-mono text-xs font-medium">
                    {c.count_no}
                    {c.blind && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label={t("counts.blind")} />}
                  </span>
                  <StatusBadge status={c.status}>{t(`counts.status.${c.status}`)}</StatusBadge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {warehouses.find((w) => w.id === c.warehouse_id)?.code} ·{" "}
                  {c.scope_location_ids.length ? t("counts.partial", { count: c.scope_location_ids.length }) : t("counts.wholeWarehouse")}
                  {c.note && ` · ${c.note}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="font-mono">{open?.count_no}</span>
              {open && <StatusBadge status={open.status}>{t(`counts.status.${open.status}`)}</StatusBadge>}
            </DialogTitle>
          </DialogHeader>
          {open?.status === "draft" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("counts.startHint")}</p>
              <AccessControl feature="stock-opname" action="update">
                <Button className="h-12 gap-2 text-base" loading={start.isPending} onClick={() => start.mutate(open.id)}>
                  <Play className="h-5 w-5" />
                  {t("counts.start")}
                </Button>
              </AccessControl>
            </div>
          )}
          {open?.status === "counting" && <CountSheet count={open} />}
          {open && ["submitted", "approved", "rejected"].includes(open.status) &&
            (approver || !open.blind ? (
              <VarianceApprovalPanel count={open} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("counts.waitingApproval")}</p>
            ))}
          {open?.reject_reason && <p className="text-sm text-rose-600">{t("counts.rejectedBecause", { reason: open.reject_reason })}</p>}
          {open && (open.status === "draft" || open.status === "counting") && (
            <AccessControl feature="stock-opname" action="update">
              <Button variant="ghost" className="h-11 gap-1.5 text-destructive" onClick={() => setAskCancel(true)}>
                <Ban className="h-4 w-4" />
                {t("counts.cancel")}
              </Button>
            </AccessControl>
          )}
          <ConfirmDialog
            open={askCancel}
            onOpenChange={setAskCancel}
            title={t("counts.cancelTitle")}
            description={t("counts.cancelBody")}
            confirmLabel={t("counts.cancel")}
            onConfirm={() => open && close.mutate({ id: open.id, status: "cancelled" })}
          />
        </DialogContent>
      </Dialog>

      <CountSessionFormDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setOpenId(id);
        }}
      />
    </div>
  );
}
