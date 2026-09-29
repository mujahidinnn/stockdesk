import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface PagerProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

// Named Pager to avoid colliding with shadcn pagination.tsx on case-insensitive filesystems.
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
}: PagerProps) {
  const { t } = useTranslation();
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-[11px] text-muted-foreground">
        {t("common.pagination.range", { from, to, total })}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-[11px] text-muted-foreground px-1 tabular-nums">
          {t("common.pagination.page", { page, pageCount })}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className={cn(
            "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors",
          )}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
