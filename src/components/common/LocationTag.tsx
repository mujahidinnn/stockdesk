import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bin or location code, shown the same way everywhere a location appears. */
export function LocationTag({ code, className }: { code: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-600 dark:text-sky-400 whitespace-nowrap",
        className,
      )}
    >
      <MapPin className="h-3 w-3" />
      {code}
    </span>
  );
}
