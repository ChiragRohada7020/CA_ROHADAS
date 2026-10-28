import { amountInWordsINR } from '../../tax';
import { columnsFor, distributeFlexWidth, formatPartyLines, inr, measureRowHeight, type TemplateContext } from '../utils';
import { densityMetrics } from '../theme';

export function renderCorporate(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const m = densityMetrics(theme.density);

  doc.rect(margin, margin, width, 60).fill(theme.primary);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(18);
  doc.text(invoice.seller.name, margin + 12, margin + 14, { width: width - 24 });
  doc.font(theme.fontBody).fontSize(8).fillColor('#dbeafe');
  doc.text(formatPartyLines(invoice.seller).slice(0, 2).join(' • '), margin + 12, margin + 38);

  doc.fillColor('#fff').font(theme.fontHeader).fontSize(14);
  doc.text('TAX INVOICE', margin, margin + 18, { width: width - 12, align: 'right' });

  let y = margin + 72;

  const half = width / 2;
  doc.rect(margin, y, half - 4, 90).fill(theme.rowAlt);
  doc.rect(margin + half + 4, y, half - 4, 90).fill(theme.rowAlt);

  doc.fillColor(theme.muted).font(theme.fontHeader).fontSize(8).text('BILL TO', margin + 10, y + 8);
  doc.fillColor(theme.text).font(theme.fontHeader).fontSize(11).text(invoice.buyer.name, margin + 10, y + 20, { width: half - 24 });
  doc.font(theme.fontBody).fontSize(8).fillColor(theme.text);
  let ly = y + 34;
  formatPartyLines(invoice.buyer).forEach((line) => { doc.text(line, margin + 10, ly, { width: half - 24 }); ly += 9; });

  doc.fillColor(theme.muted).font(theme.fontHeader).fontSize(8).text('INVOICE DETAILS', margin + half + 14, y + 8);
  const detailX = margin + half + 14;
  const valueX = margin + width - 100;
  doc.fillColor(theme.text).font(theme.fontBody).fontSize(9);
  const dy = y + 22;
  doc.text('Invoice Number', detailX, dy);
  doc.font(theme.fontHeader).text(invoice.meta.invoiceNumber, valueX, dy, { width: 90, align: 'right' });
  doc.font(theme.fontBody).text('Invoice Date', detailX, dy + 14);
  doc.font(theme.fontHeader).text(invoice.meta.invoiceDate, valueX, dy + 14, { width: 90, align: 'right' });
  if (invoice.meta.dueDate) {
    doc.font(theme.fontBody).text('Due Date', detailX, dy + 28);
    doc.font(theme.fontHeader).text(invoice.meta.dueDate, valueX, dy + 28, { width: 90, align: 'right' });
  }

  y += 102;
  doc.x = margin;
  doc.y = y;

  drawItemsTable(ctx, m);
  drawTotalsBlock(ctx, m);
  drawFooter(ctx);
}

function drawItemsTable(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const cols = columnsFor(invoice);
  const widths = distributeFlexWidth(cols, width);

  let y = doc.y;
  doc.rect(margin, y, width, m.rowHeight + 4).fill(theme.text);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(m.fontSize);
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c.label, x + m.pad, y + 4, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
    x += widths[i]!;
  });
  y += m.rowHeight + 4;

  doc.fillColor(theme.text).font(theme.fontBody).fontSize(m.fontSize);
  invoice.items.forEach((item, idx) => {
    const rowH = Math.max(m.rowHeight, measureRowHeight(doc, cols, widths, item, idx, m.fontSize, m.pad));
    if (y + rowH > 760) { doc.addPage(); y = margin; }
    if (idx % 2 === 0) doc.rect(margin, y, width, rowH).fill(theme.rowAlt);
    doc.fillColor(theme.text);
    x = margin;
    cols.forEach((c, i) => {
      doc.text(c.value(item, idx), x + m.pad, y + m.pad, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
      x += widths[i]!;
    });
    y += rowH;
  });
  doc.y = y + 6;
}

function drawTotalsBlock(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const t = invoice.totals;
  const boxW = 250;
  const x = margin + width - boxW;
  let y = doc.y + 4;

  const row = (label: string, value: string): void => {
    doc.font(theme.fontBody).fontSize(m.fontSize).fillColor(theme.text);
    doc.text(label, x + m.pad, y, { width: 130, align: 'left' });
    doc.text(value, x + 130, y, { width: boxW - 130 - m.pad, align: 'right' });
    y += m.rowHeight;
    doc.strokeColor(theme.border).lineWidth(0.5).moveTo(x, y - 1).lineTo(x + boxW, y - 1).stroke();
  };

  row('Taxable Value', inr(t.taxableValue));
  if (invoice.isInterState) row('IGST', inr(t.igst));
  else { row('CGST', inr(t.cgst)); row('SGST', inr(t.sgst)); }
  if (t.cess > 0) row('Cess', inr(t.cess));
  if (t.roundOff !== 0) row('Round Off', inr(t.roundOff));

  doc.rect(x, y, boxW, m.rowHeight + 6).fill(theme.primary);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(m.fontSize + 2);
  doc.text('GRAND TOTAL', x + m.pad, y + 4, { width: 130, align: 'left' });
  doc.text(`${invoice.currency} ${inr(t.grandTotal)}`, x + 130, y + 4, { width: boxW - 130 - m.pad, align: 'right' });
  y += m.rowHeight + 8;

  if (theme.showAmountInWords) {
    doc.fillColor(theme.text).font(theme.fontHeader).fontSize(m.fontSize - 1);
    doc.text('Amount in Words: ', margin, y + 4, { continued: true });
    doc.font(theme.fontBody).text(amountInWordsINR(t.grandTotal), { width: width - boxW - 12 });
  }
  doc.y = y + 16;
}

function drawFooter(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  doc.moveDown(1);
  if (invoice.notes || invoice.termsAndConditions) {
    doc.rect(margin, doc.y, width, 60).fillAndStroke(theme.rowAlt, theme.border);
    let ny = doc.y + 6;
    if (invoice.notes) {
      doc.fillColor(theme.muted).font(theme.fontHeader).fontSize(8).text('NOTES', margin + 8, ny);
      doc.fillColor(theme.text).font(theme.fontBody).fontSize(8).text(invoice.notes, margin + 8, ny + 10, { width: width - 16 });
      ny += 28;
    }
    if (invoice.termsAndConditions) {
      doc.fillColor(theme.muted).font(theme.fontHeader).fontSize(8).text('TERMS & CONDITIONS', margin + 8, ny);
      doc.fillColor(theme.text).font(theme.fontBody).fontSize(8).text(invoice.termsAndConditions, margin + 8, ny + 10, { width: width - 16 });
    }
  }
}
