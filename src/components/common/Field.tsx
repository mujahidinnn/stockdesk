import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Form row: the wrapping <label> ties the caption to its input without ids. */
export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : (
        hint && <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

/** Trigger size for SelectField inside forms (matches the shadcn Input height). */
export const selectClass =
  "h-10 w-full text-sm";
