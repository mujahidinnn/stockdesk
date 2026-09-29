import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toolbar, SearchInput } from "@/components/common/MasterSection";
import { FilterSelect } from "@/components/common/FilterSelect";
import { DateRangeFilter } from "@/components/common/DateRangeFilter";
import { SkuPicker } from "@/components/common/SkuPicker";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useUsers } from "@/hooks/useUsers";
import type { MovementFilters as Filters } from "@/hooks/useStockMovement";

export const MOVEMENT_TYPES = [
  "receipt", "qc_reject", "putaway", "bin_transfer", "pick", "dispatch", "transfer_out", "transfer_in", "adjustment", "return",
] as const;

export function MovementFilters({ value, onChange, withType = true }: { value: Filters; onChange: (f: Filters) => void; withType?: boolean }) {
  const { t } = useTranslation();
  const lookup = useSkuLookup();
  const { data: users = [] } = useUsers();
  return (
    <Toolbar>
      <DateRangeFilter value={{ from: value.from, to: value.to }} onChange={(r) => onChange({ ...value, from: r.from ?? value.from, to: r.to ?? value.to })} />
      <div className="flex w-full items-center gap-1 sm:w-72">
        <SkuPicker products={lookup.products} value={value.skuId ?? null} onChange={(skuId) => onChange({ ...value, skuId })} className="h-8 text-xs" />
        {value.skuId && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange({ ...value, skuId: null })} aria-label={t("common.clearDate")}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {withType && (
        <>
          <FilterSelect
            value={value.type}
            onChange={(type) => onChange({ ...value, type })}
            allLabel={t("audit.allTypes")}
            options={MOVEMENT_TYPES.map((m) => ({ value: m, label: t(`audit.types.${m}`) }))}
          />
          <FilterSelect
            value={value.userId}
            onChange={(userId) => onChange({ ...value, userId })}
            allLabel={t("audit.allUsers")}
            aria-label={t("audit.user")}
            options={users.map((u) => ({ value: u.id, label: u.full_name ?? u.email ?? u.id }))}
          />
          <SearchInput value={value.refNo ?? ""} onChange={(refNo) => onChange({ ...value, refNo })} placeholder={t("audit.refSearch")} />
          <SearchInput value={value.batchNo ?? ""} onChange={(batchNo) => onChange({ ...value, batchNo })} placeholder={t("audit.batchSearch")} />
        </>
      )}
    </Toolbar>
  );
}
