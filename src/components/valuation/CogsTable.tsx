import { useTranslation } from "react-i18next";
import type { CogsRow, Method } from "@/hooks/useFinance";
import { cn, qtyText, rupiah } from "@/lib/utils";

export function CogsTable({ rows, method }: { rows: CogsRow[]; method: Method }) {
  const { t } = useTranslation();
  const sum = (k: "cost_fifo" | "cost_average") => rows.reduce((s, r) => s + Number(r[k]), 0);
  const cell = (m: Method) => cn("px-3 py-2 text-right tabular-nums", m === method ? "font-semibold" : "text-muted-foreground");
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-3 py-2.5">SKU</th>
            <th className="px-3 py-2.5">{t("valuation.kind")}</th>
            <th className="px-3 py-2.5 text-right">{t("valuation.qty")}</th>
            <th className="px-3 py-2.5 text-right">FIFO</th>
            <th className="px-3 py-2.5 text-right">{t("valuation.methods.average")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.sku_id}-${r.kind}`} className="border-b border-border/40 last:border-0">
              <td className="px-3 py-2">
                <p className="font-mono font-medium">{r.sku_code}</p>
                <p className="text-muted-foreground">{r.product_name}</p>
              </td>
              <td className="px-3 py-2">{t(`valuation.kinds.${r.kind}`)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{Number(r.qty) ? qtyText(Number(r.qty)) : ""}</td>
              <td className={cell("fifo")}>{rupiah(Number(r.cost_fifo))}</td>
              <td className={cell("average")}>{rupiah(Number(r.cost_average))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-secondary/40 font-semibold">
            <td className="px-3 py-2" colSpan={3}>{t("valuation.total")}</td>
            <td className={cell("fifo")}>{rupiah(sum("cost_fifo"))}</td>
            <td className={cell("average")}>{rupiah(sum("cost_average"))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
