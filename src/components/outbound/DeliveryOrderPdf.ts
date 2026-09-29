import type { Shipment } from "@/hooks/useShipments";
import { brandPdfPages, PDF_MARGIN, PDF_TOP, pdfTableStyle, registerPdfFont } from "@/lib/exportBrand";
import { formatBreakdown, fromBase, type UomConversion } from "@/lib/uom";

interface Lookup {
  code: (skuId: number) => string;
  label: (skuId: number) => string;
  conversions: (skuId: number) => UomConversion[];
}

export async function printDeliveryOrder(s: Shipment, company: string, warehouseName: string, lookup: Lookup) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const font = await registerPdfFont(doc);
  const o = s.t_sales_orders;
  const w = doc.internal.pageSize.width;
  const col2 = w / 2 + 4;

  const block = (x: number, y: number, rows: [string, string][]) =>
    rows.forEach(([k, v], i) => {
      doc.setFont(font, "normal").setFontSize(8.5).text(k, x, y + i * 5.5);
      doc.setFont(font, "bold").text(doc.splitTextToSize(v || "-", w / 2 - 44)[0], x + 26, y + i * 5.5);
    });
  block(PDF_MARGIN, PDF_TOP, [
    ["Kepada", o?.customer_name ?? "-"],
    ["Alamat", o?.ship_to ?? "-"],
    ["No. SO", o?.so_no ?? "-"],
    ["Referensi", o?.reference_no ?? "-"],
  ]);
  block(col2, PDF_TOP, [
    ["Dari", warehouseName],
    ["Kurir", s.courier ?? "-"],
    ["No. resi", s.tracking_no ?? "-"],
    ["Berat / koli", `${s.weight_kg ?? "-"} kg / ${s.packages}`],
  ]);

  autoTable(doc, {
    ...pdfTableStyle(font),
    startY: PDF_TOP + 26,
    head: [["No", "SKU", "Barang", "Batch", "Jumlah"]],
    body: s.t_shipment_items.map((i, n) => [
      n + 1,
      lookup.code(i.sku_id),
      lookup.label(i.sku_id),
      i.m_batches?.batch_no ?? "-",
      formatBreakdown(fromBase(Number(i.qty), lookup.conversions(i.sku_id))),
    ]),
    columnStyles: { 0: { halign: "center", cellWidth: 10 }, 4: { halign: "right" } },
  });

  const end = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  const boxW = (w - 2 * PDF_MARGIN) / 3;
  ["Disiapkan oleh", "Pengirim / kurir", "Diterima oleh"].forEach((label, i) => {
    const x = PDF_MARGIN + i * boxW;
    doc.setFont(font, "normal").setFontSize(8.5).text(label, x + boxW / 2, end, { align: "center" });
    doc.line(x + 8, end + 22, x + boxW - 8, end + 22);
  });

  await brandPdfPages(doc, { company, title: "Surat Jalan", subtitle: s.do_no, font });
  doc.setProperties({ title: s.do_no });
  window.open(doc.output("bloburl"), "_blank");
}
