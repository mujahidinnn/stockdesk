import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ok: in stock, normal, approved, dispatched. warn: low stock, expiring,
// pending, in transit. danger: out of stock, expired, rejected, failed.
// muted: inactive, draft, cancelled.
const TONES = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  muted: "bg-muted text-muted-foreground",
} as const;

export type StatusTone = keyof typeof TONES;

/** The single status > tone mapping shared by every document type. */
const STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  open: "muted",
  cancelled: "muted",
  allocated: "info",
  counting: "info",
  packed: "info",
  received: "warn",
  picking: "warn",
  picked: "warn",
  pending: "warn",
  in_transit: "warn",
  submitted: "warn",
  putaway_done: "ok",
  dispatched: "ok",
  done: "ok",
  approved: "ok",
  success: "ok",
  rejected: "danger",
  failed: "danger",
};


/** Pass a document `status` to use the shared mapping, or a `tone` directly. */
export function StatusBadge({
  tone,
  status,
  children,
  className,
}: {
  tone?: StatusTone;
  status?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONES[tone ?? STATUS_TONE[status ?? ""] ?? "muted"],
        className,
      )}
    >
      {children}
    </span>
  );
}
