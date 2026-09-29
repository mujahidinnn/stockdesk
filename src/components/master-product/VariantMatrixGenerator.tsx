import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { buildVariants, type VariantAxis } from "@/lib/variants";

export function VariantMatrixGenerator({
  productCode,
  axes,
  onAxesChange,
  excluded,
  onExcludedChange,
}: {
  productCode: string;
  axes: VariantAxis[];
  onAxesChange: (axes: VariantAxis[]) => void;
  excluded: Set<string>;
  onExcludedChange: (excluded: Set<string>) => void;
}) {
  const { t } = useTranslation();
  const combos = buildVariants(productCode || "CODE", axes);
  const setAxis = (i: number, patch: Partial<VariantAxis>) =>
    onAxesChange(axes.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-3">
      {axes.map((axis, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={axis.name}
            onChange={(e) => setAxis(i, { name: e.target.value })}
            placeholder={t("products.variants.attribute")}
            aria-label={t("products.variants.attribute")}
            className="w-32"
          />
          <Input
            value={axis.values.join(", ")}
            onChange={(e) => setAxis(i, { values: e.target.value.split(",") })}
            placeholder={t("products.variants.values")}
            aria-label={t("products.variants.values")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onAxesChange(axes.filter((_, j) => j !== i))}
            aria-label={t("common.delete")}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onAxesChange([...axes, { name: "", values: [] }])}
        className="gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        {t("products.variants.addAttribute")}
      </Button>

      <div className="rounded-lg border border-border">
        <p className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          {t("products.variants.preview", { count: combos.length - excluded.size })}
        </p>
        <ul className="max-h-48 overflow-y-auto divide-y divide-border/60">
          {combos.map((c) => (
            <li key={c.skuCode}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <Checkbox
                  checked={!excluded.has(c.skuCode)}
                  onCheckedChange={(on) => {
                    const next = new Set(excluded);
                    if (on) next.delete(c.skuCode);
                    else next.add(c.skuCode);
                    onExcludedChange(next);
                  }}
                />
                <span className="font-mono text-xs">{c.skuCode}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {Object.values(c.attributes).join(" / ")}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
