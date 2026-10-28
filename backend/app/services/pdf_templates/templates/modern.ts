import { amountInWordsINR } from '../../tax';
import { columnsFor, distributeFlexWidth, formatPartyLines, inr, measureRowHeight, type TemplateContext } from '../utils';
import { densityMetrics } from '../theme';

export function renderModern(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const m = densityMetrics(theme.density);

  doc.rect(margin, margin, width, 8).fill(theme.primary);
  doc.fillColor(theme.text);

  let y = margin + 22;
  doc.font(theme.fontHeader).fontSize(20).fillColor(theme.primary);
  doc.text(invoice.seller.name, margin, y);

  doc.font(theme.fontHeader).fontSize(22).fillColor(theme.primary);
  doc.text('TAX INVOICE', margin, y, { width, align: 'right' });

  y = doc.y + 6;
  doc.font(theme.fontBody).fontSize(m.fontSize).fillColor(theme.text);
  const sellerLines = formatPartyLines(invoice.seller);
  sellerLines.forEach((line) => { doc.text(line, margin, y); y += 11; });

  const metaY = margin + 50;
  doc.font(theme.fontBody).fontSize(m.fontSize).fillColor(theme.muted);
  doc.text('Invoice No', margin + width - 200, metaY, { width: 90, align: 'right' });
  doc.text('Date', margin + width - 200, metaY + 12, { width: 90, align: 'right' });
  if (invoice.meta.dueDate) doc.text('Due Date', margin + width - 200, metaY + 24, { width: 90, align: 'right' });
  doc.font(theme.fontHeader).fillColor(theme.text);
  doc.text(invoice.meta.invoiceNumber, margin + width - 100, metaY, { width: 100, align: 'right' });
  doc.text(invoice.meta.invoiceDate, margin + width - 100, metaY + 12, { width: 100, align: 'right' });
  if (invoice.meta.dueDate) doc.text(invoice.meta.dueDate, margin + width - 100, metaY + 24, { width: 100, align: 'right' });

  y = Math.max(y, metaY + 40) + m.sectionGap;

  const colWidth = (width - 12) / 2;
  drawPartyBlock(ctx, 'BILL TO', invoice.buyer, margin, y, colWidth);
  drawPartyBlock(ctx, 'SHIP TO', invoice.shipTo ?? invoice.buyer, margin + colWidth + 12, y, colWidth);

  y = doc.y + m.sectionGap;
  doc.x = margin;
  doc.y = y;

  drawItemsTable(ctx, m);
  drawTotalsBlock(ctx, m);
  drawFooter(ctx);
}

function drawPartyBlock(ctx: TemplateContext, label: string, party: any, x: number, y: number, w: number): void {
  const { doc, theme } = ctx;
  doc.rect(x, y, w, 70).fillAndStroke(theme.background, theme.border);
  doc.fillColor(theme.muted).font(theme.fontHeader).fontSize(8).text(label, x + 8, y + 6);
  doc.fillColor(theme.text).font(theme.fontHeader).fontSize(10).text(party.name, x + 8, y + 18);
  doc.font(theme.fontBody).fontSize(8).fillColor(theme.text);
  let ly = y + 32;
  formatPartyLines(party).forEach((line) => { doc.text(line, x + 8, ly, { width: w - 16 }); ly += 9; });
  doc.y = y + 70;
}

function drawItemsTable(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const cols = columnsFor(invoice);
  const widths = distributeFlexWidth(cols, width);

  let y = doc.y;
  doc.rect(margin, y, width, m.rowHeight + 2).fill(theme.primary);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(m.fontSize);
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c.label, x + m.pad, y + m.pad + 1, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
    x += widths[i]!;
  });
  y += m.rowHeight + 2;

  doc.fillColor(theme.text).font(theme.fontBody).fontSize(m.fontSize);
  invoice.items.forEach((item, idx) => {
    const rowH = Math.max(m.rowHeight, measureRowHeight(doc, cols, widths, item, idx, m.fontSize, m.pad));
    if (y + rowH > 760) { doc.addPage(); y = margin; }
    if (idx % 2 === 1) doc.rect(margin, y, width, rowH).fill(theme.rowAlt);
    doc.fillColor(theme.text);
    x = margin;
    cols.forEach((c, i) => {
      doc.text(c.value(item, idx), x + m.pad, y + m.pad, { width: widths[i]! - m.pad * 2, align: c.align ?? 'left' });
      x += widths[i]!;
    });
    y += rowH;
  });
  doc.strokeColor(theme.border).lineWidth(0.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
  doc.y = y + 4;
}

function drawTotalsBlock(ctx: TemplateContext, m: ReturnType<typeof densityMetrics>): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const t = invoice.totals;
  const boxW = 220;
  const x = margin + width - boxW;
  let y = doc.y + 4;

  const row = (label: string, value: string, bold = false, color?: string): void => {
    doc.font(bold ? theme.fontHeader : theme.fontBody).fontSize(m.fontSize).fillColor(color ?? theme.text);
    doc.text(label, x, y, { width: 110, align: 'left' });
    doc.text(value, x + 110, y, { width: boxW - 110, align: 'right' });
    y += m.rowHeight - 2;
  };

  row('Taxable Value', inr(t.taxableValue));
  if (invoice.isInterState) row('IGST', inr(t.igst));
  else { row('CGST', inr(t.cgst)); row('SGST', inr(t.sgst)); }
  if (t.cess > 0) row('Cess', inr(t.cess));
  if (t.roundOff !== 0) row('Round Off', inr(t.roundOff), false, theme.muted);

  doc.rect(x, y, boxW, m.rowHeight + 4).fill(theme.primary);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(m.fontSize + 2);
  doc.text('GRAND TOTAL', x + m.pad, y + 4, { width: 110, align: 'left' });
  doc.text(`${invoice.currency} ${inr(t.grandTotal)}`, x + 110, y + 4, { width: boxW - 110 - m.pad, align: 'right' });
  y += m.rowHeight + 6;

  if (theme.showAmountInWords) {
    doc.fillColor(theme.muted).font(theme.fontBody).fontSize(m.fontSize - 1);
    doc.text(`Amount in Words: ${amountInWordsINR(t.grandTotal)}`, margin, y + 4, { width: width - boxW - 12 });
    y = Math.max(y, doc.y);
  }
  doc.y = y + 8;
}

function drawFooter(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  doc.moveDown(1);
  if (invoice.notes) {
    doc.font(ctx.theme.fontHeader).fontSize(8).fillColor(theme.muted).text('Notes:', margin);
    doc.font(theme.fontBody).fillColor(theme.text).text(invoice.notes, margin, doc.y, { width });
    doc.moveDown(0.5);
  }
  if (invoice.termsAndConditions) {
    doc.font(theme.fontHeader).fontSize(8).fillColor(theme.muted).text('Terms & Conditions:', margin);
    doc.font(theme.fontBody).fillColor(theme.text).text(invoice.termsAndConditions, margin, doc.y, { width });
  }
}
