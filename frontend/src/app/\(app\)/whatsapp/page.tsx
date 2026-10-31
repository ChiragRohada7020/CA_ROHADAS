"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";

import { Icon } from "@/components/Icon";
import { Badge, Button, Card, FormError, PageHeader } from "@/components/ui";
import {
  CheckboxField,
  FormActions,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { api, ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";

interface WhatsAppStatus {
  configured: boolean;
  provider: string;
  connected: boolean;
  status: string;
  connection_info: any;
}

interface WhatsAppQR {
  qr_code: string | null;
  pairing_code: string | null;
  instructions: string;
  provider: string;
  connected: boolean;
  connection_info: any;
}

interface ClientOption {
  id: string;
  name: string;
  phone?: string;
  whatsapp_number?: string;
}

export default function WhatsAppPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  // ── Status query (polled) ──
  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery<WhatsAppStatus>({
    queryKey: ["whatsapp", "status"],
    queryFn: () => api.get<WhatsAppStatus>("/api/whatsapp/status"),
    refetchInterval: 5000,
    retry: 2,
  });

  // ── QR query ──
  const {
    data: qrData,
    isLoading: qrLoading,
    refetch: refetchQR,
  } = useQuery<WhatsAppQR>({
    queryKey: ["whatsapp", "qr"],
    queryFn: () => api.get<WhatsAppQR>("/api/whatsapp/qr"),
    refetchInterval: statusLoading || (status?.connected === false ? 3000 : 0),
    retry: 2,
  });

  // ── Clients query (for invoice sending) ──
  const {
    data: clientsData,
    isLoading: clientsLoading,
  } = useQuery<{ items: ClientOption[] }>({
    queryKey: ["clients", "list"],
    queryFn: () => api.get<{ items: ClientOption[] }>("/clients?limit=500"),
    enabled: !!session?.data,
  });

  const clients = clientsData?.items || [];

  // ── Mutations ──
  const pairMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      api.post("/api/whatsapp/pair", { phone_number: phoneNumber }),
    onSuccess: () => {
      setPairError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "qr"] });
    },
    onError: (err: any) => {
      setPairError(err?.response?.data?.message || err?.message || "Pairing failed");
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({ phone_number, message }: { phone_number: string; message: string }) =>
      api.post("/api/whatsapp/send-message", { phone_number, message }),
    onSuccess: () => {
      setSendMessageError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
    onError: (err: any) => {
      setSendMessageError(err?.response?.data?.message || err?.message || "Send failed");
    },
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: ({ invoice_id, message }: { invoice_id: string; message?: string }) =>
      api.post(`/api/whatsapp/send-invoice/${invoice_id}`, { message }),
    onSuccess: () => {
      setSendInvoiceError(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
    onError: (err: any) => {
      setSendInvoiceError(err?.response?.data?.message || err?.message || "Send failed");
    },
  });

  // ── Handlers ──
  const handlePair = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phone = formData.get("phone") as string;
    if (!phone) return;
    pairMutation.mutate(phone);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phone = formData.get("phone") as string;
    const message = formData.get("message") as string;
    if (!phone || !message) return;
    sendMessageMutation.mutate({ phone_number: phone, message });
  };

  const handleSendInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const invoice_id = formData.get("invoice_id") as string;
    const message = formData.get("message") as string || undefined;
    if (!invoice_id) return;
    sendInvoiceMutation.mutate({ invoice_id, message });
  };

  const isConnected = status?.connected === true;
  const isPairing = status?.status === "qr_ready" || status?.status === "pairing";
  const isConnecting = status?.status === "initializing" || status?.status === "connecting";

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp"
        subtitle="Send invoices and messages to clients via WhatsApp (Baileys gateway)."
      />

      {sendMessageError && <FormError error={sendMessageError} />}
      {sendInvoiceError && <FormError error={sendInvoiceError} />}
      {pairError && <FormError error={pairError} />}

      {/* ── Connection status card ── */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Connection status</h3>
            <p className="text-xs text-slate-500">
              Baileys WhatsApp gateway &bull; {status?.provider ?? "baileys"}
            </p>
          </div>
          <Badge
            tone={
              isConnected ? "success" : isConnecting ? "info" : isPairing ? "warning" : "danger"
            }
          >
            {isConnected ? "Connected" : isConnecting ? "Connecting…" : isPairing ? "QR required" : "Disconnected"}
          </Badge>
        </div>

        <div className="px-6 py-4">
          {status?.connection_info && (
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <Icon name="monitor" className="h-4 w-4" />
                <span>Status:</span> <span className="font-medium">{status.connection_info.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="clock" className="h-4 w-4" />
                <span>Last disconnect:</span>
                <span className="font-medium">
                  {status.connection_info.last_disconnect || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="refresh" className="h-4 w-4" />
                <span>Reconnects:</span> <span className="font-medium">{status.connection_info.reconnect_count}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="check-circle" className="h-4 w-4" />
                <span>Configured:</span>
                <span className="font-medium">{status.configured ? "Yes" : "No"}</span>
              </div>
            </div>
          )}

          {!isConnected && !isConnecting && !isPairing && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <Icon name="alert-circle" className="h-4 w-4" />
              <span>
                WhatsApp is not connected. Scan the QR code below with your phone's WhatsApp app
                to link the device.
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ── QR Code pairing card ── */}
      {!isConnected && (
        <Card>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Pair your phone</h3>
              <p className="text-xs text-slate-500">
                Scan the QR code with WhatsApp &gt; Linked devices &gt; Link a device
              </p>
            </div>
            <Button size="sm" onClick={() => refetchQR()}>
              <Icon name="refresh" className="h-3 w-3" /> Refresh
            </Button>
          </div>

          <div className="px-6 py-4 flex flex-col items-center gap-4">
            {qrLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" />
                <p className="text-sm text-slate-500">Generating QR code…</p>
              </div>
            ) : qrData?.qr_code ? (
              <>
                <div className="relative group">
                  <img
                    src={qrData.qr_code}
                    alt="WhatsApp QR code"
                    className="w-64 h-64 rounded-lg border border-slate-200 bg-white shadow-sm"
                  />
                  <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="scan" className="h-10 w-10 text-white" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 text-center">
                  {qrData.instructions || "Scan this QR code to link WhatsApp."}
                </p>
                {qrData.pairing_code && (
                  <div className="mt-2 px-3 py-1 rounded-md bg-slate-100 text-xs text-slate-600 font-mono">
                    Pairing code: {qrData.pairing_code}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500 text-sm">
                <Icon name="scan" className="h-6 w-6" />
                <p>No QR code available. Try refreshing.</p>
              </div>
            )}
          </div>

          {/* Pairing code manual entry */}
          {qrData?.pairing_code && (
            <div className="px-6 py-3 border-t border-slate-200">
              <form onSubmit={handlePair} className="flex gap-2">
                <TextField
                  label="Pairing code"
                  placeholder="Enter code from phone"
                  className="flex-1"
                />
                <FormActions submitLabel="Pair" />
              </form>
              {pairError && <p className="px-2 text-xs text-rose-600">{pairError}</p>}
            </div>
          )}
        </div>
      )}

      {/* ── Send message card ── */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Send message</h3>
            <p className="text-xs text-slate-500">Send a plain-text WhatsApp message to any number.</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <form onSubmit={handleSendMessage} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField
              label="Phone number"
              name="phone"
              placeholder="+91 98765 43210"
              hint="Include country code (e.g. +91)"
              required
            />
            <TextAreaField
              label="Message"
              name="message"
              rows={3}
              placeholder="Hello, this is your CA firm…"
              required
              className="sm:col-span-2"
            />
            <div className="col-span-full flex items-end">
              <FormActions submitLabel="Send message" busy={sendMessageMutation.isPending} />
            </div>
          </form>
        </div>
      </Card>

      {/* ── Send invoice card ── */}
      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Send invoice via WhatsApp</h3>
            <p className="text-xs text-slate-500">Generate and send an invoice PDF to a client.</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <form onSubmit={handleSendInvoice} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              label="Client / Invoice"
              name="invoice_id"
              placeholder="Select client…"
              required
              options={clients.map((c) => ({
                value: c.id,
                label: c.name + (c.whatsapp_number ? ` (${c.whatsapp_number})` : ""),
              }))}
            />
            <TextAreaField
              label="Message (optional)"
              name="message"
              rows={3}
              placeholder="Here is your invoice PDF…"
              className="sm:col-span-2"
            />
            <div className="col-span-full flex items-end">
              <FormActions submitLabel="Send invoice" busy={sendInvoiceMutation.isPending} />
            </div>
          </form>
          {clientsLoading && <p className="pt-2 text-xs text-slate-500">Loading clients…</p>}
          {clients.length === 0 && (
            <p className="pt-2 text-xs text-slate-500">
              No clients found. Add a client first to send invoices via WhatsApp.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
