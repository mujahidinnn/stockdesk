import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { cn } from "@/lib/utils";

interface DateRangeValue {
  /** yyyy-MM-dd, inclusive */
  from?: string;
  to?: string;
}

const toDate = (v?: string) => (v ? new Date(`${v}T00:00:00`) : undefined);
const toStr = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : undefined);

/** Toolbar-sized date range picker; emits both ends on every change. */
export function DateRangeFilter({
  value,
  onChange,
  defaultValue,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  /** Page's default range; matching it isn't highlighted as a filter. */
  defaultValue?: DateRangeValue;
}) {
  const { t } = useTranslation();
  const locale = useDateFnsLocale();
  const [open, setOpen] = useState(false);
  const from = toDate(value.from);
  const to = toDate(value.to);
  const active = !!(from || to);
  const isDefault =
    value.from === defaultValue?.from && value.to === defaultValue?.to;
  const fmt = (d: Date) => format(d, "dd MMM yy", { locale });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 gap-2 px-3 text-xs font-normal bg-secondary border-border hover:bg-secondary/80",
            active && !isDefault
              ? "border-primary/50 text-primary"
              : "text-foreground",
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
          {active
            ? `${from ? fmt(from) : "…"} – ${to ? fmt(to) : "…"}`
            : t("master.filters.dateRange")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
        <Calendar
          mode="range"
          selected={from ? { from, to } : undefined}
          onSelect={(r) => {
            onChange({ from: toStr(r?.from), to: toStr(r?.to) });
            if (r?.from && r?.to) setOpen(false);
          }}
          numberOfMonths={2}
          defaultMonth={from}
          locale={locale}
          initialFocus
          className="text-foreground"
        />
        {active && (
          <div className="px-3 pb-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onChange({ from: undefined, to: undefined });
                setOpen(false);
              }}
            >
              <X className="w-3 h-3" />
              {t("common.clearDate")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
