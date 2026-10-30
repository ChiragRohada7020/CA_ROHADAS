try:
    import pdfkit
except Exception:
    pdfkit = None

from .theme import mergeTheme, DEFAULT_THEME
from .registry import getTemplate, registerTemplate, listTemplates
from .utils import TemplateContext
from .renderers import render as render_invoice


class InvoiceError(Exception):
    pass


PAGE_WIDTHS = {'A4': 595, 'LETTER': 612}


def generateInvoicePDF(invoice, options=None):
    options = options or {}
    template_name = options.get('template') or 'modern'
    # Merge the template into the invoice dict so render() can read it
    if isinstance(invoice, dict):
        ctx = dict(invoice)
        ctx["template"] = template_name
    else:
        ctx = {"invoice": invoice, "template": template_name}

    return render_invoice(ctx)


def generateInvoicePDFToFile(invoice, filePath, options=None):
    buffer = generateInvoicePDF(invoice, options)
    with open(filePath, 'wb') as f:
        f.write(buffer)


__all__ = ['generateInvoicePDF', 'generateInvoicePDFToFile', 'mergeTheme', 'registerTemplate', 'listTemplates']
