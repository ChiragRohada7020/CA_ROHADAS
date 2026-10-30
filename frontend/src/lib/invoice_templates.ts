import type { InvoiceTemplate, InvoiceTemplateMeta } from "@/lib/types";

// DISABLED — all invoice template metadata removed pending new design.
export const INVOICE_TEMPLATES: InvoiceTemplateMeta[] = [];

export const PREMIUM_TEMPLATES: InvoiceTemplate[] = [];

export const GENERAL_TEMPLATES: InvoiceTemplate[] = [];

export function getTemplateMeta(id: string): InvoiceTemplateMeta | undefined {
  return undefined;
}

export function getTemplateAccentColor(id: string): string {
  return "#2563eb";
}
