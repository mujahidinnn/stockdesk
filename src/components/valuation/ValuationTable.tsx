import { useTranslation } from "react-i18next";
import { qtyText, rupiah } from "@/lib/utils";

export interface Line {
  key: string;
  label: string;
  sub?: string;
  qty: number;
  unitCost: number | null;
  value: number | null;
}

export function ValuationTable({ lines, withCost }: { lines: Line[]; withCost: boolean }) {
  const { t } = useTranslation();
  const total = lines.reduce((s, l) => s + (l.value ?? 0), 0);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-3 py-2.5">{t("valuation.item")}</th>
            <th className="px-3 py-2.5 text-right">{t("valuation.qty")}</th>
            {withCost && <th className="hidden px-3 py-2.5 text-right sm:table-cell">{t("valuation.unitCost")}</th>}
            {withCost && <th className="px-3 py-2.5 text-right">{t("valuation.value")}</th>}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2">
                <p className="font-medium">{l.label}</p>
                {l.sub && <p className="text-muted-foreground">{l.sub}</p>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{qtyText(l.qty)}</td>
              {withCost && <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{l.unitCost == null ? "" : rupiah(l.unitCost)}</td>}
              {withCost && <td className="px-3 py-2 text-right tabular-nums">{l.value == null ? "" : rupiah(l.value)}</td>}
            </tr>
          ))}
        </tbody>
        {withCost && (
          <tfoot>
            <tr className="border-t border-border bg-secondary/40 font-semibold">
              <td className="px-3 py-2" colSpan={2}>{t("valuation.total")}</td>
              <td className="hidden sm:table-cell" />
              <td className="px-3 py-2 text-right tabular-nums">{rupiah(total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
