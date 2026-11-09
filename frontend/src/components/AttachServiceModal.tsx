"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button, Modal } from "@/components/ui";
import { FormError, SelectField, TextField } from "@/components/form";
import { api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import type { ClientServiceRow, Page, ServiceRow } from "@/lib/types";

interface AttachServiceModalProps {
  clientId: string;
  open: boolean;
  onClose: () => void;
  onAttached?: () => void;
}

export function AttachServiceModal({
  clientId,
  open,
  onClose,
  onAttached,
}: AttachServiceModalProps) {
  const queryClient = useQueryClient();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const services = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () =>
      api.get<Page<ServiceRow>>(`/services${buildQuery({ status: "active", limit: 100 })}`),
    enabled: open,
  });

  const attach = useMutation({
    mutationFn: async (serviceId: string) => {
      const payload: Record<string, unknown> = { service_id: serviceId };
      if (startDate) payload.start_date = startDate;
      if (endDate) payload.end_date = endDate;
      return api.post(`/clients/${clientId}/services`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      onAttached?.();
      onClose();
    },
  });

  if (!open) return null;

  if (services.isPending) {
    return (
      <Modal open={open} onClose={onClose} title="Attach Service" size="md">
        <div className="p-4 text-sm text-slate-500">Loading services…</div>
      </Modal>
    );
  }

  const items = services.data?.items ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Attach Service" size="lg">
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Start date"
            value={startDate}
            onChange={setStartDate}
            type="date"
          />
          <TextField
            label="End date"
            value={endDate}
            onChange={setEndDate}
            type="date"
            placeholder="Optional"
          />
        </div>

        <div className="max-h-[400px] overflow-y-auto border border-slate-200 rounded-lg p-3">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              No active services available. Create a service first.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((service) => (
                <li key={service.id} className="px-2 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors group">
                  <button
                    type="button"
                    className="w-full flex items-start justify-between gap-3 px-2 py-2 text-left text-sm"
                    onClick={() => attach.mutate(service.id)}
                    disabled={attach.isPending}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900 group-hover:text-sky-800">
                        {service.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 font-mono">
                        {service.code}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-slate-50 text-slate-700"
                        >
                          {humanise(service.category)}
                        </span>
                        {service.standard_fee != null && (
                          <span className="text-xs font-mono text-slate-600">
                            ₹{service.standard_fee.toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        attach.isPending ? "text-slate-400" : "text-sky-700",
                      )}
                    >
                      {attach.isPending ? "Attaching…" : "Attach"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={attach.isPending}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}
