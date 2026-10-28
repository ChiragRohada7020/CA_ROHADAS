import type { ComputedInvoice } from '../types';
import type { Theme } from './theme';

export function inr(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function inrInt(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

export interface TemplateContext {
  doc: PDFKit.PDFDocument;
  invoice: ComputedInvoice;
  theme: Theme;
  width: number;
  pageWidth: number;
  margin: number;
}

export interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  value: (item: ComputedInvoice['items'][number], idx: number) => string;
}

export function intraStateColumns(): TableColumn[] {
  return [
    { label: '#', width: 22, align: 'right', value: (_, i) => String(i + 1) },
    { label: 'Description', width: 0, align: 'left', value: (i) => i.description },
    { label: 'HSN', width: 50, align: 'left', value: (i) => i.hsn },
    { label: 'Qty', width: 35, align: 'right', value: (i) => `${i.quantity}${i.unit ? ' ' + i.unit : ''}` },
    { label: 'Rate', width: 55, align: 'right', value: (i) => inr(i.rate) },
    { label: 'Taxable', width: 65, align: 'right', value: (i) => inr(i.taxableValue) },
    { label: 'CGST', width: 50, align: 'right', value: (i) => inr(i.cgst) },
    { label: 'SGST', width: 50, align: 'right', value: (i) => inr(i.sgst) },
    { label: 'Total', width: 70, align: 'right', value: (i) => inr(i.lineTotal) },
  ];
}

export function interStateColumns(): TableColumn[] {
  return [
    { label: '#', width: 22, align: 'right', value: (_, i) => String(i + 1) },
    { label: 'Description', width: 0, align: 'left', value: (i) => i.description },
    { label: 'HSN', width: 50, align: 'left', value: (i) => i.hsn },
    { label: 'Qty', width: 35, align: 'right', value: (i) => `${i.quantity}${i.unit ? ' ' + i.unit : ''}` },
    { label: 'Rate', width: 55, align: 'right', value: (i) => inr(i.rate) },
    { label: 'Taxable', width: 65, align: 'right', value: (i) => inr(i.taxableValue) },
    { label: 'IGST%', width: 40, align: 'right', value: (i) => `${i.gstRate}%` },
    { label: 'IGST', width: 60, align: 'right', value: (i) => inr(i.igst) },
    { label: 'Total', width: 70, align: 'right', value: (i) => inr(i.lineTotal) },
  ];
}

export function columnsFor(invoice: ComputedInvoice): TableColumn[] {
  return invoice.isInterState ? interStateColumns() : intraStateColumns();
}

export function distributeFlexWidth(columns: TableColumn[], totalWidth: number): number[] {
  const fixedSum = columns.reduce((s, c) => s + (c.width > 0 ? c.width : 0), 0);
  const flexCount = columns.filter((c) => c.width === 0).length;
  const flexWidth = Math.max(60, (totalWidth - fixedSum) / Math.max(1, flexCount));
  return columns.map((c) => (c.width > 0 ? c.width : flexWidth));
}

export function measureRowHeight(
  doc: PDFKit.PDFDocument,
  cols: TableColumn[],
  widths: number[],
  item: ComputedInvoice['items'][number],
  idx: number,
  fontSize: number,
  basePad: number,
): number {
  doc.fontSize(fontSize);
  let max = fontSize + 4;
  cols.forEach((c, i) => {
    const text = c.value(item, idx);
    const w = widths[i]! - basePad * 2;
    const h = doc.heightOfString(text, { width: w, align: c.align ?? 'left' });
    if (h > max) max = h;
  });
  return Math.ceil(max + basePad * 2);
}

export function formatPartyLines(p: ComputedInvoice['seller']): string[] {
  const lines = [p.address.line1];
  if (p.address.line2) lines.push(p.address.line2);
  lines.push(`${p.address.city}, ${p.address.state} - ${p.address.pincode}`);
  if (p.gstin) lines.push(`GSTIN: ${p.gstin}`);
  if (p.email) lines.push(`Email: ${p.email}`);
  if (p.phone) lines.push(`Phone: ${p.phone}`);
  return lines;
}
