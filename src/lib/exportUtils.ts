import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ExportTableConfig {
  title: string;
  subtitle?: string;
  companyName: string;
  fileName: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  summaryLines?: Array<{ label: string; value: string }>;
}

export function exportReportPDF(cfg: ExportTableConfig): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  doc.setFillColor(24, 51, 74); // #18334A
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(cfg.companyName, 40, 30);
  doc.setFontSize(10);
  doc.text(cfg.title, 40, 48);

  doc.setTextColor(39, 55, 70);
  let startY = 86;

  if (cfg.subtitle) {
    doc.setFontSize(9.5);
    doc.setTextColor(123, 135, 144);
    doc.text(cfg.subtitle, 40, startY);
    startY += 18;
  }

  if (cfg.summaryLines && cfg.summaryLines.length > 0) {
    doc.setFontSize(9.5);
    doc.setTextColor(39, 55, 70);
    cfg.summaryLines.forEach((line) => {
      doc.text(`${line.label}: ${line.value}`, 40, startY);
      startY += 15;
    });
    startY += 8;
  }

  autoTable(doc, {
    startY,
    head: [cfg.headers],
    body: cfg.rows,
    styles: { fontSize: 8.5, textColor: [39, 55, 70], cellPadding: 5 },
    headStyles: { fillColor: [24, 51, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 248] },
  });

  doc.save(`${cfg.fileName}.pdf`);
}

export function exportReportExcel(cfg: ExportTableConfig): void {
  const sheetData = [cfg.headers, ...cfg.rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${cfg.fileName}.xlsx`);
}
