"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { Button, Card, Input, PageHeader, Modal } from "@/components/ui";
import { FormActions, TextField } from "@/components/form";
import { cn } from "@/lib/format";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://127.0.0.1:8000/mcp";

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

type WaStatus = "idle" | "checking" | "connected" | "disconnected" | "qr";

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  // ── WhatsApp state ──
  const [waOpen, setWaOpen] = useState(false);
  const [waStatus, setWaStatus] = useState<WaStatus>("idle");
  const [waKey, setWaKey] = useState(0);
  const [qrData, setQrData] = useState<WhatsAppQR | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairPhone, setPairPhone] = useState("");

  const {
    data: status,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery<WhatsAppStatus>({
    queryKey: ["whatsapp", "status"],
    queryFn: () => api.get<WhatsAppStatus>("/whatsapp/status"),
    retry: 2,
  });

  const generateQRMutation = useMutation({
    mutationFn: () => api.get<WhatsAppQR>("/whatsapp/qr"),
    onSuccess: (data) => {
      setQrData(data);
      if (data.connected) {
        setWaStatus("connected");
        setWaOpen(false);
      } else if (data.qr_code) {
        setWaStatus("qr");
        setWaKey((k) => k + 1);
      } else {
        setWaStatus("disconnected");
      }
    },
    onError: (err: any) => {
      setPairError(err?.response?.data?.message || err?.message || "Failed to generate QR code");
      setWaStatus("disconnected");
    },
  });

  // Open modal: generate QR only if we don't already have one
  useEffect(() => {
    if (waOpen) {
      setPairError(null);
      if (qrData?.qr_code) {
        setWaStatus("qr");
      } else {
        setWaStatus("checking");
        void generateQRMutation.mutate();
      }
    }
  }, [waOpen, generateQRMutation, qrData?.qr_code]);

  // Poll status while QR is shown (detect scan)
  useEffect(() => {
    if (waStatus === "qr") {
      const interval = setInterval(() => {
        void refetchStatus();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [waStatus, refetchStatus]);

  // Auto-detect when QR is scanned (connection becomes open)
  useEffect(() => {
    if (status?.connected && waStatus === "qr") {
      setWaStatus("connected");
      setWaOpen(false);
      setQrData(null);
    }
  }, [status?.connected]);

  const resetMutation = useMutation({
    mutationFn: () => api.post("/whatsapp/reset"),
    onSuccess: () => {
      setPairError(null);
      setQrData(null);
      setWaStatus("disconnected");
      setWaOpen(false);
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
    onError: (err: any) => {
      setPairError(err?.response?.data?.message || err?.message || "Reset failed");
    },
  });

  const pairMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      api.post("/whatsapp/pair", { phone_number: phoneNumber }),
    onSuccess: () => {
      setPairError(null);
      setPairPhone("");
      setWaStatus("checking");
      queryClient.invalidateQueries({ queryKey: ["whatsapp", "status"] });
    },
    onError: (err: any) => {
      setPairError(err?.response?.data?.message || err?.message || "Pairing failed");
    },
  });

  const isConnected = status?.connected === true;
  const configured = status?.configured === true;

  const handlePair = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const phone = formData.get("phone") as string;
    if (!phone) return;
    pairMutation.mutate(phone);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Firm-wide configuration and integrations." />

      {/* ── Appearance ── */}
      <section
        className={cn(
          "overflow-hidden rounded-xl shadow-sm",
          "border border-color",
          "bg-surface",
        )
      }
      >
        <div className={cn(
          "flex items-center gap-3 border-b px-5 py-4",
          "border-border-light",
        )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:ring-sky-900">
            <Icon name="settings" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Appearance</h2>
            <p className="text-xs text-text-secondary">
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
      <section
        className={cn(
          "overflow-hidden rounded-xl shadow-sm",
          "border border-color",
          "bg-surface",
        )
      }
      >
        <div className={cn(
          "flex items-center gap-3 border-b px-5 py-4",
          "border-border-light",
        )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-900/20 dark:text-sky-400 dark:ring-sky-900">
            <Icon name="integrations" className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">MCP connection</h2>
            <p className="text-xs text-text-secondary">
              Connect Claude, Cursor or other MCP clients to this firm&apos;s data.
            </p>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block text-xs font-medium uppercase tracking-wide text-text-secondary">
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
          <p className="text-xs text-text-secondary">
            Set <code className={cn("rounded", "bg-surface-2", "dark:bg-surface-3", "px-1 py-0.5")}>NEXT_PUBLIC_MCP_URL</code> to
            override (e.g. your Cloudflare tunnel URL).
          </p>
        </div>
      </section>

      {/* ── WhatsApp Connection ── */}
      <Card>
        <div className="flex items-start justify-between gap-4 p-5">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-text-primary">WhatsApp</h3>
            <p className="text-sm text-text-secondary mt-1 leading-relaxed">
              Send invoices directly to your party&apos;s WhatsApp from the invoice list or detail view.
              Scan a QR code to connect your business WhatsApp number.
            </p>
          </div>
          {isConnected && (
            <button
              onClick={() => resetMutation.mutate()}
              title="Disconnect WhatsApp and reset auth"
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-600/[0.08] transition-colors dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Disconnect
            </button>
          )}
        </div>

        {isConnected && (
          <div className={cn(
            "mt-4 p-3 rounded-lg border px-4 py-3",
            "bg-emerald-50 border-emerald-200",
            "dark:bg-emerald-950/40 dark:border-emerald-800",
          )}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-400">WhatsApp Connected</span>
            </div>
          </div>
        )}

        {!configured && (
          <div className={cn(
            "mt-4 p-3 rounded-lg border px-4 py-3",
            "bg-rose-50 border-rose-200",
            "dark:bg-rose-950/40 dark:border-rose-800",
          )}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="text-sm font-medium text-rose-800 dark:text-rose-400">WhatsApp not configured</span>
            </div>
          </div>
        )}

        {!isConnected && configured && (
          <button
            onClick={() => {
              setWaOpen(true);
            }}
            className="mt-4 text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
          >
            Connect WhatsApp
          </button>
        )}
      </Card>

      {/* ── WhatsApp Connect Modal ── */}
      <Modal open={waOpen} onClose={() => setWaOpen(false)} title="Connect WhatsApp" size="md">
        <div className="p-4 space-y-4">
          {waStatus === "checking" && (
            <div className="text-center py-4">
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-text-secondary">Checking WhatsApp connection…</p>
            </div>
          )}

          {waStatus === "connected" && (
            <div className="text-center py-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3 dark:bg-emerald-900/30">
                <Icon name="check-circle" className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-text-primary">WhatsApp Connected</p>
              <p className="text-xs text-text-secondary mt-1">You can now send invoices via WhatsApp</p>
              <button
                onClick={() => setWaOpen(false)}
                className="mt-4 text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {waStatus === "qr" && (
            <div className="text-center">
              <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-3">
                Scan QR Code
              </p>
              <div className="relative inline-block">
                <img
                  key={waKey}
                  src={qrData?.qr_code || ""}
                  alt="WhatsApp QR code"
                  className={cn(
                    "w-48 h-48 mx-auto rounded-lg shadow-sm",
                    "border border-color bg-surface",
                    "dark:border-border-light",
                  )}
                  onError={() => {
                    setTimeout(() => {
                      setWaStatus("checking");
                      void refetchStatus();
                    }, 1000);
                  }}
                />
                <div className="absolute inset-0 bg-black/10 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Icon name="qrcode" className="h-10 w-10 text-white" />
                </div>
              </div>
              <p className="text-xs text-text-secondary mt-3">
                Open WhatsApp on your phone and scan the QR code
              </p>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => {
                    setWaStatus("checking");
                    void generateQRMutation.mutate();
                  }}
                  className={cn(
                    "flex-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors disabled:opacity-50",
                    "text-text-secondary bg-surface border-border hover:bg-surface-2 dark:text-text-secondary dark:bg-surface-2 dark:border-border-light dark:hover:bg-surface-3",
                  )}
                  disabled={generateQRMutation.isPending}
                >
                  Refresh QR
                </button>
                <button
                  onClick={() => {
                    setWaStatus("checking");
                    void resetMutation.mutate();
                  }}
                  className={cn(
                    "flex-1 text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors disabled:opacity-50",
                    "text-text-secondary bg-surface border-border hover:bg-surface-2 dark:text-text-secondary dark:bg-surface-2 dark:border-border-light dark:hover:bg-surface-3",
                  )}
                  disabled={resetMutation.isPending}
                >
                  Reset QR
                </button>
              </div>
              {pairError && <p className="px-2 text-xs text-rose-600 mt-3">{pairError}</p>}
            </div>
          )}

          {waStatus === "disconnected" && (
            <div className="text-center py-4">
              <p className="text-xs text-text-secondary mb-3">Not connected to WhatsApp</p>
              <button
                onClick={() => {
                  setWaStatus("checking");
                  void generateQRMutation.mutate();
                }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
              >
                Try Connecting
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Pairing code form (inline, below card) ── */}
      {qrData?.pairing_code && waOpen && (
        <div className={cn(
          "mt-4 px-5 py-3 border-t",
          "border-border-light",
        )}
        >
          <form onSubmit={handlePair} className="flex gap-2">
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
    <label className={cn(
      "flex items-start gap-3 rounded-lg px-3 py-2",
      "border border-color",
      "bg-surface",
      "has-[:checked]:border-sky-600 has-[:checked]:ring-2 has-[:checked]:ring-sky-200/50",
      "dark:border-border-light dark:bg-surface-2",
    )}
  >
    <input
      type="radio"
      name="theme"
      value={value}
      checked={selected}
      onChange={() => set(value)}
      className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-sky-600"
    />
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      <p className="text-xs text-text-secondary">{description}</p>
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
      <legend className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}
