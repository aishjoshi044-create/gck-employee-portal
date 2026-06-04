// Shared PDF + Excel export helpers — branded headers, styled tables.
import jsPDF from "jspdf";
import autoTable, { type UserOptions } from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import logo from "@/assets/gck-logo.jpeg.asset.json";

const BRAND_R = 217, BRAND_G = 119, BRAND_B = 51; // matches primary-ish

let cachedLogo: string | null = null;
async function loadLogoDataUrl(): Promise<string | null> {
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(logo.url);
    const blob = await res.blob();
    cachedLogo = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    return cachedLogo;
  } catch {
    return null;
  }
}

export interface PdfReportOptions {
  title: string;
  subtitle?: string;
  orientation?: "portrait" | "landscape";
  filename: string;
  head: string[];
  body: (string | number)[][];
  /** Optional second table (e.g. summary). */
  extra?: { title?: string; head?: string[]; body: (string | number)[][] };
  /** Optional canvas to embed as a chart image. */
  chartCanvas?: HTMLCanvasElement | null;
}

export async function downloadPdf(opts: PdfReportOptions) {
  const doc = new jsPDF({ orientation: opts.orientation ?? "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Brand band
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.rect(0, 0, pageW, 64, "F");

  const logoData = await loadLogoDataUrl();
  if (logoData) {
    try { doc.addImage(logoData, "JPEG", 18, 10, 44, 44); } catch { /* swallow */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Gram Chetna Kendra", 74, 28);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(opts.title, 74, 46);

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  const stamp = `Generated: ${format(new Date(), "d MMM yyyy, h:mm a")}`;
  doc.text(stamp, pageW - 18, 22, { align: "right" });
  if (opts.subtitle) doc.text(opts.subtitle, pageW - 18, 38, { align: "right" });

  autoTable(doc, {
    startY: 84,
    head: [opts.head],
    body: opts.body,
    styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.4 },
    headStyles: { fillColor: [BRAND_R, BRAND_G, BRAND_B], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 244, 238] },
    margin: { left: 18, right: 18 },
    didDrawPage: () => {
      const pageNum = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(`Page ${pageNum}`, pageW - 18, pageH - 12, { align: "right" });
      doc.text("Gram Chetna Kendra · Confidential", 18, pageH - 12);
    },
  } as UserOptions);

  if (opts.extra) {
    const lastY = (doc as any).lastAutoTable.finalY ?? 100;
    if (opts.extra.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text(opts.extra.title, 18, lastY + 24);
    }
    autoTable(doc, {
      startY: lastY + (opts.extra.title ? 32 : 24),
      head: opts.extra.head ? [opts.extra.head] : undefined,
      body: opts.extra.body,
      styles: { fontSize: 9, cellPadding: 5, lineColor: [220, 220, 220], lineWidth: 0.4 },
      headStyles: { fillColor: [60, 80, 110], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      margin: { left: 18, right: 18 },
    } as UserOptions);
  }

  if (opts.chartCanvas) {
    try {
      const img = opts.chartCanvas.toDataURL("image/png");
      const lastY = (doc as any).lastAutoTable.finalY ?? 100;
      if (lastY > pageH - 220) doc.addPage();
      const y = lastY > pageH - 220 ? 40 : lastY + 20;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(40, 40, 40);
      doc.text("Performance Visualization", 18, y);
      doc.addImage(img, "PNG", 18, y + 10, pageW - 36, 200);
    } catch { /* swallow */ }
  }

  doc.save(opts.filename);
}

export interface ExcelSheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const data = [s.header, ...s.rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    // Auto-fit column widths (rough).
    ws["!cols"] = s.header.map((h, idx) => {
      const maxLen = Math.max(
        h.length,
        ...s.rows.map((r) => String(r[idx] ?? "").length),
      );
      return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 30));
  }
  XLSX.writeFile(wb, filename);
}

export function performanceLevel(score: number): string {
  if (score >= 90) return "Outstanding";
  if (score >= 75) return "Good";
  if (score >= 60) return "Average";
  return "Needs Improvement";
}
