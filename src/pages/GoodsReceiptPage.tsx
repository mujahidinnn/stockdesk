import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pager } from "@/components/ui/Pager";
import { AccessControl } from "@/components/auth/AccessControl";
import { SearchInput, SectionHeader, Toolbar } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { GoodsReceiptFormDialog } from "@/components/inbound/GoodsReceiptFormDialog";
import { ReceiptDetailDialog } from "@/components/inbound/ReceiptDetailDialog";
import { ReceiptStatusBadge } from "@/components/inbound/ReceiptStatusBadge";
import { useGoodsReceipts } from "@/hooks/useGoodsReceipts";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { usePagination } from "@/hooks/usePagination";

const STATUSES = ["draft", "received", "putaway_done", "cancelled"] as const;

export default function GoodsReceiptPage() {
  const { t } = useTranslation();
  const warehouseId = useWarehouseFilter();
  const { data: receipts = [], isLoading } = useGoodsReceipts(warehouseId);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>();
  const [form, setForm] = useState<{ id: number | null } | null>(null);
  const [detail, setDetail] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(
      (r) =>
        (!status || r.status === status) &&
        (!q || `${r.gr_no} ${r.reference_no ?? ""} ${r.m_suppliers?.name ?? r.m_customers?.name ?? ""}`.toLowerCase().includes(q)),
    );
  }, [receipts, search, status]);
  const { paged, page, pageCount, setPage, pageSize } = usePagination(filtered);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("receipts.title")}
        count={receipts.length}
        subtitle={t("receipts.subtitle")}
        tour="receipts-actions"
        actions={
          <AccessControl feature="goods-receipt" action="create">
            <Button size="sm" onClick={() => setForm({ id: null })} className="h-8 gap-1.5">
              <Plus className="w-4 h-4" />
              {t("receipts.new")}
            </Button>
          </AccessControl>
        }
      />
      <Toolbar>
        <SearchInput value={search} onChange={setSearch} placeholder={t("receipts.search")} tour="receipts-search" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          allLabel={t("common.allStatus")}
          options={STATUSES.map((s) => ({ value: s, label: t(`receipts.status.${s}`) }))}
        />
      </Toolbar>

      {!isLoading && !filtered.length ? (
        <EmptyState icon={PackagePlus} title={receipts.length ? t("common.noResults") : t("receipts.empty")} description={receipts.length ? undefined : t("receipts.emptyHint")} action={!receipts.length && (
            <AccessControl feature="goods-receipt" action="create">
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setForm({ id: null })}>
                <Plus className="h-4 w-4" />
                {t("receipts.new")}
              </Button>
            </AccessControl>
          )} />
      ) : (
        <ul data-tour="receipts-list" className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {paged.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setDetail(r.id)}
                className="grid w-full grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-secondary/40 sm:grid-cols-[12rem_1fr_8rem_7rem_auto]"
              >
                <span className="font-mono text-xs font-medium">{r.gr_no}</span>
                <span className="justify-self-end sm:order-last">
                  <ReceiptStatusBadge status={r.status} />
                </span>
                <span className="truncate text-sm">
                  {r.m_suppliers?.name ?? r.m_customers?.name ?? t(`receipts.sources.${r.source_type}`)}
                  {r.reference_no && <span className="ml-2 text-xs text-muted-foreground">{r.reference_no}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{r.m_warehouses?.code} · {r.receipt_date}</span>
                <span className="text-xs text-muted-foreground">{t("receipts.lineCount", { count: r.t_goods_receipt_lines.length })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPageChange={setPage} />

      {form && (
        <GoodsReceiptFormDialog open receiptId={form.id} onOpenChange={(o) => !o && setForm(null)} />
      )}
      <ReceiptDetailDialog
        receiptId={detail}
        onOpenChange={(o) => !o && setDetail(null)}
        onEdit={(id) => {
          setDetail(null);
          setForm({ id });
        }}
      />
    </div>
  );
}
