import type { ReactNode } from "react";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

/** Row 1 of every list tab: title/count/subtitle left, actions right. */
export function SectionHeader({
  title,
  count,
  subtitle,
  actions,
  tour,
}: {
  title: string;
  count?: number;
  subtitle: ReactNode;
  actions?: ReactNode;
  tour?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({count})
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {actions && (
        <div data-tour={tour} className="flex items-center gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Row 2: search + filters left, optional view controls pushed right. */
export function Toolbar({
  children,
  end,
}: {
  children: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {children}
      {end && <div className="ml-auto">{end}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  tour,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  tour?: string;
}) {
  const { t } = useTranslation();
  return (
    <div data-tour={tour} className="relative w-full sm:w-64">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && (e.stopPropagation(), onChange(""))}
        placeholder={placeholder}
        className="pl-8 pr-8 h-8 text-xs md:text-xs w-full bg-secondary border-border"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clearSearch")}
          className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
