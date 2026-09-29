import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SkuPicker } from "@/components/common/SkuPicker";
import { useAuth } from "@/context/auth";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useStockCounts } from "@/hooks/useStockCounts";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { useWarehouses } from "@/hooks/useWarehouses";
import { movementsQuery, type Movement } from "@/hooks/useStockMovement";
import { run } from "@/hooks/useOutboundMutation";
import i18n from "@/lib/i18n";
import { exportExcel, exportPdf, type Cell, type ReportColumn } from "@/lib/exportReport";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/errorMessage";

type Row = Record<string, Cell>;
type Need = "range" | "asOf" | "sku" | "count";
interface Params {
  from: string;
  to: string;
  asOf: string;
  method: "fifo" | "average";
  skuId: number | null;
  countId?: string;
  warehouseId: number | null;
}
type Lookup = ReturnType<typeof useSkuLookup>;

const REPORTS: { key: string; feature?: string; needs: Need[] }[] = [
  { key: "onHand", needs: [] },
  { key: "card", feature: "stock-audit", needs: ["sku", "range"] },
  { key: "movements", feature: "stock-audit", needs: ["range"] },
  { key: "valuation", feature: "valuation", needs: ["asOf"] },
  { key: "cogs", feature: "valuation", needs: ["range"] },
  { key: "opname", feature: "stock-opname", needs: ["count"] },
];

const iso = (d: Date) => d.toLocaleDateString("en-CA");

/** PostgREST returns at most 1000 rows per request; page until a short page. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const rows = await run(page(i, i + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Rows and columns (i18n keys under export.cols, optional number kind) per report. */
async function load(key: string, p: Params, lookup: Lookup): Promise<{ cols: [string, ("money" | "qty")?][]; rows: Row[] }> {
  const wh = p.warehouseId ?? undefined;
  switch (key) {
    case "onHand": {
      const rows = await fetchAll((a, b) => {
        let q = supabase
          .from("t_stock_balances")
          .select("sku_id, qty_on_hand, qty_reserved, m_warehouses(code), m_locations(full_code), m_batches(batch_no, expiry_date)")
          .gt("qty_on_hand", 0);
        if (wh) q = q.eq("warehouse_id", wh);
        return q.order("location_id").order("sku_id").range(a, b);
      });
      return {
        cols: [["warehouse"], ["location"], ["sku"], ["product"], ["batch"], ["expiry"], ["onHand", "qty"], ["reserved", "qty"]],
        rows: rows.map((r) => ({
          warehouse: r.m_warehouses?.code,
          location: r.m_locations?.full_code,
          sku: lookup.code(r.sku_id),
          product: lookup.label(r.sku_id),
          batch: r.m_batches?.batch_no,
          expiry: r.m_batches?.expiry_date,
          onHand: Number(r.qty_on_hand),
          reserved: Number(r.qty_reserved),
        })),
      };
    }
    case "card": {
      const rows = await run(supabase.rpc("stock_card", { p_sku_id: p.skuId!, p_from: p.from, p_to: p.to, p_warehouse_id: wh }));
      return {
        cols: [["date"], ["type"], ["ref"], ["batch"], ["from"], ["to"], ["in", "qty"], ["out", "qty"], ["balance", "qty"]],
        rows: rows.map((r) => ({
          date: r.movement_date,
          type: i18n.t(`audit.types.${r.movement_type}`),
          ref: r.ref_no,
          batch: r.batch_no,
          from: r.from_code,
          to: r.to_code,
          in: r.qty_in == null ? null : Number(r.qty_in),
          out: r.qty_out == null ? null : Number(r.qty_out),
          balance: Number(r.balance),
        })),
      };
    }
    case "movements": {
      const { q } = await movementsQuery({ from: p.from, to: p.to, warehouseId: p.warehouseId });
      const rows = (await fetchAll((a, b) => q.range(a, b))) as unknown as Movement[];
      return {
        cols: [["date"], ["type"], ["sku"], ["batch"], ["from"], ["to"], ["qty", "qty"], ["ref"], ["user"]],
        rows: rows.map((m) => ({
          date: m.movement_date,
          type: i18n.t(`audit.types.${m.movement_type}`),
          sku: lookup.code(m.sku_id),
          batch: m.m_batches?.batch_no,
          from: m.from?.full_code,
          to: m.to?.full_code,
          qty: Number(m.qty),
          ref: m.ref_no,
          user: m.actor?.full_name,
        })),
      };
    }
    case "valuation": {
      const rows = await fetchAll((a, b) =>
        supabase.rpc("stock_valuation", { p_as_of: p.asOf, p_method: p.method, p_warehouse_id: wh }).range(a, b),
      );
      return {
        cols: [["sku"], ["product"], ["category"], ["owner"], ["warehouse"], ["qty", "qty"], ["unitCost", "money"], ["value", "money"]],
        rows: rows.map((r) => ({
          sku: r.sku_code,
          product: r.product_name,
          category: r.category_name,
          owner: r.owner_name,
          warehouse: r.warehouse_code,
          qty: Number(r.qty),
          unitCost: r.unit_cost == null ? null : Number(r.unit_cost),
          value: r.value == null ? null : Number(r.value),
        })),
      };
    }
    case "cogs": {
      const rows = await run(supabase.rpc("cogs_report", { p_from: p.from, p_to: p.to }));
      return {
        cols: [["sku"], ["product"], ["category"], ["kind"], ["qty", "qty"], ["fifo", "money"], ["average", "money"]],
        rows: rows.map((r) => ({
          sku: r.sku_code,
          product: r.product_name,
          category: r.category_name,
          kind: i18n.t(`valuation.kinds.${r.kind}`),
          qty: Number(r.qty),
          fifo: Number(r.cost_fifo),
          average: Number(r.cost_average),
        })),
      };
    }
    default: {
      const rows = await run(supabase.rpc("count_review", { p_id: Number(p.countId) }));
      const bins = await run(supabase.from("m_locations").select("id, full_code").in("id", [...new Set(rows.map((r) => r.location_id))]));
      const bin = new Map(bins.map((b) => [b.id, b.full_code]));
      return {
        cols: [["location"], ["sku"], ["product"], ["system", "qty"], ["counted", "qty"], ["variance", "qty"], ["varianceValue", "money"]],
        rows: rows.map((r) => ({
          location: bin.get(r.location_id),
          sku: lookup.code(r.sku_id),
          product: lookup.label(r.sku_id),
          system: Number(r.system_qty),
          counted: r.counted_qty == null ? null : Number(r.counted_qty),
          variance: Number(r.variance),
          varianceValue: r.variance_value == null ? null : Number(r.variance_value),
        })),
      };
    }
  }
}

export default function ExportPage() {
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const warehouseId = useWarehouseFilter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: settings } = useSettings();
  const { data: counts = [] } = useStockCounts(warehouseId);
  const lookup = useSkuLookup();
  const reports = REPORTS.filter((r) => !r.feature || canRead(r.feature));
  const [key, setKey] = useState(reports[0]?.key ?? "onHand");
  const now = new Date();
  const [p, setP] = useState<Omit<Params, "warehouseId" | "method"> & { method?: Params["method"] }>({
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(now),
    asOf: iso(now),
    skuId: null,
  });
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const report = reports.find((r) => r.key === key) ?? reports[0];
  const decided = counts.filter((c) => c.status === "approved");
  const ready = report.needs.every((n) => (n === "sku" ? p.skuId : n === "count" ? p.countId : true));

  const go = async (kind: "xlsx" | "pdf") => {
    setBusy(kind);
    try {
      const method = p.method ?? ((settings?.valuation_method as Params["method"]) || "fifo");
      const { cols, rows } = await load(report.key, { ...p, method, warehouseId }, lookup);
      const title = t(`export.reports.${report.key}.title`);
      const whName = warehouses.find((w) => w.id === warehouseId)?.name ?? t("export.allWarehouses");
      const subtitle = [
        whName,
        report.needs.includes("range") && `${p.from} s/d ${p.to}`,
        report.needs.includes("asOf") && `${t("valuation.asOf")} ${p.asOf} · ${t(`valuation.methods.${method}`)}`,
        report.needs.includes("sku") && p.skuId && lookup.code(p.skuId),
        report.needs.includes("count") && decided.find((c) => String(c.id) === p.countId)?.count_no,
      ]
        .filter(Boolean)
        .join(" · ");
      const columns: ReportColumn<Row>[] = cols.map(([c, kindOf]) => ({ header: t(`export.cols.${c}`), kind: kindOf, value: (r) => r[c] }));
      const doc = { company: settings?.company_name ?? "StockDesk", title, subtitle, fileName: `${report.key}-${iso(now)}`, columns, rows };
      if (!rows.length) toast.info(t("export.emptyReport"));
      await (kind === "xlsx" ? exportExcel(doc) : exportPdf(doc));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader title={t("export.title")} subtitle={t("export.subtitle")} />
      <div data-tour="export-reports" className="grid gap-2 sm:grid-cols-2">
        {reports.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setKey(r.key)}
            aria-pressed={r.key === report.key}
            className={cn(
              "rounded-xl border bg-card p-4 text-left transition-colors",
              r.key === report.key ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50",
            )}
          >
            <p className="text-sm font-semibold">{t(`export.reports.${r.key}.title`)}</p>
            <p className="text-xs text-muted-foreground">{t(`export.reports.${r.key}.desc`)}</p>
          </button>
        ))}
      </div>

      <div data-tour="export-params" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {t("export.warehouseNote", { name: warehouses.find((w) => w.id === warehouseId)?.name ?? t("export.allWarehouses") })}
        </p>
        {report.needs.includes("sku") && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">SKU</Label>
            <SkuPicker products={lookup.products} value={p.skuId} onChange={(skuId) => setP({ ...p, skuId })} className="h-10" />
          </div>
        )}
        {report.needs.includes("range") && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("master.filters.dateRange")}</Label>
            <DateRangeFilter value={{ from: p.from, to: p.to }} onChange={(r) => setP({ ...p, from: r.from ?? p.from, to: r.to ?? p.to })} />
          </div>
        )}
        {report.needs.includes("asOf") && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="export-asof" className="text-xs">{t("valuation.asOf")}</Label>
              <Input id="export-asof" type="date" className="h-10 w-44" value={p.asOf} max={iso(now)} onChange={(e) => e.target.value && setP({ ...p, asOf: e.target.value })} />
            </div>
            <FilterSelect
              value={p.method ?? ((settings?.valuation_method as Params["method"]) || "fifo")}
              onChange={(method) => setP({ ...p, method })}
              aria-label={t("valuation.method")}
              options={[
                { value: "fifo", label: t("valuation.methods.fifo") },
                { value: "average", label: t("valuation.methods.average") },
              ]}
            />
          </div>
        )}
        {report.needs.includes("count") &&
          (decided.length ? (
            <FilterSelect
              value={p.countId}
              onChange={(countId) => setP({ ...p, countId })}
              allLabel={t("export.pickCount")}
              aria-label={t("export.pickCount")}
              options={decided.map((c) => ({ value: String(c.id), label: `${c.count_no} · ${t(`counts.status.${c.status}`)}` }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t("export.noCounts")}</p>
          ))}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button className="h-10 flex-1 gap-2 sm:flex-none" loading={busy === "xlsx"} disabled={!ready || !!busy} onClick={() => go("xlsx")}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" className="h-10 flex-1 gap-2 sm:flex-none" loading={busy === "pdf"} disabled={!ready || !!busy} onClick={() => go("pdf")}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
