import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function StatsCard({
  label,
  value,
  icon: Icon,
  to,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  to?: string;
  tone?: "warn" | "danger";
  hint?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={cn("h-4 w-4", tone === "warn" && "text-amber-500", tone === "danger" && "text-rose-500")} />
      </div>
      {/* Hint sits beside the value when it fits, so cards keep one height; it wraps below only when it must. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <p className="whitespace-nowrap text-base font-semibold tabular-nums sm:text-xl md:text-base xl:text-xl">{value}</p>
        {hint && <p title={hint} className="min-w-0 truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </>
  );
  const cls = "rounded-xl border border-border bg-card p-4";
  return to ? (
    <Link to={to} className={cn(cls, "hover:border-primary/50")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
