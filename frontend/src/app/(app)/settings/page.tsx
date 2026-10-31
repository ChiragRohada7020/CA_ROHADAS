"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { Badge, Button, Input, PageHeader } from "@/components/ui";
import {
  CheckboxField,
  FormActions,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { cn } from "@/lib/format";
import { api, ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://127.0.0.1:8000/mcp";

interface ClientOption {
  id: string;
  name: string;
  phone?: string;
  whatsapp_number?: string;
}

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

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  // ── WhatsApp state ──
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);
  const [sendInvoiceError, setSendInvoiceError] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);

  const [sendMessagePhone, setSendMessagePhone] = useState("");
  const [sendMessageText, setSendMessageText] = useState("");
  const [pairPhone, setPairPhone] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceMessage, setInvoiceMessage] = useState("");

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

  const {
    data: qrData,
    isLoading: qrLoading,
    refetch: refetchQR,
  } = useQuery<WhatsAppQR>({
    queryKey: ["whatsapp", "qr"],
    queryFn: () => api.get<WhatsAppQR>("/api/whatsapp/qr"),
    refetchInterval: (status?.connected === false || !status) ? 3000 : false,
    retry: 2,
  });

  const {
    data: clientsData,
    isLoading: clientsLoading,
  } = useQuery<{ items: ClientOption[] }>({
    queryKey: ["clients", "list"],
    queryFn: () => api.get<{ items: ClientOption[] }>("/clients?limit=500"),
  });

  const clients = clientsData?.items || [];

  const pairMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      api.post("/api/whatsapp/pair", { phone_number: phoneNumber }),
    onSuccess: () => {
      setPairError(null);
      setPairPhone("");
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
      setSendMessagePhone("");
      setSendMessageText("");
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
      setInvoiceId("");
      setInvoiceMessage("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
    onError: (err: any) => {
      setSendInvoiceError(err?.response?.data?.message || err?.message || "Send failed");
    },
  });

  const isConnected = status?.connected === true;
  const isPairing = status?.status === "qr_ready" || status?.status === "pairing";
  const isConnecting = status?.status === "initializing" || status?.status === "connecting";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Firm-wide configuration and integrations." />

      {/* ── Appearance ── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100">
            <Icon name="settings" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Appearance</h2>
            <p className="text-xs text-slate-500">
              Choose how Rohadas CA looks in this browser.
            </p>
          </div>
        </div>
        <div className="px-5 py-4">
          <FieldSet legend="Theme">
            <ThemeOption value="light" label="Light" description="Always use light mode." current={theme} set={setTheme} />
            <ThemeOption value="dark" label="Dark" description="Always use dark mode." current={theme} set={setTheme} />
            <ThemeOption value="system" label="System" description="Follow your device setting." current={theme} set={setTheme} />
          </FieldSet>
        </div>
      </section>

      {/* ── MCP connection ── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100">
            <Icon name="integrations" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">MCP connection</h2>
            <p className="text-xs text-slate-500">
              Connect Claude, Cursor or other MCP clients to this firm&apos;s data.
            </p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
            Endpoint URL
          </label>
          <div className="flex gap-2">
            <Input className="flex-1 font-mono" readOnly value={MCP_URL} />
            <Button
              type="button"
              className={cn(copied ? "bg-emerald-600 hover:bg-emerald-700" : "")}
              onClick={() => {
                navigator.clipboard.writeText(MCP_URL);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Icon name={copied ? "check-circle" : "settings"} className="h-4 w-4" />
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Set <code className="rounded bg-slate-100 px-1 py-0.5">NEXT_PUBLIC_MCP_URL</code> to
            override (e.g. your Cloudflare tunnel URL).
          </p>
        </div>
      </section>

      {/* ── WhatsApp Connection ── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-600 ring-1 ring-inset ring-green-100">
            <Icon name="communications" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">WhatsApp Connection</h2>
            <p className="text-xs text-slate-500">
              Connect WhatsApp for sending invoices and communications.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Status */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name="clock" className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Connection Status</p>
                {status && (
                  <p className="text-xs text-slate-500 mt-1">
                    {status.configured ? "✓ Configured" : "✗ Not configured"} | Provider: {status.provider}
                  </p>
                )}
              </div>
            </div>
            <Badge
              tone={
                isConnected ? "success" : isConnecting ? "info" : isPairing ? "warning" : "danger"
              }
            >
              {isConnected ? "Connected" : isConnecting ? "Connecting…" : isPairing ? "QR required" : "Disconnected"}
            </Badge>
          </div>

          {status?.connection_info && (
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600 px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Icon name="clock" className="h-3 w-3" />
                <span className="font-medium">{status.connection_info.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="clock" className="h-3 w-3" />
                <span className="font-medium">{status.connection_info.last_disconnect || "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="clock" className="h-3 w-3" />
                <span className="font-medium">{status.connection_info.reconnect_count}</span>
              </div>
            </div>
          )}

          {/* QR Pairing */}
          {!isConnected && !isConnecting && !isPairing && (
            <div className="px-6 py-3">
              <button
                type="button"
                className="w-full btn btn-ghost px-4 py-2"
                onClick={() => refetchQR()}
              >
                <Icon name="clock" className="h-3 w-3 mr-2" />
                Generate QR Code
              </button>
            </div>
          )}

          {qrData && qrData.qr_code && (
            <div className="px-6 py-4 border-t border-slate-100">
              <div className="flex flex-col items-center gap-3">
                <div className="relative group">
                  <img
                    src={qrData.qr_code}
                    alt="WhatsApp QR code"
                    className="w-48 h-48 rounded-lg border border-slate-200 bg-white shadow-sm"
                  />
                  <div className="absolute inset-0 bg-black/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="qrcode" className="h-10 w-10 text-white" />
                  </div>
                </div>
                <p className="text-sm text-slate-500 text-center">
                  {qrData.instructions || "Scan this QR code with WhatsApp > Linked devices > Link a device"}
                </p>
                {qrData.pairing_code && (
                  <div className="px-3 py-1 rounded-md bg-slate-100 text-xs text-slate-600 font-mono">
                    Pairing code: {qrData.pairing_code}
                  </div>
                )}
              </div>
              {pairError && <p className="px-2 text-xs text-rose-600">{pairError}</p>}
            </div>
          )}

          {/* Pairing code form */}
          {qrData?.pairing_code && (
            <div className="px-6 py-3 border-t border-slate-100">
              <form onSubmit={(e) => {
                e.preventDefault();
                pairMutation.mutate(pairPhone);
              }} className="flex gap-2">
                <TextField
                  label="Pairing code"
                  value={pairPhone}
                  onChange={setPairPhone}
                  placeholder="Enter code from phone"
                />
                <FormActions submitLabel="Pair" />
              </form>
              {pairError && <p className="px-2 text-xs text-rose-600">{pairError}</p>}
            </div>
          )}

          {/* Send Message */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 px-2">
              Send Message
            </h4>
            <form onSubmit={(e) => {
              e.preventDefault();
              sendMessageMutation.mutate({ phone_number: sendMessagePhone, message: sendMessageText });
            }} className="grid grid-cols-1 gap-3 sm:grid-cols-3 px-2">
              <TextField
                label="Phone number"
                value={sendMessagePhone}
                onChange={setSendMessagePhone}
                placeholder="+91 98765 43210"
                hint="Include country code"
                required
              />
              <TextAreaField
                label="Message"
                value={sendMessageText}
                onChange={setSendMessageText}
                rows={3}
                placeholder="Hello, this is your CA firm…"
              />
              <div className="col-span-full flex items-end">
                <FormActions submitLabel="Send message" busy={sendMessageMutation.isPending} />
              </div>
            </form>
            {sendMessageError && <p className="px-2 text-xs text-rose-600">{sendMessageError}</p>}
          </div>

          {/* Send Invoice */}
          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 px-2">
              Send Invoice
            </h4>
            <form onSubmit={(e) => {
              e.preventDefault();
              sendInvoiceMutation.mutate({ invoice_id: invoiceId, message: invoiceMessage || undefined });
            }} className="grid grid-cols-1 gap-3 sm:grid-cols-3 px-2">
              <SelectField
                label="Client"
                value={invoiceId}
                onChange={setInvoiceId}
                placeholder="Select client…"
                required
                options={clients.map((c) => ({
                  value: c.id,
                  label: c.name + (c.whatsapp_number ? ` (${c.whatsapp_number})` : ""),
                }))}
              />
              <TextAreaField
                label="Message (optional)"
                value={invoiceMessage}
                onChange={setInvoiceMessage}
                rows={2}
                placeholder="Here is your invoice PDF…"
              />
              <div className="col-span-full flex items-end">
                <FormActions submitLabel="Send invoice" busy={sendInvoiceMutation.isPending} />
              </div>
            </form>
            {sendInvoiceError && <p className="px-2 text-xs text-rose-600">{sendInvoiceError}</p>}
            {clients.length === 0 && (
              <p className="px-2 pt-2 text-xs text-slate-500">
                No clients found. Add a client first to send invoices via WhatsApp.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

/** A labelled radio option for the theme selector. */
function ThemeOption({
  value,
  label,
  description,
  current,
  set,
}: {
  value: "light" | "dark" | "system";
  label: string;
  description: string;
  current: "light" | "dark" | "system";
  set: (v: "light" | "dark" | "system") => void;
}) {
  const selected = current === value;
  return (
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 has-[:checked]:border-sky-600 has-[:checked]:ring-2 has-[:checked]:ring-sky-200/50">
      <input
        type="radio"
        name="theme"
        value={value}
        checked={selected}
        onChange={() => set(value)}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-sky-600"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </label>
  );
}

/** A simple fieldset wrapper with label, matching the settings style. */
function FieldSet({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
