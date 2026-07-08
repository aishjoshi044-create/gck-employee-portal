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
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Average";
  return "Needs Improvement";
}

// ===== Employee performance PDF =====
export interface EmpPerfSection {
  title: string;
  rows: { label: string; value: string | number }[];
}
export interface EmpPerfPdfOptions {
  filename: string;
  employeeName: string;
  project: string;
  period: string;
  overallScore: number;
  category: string;
  kpis: { label: string; value: string | number }[];
  sections: EmpPerfSection[];
  breakdown: { label: string; pct: number }[];
  feedback?: { rating: number; comment: string };
  summary: { strengths: string[]; improvements: string[]; assessment: string };
}

export async function downloadEmployeePerfPdf(opts: EmpPerfPdfOptions) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  // Header band
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.rect(0, 0, pageW, 80, "F");
  const logoData = await loadLogoDataUrl();
  if (logoData) { try { doc.addImage(logoData, "JPEG", 18, 14, 52, 52); } catch { /* */ } }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text("Gram Chetna Kendra", 82, 32);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text("Employee Performance Report", 82, 50);
  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), "d MMM yyyy, h:mm a")}`, pageW - 18, 24, { align: "right" });

  // Employee header card
  let y = 100;
  doc.setDrawColor(220); doc.setFillColor(248, 244, 238);
  doc.roundedRect(margin, y, pageW - margin * 2, 78, 6, 6, "FD");
  doc.setTextColor(30, 30, 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(opts.employeeName, margin + 14, y + 24);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(80, 80, 80);
  doc.text(`Project: ${opts.project}`, margin + 14, y + 42);
  doc.text(`Period: ${opts.period}`, margin + 14, y + 58);
  // Score badge
  const badgeW = 140, badgeX = pageW - margin - badgeW - 14;
  doc.setFillColor(BRAND_R, BRAND_G, BRAND_B);
  doc.roundedRect(badgeX, y + 14, badgeW, 50, 5, 5, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
  doc.text(`${opts.overallScore}/100`, badgeX + badgeW / 2, y + 38, { align: "center" });
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(opts.category, badgeX + badgeW / 2, y + 56, { align: "center" });
  y += 96;

  // KPI grid (4 cards)
  const cols = 4;
  const gap = 10;
  const cardW = (pageW - margin * 2 - gap * (cols - 1)) / cols;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text("Key Indicators", margin, y);
  y += 8;
  opts.kpis.slice(0, cols).forEach((k, i) => {
    const x = margin + i * (cardW + gap);
    doc.setFillColor(255, 255, 255); doc.setDrawColor(220);
    doc.roundedRect(x, y, cardW, 60, 5, 5, "FD");
    doc.setTextColor(110, 110, 110); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.text(k.label, x + 10, y + 18);
    doc.setTextColor(BRAND_R, BRAND_G, BRAND_B); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.text(String(k.value), x + 10, y + 44);
  });
  y += 76;

  // Sections as compact tables
  for (const sec of opts.sections) {
    if (y > pageH - 140) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    doc.text(sec.title, margin, y);
    autoTable(doc, {
      startY: y + 6,
      body: sec.rows.map((r) => [r.label, String(r.value)]),
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 5, lineColor: [225, 225, 225] },
      columnStyles: { 0: { fontStyle: "bold", textColor: [60, 60, 60], cellWidth: 180 }, 1: { halign: "right" } },
      margin: { left: margin, right: margin },
    } as UserOptions);
    y = (doc as any).lastAutoTable.finalY + 18;
  }

  // Breakdown progress bars
  if (y > pageH - 160) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text("Performance Breakdown", margin, y); y += 14;
  const barW = pageW - margin * 2 - 160;
  opts.breakdown.forEach((b) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
    doc.text(b.label, margin, y + 10);
    doc.setFillColor(235, 235, 235);
    doc.roundedRect(margin + 130, y, barW, 12, 3, 3, "F");
    const fill = Math.max(0, Math.min(100, b.pct));
    const color = fill >= 75 ? [34, 197, 94] : fill >= 60 ? [59, 130, 246] : fill >= 40 ? [245, 158, 11] : [239, 68, 68];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(margin + 130, y, (barW * fill) / 100, 12, 3, 3, "F");
    doc.setTextColor(40, 40, 40); doc.setFont("helvetica", "bold");
    doc.text(`${fill}%`, margin + 130 + barW + 8, y + 10);
    y += 22;
  });
  y += 6;

  // Feedback
  if (opts.feedback) {
    if (y > pageH - 110) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
    doc.text("Manager Feedback", margin, y); y += 8;
    doc.setDrawColor(220); doc.setFillColor(252, 250, 246);
    doc.roundedRect(margin, y, pageW - margin * 2, 60, 5, 5, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text(`Rating: ${opts.feedback.rating}/5`, margin + 12, y + 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
    const lines = doc.splitTextToSize(opts.feedback.comment || "—", pageW - margin * 2 - 24);
    doc.text(lines, margin + 12, y + 36);
    y += 76;
  }

  // Summary
  if (y > pageH - 170) { doc.addPage(); y = margin; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(40, 40, 40);
  doc.text("Performance Summary", margin, y); y += 12;

  const drawList = (title: string, items: string[]) => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text(title, margin, y); y += 12;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70, 70, 70);
    items.forEach((it) => {
      const lines = doc.splitTextToSize(`• ${it}`, pageW - margin * 2 - 12);
      if (y + lines.length * 11 > pageH - 40) { doc.addPage(); y = margin; }
      doc.text(lines, margin + 6, y);
      y += lines.length * 11 + 2;
    });
    y += 6;
  };
  drawList("Strengths", opts.summary.strengths);
  drawList("Areas for Improvement", opts.summary.improvements);
  drawList("Overall Assessment", [opts.summary.assessment]);

  // Footer on every page
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${total}`, pageW - 18, pageH - 12, { align: "right" });
    doc.text("Gram Chetna Kendra · Confidential", 18, pageH - 12);
  }

  doc.save(opts.filename);
}
