import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/common/Field";
import { SkuPicker } from "@/components/common/SkuPicker";
import { ScanInput } from "@/components/scanner/ScanInput";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useOwners } from "@/hooks/useOwners";
import { useCustomers } from "@/hooks/useCustomers";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useSaveSalesOrder, type SalesOrder } from "@/hooks/useSalesOrders";
import { resolveBarcode } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";
import { cn } from "@/lib/utils";
import { SelectField } from "@/components/common/SelectField";

type Line = { key: string; id?: number; sku_id: number | null; uom_id: number | null; qty: number };
const blank = (p: Partial<Line> = {}): Line => ({ key: crypto.randomUUID(), sku_id: null, uom_id: null, qty: 1, ...p });
type Channel = "manual" | "pos" | "marketplace";

export function SalesOrderFormDialog({ order, onClose }: { order: SalesOrder | null | "new"; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: warehouses = [] } = useWarehouses();
  const { data: owners = [] } = useOwners();
  const { data: customers = [] } = useCustomers();
  const filterWh = useWarehouseFilter();
  const lookup = useSkuLookup();
  const save = useSaveSalesOrder();
  const editing = order && order !== "new" ? order : null;

  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [channel, setChannel] = useState<Channel>("manual");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [removed, setRemoved] = useState<number[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!order) return;
    setWarehouseId(editing?.warehouse_id ?? filterWh ?? null);
    setOwnerId(editing?.owner_id ?? null);
    setCustomerId(editing?.customer_id ?? null);
    setCustomerName(editing?.customer_name ?? "");
    setShipTo(editing?.ship_to ?? "");
    setChannel((editing?.channel as Channel) ?? "manual");
    setReference(editing?.reference_no ?? "");
    setDate(editing?.order_date ?? new Date().toLocaleDateString("en-CA"));
    setLines(editing?.t_sales_order_lines.map((l) => blank({ id: l.id, sku_id: l.sku_id, uom_id: l.uom_id, qty: Number(l.qty) })) ?? []);
    setRemoved([]);
    setTried(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  useEffect(() => {
    if (!order) return;
    if (warehouseId == null && warehouses.length) setWarehouseId(filterWh ?? warehouses[0].id);
    if (ownerId == null && owners.length) setOwnerId(owners.find((o) => o.owner_type === "in_house")?.id ?? owners[0].id);
  }, [order, warehouses, owners, warehouseId, ownerId, filterWh]);

  const ownerProducts = useMemo(() => lookup.products.filter((p) => p.owner_id === ownerId), [lookup.products, ownerId]);
  const bad = (l: Line) => !l.sku_id || !l.uom_id || !(l.qty > 0);
  const invalid = !warehouseId || !ownerId || !customerName.trim() || !lines.length || lines.some(bad);

  function onScan(code: string) {
    const hit = resolveBarcode(ownerProducts, code);
    scanFeedback(!!hit);
    if (!hit) return toast.error(t("scanner.unknown", { code }));
    setLines((ls) => {
      const same = ls.find((l) => l.sku_id === hit.skuId && l.uom_id === hit.uomId);
      return same ? ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l)) : [...ls, blank({ sku_id: hit.skuId, uom_id: hit.uomId })];
    });
  }

  function submit() {
    setTried(true);
    if (invalid) return toast.error(t("orders.problems.fixFirst"));
    save.mutate(
      {
        id: editing?.id ?? null,
        header: {
          warehouse_id: warehouseId!,
          owner_id: ownerId!,
          customer_id: customerId,
          customer_name: customerName.trim(),
          ship_to: shipTo.trim() || null,
          channel,
          reference_no: reference.trim() || null,
          order_date: date,
        },
        lines: lines.map((l) => ({ id: l.id, sku_id: l.sku_id!, uom_id: l.uom_id!, qty: l.qty })),
        removedLineIds: removed,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base">{editing?.so_no ?? t("orders.new")}</DialogTitle>
        </DialogHeader>
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
          <Field label={t("receipts.fields.owner")}>
            <SelectField value={ownerId ?? ""} disabled={lines.length > 0} onChange={(e) => setOwnerId(Number(e.target.value))} className={selectClass}>
              {owners.filter((o) => o.is_active).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label={t("orders.fields.channel")}>
            <SelectField value={channel} onChange={(e) => setChannel(e.target.value as Channel)} className={selectClass}>
              {(["manual", "pos", "marketplace"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`orders.channels.${c}`)}
                </option>
              ))}
            </SelectField>
          </Field>
          <Field label={t("orders.fields.customer")} error={tried && !customerName.trim() ? t("orders.problems.customer") : undefined}>
            <Input
              list="so-customers"
              value={customerName}
              onChange={(e) => {
                const c = customers.find((x) => x.name === e.target.value);
                setCustomerName(e.target.value);
                setCustomerId(c?.id ?? null);
                if (c?.address && !shipTo) setShipTo(c.address);
              }}
            />
            <datalist id="so-customers">
              {customers.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field label={t("orders.fields.reference")}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label={t("orders.fields.date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t("orders.fields.shipTo")} className="sm:col-span-3">
            <Input value={shipTo} onChange={(e) => setShipTo(e.target.value)} />
          </Field>
        </div>

        <ScanInput onScan={onScan} placeholder={t("orders.scanPlaceholder")} autoFocus={false} />

        <ol className="flex flex-col gap-2">
          {lines.map((l) => {
            const sku = l.sku_id ? lookup.get(l.sku_id)?.sku : undefined;
            return (
              <li key={l.key} className={cn("grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_6rem_auto]", tried && bad(l) ? "border-destructive/60" : "border-border")}>
                <SkuPicker
                  products={ownerProducts}
                  value={l.sku_id}
                  onChange={(skuId) =>
                    setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, sku_id: skuId, uom_id: lookup.get(skuId)?.sku.base_uom_id ?? null } : x)))
                  }
                  className="col-span-2 sm:col-span-1"
                />
                <SelectField
                  value={l.uom_id ?? ""}
                  disabled={!sku}
                  aria-label={t("receipts.fields.uom")}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, uom_id: Number(e.target.value) } : x)))}
                  className={cn(selectClass, "h-10")}
                >
                  {[...(sku?.m_sku_uoms ?? [])]
                    .sort((a, b) => a.factor_to_base - b.factor_to_base)
                    .map((u) => (
                      <option key={u.uom_id} value={u.uom_id}>
                        {lookup.uomCode(u.uom_id)}
                      </option>
                    ))}
                </SelectField>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={l.qty}
                  aria-label={t("orders.fields.qty")}
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Number(e.target.value) } : x)))}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={t("common.delete")}
                  onClick={() => {
                    if (l.id) setRemoved((r) => [...r, l.id!]);
                    setLines((ls) => ls.filter((x) => x.key !== l.key));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ol>
        <Button type="button" variant="outline" className="h-11 w-full gap-1.5 sm:w-fit" onClick={() => setLines((ls) => [...ls, blank()])}>
          <Plus className="h-4 w-4" />
          {t("receipts.addLine")}
        </Button>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button className="h-11" loading={save.isPending} onClick={submit}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
