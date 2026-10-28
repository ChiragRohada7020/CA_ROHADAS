try:
    import pdfkit
except Exception:
    pdfkit = None

from .theme import mergeTheme, DEFAULT_THEME
from .registry import getTemplate, registerTemplate, listTemplates
from .utils import TemplateContext


class InvoiceError(Exception):
    pass


PAGE_WIDTHS = {'A4': 595, 'LETTER': 612}


def generateInvoicePDF(invoice, options=None):
    options = options or {}
    template_name = options.get('template') or 'modern'
    renderer = getTemplate(template_name)
    if not renderer:
        raise InvoiceError('PDF_ERROR', f'Unknown template "{template_name}"')
    theme = mergeTheme(options.get('theme'))
    size = options.get('size') or 'A4'
    margin = options.get('margin') or 36
    pageWidth = PAGE_WIDTHS.get(size, 595)
    # For now, delegate to existing whatsapp service style - use pdfkit if available
    if pdfkit is not None:
        # Simple HTML fallback using pdfkit
        html = f"""
        <html><head><meta charset='utf-8'><style>body{{font-family:Arial;padding:40px}}h1{{color:#333}}table{{width:100%;border-collapse:collapse}}td,th{{border:1px solid #ddd;padding:8px}}</style></head>
        <body>
        <h1>TAX INVOICE</h1>
        <p><strong>Invoice No:</strong> {invoice.get('meta',{}).get('invoiceNumber','')}</p>
        <p><strong>Date:</strong> {invoice.get('meta',{}).get('invoiceDate','')}</p>
        <table>
        <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
        """
        for item in invoice.get('items',[]):
            html += f"<tr><td>{item.get('description','')}</td><td>{item.get('quantity','')}</td><td>₹{item.get('rate','')}</td><td>₹{item.get('amount','')}</td></tr>"
        html += f"</table><h3>Grand Total: ₹{invoice.get('totals',{}).get('grandTotal','')}</h3></body></html>"
        try:
            pdf_bytes = pdfkit.from_string(html, False)
            return pdf_bytes
        except Exception:
            pass
    # Fallback to reportlab style basic pdf
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    from io import BytesIO
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(50, 800, 'TAX INVOICE')
    c.setFont('Helvetica', 10)
    c.drawString(50, 780, f"Invoice No: {invoice.get('meta',{}).get('invoiceNumber','')}")
    c.drawString(50, 765, f"Date: {invoice.get('meta',{}).get('invoiceDate','')}")
    y = 720
    for item in invoice.get('items',[]):
        c.drawString(50, y, f"{item.get('description','')[:60]}")
        c.drawString(400, y, f"₹{item.get('amount','')}")
        y -= 15
    c.drawString(50, y-20, f"Grand Total: ₹{invoice.get('totals',{}).get('grandTotal','')}")
    c.save()
    return buf.getvalue()


def generateInvoicePDFToFile(invoice, filePath, options=None):
    buffer = generateInvoicePDF(invoice, options)
    with open(filePath, 'wb') as f:
        f.write(buffer)


__all__ = ['generateInvoicePDF', 'generateInvoicePDFToFile', 'mergeTheme', 'registerTemplate', 'listTemplates']
