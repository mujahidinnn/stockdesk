import { useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Option<T extends string | number> {
  value: T;
  label: string;
}

interface MultiSelectPopoverProps<T extends string | number> {
  options: Option<T>[];
  selected: T[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelectPopover<T extends string | number>({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
}: MultiSelectPopoverProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (value: T) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn(
            "w-full h-auto min-h-9 justify-between border-border bg-secondary text-foreground hover:bg-secondary/80 font-normal",
            className,
          )}
        >
          <div className="flex flex-wrap gap-1 flex-1 text-left">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground text-sm">
                {placeholder}
              </span>
            ) : (
              selectedLabels.map((o) => (
                <Badge
                  key={o.value}
                  variant="outline"
                  className="h-5 px-1.5 text-[10px] font-medium border-border text-foreground bg-card gap-1"
                >
                  {o.label}
                  <span
                    role="button"
                    className="cursor-pointer text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(o.value);
                    }}
                  >
                    <X className="w-2.5 h-2.5" />
                  </span>
                </Badge>
              ))
            )}
          </div>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 bg-card border-border"
        align="start"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="max-h-[200px] overflow-y-auto scrollbar-thin py-1">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No results found
            </p>
          ) : (
            filtered.map((option) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left",
                    isSelected
                      ? "text-foreground bg-secondary/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-border",
                    )}
                  >
                    {isSelected && (
                      <Check
                        className="w-3 h-3 text-primary-foreground"
                        strokeWidth={3}
                      />
                    )}
                  </div>
                  {option.label}
                </button>
              );
            })
          )}
        </div>

        {selected.length > 0 && (
          <div className="px-3 py-2 border-t border-border flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {selected.length} selected
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
