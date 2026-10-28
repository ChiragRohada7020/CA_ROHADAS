"use client";

import { ServiceCombobox, type ServiceOption } from "@/components/ServiceCombobox";
import { Icon } from "@/components/Icon";
import { formatMoney } from "@/lib/format";
import type { InvoiceLineInput } from "@/lib/types";

export interface DraftLine extends InvoiceLineInput {
  key: string;
}

export function blankLine(): DraftLine {
  return {
    key: Math.random().toString(36).slice(2, 10),
    description: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    is_taxable: true,
    sac_code: null,
    service_id: null,
    task_id: null,
  };
}

export interface LineItemTableProps {
  lines: DraftLine[];
  taxRate: number;
  onUpdate: (key: string, patch: Partial<DraftLine>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
  showTaxColumn?: boolean;
  clientServices?: ServiceOption[];
  clientServicesLoading?: boolean;
}

export function lineAmount(line: DraftLine): number {
  const qty = Number(line.quantity ?? 1);
  const rate = Number(line.unit_price ?? 0);
  const disc = Number(line.discount ?? 0);
  return qty * rate - disc;
}

export function lineSubtotal(lines: DraftLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

// Column widths mirror hisaabo's invoice editor grid.
const COLUMNS = "1fr 170px 70px 86px 56px 56px 82px 28px";

export function InvoiceLineTable({
  lines,
  taxRate,
  onUpdate,
  onAdd,
  onRemove,
  showTaxColumn = true,
  clientServices = [],
  clientServicesLoading = false,
}: LineItemTableProps) {
  const usable = lines.filter((line) => line.description.trim().length > 0);

  function handleServiceSelect(key: string, service: ServiceOption | null) {
    if (!service) return;
    onUpdate(key, {
      description: service.name,
      sac_code: service.sac_code,
      unit_price: service.standard_fee ?? 0,
      service_id: service.id,
    });
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div
        className="grid gap-2 px-3 py-2 text-[10px] font-medium"
        style={{
          gridTemplateColumns: COLUMNS,
          background: "var(--h-dark-surface-1)",
          color: "var(--h-dark-text-tertiary)",
        }}
      >
        <span>Service</span>
        <span>Description</span>
        <span className="text-right">SAC / HSN</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Discount</span>
        {showTaxColumn && <span className="text-right">Tax %</span>}
        <span className="text-right">Amount</span>
        <span />
      </div>

      {/* Line item rows */}
      <div className="divide-y" style={{ borderColor: "var(--h-dark-border-light)" }}>
        {lines.map((line, index) => {
          const amount = lineAmount(line);
          const showRemove = lines.length > 1;
          const isRowEmpty = !line.description.trim();

          return (
            <div
              key={line.key}
              className={`grid gap-2 px-3 py-2 items-center rounded-lg transition-colors duration-100 ${
                isRowEmpty ? "bg-[var(--h-dark-surface-1)]/50" : "hover:bg-[var(--h-dark-surface-2)]"
              }`}
              style={{
                gridTemplateColumns: COLUMNS,
                border: `1px solid var(--h-dark-border-color)`,
              }}
            >
              {/* Row number */}
              <div className="text-[10px] tabular text-[var(--h-dark-text-tertiary)]">
                {index + 1}
              </div>

              {/* Service selector */}
              <div>
                <ServiceCombobox
                  value={line.service_id ?? ""}
                  onChange={(s) => handleServiceSelect(line.key, s)}
                  clientServices={clientServices}
                  loading={clientServicesLoading}
                  placeholder="Search services…"
                />
              </div>

              {/* Description */}
              <div>
                <input
                  className="w-full px-2 py-1.5 rounded text-[10px] outline-none"
                  placeholder="Describe the service…"
                  maxLength={300}
                  value={line.description}
                  onChange={(e) => onUpdate(line.key, { description: e.target.value })}
                  style={{
                    background: "var(--h-dark-surface-1)",
                    border: "1px solid var(--h-dark-border-color)",
                    color: "var(--h-dark-text-primary)",
                  }}
                />
              </div>

              {/* SAC / HSN */}
              <div>
                <input
                  className="w-full px-2 py-1.5 rounded text-center font-mono text-[10px] outline-none"
                  placeholder="9982"
                  maxLength={10}
                  value={line.sac_code ?? ""}
                  onChange={(e) => onUpdate(line.key, { sac_code: e.target.value || null })}
                  style={{
                    background: "var(--h-dark-surface-1)",
                    border: "1px solid var(--h-dark-border-color)",
                    color: "var(--h-dark-text-primary)",
                  }}
                />
              </div>

              {/* Qty */}
              <div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full px-2 py-1.5 rounded text-right tabular-nums text-[10px] outline-none"
                  value={String(line.quantity ?? 1)}
                  onChange={(e) => onUpdate(line.key, { quantity: Number(e.target.value) })}
                  style={{
                    background: "var(--h-dark-surface-1)",
                    border: "1px solid var(--h-dark-border-color)",
                    color: "var(--h-dark-text-primary)",
                  }}
                />
              </div>

              {/* Rate */}
              <div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full px-2 py-1.5 rounded text-right tabular-nums text-[10px] outline-none"
                  value={String(line.unit_price ?? 0)}
                  onChange={(e) => onUpdate(line.key, { unit_price: Number(e.target.value) })}
                  style={{
                    background: "var(--h-dark-surface-1)",
                    border: "1px solid var(--h-dark-border-color)",
                    color: "var(--h-dark-text-primary)",
                  }}
                />
              </div>

              {/* Discount */}
              <div>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="w-full px-2 py-1.5 rounded text-right tabular-nums text-[10px] outline-none"
                  value={String(line.discount ?? 0)}
                  onChange={(e) => onUpdate(line.key, { discount: Number(e.target.value) })}
                  style={{
                    background: "var(--h-dark-surface-1)",
                    border: "1px solid var(--h-dark-border-color)",
                    color: "var(--h-dark-text-primary)",
                  }}
                />
              </div>

              {showTaxColumn && (
                <div className="text-right tabular-nums text-[10px] text-[var(--h-dark-text-tertiary)]">
                  {line.is_taxable ? `${taxRate}%` : "—"}
                </div>
              )}

              {/* Amount */}
              <div className="text-right tabular-nums text-sm font-semibold" style={{ color: "var(--h-dark-text-primary)" }}>
                {isRowEmpty ? "—" : formatMoney(amount)}
              </div>

              {/* Remove */}
              <div className="text-center">
                {showRemove && (
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-[var(--h-dark-surface-2)] text-[var(--h-brand-600)] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                    onClick={() => onRemove(line.key)}
                    aria-label="Remove line item"
                    disabled={!showRemove}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add row button */}
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--h-dark-border-color)] bg-[var(--h-dark-surface-0)] px-4 py-2 text-[10px] font-medium text-[var(--h-dark-text-secondary)] shadow-sm transition-all hover:border-[var(--h-brand-600)] hover:bg-[var(--h-dark-surface-2)] hover:text-[var(--h-brand-600)]"
        onClick={onAdd}
      >
        <Icon name="plus" className="h-4 w-4" />
        Add line item
      </button>
    </div>
  );
}
