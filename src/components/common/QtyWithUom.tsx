import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBreakdown, fromBase, type UomConversion } from "@/lib/uom";
import { cn } from "@/lib/utils";

/** "2 BOX 3 PCS" with the plain base-unit total on hover. */
export function QtyWithUom({ qty, conversions, className }: { qty: number; conversions: UomConversion[]; className?: string }) {
  const base = conversions.find((c) => c.factor === 1);
  const total = `${qty.toLocaleString("id-ID", { maximumFractionDigits: 3 })} ${base?.code ?? ""}`;
  if (conversions.length <= 1) return <span className={cn("tabular-nums", className)}>{total}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("tabular-nums underline decoration-dotted underline-offset-2", className)}>
          {formatBreakdown(fromBase(qty, conversions))}
        </span>
      </TooltipTrigger>
      <TooltipContent>{total}</TooltipContent>
    </Tooltip>
  );
}
