import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import { registerPdfFont } from "./exportBrand";

export interface LabelItem {
  /** Encoded in the barcode or QR and printed under it. */
  value: string;
  title: string;
  subtitle?: string;
}

export type LabelKind = "barcode" | "qr";
export type LabelPaper = "a4" | "thermal";

// A4 sheet of 3 x 7 labels, 63.5 x 38.1 mm (the common L7160 layout), or
// one 50 x 30 mm label per page for a thermal printer.
const SHEETS = {
  a4: { cols: 3, rows: 7, w: 63.5, h: 38.1, left: 7.2, top: 15.1, gapX: 2.5 },
  thermal: { cols: 1, rows: 1, w: 50, h: 30, left: 0, top: 0, gapX: 0 },
};

function barcodePng(value: string) {
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, value, { format: "CODE128", displayValue: false, margin: 0, height: 60, width: 2 });
  return canvas.toDataURL("image/png");
}

export async function printLabels(items: LabelItem[], kind: LabelKind, fileName: string, paper: LabelPaper = "a4") {
  const { jsPDF } = await import("jspdf");
  const SHEET = SHEETS[paper];
  const doc = new jsPDF({ unit: "mm", format: paper === "a4" ? "a4" : [SHEET.w, SHEET.h], orientation: paper === "a4" ? "portrait" : "landscape" });
  const font = await registerPdfFont(doc);
  const perPage = SHEET.cols * SHEET.rows;
  // The layout below is drawn for the 38.1 mm A4 cell; thermal labels scale it down.
  const k = SHEET.h / 38.1;

  for (const [i, item] of items.entries()) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const slot = i % perPage;
    const x = SHEET.left + (slot % SHEET.cols) * (SHEET.w + SHEET.gapX);
    const y = SHEET.top + Math.floor(slot / SHEET.cols) * SHEET.h;
    const pad = 3 * k;

    doc.setFont(font, "bold").setFontSize(9 * k);
    doc.text(doc.splitTextToSize(item.title, SHEET.w - 2 * pad)[0], x + pad, y + pad + 3 * k);
    if (item.subtitle) {
      doc.setFont(font, "normal").setFontSize(7 * k);
      doc.text(doc.splitTextToSize(item.subtitle, SHEET.w - 2 * pad)[0], x + pad, y + pad + 6.5 * k);
    }

    if (kind === "qr") {
      const png = await QRCode.toDataURL(item.value, { margin: 0, width: 240 });
      doc.addImage(png, "PNG", x + pad, y + 12 * k, 22 * k, 22 * k);
      doc.setFont(font, "bold").setFontSize(10 * k);
      doc.text(doc.splitTextToSize(item.value, SHEET.w - 30 * k)[0], x + 28 * k, y + 24 * k);
    } else {
      doc.addImage(barcodePng(item.value), "PNG", x + pad, y + 12 * k, SHEET.w - 2 * pad, 16 * k);
      doc.setFont(font, "normal").setFontSize(8 * k);
      doc.text(item.value, x + SHEET.w / 2, y + 32 * k, { align: "center" });
    }
  }

  doc.setProperties({ title: fileName });
  window.open(doc.output("bloburl"), "_blank");
}
