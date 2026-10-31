import type { InvoiceTemplateMeta } from "@/lib/types";

export type InvoiceTemplate = "modern_gst" | "wave" | "studio" | "grid_v6";

export const INVOICE_TEMPLATES: InvoiceTemplateMeta[] = [
  {
    id: "modern_gst",
    name: "Modern GST",
    description: "Clean modern layout with firm branding, two-column billing, and prominent GST totals panel.",
    category: "General",
    header_style: "asymmetric",
    accent_color: "#172B4D",
    best_for: "Standard Indian GST invoices with firm branding and totals panel",
    features: ["GST breakdown", "HSN/SAC codes", "Amount in words", "Bank details"],
  },
  {
    id: "wave",
    name: "Wave",
    description: "Styled header with teal and navy wave graphics, footer stripes, and bold invoice title.",
    category: "General",
    header_style: "band",
    accent_color: "#56C9C1",
    best_for: "Styled CA invoice with teal/navy wave header and footer stripes",
    features: ["Wave header", "Footer stripes", "GST breakdown", "Bank details"],
  },
  {
    id: "grid_v6",
    name: "Grid v6",
    description: "Graphite/lime palette with left brand rail, rounded cards, and clean service table.",
    category: "General",
    header_style: "band",
    accent_color: "#20262E",
    best_for: "Premium CA invoice with dark brand rail and lime accents",
    features: ["Brand rail", "Rounded cards", "Grid service table", "Amount in words"],
  },
];

export const PREMIUM_TEMPLATES: InvoiceTemplate[] = ["modern_gst", "wave", "studio", "grid_v6"];

export const GENERAL_TEMPLATES: InvoiceTemplate[] = ["modern_gst", "wave", "studio", "grid_v6"];

export function getTemplateMeta(id: string): InvoiceTemplateMeta | undefined {
  return INVOICE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplateAccentColor(id: string): string {
  const t = INVOICE_TEMPLATES.find((tpl) => tpl.id === id);
  return t ? t.accent_color : "#172B4D";
}
