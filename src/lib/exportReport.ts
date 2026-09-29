import { brandPdfPages, brandSheet, newWorkbook, pdfTableStyle, registerPdfFont, saveWorkbook } from "./exportBrand";

export type Cell = string | number | null | undefined;

export interface ReportColumn<T> {
  header: string;
  value: (row: T) => Cell;
  /** Excel number format and right alignment: "money" (0 dp) or "qty" (up to 3 dp). */
  kind?: "money" | "qty";
  width?: number;
}

export interface Report<T> {
  company: string;
  title: string;
  subtitle: string;
  fileName: string;
  columns: ReportColumn<T>[];
  rows: T[];
}

// A spreadsheet runs text starting with these as a formula (CSV/Excel injection).
const FORMULA_START = /^[=+\-@\t\r]/;

/** Text that a spreadsheet would read as a formula gets a leading quote; numbers pass through. */
export function safeCell(v: Cell): string | number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  return FORMULA_START.test(v) ? `'${v}` : v;
}

const FMT = { money: "#,##0", qty: "#,##0.###" } as const;
const fmt = (v: Cell, kind?: "money" | "qty") =>
  typeof v === "number" ? v.toLocaleString("id-ID", { maximumFractionDigits: kind === "money" ? 0 : 3 }) : (v ?? "");

export async function exportExcel<T>(r: Report<T>) {
  const { wb, logo } = await newWorkbook(r.company);
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.columns = r.columns.map((c) => ({ header: c.header, width: c.width ?? 16 }));
  for (const row of r.rows) ws.addRow(r.columns.map((c) => safeCell(c.value(row))));
  r.columns.forEach((c, i) => {
    if (c.kind) ws.getColumn(i + 1).numFmt = FMT[c.kind];
  });
  brandSheet(wb, ws, { company: r.company, title: r.title, subtitle: r.subtitle, logo });
  await saveWorkbook(wb, `${r.fileName}.xlsx`);
}

export async function exportPdf<T>(r: Report<T>) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: r.columns.length > 6 ? "landscape" : "portrait" });
  const font = await registerPdfFont(doc);
  autoTable(doc, {
    ...pdfTableStyle(font),
    head: [r.columns.map((c) => c.header)],
    body: r.rows.map((row) => r.columns.map((c) => fmt(c.value(row), c.kind))),
    columnStyles: Object.fromEntries(r.columns.flatMap((c, i) => (c.kind ? [[i, { halign: "right" as const }]] : []))),
  });
  await brandPdfPages(doc, { company: r.company, title: r.title, subtitle: r.subtitle, font });
  doc.save(`${r.fileName}.pdf`);
}
