import { Table2, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "table" | "kanban";

interface ViewSwitcherProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewSwitcher({ view, onChange, className }: ViewSwitcherProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-0.5 p-0.5 bg-segment rounded-lg border border-border",
        className,
      )}
    >
      {(["table", "kanban"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200",
            view === v
              ? "bg-card text-foreground border border-border shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "table" ? (
            <Table2 className="w-3.5 h-3.5" />
          ) : (
            <LayoutGrid className="w-3.5 h-3.5" />
          )}
          {v === "table" ? "Table" : "Kanban"}
        </button>
      ))}
    </div>
  );
}
