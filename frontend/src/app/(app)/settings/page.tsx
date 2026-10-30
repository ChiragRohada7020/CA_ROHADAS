"use client";

import { useState, useEffect } from "react";

import { Icon } from "@/components/Icon";
import { Button, Input, PageHeader } from "@/components/ui";
import { cn } from "@/lib/format";
import { useTheme } from "@/lib/theme";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://127.0.0.1:8000/mcp";

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const { theme, setTheme } = useTheme();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Settings" subtitle="Firm-wide configuration and integrations." />

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
        <div className="space-y-3 px-5 py-4">
          <WhatsAppConnection />
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

function WhatsAppConnection() {
  const [qrData, setQrData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) {
        setStatus({ configured: false, provider: "none" });
        return;
      }
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchQr = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/qr");
      if (!res.ok) {
        setQrData({
          qr_code: null,
          instructions: "WhatsApp integration is not configured.",
        });
        return;
      }
      const data = await res.json();
      setQrData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">Connection Status</p>
          {status && (
            <p className="text-xs text-slate-500 mt-1">
              {status.configured ? "✓ Configured" : "✗ Not configured"} | Provider: {status.provider}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost px-5 py-2.5"
          onClick={fetchQr}
          disabled={loading}
        >
          {loading ? "Generating..." : "Generate QR Code"}
        </button>
      </div>
      {qrData && (
        <div className="space-y-3">
          {qrData.qr_code ? (
            <img src={qrData.qr_code} alt="WhatsApp QR Code" className="w-48 h-48 border border-slate-200 rounded" />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-[#f7f6f3] p-3 text-sm text-slate-700">
              {qrData.instructions}
            </div>
          )}
          <div className="text-xs text-slate-600 space-y-1">
            <p><strong>Instructions:</strong> {qrData.instructions}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-700">Connection Details</summary>
              <pre className="mt-2 p-2 bg-[#f7f6f3] rounded text-[10px] overflow-auto">
                {JSON.stringify(qrData.connection_info, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
      <div className="text-xs text-slate-500">
        <p>To connect WhatsApp, configure the provider in your backend environment (.env file).</p>
      </div>
    </div>
  );
}
