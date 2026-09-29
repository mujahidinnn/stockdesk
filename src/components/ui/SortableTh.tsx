import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/hooks/useSortableData";

interface SortableThProps {
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

export function SortableTh({
  active,
  direction,
  onClick,
  children,
  className,
}: SortableThProps) {
  const Icon = !active
    ? ArrowUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap",
        className,
      )}
    >
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("w-3 h-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}
