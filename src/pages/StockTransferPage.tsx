import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccessControl } from "@/components/auth/AccessControl";
import { SectionHeader } from "@/components/common/MasterSection";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { LocationTag } from "@/components/common/LocationTag";
import { BinTransferPanel } from "@/components/stock-transfer/BinTransferPanel";
import { TransferFormDialog } from "@/components/stock-transfer/TransferFormDialog";
import { TransferTable } from "@/components/stock-transfer/TransferTable";
import { ReceiveTransferDialog } from "@/components/stock-transfer/ReceiveTransferDialog";
import { useTabParam } from "@/hooks/useTabParam";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useCancelTransfer, useSendTransfer, useStockTransfers, type StockTransfer } from "@/hooks/useStockTransfers";

const TABS = ["bin", "inter"] as const;

export default function StockTransferPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TABS, "bin");
  const filterWh = useWarehouseFilter();
  const { data: warehouses = [] } = useWarehouses();
  const warehouseId = filterWh ?? warehouses[0]?.id ?? null;
  const { data: binMoves = [] } = useStockTransfers("bin_to_bin", warehouseId);
  const { data: inter = [] } = useStockTransfers("inter_warehouse", filterWh);
  const lookup = useSkuLookup();
  const send = useSendTransfer();
  const cancel = useCancelTransfer();
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<StockTransfer | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "send" | "cancel"; tr: StockTransfer } | null>(null);
  const warehouseCode = (id: number) => warehouses.find((w) => w.id === id)?.code ?? "?";

  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader title={t("transfers.title")} subtitle={t("transfers.subtitle")} />
      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="flex flex-col gap-4">
        <TabsList data-tour="transfers-tabs" className="w-full justify-start">
          <TabsTrigger value="bin" className="text-xs">{t("transfers.tabs.bin")}</TabsTrigger>
          <TabsTrigger value="inter" className="text-xs">{t("transfers.tabs.inter")}</TabsTrigger>
        </TabsList>

        <TabsContent value="bin" className="flex flex-col gap-4">
          {warehouseId && (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-xs text-muted-foreground">{t("transfers.binHint", { wh: warehouseCode(warehouseId) })}</p>
              <BinTransferPanel key={warehouseId} warehouseId={warehouseId} />
            </div>
          )}
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {binMoves.flatMap((tr) =>
              tr.t_stock_transfer_lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="font-mono text-xs">{lookup.code(l.sku_id)}</span>
                  <span className="tabular-nums text-xs">{Number(l.qty)}</span>
                  {l.from && <LocationTag code={l.from.full_code} />}→{l.to && <LocationTag code={l.to.full_code} />}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(tr.created_at).toLocaleString("id-ID")}</span>
                </li>
              )),
            )}
            {!binMoves.length && <li><EmptyState size="sm" icon={ArrowLeftRight} title={t("transfers.noBinMoves")} /></li>}
          </ul>
        </TabsContent>

        <TabsContent value="inter" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <AccessControl feature="stock-transfer" action="update">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreating(true)} disabled={warehouses.length < 2}>
                <Plus className="h-4 w-4" />
                {t("transfers.newInter")}
              </Button>
            </AccessControl>
          </div>
          {inter.length ? (
            <TransferTable
              transfers={inter}
              warehouseCode={warehouseCode}
              onSend={(tr) => setConfirm({ kind: "send", tr })}
              onReceive={setReceiving}
              onCancel={(tr) => setConfirm({ kind: "cancel", tr })}
            />
          ) : (
            <EmptyState icon={ArrowLeftRight} title={t("transfers.noInter")} description={t("transfers.noInterHint")} />
          )}
        </TabsContent>
      </Tabs>

      <TransferFormDialog open={creating} onClose={() => setCreating(false)} />
      <ReceiveTransferDialog transfer={receiving} onClose={() => setReceiving(null)} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`transfers.confirm.${confirm.kind}.title`, { no: confirm.tr.transfer_no }) : ""}
        description={confirm ? t(`transfers.confirm.${confirm.kind}.body`) : ""}
        confirmLabel={confirm ? t(`transfers.confirm.${confirm.kind}.action`) : ""}
        onConfirm={() => confirm && (confirm.kind === "send" ? send.mutate(confirm.tr.id) : cancel.mutate(confirm.tr.id))}
      />
    </div>
  );
}
