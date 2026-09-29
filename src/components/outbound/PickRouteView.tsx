import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessControl } from "@/components/auth/AccessControl";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LocationTag } from "@/components/common/LocationTag";
import { BatchTag } from "@/components/common/BatchTag";
import { QtyWithUom } from "@/components/common/QtyWithUom";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PickScanPanel } from "./PickScanPanel";
import { useCancelPickList, type PickList } from "@/hooks/usePickLists";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { cn } from "@/lib/utils";

export function PickRouteView({ list, onClose }: { list: PickList | null; onClose: () => void }) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  const cancel = useCancelPickList();
  const [askCancel, setAskCancel] = useState(false);
  const stops = list?.t_pick_list_lines ?? [];
  const current = stops.find((s) => s.status === "open");
  const done = stops.filter((s) => s.status !== "open").length;

  return (
    <Dialog open={!!list} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-base">
            <span className="font-mono">{list?.pick_no}</span>
            <span className="text-xs font-normal text-muted-foreground">{t("picking.progress", { done, total: stops.length })}</span>
          </DialogTitle>
        </DialogHeader>

        {current ? (
          <section className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{t("picking.stop", { seq: current.seq })}</span>
              {current.m_locations && <LocationTag code={current.m_locations.full_code} className="text-sm" />}
            </div>
            <div>
              <p className="font-mono text-lg font-semibold">{lookup.code(current.sku_id)}</p>
              <p className="text-sm text-muted-foreground">{lookup.label(current.sku_id)}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {current.m_batches ? <BatchTag batchNo={current.m_batches.batch_no} expiry={current.m_batches.expiry_date} /> : <span />}
              <QtyWithUom qty={Number(current.qty)} conversions={lookup.conversions(current.sku_id)} className="text-xl font-semibold" />
            </div>
            <PickScanPanel stop={current} products={lookup.products} />
          </section>
        ) : (
          <p className="rounded-xl bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">{t("picking.allDone")}</p>
        )}

        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
          {stops.map((s) => (
            <li key={s.id} className={cn("flex items-center gap-2 px-3 py-2", s.id === current?.id && "bg-secondary/60")}>
              <span className="w-5 text-xs text-muted-foreground">{s.seq}</span>
              {s.m_locations && <LocationTag code={s.m_locations.full_code} />}
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{lookup.code(s.sku_id)}</span>
              <span className="tabular-nums text-xs">
                {s.status === "open" ? Number(s.qty) : `${Number(s.qty_picked)}/${Number(s.qty)}`}
              </span>
              {s.status !== "open" && (
                <StatusBadge tone={s.status === "picked" ? "ok" : s.status === "short" ? "warn" : "muted"}>
                  {t(`picking.lineStatus.${s.status}`)}
                </StatusBadge>
              )}
            </li>
          ))}
        </ol>

        {list && (list.status === "open" || list.status === "picking") && !stops.some((s) => Number(s.qty_picked) > 0) && (
          <AccessControl feature="pick-list" action="delete">
            <Button variant="ghost" className="h-11 gap-1.5 text-destructive" onClick={() => setAskCancel(true)}>
              <Ban className="h-4 w-4" />
              {t("picking.cancelList")}
            </Button>
          </AccessControl>
        )}
        <ConfirmDialog
          open={askCancel}
          onOpenChange={setAskCancel}
          title={t("picking.cancelTitle")}
          description={t("picking.cancelBody")}
          confirmLabel={t("picking.cancelList")}
          onConfirm={() => list && cancel.mutate(list.id, { onSuccess: onClose })}
        />
      </DialogContent>
    </Dialog>
  );
}
