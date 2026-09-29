import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Warehouse } from "lucide-react";
import { useWarehouses } from "@/hooks/useWarehouses";
import { setWarehouseFilter, useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { SelectField } from "@/components/common/SelectField";

/** Global warehouse filter in the header; every page reads it through useWarehouseFilter. */
export function WarehouseSwitcher() {
  const { t } = useTranslation();
  const { data: warehouses = [], isSuccess } = useWarehouses();
  const value = useWarehouseFilter();
  // A saved warehouse that no longer exists (e.g. after reseed) would empty every page; fall back to all.
  const stale = isSuccess && value != null && !warehouses.some((w) => w.id === value);
  useEffect(() => {
    if (stale) setWarehouseFilter(null);
  }, [stale]);
  if (!warehouses.length) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 hover:bg-secondary/70">
      <Warehouse className="w-3.5 h-3.5 shrink-0 text-foreground" />
      <SelectField
        value={value ?? ""}
        onChange={(e) => setWarehouseFilter(e.target.value ? Number(e.target.value) : null)}
        aria-label={t("warehouses.filter")}
        className="h-8 w-auto max-w-28 sm:max-w-56 [&_[data-wh-name]]:hidden sm:[&_[data-wh-name]]:inline gap-1.5 border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none focus:ring-0 focus:ring-offset-0 data-[state=open]:ring-0"
      >
        <option value="">{t("warehouses.all")}</option>
        {warehouses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.code}
            <span data-wh-name> · {w.name}</span>
          </option>
        ))}
      </SelectField>
    </div>
  );
}
