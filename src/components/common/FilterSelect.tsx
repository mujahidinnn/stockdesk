import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Radix Select can't hold an empty value, so "no filter" gets a sentinel.
const ALL = "__all__";

export function FilterSelect<T extends string>({
  value,
  onChange,
  allLabel,
  options,
  "aria-label": ariaLabel,
}: {
  value?: T;
  onChange: (v: T | undefined) => void;
  /** Omit for a plain picker that always has a value. */
  allLabel?: string;
  options: { value: T; label: string }[];
  "aria-label"?: string;
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? undefined : (v as T))}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-8 w-auto min-w-32 gap-2 text-xs bg-secondary border-border",
          allLabel && value && "border-primary/50 text-primary",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-card border-border">
        {allLabel && (
          <SelectItem value={ALL} className="text-xs">
            {allLabel}
          </SelectItem>
        )}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
