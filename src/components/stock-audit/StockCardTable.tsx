import { useTranslation } from "react-i18next";
import { LocationTag } from "@/components/common/LocationTag";
import type { Database } from "@/integrations/supabase/types";

type Row = Database["public"]["Functions"]["stock_card"]["Returns"][number];
const n = (v: number | null) => (v == null ? "" : Number(v).toLocaleString("id-ID", { maximumFractionDigits: 3 }));

export function StockCardTable({ rows, uom }: { rows: Row[]; uom: string }) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="px-3 py-2.5">{t("audit.date")}</th>
            <th className="px-3 py-2.5">{t("audit.type")}</th>
            <th className="px-3 py-2.5 hidden sm:table-cell">{t("audit.ref")}</th>
            <th className="px-3 py-2.5 hidden md:table-cell">{t("audit.route")}</th>
            <th className="px-3 py-2.5 text-right">{t("audit.in")}</th>
            <th className="px-3 py-2.5 text-right">{t("audit.out")}</th>
            <th className="px-3 py-2.5 text-right">{t("audit.balance", { uom })}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.movement_id ?? `o${i}`} className={`border-b border-border/40 last:border-0 ${r.movement_type === "opening" ? "bg-secondary/40 font-medium" : ""}`}>
              <td className="px-3 py-2 whitespace-nowrap">{r.movement_date}</td>
              <td className="px-3 py-2">{t(`audit.types.${r.movement_type}`)}</td>
              <td className="px-3 py-2 font-mono hidden sm:table-cell">{r.ref_no ?? ""}</td>
              <td className="px-3 py-2 hidden md:table-cell">
                <div className="flex flex-wrap items-center gap-1">
                  {r.from_code && <LocationTag code={r.from_code} />}
                  {r.to_code && <LocationTag code={r.to_code} />}
                  {r.batch_no && <span className="text-muted-foreground">{r.batch_no}</span>}
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{r.qty_in ? n(r.qty_in) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums text-rose-600">{r.qty_out ? n(r.qty_out) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums font-medium">{n(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
