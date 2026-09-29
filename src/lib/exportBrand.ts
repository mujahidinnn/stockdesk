import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { Borders, Workbook, Worksheet } from "exceljs";
import type { jsPDF } from "jspdf";
import type { UserOptions } from "jspdf-autotable";

type RGB = [number, number, number];

export const INK: RGB = [17, 17, 17];
export const MUTED: RGB = [90, 90, 90];
const RULE: RGB = [120, 120, 120];
export const HEAD_FILL: RGB = [235, 235, 235];

export const printedAt = () =>
  format(new Date(), "d MMMM yyyy, HH:mm", { locale: localeId });

/** Caches a successful load; a failed one is retried next export. */
function once<T>(load: () => Promise<T>) {
  let p: Promise<T> | undefined;
  return () =>
    (p ??= load().catch((e) => {
      p = undefined;
      throw e;
    }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** The PNG app icon as a data URL, since neither jsPDF nor Excel reads SVG. */
export const logoPng = once(async () => {
  const res = await fetch("/apple-touch-icon.png");
  if (!res.ok) throw new Error(`logo: ${res.status}`);
  return blobToDataUrl(await res.blob());
});

const interFonts = once(() =>
  Promise.all(
    ["Inter-Regular.ttf", "Inter-Bold.ttf"].map(async (file) => {
      const res = await fetch(`/fonts/${file}`);
      if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
      return (await blobToDataUrl(await res.blob())).split(",")[1];
    }),
  ),
);

export const PDF_MARGIN = 14;
/** Where content starts, below the letterhead and title drawn by brandPdfPages. */
export const PDF_TOP = 50;

/** Embeds Inter in the document and returns the family to use. Falls back to
 *  Helvetica when the font files can't be fetched, so the export still works. */
export async function registerPdfFont(doc: jsPDF): Promise<string> {
  try {
    const [regular, bold] = await interFonts();
    doc.addFileToVFS("Inter-Regular.ttf", regular);
    doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", bold);
    doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    return "Inter";
  } catch {
    return "helvetica";
  }
}

export function pdfTableStyle(font: string): Partial<UserOptions> {
  return {
    theme: "grid",
    styles: {
      font,
      fontSize: 8,
      cellPadding: 2,
      textColor: INK,
      lineColor: RULE,
      lineWidth: 0.15,
      valign: "middle",
    },
    headStyles: {
      fillColor: HEAD_FILL,
      textColor: INK,
      fontStyle: "bold",
      halign: "center",
    },
    footStyles: { fillColor: HEAD_FILL, textColor: INK, fontStyle: "bold" },
    margin: { top: PDF_TOP, left: PDF_MARGIN, right: PDF_MARGIN, bottom: 18 },
  };
}

/** Letterhead, title and page number on every page. Runs once after all
 *  content is laid out, so the footer can say "of N". Content must start at
 *  PDF_TOP. */
export async function brandPdfPages(
  doc: jsPDF,
  meta: { company: string; title: string; subtitle: string; font: string },
) {
  const { company, title, subtitle, font } = meta;
  const logo = await logoPng().catch(() => null);
  const { width, height } = doc.internal.pageSize;
  const m = PDF_MARGIN;
  const mid = width / 2;
  const printed = printedAt();
  const pages = doc.getNumberOfPages();

  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setTextColor(...INK);

    if (logo) doc.addImage(logo, "PNG", m, 9, 15, 15, "brand-logo");
    doc.setFont(font, "bold");
    doc.setFontSize(14);
    doc.text(company.toUpperCase(), mid, 18.5, { align: "center" });

    doc.setDrawColor(...INK);
    doc.setLineWidth(0.6);
    doc.line(m, 28, width - m, 28);
    doc.setLineWidth(0.2);
    doc.line(m, 29.2, width - m, 29.2);

    doc.setFontSize(12);
    doc.text(title.toUpperCase(), mid, 38, { align: "center" });
    doc.setFont(font, "normal");
    doc.setFontSize(9);
    doc.text(subtitle, mid, 43.5, { align: "center" });

    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Dicetak: ${printed}`, m, height - 8);
    doc.text(`Halaman ${p} dari ${pages}`, width - m, height - 8, {
      align: "right",
    });
  }
}

const XL_FONT = "Inter";
const argb = ([r, g, b]: RGB) =>
  `FF${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Expects headers in row 1 and data below; call after the rows are added. */
export function brandSheet(
  wb: Workbook,
  ws: Worksheet,
  meta: { company: string; title: string; subtitle?: string; logo: string | null },
) {
  const cols = ws.columns.length;
  const thin = { style: "thin" as const, color: { argb: argb(RULE) } };
  const grid: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

  const head = ws.getRow(1);
  head.height = 22;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(HEAD_FILL) } };
    c.font = { name: XL_FONT, bold: true, size: 10, color: { argb: argb(INK) } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = grid;
  });

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    for (let col = 1; col <= cols; col++) {
      const c = row.getCell(col);
      c.font = { size: 10, color: { argb: argb(INK) }, ...c.font, name: XL_FONT };
      c.border = grid;
      c.alignment = { ...c.alignment, vertical: "middle" };
    }
  }

  // Company, title, period line, spacer. The logo sits in the last column so
  // the text can start at A whatever its width.
  ws.spliceRows(1, 0, [], [], [], []);
  const textEnd = ws.getColumn(Math.max(1, cols - 1)).letter;
  const lines: [string, number, object][] = [
    [meta.company.toUpperCase(), 24, { bold: true, size: 14 }],
    [meta.title, 18, { bold: true, size: 12 }],
    [
      [meta.subtitle, `Dicetak: ${printedAt()}`].filter(Boolean).join(" · "),
      16,
      { size: 9, color: { argb: argb(MUTED) } },
    ],
  ];
  lines.forEach(([text, height, font], i) => {
    const r = i + 1;
    if (cols > 1) ws.mergeCells(`A${r}:${textEnd}${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = text;
    c.font = { name: XL_FONT, color: { argb: argb(INK) }, ...font };
    c.alignment = { vertical: "middle", horizontal: "left" };
    ws.getRow(r).height = height;
  });
  ws.getRow(4).height = 8;

  if (meta.logo) {
    const id = wb.addImage({ base64: meta.logo, extension: "png" });
    const px = (ws.getColumn(cols).width ?? 10) * 7 + 5;
    ws.addImage(id, {
      tl: { col: cols - 1 + Math.max(0, (px - 48) / px), row: 0.2 },
      ext: { width: 40, height: 40 },
    });
  }

  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: cols } };
  ws.pageSetup = {
    ...ws.pageSetup,
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "5:5",
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
  };
  const esc = (s: string) => s.replace(/&/g, "&&");
  ws.headerFooter.oddFooter = `&L&8${esc(meta.company)} · ${esc(meta.title)}&R&8Halaman &P dari &N`;
}

export async function newWorkbook(company: string) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = company;
  wb.company = company;
  wb.created = new Date();
  const logo = await logoPng().catch(() => null);
  return { wb, logo };
}

export async function saveWorkbook(wb: Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
