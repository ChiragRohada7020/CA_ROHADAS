import { amountInWordsINR } from '../../tax';
import { columnsFor, distributeFlexWidth, formatPartyLines, inr, measureRowHeight, type TemplateContext } from '../utils';
import { densityMetrics } from '../theme';

export function renderClassic(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const m = densityMetrics(theme.density);
  const right = margin + width;

  doc.lineWidth(2).strokeColor(theme.text).rect(margin - 4, margin - 4, width + 8, 760).stroke();
  doc.lineWidth(0.5);

  let y = margin + 4;
  doc.font('Times-Bold').fontSize(24).fillColor(theme.text);
  doc.text('TAX INVOICE', margin, y, { width, align: 'center' });
  y += 30;
  doc.strokeColor(theme.text).moveTo(margin, y).lineTo(right, y).stroke();
  y += 6;

  doc.font('Times-Bold').fontSize(16).fillColor(theme.text);
  doc.text(invoice.seller.name, margin, y, { width, align: 'center' });
  y = doc.y + 2;
  doc.font('Times-Roman').fontSize(m.fontSize);
  formatPartyLines(invoice.seller).forEach((line) => {
    doc.text(line, margin, y, { width, align: 'center' });
    y += 11;
  });

  y += 4;
  doc.strokeColor(theme.text).moveTo(margin, y).lineTo(right, y).stroke();
  y += 6;

  doc.font('Times-Bold').fontSize(m.fontSize);
  doc.text(`Invoice No: `, margin, y, { continued: true }).font('Times-Roman').text(invoice.meta.invoiceNumber);
  doc.font('Times-Bold').text(`Date: `, right - 200, y, { continued: true }).font('Times-Roman').text(invoice.meta.invoiceDate);
  y = doc.y + 8;

  const half = (width - 16) / 2;
  drawPartyBox(ctx, 'Bill To', invoice.buyer, margin, y, half);
  drawPartyBox(ctx, 'Ship To', invoice.shipTo ?? invoice.buyer, margin + half + 16, y, half);
  y = doc.y + m.sectionGap;
  doc.y = y;

  drawItemsTable(ctx, m);
  drawTotalsBlock(ctx, m);
  drawFooter(ctx);
}

function drawPartyBox(ctx: TemplateContext, label: string, party: any, x: number, y: number, w: number): void {
  const { doc, theme } = ctx;
  doc.strokeColor(theme.text).lineWidth(1).rect(x, y, w, 78).stroke();
  doc.fillColor(theme.text).font('Times-Bold').fontSize(9).text(label.toUpperCase(), x + 6, y + 4);
  doc.font('Times-Bold').fontSize(10).text(party.name, x + 6, y + 16);
  doc.font('Times-Roman').fontSize(8);
  let ly = y + 30;
  formatPartyLines(party).forEach((line) => { doc.text(line, x + 6, ly, { width: w - 12 }); ly += 10; });
  doc.y = y + 78;
}

function drawItemsTable(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const cols = columnsFor(invoice);
  const widths = distributeFlexWidth(cols, width);

  let y = doc.y;
  doc.strokeColor(theme.text).lineWidth(1).rect(margin, y, width, m.rowHeight + 4).stroke();
  doc.font('Times-Bold').fontSize(m.fontSize).fillColor(theme.text);
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c.label, x + m.pad, y + m.pad + 2, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
    if (i < cols.length - 1) doc.moveTo(x + widths[i]!, y).lineTo(x + widths[i]!, y + m.rowHeight + 4).stroke();
    x += widths[i]!;
  });
  y += m.rowHeight + 4;

  doc.font('Times-Roman').fontSize(m.fontSize);
  invoice.items.forEach((item, idx) => {
    const rowH = Math.max(m.rowHeight, measureRowHeight(doc, cols, widths, item, idx, m.fontSize, m.pad));
    if (y + rowH > 760) { doc.addPage(); y = margin; }
    doc.strokeColor(theme.text).lineWidth(0.5).rect(margin, y, width, rowH).stroke();
    x = margin;
    cols.forEach((c, i) => {
      doc.text(c.value(item, idx), x + m.pad, y + m.pad, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
      if (i < cols.length - 1) doc.moveTo(x + widths[i]!, y).lineTo(x + widths[i]!, y + rowH).stroke();
      x += widths[i]!;
    });
    y += rowH;
  });
  doc.y = y + 4;
}

function drawTotalsBlock(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const t = invoice.totals;
  const boxW = 240;
  const x = margin + width - boxW;
  let y = doc.y + 4;

  doc.strokeColor(theme.text).lineWidth(1).rect(x, y, boxW, 0).stroke();
  const row = (label: string, value: string, bold = false): void => {
    doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(m.fontSize).fillColor(theme.text);
    doc.text(label, x + m.pad, y + 3, { width: 120, align: 'left' });
    doc.text(value, x + 120, y + 3, { width: boxW - 120 - m.pad, align: 'right' });
    y += m.rowHeight;
    doc.moveTo(x, y).lineTo(x + boxW, y).stroke();
  };

  doc.moveTo(x, y).lineTo(x + boxW, y).stroke();
  row('Taxable Value', inr(t.taxableValue));
  if (invoice.isInterState) row('IGST', inr(t.igst));
  else { row('CGST', inr(t.cgst)); row('SGST', inr(t.sgst)); }
  if (t.cess > 0) row('Cess', inr(t.cess));
  if (t.roundOff !== 0) row('Round Off', inr(t.roundOff));
  row('GRAND TOTAL', `${invoice.currency} ${inr(t.grandTotal)}`, true);

  doc.strokeColor(theme.text).lineWidth(1).rect(x, doc.y - (m.rowHeight * 5), boxW, m.rowHeight * 5).stroke();

  if (theme.showAmountInWords) {
    doc.fillColor(theme.text).font('Times-Italic').fontSize(m.fontSize);
    doc.text(`Amount in Words: ${amountInWordsINR(t.grandTotal)}`, margin, y + 6, { width: width - boxW - 12 });
  }
  doc.y = y + 20;
}

function drawFooter(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  doc.moveDown(1);
  doc.font('Times-Bold').fontSize(9).fillColor(theme.text);
  if (invoice.notes) {
    doc.text('Notes: ', margin, doc.y, { continued: true });
    doc.font('Times-Roman').text(invoice.notes, { width });
    doc.moveDown(0.3);
  }
  if (invoice.termsAndConditions) {
    doc.font('Times-Bold').text('Terms & Conditions:', margin);
    doc.font('Times-Roman').text(invoice.termsAndConditions, margin, doc.y, { width });
  }
}
