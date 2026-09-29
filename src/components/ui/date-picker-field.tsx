import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export function DatePickerField({
  label,
  value,
  onChange,
  placeholder,
  clearLabel,
  required,
  error,
  fromDate,
  className,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearLabel?: string;
  required?: boolean;
  error?: string;
  fromDate?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value) : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground font-medium">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full h-9 justify-start text-sm border-border bg-secondary hover:bg-secondary/80 font-normal",
              !value && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            <CalendarIcon className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
            {value
              ? format(new Date(value), "dd MMM yyyy")
              : (placeholder ?? t("common.pickDate"))}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 bg-card border-border"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              onChange(d ? format(d, "yyyy-MM-dd") : null);
              setOpen(false);
            }}
            disabled={fromDate ? { before: new Date(fromDate) } : undefined}
            initialFocus
            className="text-foreground"
          />
          {value && !required && (
            <div className="px-3 pb-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                {clearLabel ?? t("common.clearDate")}
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
