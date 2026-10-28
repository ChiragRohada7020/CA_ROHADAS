import { amountInWordsINR } from '../../tax';
import { columnsFor, distributeFlexWidth, formatPartyLines, inr, measureRowHeight, type TemplateContext } from '../utils';
import { densityMetrics } from '../theme';

export function renderMinimal(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const m = densityMetrics(theme.density);

  doc.font(theme.fontHeader).fontSize(11).fillColor(theme.text);
  doc.text(invoice.seller.name.toUpperCase(), margin, margin);

  doc.font(theme.fontHeader).fontSize(28).fillColor(theme.text);
  doc.text('Invoice', margin, margin + 18, { width, align: 'right' });

  let y = margin + 60;
  doc.strokeColor(theme.text).lineWidth(0.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
  y += 10;

  const col1 = margin;
  const col2 = margin + width / 3;
  const col3 = margin + (width / 3) * 2;

  doc.font(theme.fontBody).fontSize(8).fillColor(theme.muted);
  doc.text('FROM', col1, y);
  doc.text('BILL TO', col2, y);
  doc.text('INVOICE DETAILS', col3, y);

  y += 10;
  doc.font(theme.fontHeader).fontSize(10).fillColor(theme.text);
  doc.text(invoice.seller.name, col1, y, { width: width / 3 - 10 });
  doc.text(invoice.buyer.name, col2, y, { width: width / 3 - 10 });

  doc.font(theme.fontBody).fontSize(m.fontSize).fillColor(theme.text);
  doc.text(`No.    ${invoice.meta.invoiceNumber}`, col3, y);
  doc.text(`Date   ${invoice.meta.invoiceDate}`, col3, y + 12);
  if (invoice.meta.dueDate) doc.text(`Due    ${invoice.meta.dueDate}`, col3, y + 24);

  let leftY = y + 14;
  let rightY = y + 14;
  doc.font(theme.fontBody).fontSize(m.fontSize - 1).fillColor(theme.muted);
  formatPartyLines(invoice.seller).forEach((line) => { doc.text(line, col1, leftY, { width: width / 3 - 10 }); leftY += 10; });
  formatPartyLines(invoice.buyer).forEach((line) => { doc.text(line, col2, rightY, { width: width / 3 - 10 }); rightY += 10; });

  y = Math.max(leftY, rightY) + m.sectionGap;
  doc.x = margin;
  doc.y = y;

  drawItemsTable(ctx, m);
  drawTotals(ctx, m);
  drawFooter(ctx);
}

function drawItemsTable(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const cols = columnsFor(invoice);
  const widths = distributeFlexWidth(cols, width);

  let y = doc.y;
  doc.strokeColor(theme.text).lineWidth(0.75).moveTo(margin, y).lineTo(margin + width, y).stroke();
  y += 4;
  doc.font(theme.fontBody).fontSize(8).fillColor(theme.muted);
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c.label.toUpperCase(), x + m.pad, y, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
    x += widths[i]!;
  });
  y += 12;
  doc.strokeColor(theme.text).lineWidth(0.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
  y += 4;

  doc.font(theme.fontBody).fontSize(m.fontSize).fillColor(theme.text);
  invoice.items.forEach((item, idx) => {
    const rowH = Math.max(m.rowHeight, measureRowHeight(doc, cols, widths, item, idx, m.fontSize, m.pad));
    if (y + rowH > 760) { doc.addPage(); y = margin; }
    x = margin;
    cols.forEach((c, i) => {
      doc.text(c.value(item, idx), x + m.pad, y, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
      x += widths[i]!;
    });
    y += rowH;
  });
  doc.strokeColor(theme.text).lineWidth(0.75).moveTo(margin, y).lineTo(margin + width, y).stroke();
  doc.y = y + 6;
}

function drawTotals(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const t = invoice.totals;
  const x = margin + width - 180;
  let y = doc.y + 4;

  const row = (label: string, value: string, em = false): void => {
    doc.font(em ? theme.fontHeader : theme.fontBody).fontSize(em ? m.fontSize + 1 : m.fontSize).fillColor(em ? theme.text : theme.muted);
    doc.text(label, x, y, { width: 90, align: 'left' });
    doc.fillColor(theme.text).text(value, x + 90, y, { width: 90, align: 'right' });
    y += m.rowHeight - 2;
  };

  row('Taxable', inr(t.taxableValue));
  if (invoice.isInterState) row('IGST', inr(t.igst));
  else { row('CGST', inr(t.cgst)); row('SGST', inr(t.sgst)); }
  if (t.cess > 0) row('Cess', inr(t.cess));
  if (t.roundOff !== 0) row('Round Off', inr(t.roundOff));
  y += 2;
  doc.strokeColor(theme.text).lineWidth(0.75).moveTo(x, y - 2).lineTo(x + 180, y - 2).stroke();
  row('Total', `${invoice.currency} ${inr(t.grandTotal)}`, true);

  if (theme.showAmountInWords) {
    doc.fillColor(theme.muted).font(theme.fontBody).fontSize(m.fontSize - 1);
    doc.text(amountInWordsINR(t.grandTotal), margin, y + 4, { width: width - 200 });
  }
  doc.y = y + 16;
}

function drawFooter(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  doc.moveDown(1);
  if (invoice.notes) {
    doc.font(theme.fontBody).fontSize(7).fillColor(theme.muted).text('NOTES', margin);
    doc.font(theme.fontBody).fontSize(9).fillColor(theme.text).text(invoice.notes, margin, doc.y + 2, { width });
    doc.moveDown(0.5);
  }
  if (invoice.termsAndConditions) {
    doc.font(theme.fontBody).fontSize(7).fillColor(theme.muted).text('TERMS', margin);
    doc.font(theme.fontBody).fontSize(8).fillColor(theme.text).text(invoice.termsAndConditions, margin, doc.y + 2, { width });
  }
}
