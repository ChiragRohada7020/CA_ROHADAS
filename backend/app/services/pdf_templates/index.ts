import PDFDocument from 'pdfkit';
import { Writable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { InvoiceError, type ComputedInvoice } from '../types';
import { mergeTheme, type Theme } from './theme';
import { getTemplate, type BuiltinTemplate, type TemplateRenderer } from './registry';
import type { TemplateContext } from './utils';

export interface PDFOptions {
  template?: BuiltinTemplate | string;
  theme?: Partial<Theme>;
  size?: 'A4' | 'LETTER';
  margin?: number;
}

const PAGE_WIDTHS = { A4: 595, LETTER: 612 };

export async function generateInvoicePDF(
  invoice: ComputedInvoice,
  options: PDFOptions = {},
): Promise<Buffer> {
  const templateName = options.template ?? 'modern';
  const renderer = getTemplate(templateName);
  if (!renderer) {
    throw new InvoiceError('PDF_ERROR', `Unknown template "${templateName}". Available: modern, classic, minimal, corporate, compact`);
  }

  const theme = mergeTheme(options.theme);
  const size = options.size ?? 'A4';
  const margin = options.margin ?? 36;
  const pageWidth = PAGE_WIDTHS[size];

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size, margin });
      const chunks: Buffer[] = [];

      const stream = new Writable({
        write(chunk, _enc, cb) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          cb();
        },
      });

      doc.pipe(stream);

      const ctx: TemplateContext = {
        doc,
        invoice,
        theme,
        width: pageWidth - margin * 2,
        pageWidth,
        margin,
      };

      renderer(ctx);
      doc.end();

      stream.on('finish', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => reject(new InvoiceError('PDF_ERROR', err.message)));
    } catch (err) {
      reject(new InvoiceError('PDF_ERROR', err instanceof Error ? err.message : 'PDF generation failed'));
    }
  });
}

export async function generateInvoicePDFToFile(
  invoice: ComputedInvoice,
  filePath: string,
  options: PDFOptions = {},
): Promise<void> {
  const buffer = await generateInvoicePDF(invoice, options);
  await writeFile(filePath, buffer);
}

export { registerTemplate, listTemplates, type TemplateRenderer, type BuiltinTemplate } from './registry';
export { type Theme, DEFAULT_THEME } from './theme';
export type { TemplateContext } from './utils';
