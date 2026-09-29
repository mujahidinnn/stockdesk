import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** The next step, e.g. a "create the first one" button. */
  action?: ReactNode;
  /** Smaller and without the panel, for dropdowns and cards. */
  size?: "default" | "sm";
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, size = "default", className }: EmptyStateProps) {
  const small = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        small
          ? "gap-2 px-4 py-6"
          : "gap-4 rounded-2xl border border-dashed border-sea/30 bg-gradient-to-b from-sea/[0.07] to-transparent px-6 py-14",
        className,
      )}
    >
      <div className={cn("relative flex items-center justify-center", small ? "h-10 w-10" : "h-20 w-20")}>
        {!small && (
          <>
            <span className="absolute inset-0 rounded-full bg-sea/10" aria-hidden />
            <span className="absolute inset-2.5 rounded-full bg-sea/15" aria-hidden />
          </>
        )}
        <span
          className={cn(
            "relative flex items-center justify-center rounded-full bg-gradient-to-br from-sea to-primary text-white shadow-md shadow-sea/30",
            small ? "h-10 w-10" : "h-11 w-11",
          )}
        >
          <Icon className={small ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.25} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className={cn("font-semibold text-foreground", small ? "text-xs" : "text-base")}>{title}</p>
        {description && (
          <p className={cn("mx-auto max-w-sm leading-snug text-muted-foreground", small ? "text-[11px]" : "text-sm")}>{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
