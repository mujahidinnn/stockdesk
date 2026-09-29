import { useState } from "react";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

export function TimePickerField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label?: string;
  /** "HH:MM", or "" when unset */
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hour, minute] = value ? value.split(":") : ["", ""];

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label className="text-xs text-muted-foreground font-medium">
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full h-9 justify-start text-sm border-border bg-secondary hover:bg-secondary/80 font-normal",
              !value && "text-muted-foreground",
            )}
          >
            <Clock className="w-3.5 h-3.5 mr-2 flex-shrink-0 text-muted-foreground" />
            {value || placeholder || t("common.pickTime")}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-3 bg-card border-border"
          align="start"
        >
          <div className="flex items-center gap-2">
            <Select
              value={hour}
              onValueChange={(h) => onChange(`${h}:${minute || "00"}`)}
            >
              <SelectTrigger className="w-20 h-9 bg-secondary border-border text-foreground text-sm">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-60">
                {HOURS.map((h) => (
                  <SelectItem key={h} value={h} className="text-sm">
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground font-semibold">:</span>
            <Select
              value={minute}
              onValueChange={(m) => onChange(`${hour || "00"}:${m}`)}
            >
              <SelectTrigger className="w-20 h-9 bg-secondary border-border text-foreground text-sm">
                <SelectValue placeholder="--" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border max-h-60">
                {MINUTES.map((m) => (
                  <SelectItem key={m} value={m} className="text-sm">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
