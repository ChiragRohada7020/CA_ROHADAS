import { amountInWordsINR } from '../../tax';
import { columnsFor, distributeFlexWidth, formatPartyLines, inr, measureRowHeight, type TemplateContext } from '../utils';

export function renderCompact(ctx: TemplateContext): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const fontSize = 7;
  const rowHeight = 11;
  const pad = 2;

  doc.font(theme.fontHeader).fontSize(14).fillColor(theme.text);
  doc.text(invoice.seller.name, margin, margin);
  doc.font(theme.fontHeader).fontSize(14).fillColor(theme.primary);
  doc.text('TAX INVOICE', margin, margin, { width, align: 'right' });

  let y = margin + 18;
  doc.font(theme.fontBody).fontSize(fontSize).fillColor(theme.muted);
  doc.text(formatPartyLines(invoice.seller).join(' • '), margin, y, { width: width * 0.65 });

  doc.fillColor(theme.text).font(theme.fontBody).fontSize(fontSize);
  doc.text(`Invoice: ${invoice.meta.invoiceNumber}`, margin + width - 200, y, { width: 200, align: 'right' });
  doc.text(`Date: ${invoice.meta.invoiceDate}${invoice.meta.dueDate ? ' | Due: ' + invoice.meta.dueDate : ''}`, margin + width - 200, y + 10, { width: 200, align: 'right' });

  y = doc.y + 6;
  doc.strokeColor(theme.border).lineWidth(0.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
  y += 4;

  const half = width / 2;
  doc.font(theme.fontHeader).fontSize(fontSize).fillColor(theme.muted);
  doc.text('BILL TO', margin, y);
  doc.text('SHIP TO', margin + half, y);
  y += 9;
  doc.font(theme.fontHeader).fontSize(fontSize + 1).fillColor(theme.text);
  doc.text(invoice.buyer.name, margin, y, { width: half - 8 });
  doc.text((invoice.shipTo ?? invoice.buyer).name, margin + half, y, { width: half - 8 });
  y += 11;
  doc.font(theme.fontBody).fontSize(fontSize).fillColor(theme.text);
  const buyerLines = formatPartyLines(invoice.buyer);
  const shipLines = formatPartyLines(invoice.shipTo ?? invoice.buyer);
  const maxLines = Math.max(buyerLines.length, shipLines.length);
  for (let i = 0; i < maxLines; i++) {
    if (buyerLines[i]) doc.text(buyerLines[i]!, margin, y, { width: half - 8 });
    if (shipLines[i]) doc.text(shipLines[i]!, margin + half, y, { width: half - 8 });
    y += 9;
  }

  y += 6;
  doc.x = margin;
  doc.y = y;

  drawItemsTable(ctx, fontSize, rowHeight, pad);
  drawTotalsInline(ctx, fontSize);
  drawFooter(ctx, fontSize);
}

function drawItemsTable(ctx: TemplateContext, fontSize: number, rowHeight: number, pad: number): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const cols = columnsFor(invoice);
  const widths = distributeFlexWidth(cols, width);

  let y = doc.y;
  doc.rect(margin, y, width, rowHeight + 1).fill(theme.text);
  doc.fillColor('#fff').font(theme.fontHeader).fontSize(fontSize);
  let x = margin;
  cols.forEach((c, i) => {
    doc.text(c.label, x + pad, y + 2, { width: widths[i]! - pad * 2, align: c.align ?? 'left' });
    x += widths[i]!;
  });
  y += rowHeight + 1;

  doc.fillColor(theme.text).font(theme.fontBody).fontSize(fontSize);
  invoice.items.forEach((item, idx) => {
    const rowH = Math.max(rowHeight, measureRowHeight(doc, cols, widths, item, idx, fontSize, pad));
    if (y + rowH > 770) { doc.addPage(); y = margin; }
    x = margin;
    cols.forEach((c, i) => {
      doc.text(c.value(item, idx), x + pad, y + 1, { width: widths[i]! - pad * 2, align: c.align ?? 'left' });
      x += widths[i]!;
    });
    y += rowH;
    doc.strokeColor(theme.border).lineWidth(0.3).moveTo(margin, y).lineTo(margin + width, y).stroke();
  });
  doc.y = y + 2;
}

function drawTotalsInline(ctx: TemplateContext, fontSize: number): void {
  const { doc, invoice, theme, margin, width } = ctx;
  const t = invoice.totals;
  const x = margin + width - 200;
  let y = doc.y + 2;

  const row = (label: string, value: string, em = false): void => {
    doc.font(em ? theme.fontHeader : theme.fontBody).fontSize(em ? fontSize + 2 : fontSize).fillColor(em ? theme.primary : theme.text);
    doc.text(label, x, y, { width: 100, align: 'left' });
    doc.text(value, x + 100, y, { width: 100, align: 'right' });
    y += em ? 14 : 10;
  };

  row('Taxable', inr(t.taxableValue));
  if (invoice.isInterState) row('IGST', inr(t.igst));
  else { row('CGST', inr(t.cgst)); row('SGST', inr(t.sgst)); }
  if (t.cess > 0) row('Cess', inr(t.cess));
  if (t.roundOff !== 0) row('Round Off', inr(t.roundOff));
  doc.strokeColor(theme.primary).lineWidth(1).moveTo(x, y).lineTo(x + 200, y).stroke();
  y += 2;
  row('GRAND TOTAL', `${invoice.currency} ${inr(t.grandTotal)}`, true);

  if (theme.showAmountInWords) {
    doc.fillColor(theme.muted).font(theme.fontBody).fontSize(fontSize);
    doc.text(`In Words: ${amountInWordsINR(t.grandTotal)}`, margin, doc.y + 2, { width: width - 220 });
  }
  doc.y = y + 4;
}

function drawFooter(ctx: TemplateContext, fontSize: number): void {
  const { doc, invoice, theme, margin, width } = ctx;
  doc.moveDown(0.5);
  if (invoice.notes) {
    doc.font(theme.fontBody).fontSize(fontSize).fillColor(theme.muted);
    doc.text(`Notes: ${invoice.notes}`, margin, doc.y, { width });
  }
  if (invoice.termsAndConditions) {
    doc.font(theme.fontBody).fontSize(fontSize).fillColor(theme.muted);
    doc.text(`Terms: ${invoice.termsAndConditions}`, margin, doc.y, { width });
  }
}
