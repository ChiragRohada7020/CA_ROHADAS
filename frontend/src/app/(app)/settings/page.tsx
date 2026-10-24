"use client";

import { useState, useEffect } from "react";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/format";

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || "http://127.0.0.1:8000/mcp";

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Firm-wide configuration and integrations.
        </p>
      </div>

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
            <input
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
              readOnly
              value={MCP_URL}
            />
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition",
                copied ? "bg-emerald-600" : "bg-sky-600 hover:bg-sky-700",
              )}
              onClick={() => {
                navigator.clipboard.writeText(MCP_URL);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Icon name={copied ? "check-circle" : "settings"} className="h-4 w-4" />
              {copied ? "Copied" : "Copy link"}
            </button>
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


function WhatsAppConnection() {
  const [qrData, setQrData] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
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
          className="btn-ghost"
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              {qrData.instructions}
            </div>
          )}
          <div className="text-xs text-slate-600 space-y-1">
            <p><strong>Instructions:</strong> {qrData.instructions}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-slate-700">Connection Details</summary>
              <pre className="mt-2 p-2 bg-slate-50 rounded text-[10px] overflow-auto">
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
