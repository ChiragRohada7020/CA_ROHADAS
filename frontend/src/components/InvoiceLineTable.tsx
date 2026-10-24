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

function lineAmount(line: DraftLine): number {
  const qty = Number(line.quantity ?? 1);
  const rate = Number(line.unit_price ?? 0);
  const disc = Number(line.discount ?? 0);
  return qty * rate - disc;
}

export function lineSubtotal(lines: DraftLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

/**
 * Editable line-item table with service autocomplete.
 *
 * Columns: #, Service, Description, SAC/HSN, Qty, Rate, Discount, Tax Rate, Amount, Actions.
 * Selecting a service auto-fills the description, SAC code, rate, and service_id.
 */
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
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="invoice-table w-full min-w-[72rem]">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-50">
              <th className="th w-8">#</th>
              <th className="th w-36">Service</th>
              <th className="th">Description</th>
              <th className="th w-20">SAC / HSN</th>
              <th className="th w-14 text-right">Qty</th>
              <th className="th w-20 text-right">Rate</th>
              <th className="th w-18 text-right">Discount</th>
              {showTaxColumn && <th className="th w-16 text-right">Tax Rate</th>}
              <th className="th w-20 text-right">Amount</th>
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => {
              const amount = lineAmount(line);
              const showRemove = lines.length > 1;
              const isRowEmpty = !line.description.trim();

              return (
                <tr key={line.key} className={isRowEmpty ? "bg-slate-50" : ""}>
                  <td className="td py-3 text-xs text-slate-400 tabular">{index + 1}</td>

                  <td className="td py-3">
                    <ServiceCombobox
                      value={line.service_id ?? ""}
                      onChange={(s) => handleServiceSelect(line.key, s)}
                      clientServices={clientServices}
                      loading={clientServicesLoading}
                      placeholder="Search services…"
                    />
                  </td>

                  <td className="td py-3">
                    <input
                      className="input py-2 text-sm"
                      placeholder="Service description…"
                      maxLength={300}
                      value={line.description}
                      onChange={(e) => onUpdate(line.key, { description: e.target.value })}
                    />
                  </td>

                  <td className="td py-3">
                    <input
                      className="input py-2 text-xs font-mono"
                      placeholder="9982"
                      maxLength={10}
                      value={line.sac_code ?? ""}
                      onChange={(e) =>
                        onUpdate(line.key, { sac_code: e.target.value || null })
                      }
                    />
                  </td>

                  <td className="td py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="input py-2 text-right tabular text-sm"
                      value={String(line.quantity ?? 1)}
                      onChange={(e) => onUpdate(line.key, { quantity: Number(e.target.value) })}
                    />
                  </td>

                  <td className="td py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="input py-2 text-right tabular text-sm"
                      value={String(line.unit_price ?? 0)}
                      onChange={(e) => onUpdate(line.key, { unit_price: Number(e.target.value) })}
                    />
                  </td>

                  <td className="td py-3">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="input py-2 text-right tabular text-sm"
                      value={String(line.discount ?? 0)}
                      onChange={(e) => onUpdate(line.key, { discount: Number(e.target.value) })}
                    />
                  </td>

                  {showTaxColumn && (
                    <td className="td py-3 text-right tabular text-sm text-slate-500">
                      {line.is_taxable ? `${taxRate}%` : "—"}
                    </td>
                  )}

                  <td className="td py-3 tabular text-right text-sm font-medium text-slate-800">
                    {isRowEmpty ? "—" : formatMoney(amount)}
                  </td>

                  <td className="td py-3">
                    {showRemove && (
                      <button
                        type="button"
                        className="rounded p-1 text-slate-400 opacity-0 transition-all duration-200 hover:opacity-100 hover:bg-slate-100 hover:text-rose-600 group-hover:opacity-100"
                        onClick={() => onRemove(line.key)}
                        aria-label="Remove line"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={showTaxColumn ? 9 : 8} className="td py-3">
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-800"
                  onClick={onAdd}
                >
                  <Icon name="plus" className="h-4 w-4" />
                  Add a line
                </button>
              </td>
              <td className="td py-3 tabular text-right text-sm font-semibold text-slate-900">
                {formatMoney(lineSubtotal(lines))}
              </td>
              <td className="td py-3" />
            </tr>
          </tfoot>
        </table>
      </div>

      {usable.length === 0 && (
        <p className="text-sm text-slate-500">
          Add a line to get started. Rows with no description are excluded from the invoice.
        </p>
      )}
    </div>
  );
}
