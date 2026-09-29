import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { ScanInput } from "@/components/scanner/ScanInput";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ReceiptLinesTable } from "./ReceiptLinesTable";
import { fromSaved, lineProblems, newLine, skuIndex, type DraftLine } from "./receiptLine";
import { useProducts } from "@/hooks/useProducts";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useCustomers } from "@/hooks/useCustomers";
import { useOwners } from "@/hooks/useOwners";
import { useUoms } from "@/hooks/useUoms";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useGoodsReceipt, usePostReceipt, useSaveReceiptDraft } from "@/hooks/useGoodsReceipts";
import { resolveBarcode } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";
import { SelectField } from "@/components/common/SelectField";
import { QueryState } from "@/components/common/QueryState";

const SOURCES = ["supplier", "production", "customer_return", "client_inbound"] as const;
type Source = (typeof SOURCES)[number];

/** Create or edit a draft receipt; scanning adds or bumps lines. Posting saves first, then posts. */
export function GoodsReceiptFormDialog({
  receiptId,
  open,
  onOpenChange,
}: {
  receiptId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: products = [] } = useProducts();
  const { data: warehouses = [] } = useWarehouses();
  const { data: suppliers = [] } = useSuppliers();
  const { data: customers = [] } = useCustomers();
  const { data: owners = [] } = useOwners();
  const { data: uoms = [] } = useUoms();
  const filterWh = useWarehouseFilter();
  const existingQ = useGoodsReceipt(receiptId);
  const existing = existingQ.data;
  const save = useSaveReceiptDraft();
  const post = usePostReceipt();

  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [source, setSource] = useState<Source>("supplier");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [showProblems, setShowProblems] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);

  // Load once per opening: the draft being edited, or sensible defaults.
  useEffect(() => {
    if (!open) return;
    const r = existing?.receipt;
    if (receiptId && !r) return;
    setWarehouseId(r?.warehouse_id ?? filterWh ?? warehouses[0]?.id ?? null);
    setSource((r?.source_type as Source) ?? "supplier");
    setSupplierId(r?.supplier_id ?? null);
    setCustomerId(r?.customer_id ?? null);
    setOwnerId(r?.owner_id ?? owners.find((o) => o.owner_type === "in_house")?.id ?? null);
    setDate(r?.receipt_date ?? new Date().toLocaleDateString("en-CA"));
    setReference(r?.reference_no ?? "");
    setNote(r?.note ?? "");
    setLines(r ? r.t_goods_receipt_lines.map((l) => fromSaved(l)) : []);
    setRemoved([]);
    setShowProblems(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receiptId, existing]);

  // Master lists can arrive after the dialog opened; fill the defaults then.
  useEffect(() => {
    if (!open) return;
    if (warehouseId == null && warehouses.length) setWarehouseId(filterWh ?? warehouses[0].id);
    if (ownerId == null && owners.length) setOwnerId(owners.find((o) => o.owner_type === "in_house")?.id ?? owners[0].id);
  }, [open, warehouses, owners, warehouseId, ownerId, filterWh]);

  // Stock belongs to the product's owner, so only that owner's SKUs can be received here.
  const ownerProducts = useMemo(() => products.filter((p) => p.owner_id === ownerId), [products, ownerId]);
  const index = useMemo(() => skuIndex(ownerProducts), [ownerProducts]);
  const uomCode = (id: number) => uoms.find((u) => u.id === id)?.code ?? "?";

  const patchLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function onScan(code: string) {
    const hit = resolveBarcode(ownerProducts, code);
    scanFeedback(!!hit);
    if (!hit) return toast.error(t("scanner.unknown", { code }));
    setLines((ls) => {
      const same = [...ls].reverse().find((l) => l.sku_id === hit.skuId && l.uom_id === hit.uomId);
      if (same) return ls.map((l) => (l === same ? { ...l, qty_received: l.qty_received + 1 } : l));
      return [...ls, newLine({ sku_id: hit.skuId, uom_id: hit.uomId })];
    });
    toast.success(index.get(hit.skuId)?.sku.sku_code ?? code, { id: "scan" });
  }

  // Client inbound only takes a client's stock (the DB refuses the rest too).
  const ownerChoices = owners.filter((o) => o.is_active && (source !== "client_inbound" || o.owner_type === "client"));
  const ownerProblem = !ownerId || !ownerChoices.some((o) => o.id === ownerId);
  const headerProblem =
    !warehouseId || ownerProblem || (source === "supplier" && !supplierId) || (source === "customer_return" && !customerId);
  const invalid = headerProblem || !lines.length || lines.some((l) => lineProblems(l, index.get(l.sku_id ?? -1)?.sku).length);

  async function persist() {
    return save.mutateAsync({
      id: receiptId,
      header: {
        warehouse_id: warehouseId!,
        source_type: source,
        supplier_id: source === "supplier" ? supplierId : null,
        customer_id: source === "customer_return" ? customerId : null,
        owner_id: ownerId!,
        receipt_date: date,
        reference_no: reference.trim() || null,
        note: note.trim() || null,
      },
      lines: lines
        .filter((l) => l.sku_id && l.uom_id)
        .map((l) => ({
          id: l.id,
          sku_id: l.sku_id!,
          uom_id: l.uom_id!,
          qty_received: l.qty_received,
          qty_rejected: l.qty_rejected,
          reject_reason: l.qty_rejected > 0 ? l.reject_reason.trim() : null,
          batch_no: l.batch_no.trim() || null,
          mfg_date: l.mfg_date || null,
          expiry_date: l.expiry_date || null,
        })),
      removedLineIds: removed,
    });
  }

  async function saveDraft() {
    setShowProblems(true);
    if (headerProblem) return toast.error(t("receipts.problems.header"));
    await persist();
    onOpenChange(false);
  }

  function askPost() {
    setShowProblems(true);
    if (invalid) return toast.error(t("receipts.problems.fixFirst"));
    setConfirmPost(true);
  }

  async function saveAndPost() {
    const id = await persist();
    await post.mutateAsync(id);
    onOpenChange(false);
  }

  const busy = save.isPending || post.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {existing?.receipt.gr_no ?? t("receipts.new")}
          </DialogTitle>
        </DialogHeader>

        <QueryState query={existingQ}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("receipts.fields.warehouse")}>
              <SelectField value={warehouseId ?? ""} onChange={(e) => setWarehouseId(Number(e.target.value))} className={selectClass}>
                {warehouses.filter((w) => w.is_active).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} · {w.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t("receipts.fields.source")}>
              <SelectField value={source} onChange={(e) => setSource(e.target.value as Source)} className={selectClass}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {t(`receipts.sources.${s}`)}
                  </option>
                ))}
              </SelectField>
            </Field>
            {source === "supplier" ? (
              <Field label={t("receipts.fields.supplier")} error={showProblems && !supplierId ? t("receipts.problems.supplier") : undefined}>
                <SelectField value={supplierId ?? ""} onChange={(e) => setSupplierId(Number(e.target.value) || null)} className={selectClass}>
                  <option value="">-</option>
                  {suppliers.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
            ) : source === "customer_return" ? (
              <Field label={t("receipts.fields.customer")} error={showProblems && !customerId ? t("receipts.problems.customer") : undefined}>
                <SelectField value={customerId ?? ""} onChange={(e) => setCustomerId(Number(e.target.value) || null)} className={selectClass}>
                  <option value="">-</option>
                  {customers.filter((c) => c.is_active).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
              </Field>
            ) : (
              <div />
            )}
            <Field
              label={t("receipts.fields.owner")}
              hint={lines.length ? t("receipts.ownerLocked") : undefined}
              error={showProblems && ownerProblem ? t("receipts.problems.owner") : undefined}
            >
              <SelectField
                value={ownerId ?? ""}
                disabled={lines.length > 0}
                onChange={(e) => setOwnerId(Number(e.target.value) || null)}
                className={selectClass}
              >
                <option value="">-</option>
                {ownerChoices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t("receipts.fields.date")}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t("receipts.fields.reference")}>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / SJ" />
            </Field>
            <Field label={t("receipts.fields.note")} className="sm:col-span-3">
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>

          <ScanInput onScan={onScan} placeholder={t("receipts.scanPlaceholder")} />

          <ReceiptLinesTable
            lines={lines}
            products={ownerProducts}
            uomCode={uomCode}
            showProblems={showProblems}
            onChange={patchLine}
            onRemove={(key) => {
              const l = lines.find((x) => x.key === key);
              if (l?.id) setRemoved((r) => [...r, l.id!]);
              setLines((ls) => ls.filter((x) => x.key !== key));
            }}
          />
          <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])} className="h-11 gap-1.5 w-full sm:w-fit">
            <Plus className="w-4 h-4" />
            {t("receipts.addLine")}
          </Button>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11">
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="secondary" onClick={saveDraft} loading={save.isPending && !post.isPending} disabled={busy} className="h-11">
              {t("receipts.saveDraft")}
            </Button>
            <Button type="button" onClick={askPost} loading={post.isPending} disabled={busy} className="h-11 gap-1.5">
              <Send className="w-4 h-4" />
              {t("receipts.post")}
            </Button>
          </DialogFooter>
        </QueryState>
        <ConfirmDialog
          open={confirmPost}
          onOpenChange={setConfirmPost}
          title={t("receipts.confirm.post.title")}
          description={t("receipts.confirm.post.body")}
          confirmLabel={t("receipts.confirm.post.action")}
          onConfirm={saveAndPost}
        />
      </DialogContent>
    </Dialog>
  );
}
