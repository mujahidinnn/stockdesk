import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Package, Pencil, Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pager } from "@/components/ui/Pager";
import { AccessControl } from "@/components/auth/AccessControl";
import { StatusBadge } from "@/components/common/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import type { Product, Sku } from "@/hooks/useProducts";
import { cn } from "@/lib/utils";
import { attributeValues } from "@/lib/variants";
import { Button } from "@/components/ui/button";

const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground";

export function ProductsTable({
  products,
  uomCode,
  categoryName,
  ownerName,
  selected,
  onSelectedChange,
  onEditProduct,
  onAddSku,
  onEditSku,
}: {
  products: Product[];
  uomCode: (id: number) => string;
  categoryName: (id: number | null) => string;
  ownerName: (id: number) => string;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  onEditProduct: (p: Product) => void;
  onAddSku: (p: Product) => void;
  onEditSku: (p: Product, s: Sku) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const { paged: pageItems, page, pageCount, setPage, pageSize } = usePagination(products);

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const units = (s: Sku) =>
    s.m_sku_uoms
      .filter((u) => u.factor_to_base > 1)
      .sort((a, b) => b.factor_to_base - a.factor_to_base)
      .map((u) => `${uomCode(u.uom_id)}=${u.factor_to_base}`)
      .join(" · ");

  if (!products.length) return <EmptyState icon={Package} title={t("products.empty")} description={t("products.emptyHint")} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="w-8" />
              <th className="px-3 py-3 font-semibold hidden sm:table-cell">{t("products.fields.code")}</th>
              <th className="px-3 py-3 font-semibold">{t("products.fields.name")}</th>
              <th className="px-3 py-3 font-semibold hidden md:table-cell">{t("products.fields.category")}</th>
              <th className="px-3 py-3 font-semibold hidden md:table-cell">{t("products.fields.owner")}</th>
              <th className="px-3 py-3 font-semibold">{t("common.status")}</th>
              <th className="px-3 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => {
              const expanded = open.has(p.id);
              return (
                <Fragment key={p.id}>
                  <tr className="border-b border-border/40 hover:bg-secondary/40">
                    <td className="pl-2">
                      <button
                        onClick={() => setOpen(toggle(open, p.id))}
                        aria-expanded={expanded}
                        aria-label={t("products.showSkus")}
                        className={iconBtn}
                      >
                        <ChevronRight className={cn("w-4 h-4 transition-transform", expanded && "rotate-90")} />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs hidden sm:table-cell">{p.code}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono sm:hidden">{p.code} · </span>
                        {t("products.skuCount", { count: p.m_skus.length })}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{categoryName(p.category_id)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground hidden md:table-cell">{ownerName(p.owner_id)}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge tone={p.is_active ? "ok" : "muted"}>
                        {p.is_active ? t("common.active") : t("common.inactive")}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <AccessControl feature="master-product" action="create">
                          <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onAddSku(p)} aria-label={t("products.addSkuShort")}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </AccessControl>
                        <AccessControl feature="master-product" action="update">
                          <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onEditProduct(p)} aria-label={t("common.edit")}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </AccessControl>
                      </div>
                    </td>
                  </tr>
                  {expanded &&
                    [...p.m_skus]
                      .sort((a, b) => a.sku_code.localeCompare(b.sku_code))
                      .map((s) => (
                        <tr key={s.id} className="border-b border-border/40 bg-secondary/20 text-xs">
                          <td className="pl-3">
                            <Checkbox
                              checked={selected.has(s.id)}
                              onCheckedChange={() => onSelectedChange(toggle(selected, s.id))}
                              aria-label={t("labels.select", { sku: s.sku_code })}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono hidden sm:table-cell">{s.sku_code}</td>
                          <td className="px-3 py-2">
                            <p className="font-mono sm:hidden">{s.sku_code}</p>
                            <p>{attributeValues(p.variant_attributes, s.attributes).join(" / ") || "-"}</p>
                            <p className="text-muted-foreground font-mono">{s.barcode ?? t("products.noBarcode")}</p>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                            {uomCode(s.base_uom_id)}
                            {units(s) && <span className="block">{units(s)}</span>}
                          </td>
                          <td className="px-3 py-2 hidden md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {s.track_batch && <StatusBadge tone="info">{t("products.batch")}</StatusBadge>}
                              {s.track_expiry && <StatusBadge tone="warn">{t("products.expiry")}</StatusBadge>}
                              <span className="text-muted-foreground">ROP {s.reorder_point}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={s.is_active ? "ok" : "muted"}>
                              {s.is_active ? t("common.active") : t("common.inactive")}
                            </StatusBadge>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end">
                              <AccessControl feature="master-product" action="update">
                                <Button variant="ghost" size="icon" className={iconBtn} onClick={() => onEditSku(p, s)} aria-label={t("common.edit")}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </AccessControl>
                            </div>
                          </td>
                        </tr>
                      ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} total={products.length} pageSize={pageSize} onPageChange={setPage} />
    </div>
  );
}
