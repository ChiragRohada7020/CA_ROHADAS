"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { Badge, EmptyState, ErrorState, LoadingState, Select } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { cn, formatBytes, formatDate, formatDateTime, humanise } from "@/lib/format";
import { hasPermission, useSession } from "@/lib/session";
import { documentStatusTone } from "@/lib/status";
import type { ClientListItem, DocumentDetail, DocumentRow, DocumentShare, DocumentStatus, Page } from "@/lib/types";

type DrawerTab = "details" | "versions" | "links";

/** The document categories the backend accepts. Mirrors `service_category`. */
const CATEGORIES = [
  "gst",
  "income_tax",
  "tds",
  "roc",
  "audit",
  "accounting",
  "payroll",
  "other",
];

/**
 * One document, as a slide-over.
 *
 * A drawer rather than a page because the list is the context: somebody clearing a
 * client's pending paperwork wants to open a file, check its version history, share it
 * or re-file it, and move to the next one without losing their filters or their place.
 *
 * The quick actions live in a footer rather than behind a "more" menu, because each one
 * maps to a distinct endpoint and hiding them would make a working control look missing.
 * Each is hidden when the signed-in user lacks the permission its endpoint requires, so
 * a button that is on screen is a button that will work.
 */
export function DocumentDetailDrawer({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const session = useSession();
  const [tab, setTab] = useState<DrawerTab>("details");

  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [tagText, setTagText] = useState("");

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusDropdownRef = useRef<HTMLDivElement>(null);

  const document = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.get<DocumentDetail>(`/documents/${documentId}`),
  });

  const clients = useQuery({
    queryKey: ["clients", "for-select"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=200"),
  });

  const row = document.data;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["document", documentId] });
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["document-summary"] });
  }

  function report(err: unknown, fallback: string) {
    setNotice(null);
    setError(err instanceof ApiError ? err.message : fallback);
  }

  /**
   * Save the inline edit.
   *
   * Only the fields the user actually touched are sent, because the endpoint leaves an
   * omitted field alone — so re-filing a document cannot quietly rename it, and renaming
   * it cannot quietly un-file it.
   */
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch<DocumentDetail>(`/documents/${documentId}`, payload),
    onSuccess: () => {
      setRenaming(false);
      setError(null);
      setNotice("Saved.");
      invalidate();
    },
    onError: (err) => report(err, "Could not save the changes."),
  });

  const share = useMutation({
    mutationFn: () => api.post<DocumentShare>(`/documents/${documentId}/share`, {}),
    onSuccess: (data) => {
      setShareUrl(data.url);
      setError(null);
      setNotice("Link created. Copy it now — it cannot be shown again.");
      invalidate();
    },
    onError: (err) => report(err, "Could not create a share link."),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ ok: boolean }>(`/documents/${documentId}`),
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (err) => report(err, "Could not delete the document."),
  });

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<DocumentStatus | null>(null);

  const statusChange = useMutation({
    mutationFn: (payload: { status: DocumentStatus; reason?: string }) =>
      api.post<DocumentRow>(`/documents/${documentId}/status`, payload),
    onSuccess: () => {
      invalidate();
      setStatusOpen(false);
      setStatusTarget(null);
      setNotice("Status updated.");
    },
    onError: (err) => report(err, "Could not change the document status."),
  });

  const canChangeStatus = hasPermission(session.data, "document.review");

  const statusTransitions: Record<string, DocumentStatus[]> = {
    requested: ["received"],
    received: ["under_review"],
    under_review: ["accepted", "rejected"],
    accepted: [],
    rejected: ["under_review"],
    superseded: [],
  };

  const availableStatuses = canChangeStatus && row
    ? statusTransitions[row.status] ?? []
    : [];

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setStatusOpen(false);
    }
    if (statusOpen) {
      window.addEventListener("mousedown", onOutside);
      window.addEventListener("keydown", onKey);
    }
    return () => {
      window.removeEventListener("mousedown", onOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [statusOpen]);

  function startRename() {
    setTitle(row?.title ?? "");
    setClientId(row?.client_id ?? "");
    setTagText((row?.tags ?? []).join(", "));
    setRenaming(true);
    setNotice(null);
    setError(null);
  }

  function submitRename(event: React.FormEvent) {
    event.preventDefault();
    const payload: Record<string, unknown> = { title: title.trim() };
    // A re-file is only sent when the client actually changed, so opening the editor
    // and pressing save does not re-write a column with the value it already had.
    if (clientId !== (row?.client_id ?? "")) payload.client_id = clientId || null;
    payload.tags = tagText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    save.mutate(payload);
  }

  const tabs: Array<{ key: DrawerTab; label: string; count?: number }> = [
    { key: "details", label: "Details" },
    { key: "versions", label: "Versions", count: row?.versions.length },
    { key: "links", label: "Related to", count: row?.links.length },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Close document details"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Document details"
        className="fixed right-0 top-0 z-50 flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl"
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-slate-900">
                  {row?.title ?? "Document"}
                </h2>
                {row && (
                  <Badge tone={documentStatusTone(row.status)}>{humanise(row.status)}</Badge>
                )}
                {row?.is_confidential && <Badge tone="danger">Confidential</Badge>}
                {row?.from_client && <Badge tone="info">From client</Badge>}
              </div>
              {row && (
                <p className="mt-0.5 text-xs text-slate-500">
                  {clientName(clients.data, row.client_id) ?? "Not filed under a client"}
                  {" · "}
                  {humanise(row.doc_type) || "Unclassified"}
                  {" · v"}
                  {row.version_count}
                  {" · added "}
                  {formatDate(row.created_at)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-icon shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {row?.rejection_reason && (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
              Rejected: {row.rejection_reason}
            </p>
          )}

          {notice && (
            <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800">
              {notice}
            </p>
          )}
          {error && (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
              {error}
            </p>
          )}

          {shareUrl && (
            <div className="mt-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5">
              <p className="text-[10px] uppercase tracking-wide text-sky-700">
                Share link — shown once
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs text-sky-900">{shareUrl}</code>
                <button
                  type="button"
                  className="btn-ghost shrink-0"
                  onClick={() => {
                    void navigator.clipboard?.writeText(shareUrl);
                    setNotice("Link copied to the clipboard.");
                  }}
                >
                  <Icon name="link" className="h-3.5 w-3.5" />
                  Copy
                </button>
              </div>
            </div>
          )}
        </header>

        <nav className="flex gap-1 border-b border-slate-200 px-3">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={cn(
                "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                entry.key === tab
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {entry.label}
              {entry.count !== undefined && (
                <span className="tabular ml-1.5 text-[10px] text-slate-400">{entry.count}</span>
              )}
            </button>
          ))}
        </nav>


        <div className="flex-1 overflow-y-auto p-4">
          {document.isPending ? (
            <LoadingState label="Loading the document…" />
          ) : document.isError || !row ? (
            <ErrorState message="Could not load this document." />
          ) : tab === "details" ? (
            <DetailsPanel
              row={row}
              renaming={renaming}
              title={title}
              clientId={clientId}
              tagText={tagText}
              clients={clients.data}
              saving={save.isPending}
              onTitleChange={setTitle}
              onClientChange={setClientId}
              onTagChange={setTagText}
              onStartRename={startRename}
              onCancelRename={() => setRenaming(false)}
              onSubmit={submitRename}
            />
          ) : tab === "versions" ? (
            <VersionsPanel row={row} />
          ) : (
            <LinksPanel row={row} />
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-4 py-3">
          {row?.current_version_id && (
            <a
              // A plain link, not a fetch: the download endpoint is same-origin and
              // cookie-authenticated, so the browser handles it — and every read is
              // written to the access log.
              href={`/api/documents/versions/${row.current_version_id}/content`}
              className="btn btn-ghost px-5 py-2.5"
            >
              <Icon name="download" className="h-3.5 w-3.5" />
              Download
            </a>
          )}
          {hasPermission(session.data, "document.share_external") && (
            <button
              type="button"
              className="btn btn-ghost px-5 py-2.5"
              disabled={share.isPending}
              onClick={() => share.mutate()}
            >
              <Icon name="share" className="h-3.5 w-3.5" />
              {share.isPending ? "Creating…" : "Share link"}
            </button>
          )}
          {hasPermission(session.data, "document.upload") && !renaming && (
            <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={startRename}>
              <Icon name="pencil" className="h-3.5 w-3.5" />
              Rename / move
            </button>
          )}
          {canChangeStatus && availableStatuses.length > 0 && (
            <>
              <div className="relative inline-block" ref={statusDropdownRef}>
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
                  onClick={() => setStatusOpen(!statusOpen)}
                >
                  <Icon name={statusIcon(row?.status ?? "requested")} className="h-3.5 w-3.5" />
                  Mark as
                  <Icon name="chevron-down" className="h-3 w-3 text-slate-400" />
                </button>
                {statusOpen && (
                  <div className="absolute top-full right-0 z-30 mt-1 w-40 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                    {availableStatuses.map((target) => (
                      <button
                        key={target}
                        type="button"
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                        onClick={() => {
                          setStatusOpen(false);
                          setStatusTarget(target);
                        }}>
                        {humanise(target)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {statusTarget && (
                <StatusReasonModal
                  target={statusTarget}
                  onClose={() => setStatusTarget(null)}
                  onConfirm={(reason) => {
                    statusChange.mutate({
                      status: statusTarget,
                      reason: statusTarget === "rejected" ? (reason.trim() || undefined) : undefined,
                    });
                  }}
                  isPending={statusChange.isPending}
                />
              )}
            </>
          )}
          {hasPermission(session.data, "document.delete") && (
            <button
              type="button"
              className="btn-ghost ml-auto text-rose-700"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${row?.title}"? It leaves every list and any share link ` +
                      "stops working. The stored file is kept for the audit trail.",
                  )
                ) {
                  remove.mutate();
                }
              }}
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
        </footer>
      </aside>
    </>
  );
}

const STATUS_ICON_MAP: Record<string, IconName> = {
  requested: "file-text",
  received: "upload",
  under_review: "eye",
  accepted: "check-circle",
  rejected: "x",
  superseded: "file-text",
};

function statusIcon(status: string): IconName {
  return STATUS_ICON_MAP[status] ?? "file-text";
}

function StatusReasonModal({
  target,
  onClose,
  onConfirm,
  isPending,
}: {
  target: DocumentStatus;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");

  const needsReason = target === "rejected";

  return (
    <>
      <button
        type="button"
        aria-label="Close status change"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Change document status"
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <h3 className="text-sm font-semibold text-slate-900">
            Mark as {humanise(target)}
          </h3>
          {needsReason && (
            <p className="mt-2 text-xs text-slate-600">
              A reason is required so the client knows what to fix.
            </p>
          )}
          {needsReason && (
            <textarea
              className="input mt-3 w-full resize-y text-xs"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for rejection…"
              rows={3}
              aria-label="Rejection reason"
              maxLength={600}
            />
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={isPending || (needsReason && !reason.trim())}
              onClick={() => {
                onConfirm(reason);
                setReason("");
              }}
            >
              {isPending ? "Saving…" : "Confirm"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}


function clientName(clients: Page<ClientListItem> | undefined, id: string | null): string | null {
  if (!id || !clients) return null;
  const match = clients.items.find((entry) => entry.id === id);
  if (!match) return null;
  return match.trade_name || match.legal_name;
}


/** The metadata, plus the inline rename / re-file editor. */
function DetailsPanel({
  row,
  renaming,
  title,
  clientId,
  tagText,
  clients,
  saving,
  onTitleChange,
  onClientChange,
  onTagChange,
  onStartRename,
  onCancelRename,
  onSubmit,
}: {
  row: DocumentDetail;
  renaming: boolean;
  title: string;
  clientId: string;
  tagText: string;
  clients: Page<ClientListItem> | undefined;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onClientChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  if (renaming) {
    return (
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label" htmlFor="doc-title">
            Title
          </label>
          <input
            id="doc-title"
            className="input"
            value={title}
            required
            minLength={2}
            maxLength={300}
            onChange={(event) => onTitleChange(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">
            A document must keep a title — an untitled one cannot be listed or searched for.
          </p>
        </div>

        <Select
          label="Filed under client"
          value={clientId}
          onChange={onClientChange}
          placeholder="No client (firm-wide)"
          options={(clients?.items ?? []).map((entry) => ({
            value: entry.id,
            label: entry.trade_name || entry.legal_name,
          }))}
        />

        <div>
          <label className="label" htmlFor="doc-tags">
            Tags
          </label>
          <input
            id="doc-tags"
            className="input"
            value={tagText}
            placeholder="gst, fy-2026-27"
            onChange={(event) => onTagChange(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">Comma separated.</p>
        </div>

        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary px-5 py-2.5" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={onCancelRename}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const rows: Array<[string, string]> = [
    ["Category", humanise(row.category) || "—"],
    ["Document type", humanise(row.doc_type) || "—"],
    ["Period", row.period_key || "—"],
    ["Status", humanise(row.status)],
    ["Versions", String(row.version_count)],
    ["Confidential", row.is_confidential ? "Yes — partners and managers only" : "No"],
    ["Received from client", row.from_client ? "Yes" : "No"],
    ["Uploaded by", row.uploaded_by_name ?? "Unknown"],
    ["Added", formatDateTime(row.created_at)],
    ["Last changed", formatDateTime(row.updated_at)],
  ];

  return (
    <div className="space-y-3">
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start gap-3 px-3 py-2">
            <dt className="w-40 shrink-0 text-xs text-slate-500">{label}</dt>
            <dd className="min-w-0 flex-1 text-xs text-slate-800">{value}</dd>
          </div>
        ))}
      </dl>

      {row.description && (
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs text-slate-500">Description</p>
          <p className="mt-0.5 text-sm text-slate-800">{row.description}</p>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 px-3 py-2">
        <p className="text-xs text-slate-500">Tags</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {row.tags && row.tags.length > 0 ? (
            row.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-400">
              {row.tags === null ? "Never tagged" : "Tags cleared"}
            </span>
          )}
        </div>
        <button type="button" className="btn-ghost mt-2" onClick={onStartRename}>
          <Icon name="tag" className="h-3.5 w-3.5" />
          Edit tags
        </button>
      </div>
    </div>
  );
}


/** Every revision, newest first, each downloadable. */
function VersionsPanel({ row }: { row: DocumentDetail }) {
  if (row.versions.length === 0) {
    return <EmptyState title="No versions" message="This document has no stored file." />;
  }

  const ordered = [...row.versions].sort((a, b) => b.version_no - a.version_no);

  return (
    <div className="table-wrap">
      <table className="w-full min-w-[34rem]">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Version</th>
            <th className="th">File</th>
            <th className="th text-right">Size</th>
            <th className="th">Uploaded</th>
            <th className="th">By</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {ordered.map((version) => {
            const isCurrent = version.id === row.current_version_id;
            return (
              <tr key={version.id} className="hover:bg-slate-50">
                <td className="td text-xs">
                  <span className="tabular font-medium text-slate-900">
                    v{version.version_no}
                  </span>
                  {isCurrent && (
                    <span className="ml-2">
                      <Badge tone="success">In force</Badge>
                    </span>
                  )}
                </td>
                <td className="td text-xs">
                  <span className="font-medium text-slate-800">{version.file_name}</span>
                  <p className="text-slate-400">{version.mime_type}</p>
                </td>
                <td className="td tabular text-right text-xs">{formatBytes(version.size_bytes)}</td>
                <td className="td text-xs text-slate-500">{formatDate(version.created_at)}</td>
                <td className="td text-xs text-slate-500">
                  {version.uploaded_by_type === "client_user" ? "Client" : "Firm"}
                </td>
                <td className="td text-xs">
                  <a
                    href={`/api/documents/versions/${version.id}/content`}
                    className="font-medium text-slate-700 underline underline-offset-2"
                  >
                    Download
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-slate-500">
        Versions are kept, never overwritten — a corrected file becomes a new version and the
        earlier one stays reachable.
      </p>
    </div>
  );
}

/** What this document is attached to. */
function LinksPanel({ row }: { row: DocumentDetail }) {
  if (row.links.length === 0) {
    return (
      <EmptyState
        title="Not linked to anything"
        message="A document can serve a task, an engagement and a filing at once without being duplicated."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="w-full min-w-[30rem]">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Linked to</th>
            <th className="th">Purpose</th>
            <th className="th">Since</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {row.links.map((link) => (
            <tr key={link.id} className="hover:bg-slate-50">
              <td className="td text-xs font-medium text-slate-800">
                {humanise(link.linked_type)}
              </td>
              <td className="td text-xs text-slate-600">{link.purpose ?? "—"}</td>
              <td className="td text-xs text-slate-500">{formatDate(link.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

