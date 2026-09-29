import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Pencil, Send, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AccessControl } from "@/components/auth/AccessControl";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { BatchTag } from "@/components/common/BatchTag";
import { ReceiptStatusBadge } from "./ReceiptStatusBadge";
import { ReceiptAttachments } from "./ReceiptAttachments";
import { ReceiptCostDialog } from "./ReceiptCostDialog";
import { useAuth } from "@/context/auth";
import { useCancelReceipt, useDeleteReceipt, useGoodsReceipt, usePostReceipt } from "@/hooks/useGoodsReceipts";
import { useAttachments } from "@/hooks/useAttachments";
import { useProducts } from "@/hooks/useProducts";
import { useUoms } from "@/hooks/useUoms";
import { skuIndex } from "./receiptLine";
import { QueryState } from "@/components/common/QueryState";

type Pending = "post" | "cancel" | "delete" | null;

export function ReceiptDetailDialog({
  receiptId,
  onOpenChange,
  onEdit,
}: {
  receiptId: number | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { canRead, canUpdate } = useAuth();
  const receipt = useGoodsReceipt(receiptId);
  const { data } = receipt;
  const { data: products = [] } = useProducts();
  const { data: uoms = [] } = useUoms();
  const r = data?.receipt;
  const lines = r?.t_goods_receipt_lines ?? [];
  const { data: files = [] } = useAttachments("t_goods_receipt_lines", lines.map((l) => l.id));
  const post = usePostReceipt();
  const cancel = useCancelReceipt();
  const remove = useDeleteReceipt();
  const [pending, setPending] = useState<Pending>(null);
  const [pricing, setPricing] = useState(false);
  const index = skuIndex(products);
  const uomCode = (id: number) => uoms.find((u) => u.id === id)?.code ?? "?";
  const fmt = (n: number | null) => (n == null ? "-" : Number(n).toLocaleString("id-ID", { maximumFractionDigits: 3 }));

  const confirm = () => {
    if (!r) return;
    const close = { onSuccess: () => onOpenChange(false) };
    if (pending === "post") post.mutate(r.id);
    if (pending === "cancel") cancel.mutate(r.id, close);
    if (pending === "delete") remove.mutate(r.id, close);
  };

  return (
    <Dialog open={receiptId != null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono">{r?.gr_no}</span>
            {r && <ReceiptStatusBadge status={r.status} />}
          </DialogTitle>
        </DialogHeader>
        <QueryState query={receipt}>
          {r && (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Info label={t("receipts.fields.date")} value={r.receipt_date} />
                <Info label={t("receipts.fields.warehouse")} value={r.m_warehouses ? `${r.m_warehouses.code} · ${r.m_warehouses.name}` : "-"} />
                {r.source_type === "supplier" && <Info label={t("receipts.fields.supplier")} value={r.m_suppliers?.name ?? "-"} />}
                {r.source_type === "customer_return" && <Info label={t("receipts.fields.customer")} value={r.m_customers?.name ?? "-"} />}
                <Info label={t("receipts.fields.owner")} value={r.m_owners?.name ?? "-"} />
                <Info label={t("receipts.fields.source")} value={t(`receipts.sources.${r.source_type}`)} />
                <Info label={t("receipts.fields.reference")} value={r.reference_no ?? "-"} />
                <Info label={t("receipts.fields.note")} value={r.note ?? "-"} />
              </dl>

              <ol className="flex flex-col gap-2">
                {lines.map((l) => {
                  const e = index.get(l.sku_id);
                  const tasks = r.t_putaway_tasks.filter((x) => x.receipt_line_id === l.id);
                  const done = tasks.reduce((s, x) => s + Number(x.qty_done), 0);
                  const cost = data?.costs.get(l.id);
                  return (
                    <li key={l.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p>
                          <span className="font-mono text-xs">{e?.sku.sku_code}</span>
                          <span className="ml-2 text-muted-foreground">{e?.product.name}</span>
                        </p>
                        <p className="tabular-nums">
                          {fmt(l.qty_received)} {uomCode(l.uom_id)}
                          {canRead("valuation") && cost != null && (
                            <span className="ml-2 text-xs text-muted-foreground">@ {cost.toLocaleString("id-ID")}</span>
                          )}
                        </p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {l.batch_no && <BatchTag batchNo={l.batch_no} expiry={l.expiry_date} />}
                        {Number(l.qty_rejected) > 0 && (
                          <span className="text-rose-600 dark:text-rose-400">
                            {t("receipts.rejectedLine", { qty: `${fmt(l.qty_rejected)} ${uomCode(l.uom_id)}`, reason: l.reject_reason })}
                          </span>
                        )}
                        {l.base_qty_accepted != null && tasks.length > 0 && (
                          <span>{t("receipts.putawayProgress", { done: fmt(done), total: fmt(l.base_qty_accepted) })}</span>
                        )}
                      </div>
                      <div className="mt-2">
                        <ReceiptAttachments lineId={l.id} files={files.filter((f) => f.entity_id === l.id)} />
                      </div>
                    </li>
                  );
                })}
              </ol>

              <DialogFooter className="gap-2">
                {r.status === "draft" && (
                  <AccessControl feature="goods-receipt" action="delete">
                    <Button variant="ghost" className="h-11 gap-1.5 text-destructive" onClick={() => setPending("delete")}>
                      <Trash2 className="w-4 h-4" />
                      {t("common.delete")}
                    </Button>
                  </AccessControl>
                )}
                {r.status === "draft" && canUpdate("valuation") && lines.length > 0 && (
                  <Button variant="outline" className="h-11 gap-1.5" onClick={() => setPricing(true)}>
                    <Tag className="w-4 h-4" />
                    {t("receipts.costs.open")}
                  </Button>
                )}
                {r.status === "draft" && (
                  <AccessControl feature="goods-receipt" action="update">
                    <Button variant="outline" className="h-11 gap-1.5" onClick={() => setPending("cancel")}>
                      <Ban className="w-4 h-4" />
                      {t("receipts.cancel")}
                    </Button>
                    <Button variant="outline" className="h-11 gap-1.5" onClick={() => onEdit(r.id)}>
                      <Pencil className="w-4 h-4" />
                      {t("common.edit")}
                    </Button>
                    <Button className="h-11 gap-1.5" loading={post.isPending} onClick={() => setPending("post")}>
                      <Send className="w-4 h-4" />
                      {t("receipts.post")}
                    </Button>
                  </AccessControl>
                )}
              </DialogFooter>
            </>
          )}
        </QueryState>
        {r && data && (
          <ReceiptCostDialog
            key={r.id}
            receiptId={r.id}
            lines={lines}
            costs={data.costs}
            label={(l) => `${index.get(l.sku_id)?.sku.sku_code ?? "?"} · ${fmt(l.qty_received)} ${uomCode(l.uom_id)}`}
            open={pricing}
            onOpenChange={setPricing}
          />
        )}
        <ConfirmDialog
          open={pending != null}
          onOpenChange={(o) => !o && setPending(null)}
          title={pending ? t(`receipts.confirm.${pending}.title`) : ""}
          description={pending ? t(`receipts.confirm.${pending}.body`) : ""}
          confirmLabel={pending ? t(`receipts.confirm.${pending}.action`) : ""}
          onConfirm={confirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}
