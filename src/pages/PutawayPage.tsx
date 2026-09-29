import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { SectionHeader } from "@/components/common/MasterSection";
import { ScanInput } from "@/components/scanner/ScanInput";
import { PutawayTaskList } from "@/components/inbound/PutawayTaskList";
import { PutawaySuggestion } from "@/components/inbound/PutawaySuggestion";
import { usePutawayTasks, type PutawayTask } from "@/hooks/usePutawayTasks";
import { useSkuLookup } from "@/hooks/useSkuLookup";
import { useLocations } from "@/hooks/useLocations";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useWarehouseFilter } from "@/hooks/useWarehouseFilter";
import { resolveBarcode } from "@/lib/barcode";
import { scanFeedback } from "@/lib/scanFeedback";

export default function PutawayPage() {
  const { t } = useTranslation();
  const filterWh = useWarehouseFilter();
  const { data: warehouses = [] } = useWarehouses();
  const { data: tasks = [] } = usePutawayTasks(filterWh);
  const lookup = useSkuLookup();
  const products = lookup.products;
  const [open, setOpen] = useState<PutawayTask | null>(null);
  const { data: locations = [] } = useLocations(open?.warehouse_id ?? filterWh ?? warehouses[0]?.id);

  const skuLabel = (id: number) => ({ code: lookup.code(id), name: lookup.label(id) });
  const conversions = lookup.conversions;

  // Scanning an item opens its oldest open task.
  function onScan(code: string) {
    const hit = resolveBarcode(products, code);
    const task = hit && tasks.find((x) => x.sku_id === hit.skuId);
    scanFeedback(!!task);
    if (!task) return toast.error(t("putaway.noTaskFor", { code }));
    setOpen(task);
  }

  const current = open && tasks.find((x) => x.id === open.id);

  return (
    <div className="flex w-full flex-col gap-4">
      <SectionHeader title={t("putaway.title")} count={tasks.length} subtitle={t("putaway.subtitle")} />
      <div data-tour="putaway-scan">
        <ScanInput onScan={onScan} placeholder={t("putaway.scanItem")} />
      </div>
      <div data-tour="putaway-list">
        <PutawayTaskList tasks={tasks} skuLabel={skuLabel} conversions={conversions} onOpen={setOpen} />
      </div>
      <PutawaySuggestion
        task={current ?? null}
        title={current ? `${skuLabel(current.sku_id).code} · ${skuLabel(current.sku_id).name}` : ""}
        locations={locations}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
