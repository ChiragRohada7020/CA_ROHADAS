"use client";

import { Icon } from "@/components/Icon";
import type { InvoiceDetail, InvoiceTemplate, InvoiceTemplateMeta } from "@/lib/types";
import { INVOICE_TEMPLATES } from "@/lib/invoice_templates";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { useState } from "react";

interface InvoiceTemplateSelectorProps {
  value: InvoiceTemplate;
  onChange: (template: InvoiceTemplate) => void;
  /** When true, only the premium templates are shown. */
  premiumOnly?: boolean;
  /** When true, templates scroll horizontally instead of wrapping in a grid. */
  scrollX?: boolean;
  /** Optional invoice data for preview. */
  invoice?: InvoiceDetail;
}

const block = (props: { className?: string; bg?: string; h?: string; w?: string; rounded?: boolean }) => (
  <div
    className={`rounded${props.rounded ? "-lg" : ""} ${props.className ?? ""}`}
    style={{
      backgroundColor: props.bg,
      height: props.h,
      width: props.w,
    }}
  />
);

const SkeletonLine = ({
  w,
  h = "10",
  className,
  bg = "#e5e7eb",
  rounded = false,
}: {
  w: string;
  h?: string;
  className?: string;
  bg?: string;
  rounded?: boolean;
}) => (
  <div
    className={`h-[${h}px] rounded${rounded ? "-lg" : ""} ${className ?? ""}`}
    style={{ backgroundColor: bg, width: w }}
  />
);

const TemplateThumbnail = ({
  template,
  isSelected,
}: {
  template: InvoiceTemplateMeta;
  isSelected: boolean;
}) => {
  const accent = template.accent_color;
  const isPremium = template.category === "Premium";

  const renderThumbnail = () => {
    switch (template.header_style) {
      case "asymmetric":
        return (
          <div className="h-[140px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="h-9 w-full flex items-center justify-between border-b border-slate-200 px-2" style={{ backgroundColor: accent }}>
              <span className="text-[7px] font-bold uppercase text-white">TAX INVOICE</span>
              <span className="text-[7px] font-bold tabular text-white">INV-001</span>
            </div>
            <div className="h-6 w-full border-b border-slate-100 px-2 pt-1">
              <div className="flex justify-between">
                <SkeletonLine w="70%" h="7" bg="#dbeafe" />
                <SkeletonLine w="28%" h="7" bg="#dbeafe" />
              </div>
            </div>
            <div className="flex-1 p-2 space-y-1">
              <div className="flex gap-2">
                <div className="flex-1">
                  <SkeletonLine w="100%" h="8" bg="#f1f5f9" rounded={true} />
                  <SkeletonLine w="60%" h="6" bg="#f1f5f9" rounded={true} className="mt-1" />
                </div>
                <div className="w-[35%]">
                  <SkeletonLine w="100%" h="24" bg="#f1f5f9" rounded={true} />
                  <SkeletonLine w="100%" h="8" bg="#f1f5f9" rounded={true} className="mt-2" />
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <div className="flex justify-between">
                <SkeletonLine w="55%" h="8" bg="#e2e8f0" />
                <SkeletonLine w="35%" h="8" bg="#bfdbfe" className="font-bold" />
              </div>
            </div>
          </div>
        );
      case "editorial":
        return (
          <div className="h-[140px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="h-5 w-full border-b border-slate-200 px-2 pt-1">
              <span className="text-[7px] font-bold italic uppercase tracking-widest text-slate-400">Tax invoice</span>
            </div>
            <div className="flex-1 p-3 space-y-2">
              <div className="h-4 w-[40%] rounded bg-slate-100" />
              <div className="h-[2px] w-[20%] rounded bg-slate-200 mt-1" />
              <div className="h-3 w-[90%] rounded bg-slate-200 mt-2" />
              <div className="h-9 border border-slate-200 rounded flex items-center justify-center">
                <span className="text-[7px] text-slate-400">items table</span>
              </div>
              <div className="h-7 border border-slate-200 rounded mt-2 flex items-end justify-end pr-1">
                <span className="text-[7px] font-bold text-slate-900">Total</span>
              </div>
            </div>
          </div>
        );
      case "split":
        return (
          <div className="h-[140px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="h-full grid grid-cols-2 gap-0">
              <div className={`border-r border-slate-200 p-2 ${accent}10`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-3.5 h-3.5 rounded-lg" style={{ backgroundColor: accent }} />
                  <span className="text-[7px] font-bold" style={{ color: accent }}>THE FIRM</span>
                </div>
                <SkeletonLine w="100%" h="6" bg="#f1f5f9" rounded={true} />
                <SkeletonLine w="50%" h="5" bg="#f1f5f9" rounded={true} className="mt-1" />
              </div>
              <div className="p-2 space-y-1">
                <span className="text-[7px] font-bold uppercase text-slate-400">INV-001</span>
                <div className="h-3 w-[50%] rounded bg-slate-200 mt-1" />
                <div className="mt-2 h-5 w-[60%] rounded bg-slate-100" />
                <div className="mt-1 h-3 w-[40%] rounded bg-slate-200" />
              </div>
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <div className="flex justify-between">
                <SkeletonLine w="60%" h="8" bg="#e2e8f0" />
                <SkeletonLine w="30%" h="8" bg="#bfdbfe" className="font-bold" />
              </div>
            </div>
          </div>
        );
      case "grid":
        return (
          <div className="h-[140px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="h-7 w-full border-b border-slate-200 px-2 pt-1">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-3">
                  <SkeletonLine w="40%" h="8" bg="#f3f4f6" />
                  <SkeletonLine w="100%" h="6" bg="#f3f4f6" rounded={true} className="mt-1" />
                </div>
                <div className="col-span-1 text-right">
                  <SkeletonLine w="80%" h="8" bg="#e5e7eb" />
                  <SkeletonLine w="100%" h="6" bg="#e5e7eb" rounded={true} className="mt-1" />
                </div>
              </div>
            </div>
            <div className="flex-1 p-2">
              <SkeletonLine w="100%" h="6" bg="#f3f4f6" rounded={true} className="mt-1" />
              <SkeletonLine w="50%" h="5" bg="#f3f4f6" rounded={true} className="mt-1" />
            </div>
            <div className="border-t border-slate-900 px-2 py-1">
              <div className="flex justify-between">
                <SkeletonLine w="50%" h="8" bg="#d1d5db" />
                <SkeletonLine w="30%" h="8" bg="#374151" className="font-bold" />
              </div>
            </div>
          </div>
        );
      case "band":
      default:
        return (
          <div className="h-[140px] w-full overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className={`h-7 w-full flex items-center justify-center border-b border-slate-200 px-2 text-white`} style={{ backgroundColor: accent }}>
              <span className="text-[7px] font-bold uppercase">TAX INVOICE</span>
            </div>
            <div className="h-3 w-full border-b border-slate-100 px-2 pt-1">
              <SkeletonLine w="100%" h="8" bg="#f8fafc" />
            </div>
            <div className="flex-1 p-2 space-y-1">
              <div className="flex gap-2">
                <div className="flex-1">
                  <SkeletonLine w="100%" h="8" bg="#f1f5f9" rounded={true} />
                  <SkeletonLine w="60%" h="6" bg="#f1f5f9" rounded={true} className="mt-1" />
                </div>
                <div className="w-[35%]">
                  <SkeletonLine w="100%" h="24" bg="#f1f5f9" rounded={true} />
                  <SkeletonLine w="100%" h="8" bg="#f1f5f9" rounded={true} className="mt-2" />
                </div>
              </div>
            </div>
            <div className="border-t border-slate-100 px-2 py-1">
              <div className="flex justify-between">
                <SkeletonLine w="55%" h="8" bg="#e2e8f0" />
                <SkeletonLine w="35%" h="8" bg="#dbeafe" className="font-bold" />
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className={`
        relative cursor-pointer rounded-xl border-2 p-[4px] transition-all
        ${isSelected ? "border-slate-900 ring-2 ring-slate-900/20" : "border-slate-200 hover:border-slate-300"}
      `}
    >
      <div>{renderThumbnail()}</div>

      {isSelected && (
        <div className="absolute top-1 right-1 rounded-full bg-slate-900 p-0.5">
          <Icon name="check-circle" className="h-3 w-3 text-white" />
        </div>
      )}
      {isPremium && (
        <div className="absolute top-1 left-1 rounded-xs bg-amber-400 px-1.5 py-0.25 text-[7px] font-bold uppercase text-amber-950">
          Premium
        </div>
      )}
    </div>
  );
};

export function InvoiceTemplateSelector({
  value,
  onChange,
  premiumOnly = false,
  scrollX = false,
  invoice,
}: InvoiceTemplateSelectorProps) {
  const templates = premiumOnly
    ? INVOICE_TEMPLATES.filter((t) => t.category === "Premium")
    : INVOICE_TEMPLATES;

  const grouped = templates.reduce(
    (acc, template) => {
      const key = template.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    },
    {} as Record<string, InvoiceTemplateMeta[]>,
  );

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplate>("modern");

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {category}
          </h4>
          {scrollX ? (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {items.map((template) => (
                <div key={template.id} className="shrink-0 w-[220px]">
                  <input
                    type="radio"
                    id={`template-${template.id}`}
                    name="invoiceTemplate"
                    value={template.id}
                    checked={value === template.id}
                    onChange={() => {
                      onChange(template.id as InvoiceTemplate);
                      setPreviewTemplate(template.id as InvoiceTemplate);
                    }}
                    className="sr-only"
                    readOnly={false}
                  />
                  <label
                    htmlFor={`template-${template.id}`}
                    className="block cursor-pointer group"
                    onClick={() => setPreviewOpen(true)}
                  >
                    <TemplateThumbnail template={template} isSelected={value === template.id} />
                    <div className="mt-1">
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((template) => (
                <div key={template.id}>
                  <input
                    type="radio"
                    id={`template-${template.id}`}
                    name="invoiceTemplate"
                    value={template.id}
                    checked={value === template.id}
                    onChange={() => onChange(template.id as InvoiceTemplate)}
                    className="sr-only"
                    readOnly={false}
                  />
                  <label htmlFor={`template-${template.id}`} className="block cursor-pointer">
                    <TemplateThumbnail template={template} isSelected={value === template.id} />
                    <div className="mt-2">
                      <p className="text-sm font-medium text-slate-900">{template.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{template.description}</p>
                    </div>
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Preview Modal */}
      {previewOpen && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="relative w-full max-w-[210mm] bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              aria-label="Close preview"
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Preview: {previewTemplate}
              </p>
              <InvoiceSheet invoice={invoice} template={previewTemplate} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
