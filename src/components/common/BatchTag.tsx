import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

/** Batch number, plus expiry colored by how close it is (≤ 30 days amber, past rose). */
export function BatchTag({ batchNo, expiry, className }: { batchNo: string; expiry?: string | null; className?: string }) {
  const { t } = useTranslation();
  const days = expiry ? Math.floor((new Date(expiry).getTime() - Date.now()) / DAY) : null;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-600 dark:text-sky-400">{batchNo}</span>
      {expiry && (
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[11px]",
            days! < 0
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : days! <= 30
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-secondary text-muted-foreground",
          )}
        >
          {t("batch.exp", { date: expiry })}
        </span>
      )}
    </span>
  );
}
