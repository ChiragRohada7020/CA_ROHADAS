export interface Party {
  name: string;
  gstin?: string;
  stateCode: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  email?: string;
  phone?: string;
}

export interface LineItem {
  description: string;
  hsn: string;
  quantity: number;
  unit?: string;
  rate: number;
  gstRate: number;
  discount?: number;
  cess?: number;
}

export interface InvoiceMeta {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  placeOfSupply?: string;
  reverseCharge?: boolean;
  documentType?: 'INV' | 'CRN' | 'DBN';
}

export interface InvoiceInput {
  meta: InvoiceMeta;
  seller: Party;
  buyer: Party;
  shipTo?: Party;
  items: LineItem[];
  currency?: string;
  notes?: string;
  termsAndConditions?: string;
  logoPath?: string;
}

export interface ComputedLine extends LineItem {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cessAmount: number;
  totalTax: number;
  lineTotal: number;
}

export interface InvoiceTotals {
  subtotal: number;
  totalDiscount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
}

export interface ComputedInvoice {
  meta: InvoiceMeta;
  seller: Party;
  buyer: Party;
  shipTo?: Party;
  currency: string;
  notes?: string;
  termsAndConditions?: string;
  logoPath?: string;
  isInterState: boolean;
  items: ComputedLine[];
  totals: InvoiceTotals;
}

export class InvoiceError extends Error {
  code: 'INVALID_GSTIN' | 'INVALID_HSN' | 'INVALID_STATE_CODE' | 'INVALID_INPUT' | 'PDF_ERROR';
  constructor(code: InvoiceError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'InvoiceError';
  }
}
