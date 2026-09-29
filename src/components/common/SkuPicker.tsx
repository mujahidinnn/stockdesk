import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Product } from "@/hooks/useProducts";
import { attributeValues } from "@/lib/variants";
import { cn } from "@/lib/utils";

/** Searchable SKU list grouped by product. Pass `products` pre-filtered (e.g. by owner). */
export function SkuPicker({
  products,
  value,
  onChange,
  className,
}: {
  products: Product[];
  value: number | null;
  onChange: (skuId: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = products.flatMap((p) => p.m_skus.map((s) => ({ p, s }))).find((x) => x.s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          // A combobox does not take its name from its content, so say it here.
          aria-label={selected ? `${selected.s.sku_code} · ${selected.p.name}` : t("skuPicker.placeholder")}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.s.sku_code} · ${selected.p.name}` : t("skuPicker.placeholder")}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("skuPicker.search")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            {products
              .filter((p) => p.is_active)
              .map((p) => (
                <CommandGroup key={p.id} heading={`${p.code} · ${p.name}`}>
                  {p.m_skus
                    .filter((s) => s.is_active)
                    .map((s) => (
                      <CommandItem
                        key={s.id}
                        value={`${s.sku_code} ${p.name} ${s.barcode ?? ""} ${attributeValues(p.variant_attributes, s.attributes).join(" ")}`}
                        onSelect={() => {
                          onChange(s.id);
                          setOpen(false);
                        }}
                      >
                        <span className="font-mono text-xs">{s.sku_code}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">
                          {attributeValues(p.variant_attributes, s.attributes).join(" / ")}
                        </span>
                      </CommandItem>
                    ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
