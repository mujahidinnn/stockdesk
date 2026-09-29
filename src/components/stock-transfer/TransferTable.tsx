import { useTranslation } from "react-i18next";
import { ArrowRight, Check, PackageCheck, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessControl } from "@/components/auth/AccessControl";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { StockTransfer } from "@/hooks/useStockTransfers";
import { useDecideVariance } from "@/hooks/useStockTransfers";
import { useSkuLookup } from "@/hooks/useSkuLookup";


export function TransferTable({
  transfers,
  warehouseCode,
  onSend,
  onReceive,
  onCancel,
}: {
  transfers: StockTransfer[];
  warehouseCode: (id: number) => string;
  onSend: (t: StockTransfer) => void;
  onReceive: (t: StockTransfer) => void;
  onCancel: (t: StockTransfer) => void;
}) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  const decide = useDecideVariance();

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {transfers.map((tr) => (
        <li key={tr.id} className="flex flex-col gap-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs font-medium">{tr.transfer_no}</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {warehouseCode(tr.from_warehouse_id)} <ArrowRight className="h-3 w-3" /> {warehouseCode(tr.to_warehouse_id)}
              </span>
            </span>
            <StatusBadge status={tr.status}>{t(`transfers.status.${tr.status}`)}</StatusBadge>
          </div>
          <ul className="flex flex-col gap-1 text-xs">
            {tr.t_stock_transfer_lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{lookup.code(l.sku_id)}</span>
                <span className="text-muted-foreground">
                  {l.qty_received != null ? `${Number(l.qty_received)}/${Number(l.qty)}` : Number(l.qty)}
                </span>
                {l.variance_status === "pending" && (
                  <>
                    <StatusBadge tone="warn">{t("transfers.variancePending", { qty: Number(l.qty) - Number(l.qty_received) })}</StatusBadge>
                    <span className="text-muted-foreground">{l.variance_reason}</span>
                    <AccessControl feature="stock-approval" action="update">
                      <Button size="sm" variant="outline" className="h-8 gap-1" loading={decide.isPending && decide.variables?.lineId === l.id && decide.variables.approve} disabled={decide.isPending} onClick={() => decide.mutate({ lineId: l.id, approve: true })}>
                        <Check className="h-3.5 w-3.5" />
                        {t("transfers.writeOff")}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1" loading={decide.isPending && decide.variables?.lineId === l.id && !decide.variables.approve} disabled={decide.isPending} onClick={() => decide.mutate({ lineId: l.id, approve: false })}>
                        <X className="h-3.5 w-3.5" />
                        {t("transfers.keepInTransit")}
                      </Button>
                    </AccessControl>
                  </>
                )}
                {l.variance_status === "approved" && <StatusBadge tone="danger">{t("transfers.writtenOff")}</StatusBadge>}
              </li>
            ))}
          </ul>
          {tr.note && <p className="text-xs text-muted-foreground">{tr.note}</p>}
          <div className="flex flex-wrap gap-2">
            {tr.status === "draft" && (
              <AccessControl feature="stock-transfer" action="update">
                <Button size="sm" className="h-8 gap-1.5" onClick={() => onSend(tr)}>
                  <Send className="h-4 w-4" />
                  {t("transfers.send")}
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => onCancel(tr)}>
                  {t("transfers.cancel")}
                </Button>
              </AccessControl>
            )}
            {tr.status === "in_transit" && (
              <AccessControl feature="goods-receipt" action="create">
                <Button size="sm" className="h-8 gap-1.5" onClick={() => onReceive(tr)}>
                  <PackageCheck className="h-4 w-4" />
                  {t("transfers.receive")}
                </Button>
              </AccessControl>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
