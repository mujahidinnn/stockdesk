import { useTranslation } from "react-i18next";
import { ArrowRight, PackageCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { BatchTag } from "@/components/common/BatchTag";
import { LocationTag } from "@/components/common/LocationTag";
import { QtyWithUom } from "@/components/common/QtyWithUom";
import type { PutawayTask } from "@/hooks/usePutawayTasks";
import type { UomConversion } from "@/lib/uom";

/** Open putaway tasks as large tap targets, oldest first. */
export function PutawayTaskList({
  tasks,
  skuLabel,
  conversions,
  onOpen,
}: {
  tasks: PutawayTask[];
  skuLabel: (skuId: number) => { code: string; name: string };
  conversions: (skuId: number) => UomConversion[];
  onOpen: (task: PutawayTask) => void;
}) {
  const { t } = useTranslation();
  if (!tasks.length) return <EmptyState icon={PackageCheck} title={t("putaway.empty")} description={t("putaway.emptyHint")} />;
  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        const sku = skuLabel(task.sku_id);
        return (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onOpen(task)}
              className="w-full rounded-xl border border-border bg-card p-4 text-left hover:border-primary/50 active:bg-secondary/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{sku.code}</p>
                  <p className="truncate text-xs text-muted-foreground">{sku.name}</p>
                </div>
                <QtyWithUom
                  qty={Number(task.qty) - Number(task.qty_done)}
                  conversions={conversions(task.sku_id)}
                  className="text-base font-semibold"
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {task.m_batches && <BatchTag batchNo={task.m_batches.batch_no} expiry={task.m_batches.expiry_date} />}
                {task.from && <LocationTag code={task.from.full_code} />}
                <ArrowRight className="h-3.5 w-3.5" />
                {task.suggested ? <LocationTag code={task.suggested.full_code} /> : <span>{t("putaway.noSuggestion")}</span>}
                {task.t_goods_receipts && <span className="ml-auto font-mono">{task.t_goods_receipts.gr_no}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
