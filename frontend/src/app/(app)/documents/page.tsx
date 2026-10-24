"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { DocumentDetailDrawer } from "@/components/DocumentDetailDrawer";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { Icon } from "@/components/Icon";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  StatCard,
} from "@/components/ui";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatBytes, formatDate, formatRelative, humanise } from "@/lib/format";
import { usePaging } from "@/lib/hooks";
import { hasPermission, useSession } from "@/lib/session";
import { documentRequestTone, documentStatusTone } from "@/lib/status";
import type {
  ClientListItem,
  DocumentRequestRow,
  DocumentRow,
  DocumentSummary,
  Page,
} from "@/lib/types";

/**
 * The tabs, and the status each slices by.
 *
 * Every tab is a real filter on `GET /documents`, and its count comes from
 * `/documents/summary`, which is built from the same conditions function the list uses.
 * That is what stops a tab from claiming more rows than the table beneath it can show —
 * they cannot drift, because there is only one definition of each filter.
 */
const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All documents" },
  { key: "requested", label: "Requested" },
  { key: "received", label: "Received" },
  { key: "under_review", label: "Under review" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];

/** The list parameters for a tab. `all` means "every status". */
function tabParams(key: string): Record<string, string> {
  return key === "all" ? {} : { status: key };
}

/** A tab's count. `all` is the unfiltered total; the rest come from the status map. */
function tabCount(summary: DocumentSummary | undefined, key: string): number {
  if (!summary) return 0;
  return key === "all" ? summary.total_files : (summary.status_counts[key] ?? 0);
}

const DOC_TYPES = [
  "bank_statement",
  "gst_return",
  "form_16",
  "itr",
  "engagement_letter",
  "financial_statement",
  "invoice",
  "other",
];

export default function DocumentsPage() {
  const session = useSession();
  const paging = usePaging(50);
  const { offset, setOffset, limit, page } = paging;

  const [tab, setTab] = useState("all");
  const [clientId, setClientId] = useState("");
  const [docType, setDocType] = useState("");
  const [search, setSearch] = useState("");
  const [confidentialOnly, setConfidentialOnly] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);

  /**
   * The filters that narrow *what is being looked at*, as opposed to which slice the tab
   * shows. The summary is built from these alone, so the tab counts keep describing the
   * whole filtered set rather than collapsing to the tab you are standing on.
   */
  const scope: Record<string, string> = {
    client_id: clientId,
    doc_type: docType,
    search,
    confidential_only: confidentialOnly ? "true" : "",
  };

  const summary = useQuery({
    queryKey: ["document-summary", scope],
    queryFn: () => api.get<DocumentSummary>(`/documents/summary${buildQuery(scope)}`),
  });

  const documents = useQuery({
    queryKey: ["documents", { ...scope, tab, offset, limit }],
    queryFn: () =>
      api.get<Page<DocumentRow>>(
        `/documents${buildQuery({ ...scope, ...tabParams(tab), limit, offset })}`,
      ),
  });

  const clients = useQuery({
    queryKey: ["clients", "for-select"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=200"),
  });

  const pending = useQuery({
    queryKey: ["document-requests", "missing"],
    queryFn: () => api.get<DocumentRequestRow[]>("/document-requests/missing"),
    enabled: showPending,
  });

  const clientDocs = useQuery({
    queryKey: ["documents", "from_client", "pending"],
    queryFn: () =>
      api.get<Page<DocumentRow>>(
        `/documents?${buildQuery({ from_client: "true", status_in: ["requested", "received", "under_review"].join(",") })}`,
      ),
    enabled: showPending,
  });

  const clientNames = new Map(
    (clients.data?.items ?? []).map((entry) => [
      entry.id,
      entry.trade_name || entry.legal_name,
    ]),
  );

  function changeTab(key: string) {
    setTab(key);
    setOffset(0);
  }

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setOffset(0);
  }

  const canUpload = hasPermission(session.data, "document.upload");
  const canRequest = hasPermission(session.data, "document.request");
  const queryClient = useQueryClient();

  const [requestOpen, setRequestOpen] = useState(false);
  const [requestClient, setRequestClient] = useState("");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestDueDate, setRequestDueDate] = useState("");
  const [requestDocType, setRequestDocType] = useState("");

  const requestMutate = useMutation({
    mutationFn: (payload: {
      client_id: string;
      title: string;
      description?: string;
      due_date?: string;
      doc_type?: string;
    }) => api.post<DocumentRequestRow>("/document-requests", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-requests", "missing"] });
      queryClient.invalidateQueries({ queryKey: ["document-requests"] });
      setRequestOpen(false);
      setRequestClient("");
      setRequestTitle("");
      setRequestDescription("");
      setRequestDueDate("");
      setRequestDocType("");
    },
  });

  const canSubmitRequest =
    requestTitle.trim().length >= 2 && !!requestClient && !requestMutate.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documents"
        subtitle="Store, organise and manage client documents securely"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                className={cn(
                  "btn-ghost",
                  showPending && "bg-amber-50/60",
                )}
                onClick={() => setShowPending((current) => !current)}
            >
              <Icon name="clock" className="h-4 w-4" />
              Pending from clients
              {summary.data ? (
                <span className="tabular ml-1 rounded bg-slate-100 px-1.5 text-[10px] text-slate-600">
                  {summary.data.pending_from_clients}
                </span>
              ) : null}
            </button>
            {canUpload && (
              <button type="button" className="btn-primary" onClick={() => setUploadOpen(true)}>
                <Icon name="upload" className="h-4 w-4" />
                Upload document
              </button>
            )}
            {canRequest && (
              <button type="button" className="btn-ghost" onClick={() => setRequestOpen(true)}>
                <Icon name="file-text" className="h-4 w-4" />
                Request from client
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Total files"
          value={summary.data?.total_files ?? 0}
          hint="In this view"
          icon={<Icon name="documents" className="h-5 w-5" />}
        />
        <StatCard
          label="Clients"
          value={summary.data?.clients_count ?? 0}
          hint="In the firm"
          tone="info"
          icon={<Icon name="clients" className="h-5 w-5" />}
        />
        <StatCard
          label="Storage used"
          value={summary.data?.storage_used_display ?? "0 B"}
          hint="Current versions only"
          tone="progress"
          icon={<Icon name="folder" className="h-5 w-5" />}
        />
        <StatCard
          label="Pending from clients"
          value={summary.data?.pending_from_clients ?? 0}
          hint="Awaiting review"
          tone="warning"
          icon={<Icon name="clock" className="h-5 w-5" />}
        />
        <StatCard
          label="Shared with client"
          value={summary.data?.shared_with_client ?? 0}
          hint="Live links"
          tone="success"
          icon={<Icon name="share" className="h-5 w-5" />}
        />
      </div>

        {showPending && (
          <Card>
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Pending from clients
                <span className="ml-2 text-xs font-normal text-slate-500">
                  What the firm is still waiting on, and from whom
                </span>
              </h3>
              <button
                type="button"
                className="btn-icon"
                aria-label="Hide pending documents"
                onClick={() => setShowPending(false)}
              >
                ✕
              </button>
            </div>
            {pending.isPending || clientDocs.isPending ? (
              <LoadingState label="Loading what is outstanding…" />
            ) : pending.isError || clientDocs.isError ? (
              <ErrorState message="Could not load the outstanding requests." />
            ) : pending.data.length === 0 && (clientDocs.data?.items ?? []).length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                message="Every document the firm has asked for has come in."
              />
            ) : (
              <>
                {(clientDocs.data?.items ?? []).length > 0 && (
                  <div>
                    <div className="border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
                      Documents from clients
                    </div>
                    <div className="table-wrap">
                      <table className="w-full min-w-[52rem]">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="th">Document</th>
                            <th className="th">Client</th>
                            <th className="th">Status</th>
                            <th className="th">Added</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {clientDocs.data!.items.map((doc) => (
                            <tr
                              key={doc.id}
                              className="cursor-pointer hover:bg-slate-50"
                              onClick={() => {
                                setShowPending(false);
                                setOpenDocumentId(doc.id);
                              }}
                            >
                              <td className="td">
                                <span className="font-medium text-slate-800">{doc.title}</span>
                                {doc.file_name && (
                                  <span className="ml-1 text-[11px] text-slate-400">{doc.file_name}</span>
                                )}
                              </td>
                              <td className="td text-xs text-slate-600">
                                {clientNames.get(doc.client_id ?? "") ?? "—"}
                              </td>
                              <td className="td">
                                <Badge tone={documentStatusTone(doc.status)}>
                                  {humanise(doc.status)}
                                </Badge>
                              </td>
                              <td className="td text-xs text-slate-500">
                                {formatRelative(doc.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {pending.data.length > 0 && (
                  <div>
                    <div className="border-b border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">
                      Outstanding requests
                    </div>
                    <div className="table-wrap">
                      <table className="w-full min-w-[52rem]">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="th">Requested</th>
                            <th className="th">Client</th>
                            <th className="th">Due</th>
                            <th className="th">Status</th>
                            <th className="th text-right">Reminders</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pending.data.map((request) => (
                            <tr key={request.id} className="hover:bg-slate-50">
                              <td className="td text-xs font-medium text-slate-800">{request.title}</td>
                              <td className="td text-xs text-slate-600">
                                {clientNames.get(request.client_id) ?? "—"}
                              </td>
                              <td className="td text-xs">
                                {request.due_date ? (
                                  <span
                                    className={request.is_overdue ? "text-rose-700" : "text-slate-600"}
                                  >
                                    {formatDate(request.due_date)}
                                    {request.is_overdue && " · overdue"}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">No date</span>
                                )}
                              </td>
                              <td className="td">
                                <Badge tone={documentRequestTone(request.status)}>
                                  {humanise(request.status)}
                                </Badge>
                              </td>
                              <td className="td tabular text-right text-xs text-slate-500">
                                {request.reminder_count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        )}


      <Card>
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 pt-2">
          {TABS.map((entry) => {
            const isActive = entry.key === tab;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => changeTab(entry.key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-sky-600 text-sky-700"
                    : "border-transparent text-slate-500 hover:text-slate-800",
                )}
              >
                {entry.label}
                <span
                  className={cn(
                    "tabular ml-1.5 rounded px-1.5 py-0.5 text-[10px]",
                    isActive ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {tabCount(summary.data, entry.key)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-3 py-2">
          <div className="min-w-[14rem] flex-1">
            <SearchInput
              value={search}
              onChange={(value) => changeFilter(setSearch, value)}
              placeholder="Search by title or type…"
              hideLabel
            />
          </div>
          <div className="w-52">
            <Select
              label="Client"
              value={clientId}
              onChange={(value) => changeFilter(setClientId, value)}
              placeholder="All clients"
              hideLabel
              options={(clients.data?.items ?? []).map((entry) => ({
                value: entry.id,
                label: entry.trade_name || entry.legal_name,
              }))}
            />
          </div>
          <div className="w-44">
            <Select
              label="Document type"
              value={docType}
              onChange={(value) => changeFilter(setDocType, value)}
              placeholder="All types"
              hideLabel
              options={DOC_TYPES.map((entry) => ({ value: entry, label: humanise(entry) }))}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setConfidentialOnly((current) => !current);
              setOffset(0);
            }}
            className={cn(
              "btn-ghost",
              confidentialOnly && "border-rose-300 bg-rose-50 text-rose-700",
            )}
            aria-pressed={confidentialOnly}
          >
            <Icon name="eye" className="h-3.5 w-3.5" />
            Confidential only
          </button>
          {(clientId || docType || search || confidentialOnly) && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setClientId("");
                setDocType("");
                setSearch("");
                setConfidentialOnly(false);
                setOffset(0);
              }}
            >
              Clear filters
            </button>
          )}
        </div>


        <div className="grid gap-4 p-3 lg:grid-cols-[15rem_1fr]">
          <ClientRail
            summary={summary.data}
            clientId={clientId}
            onSelect={(value) => changeFilter(setClientId, value)}
            loading={summary.isPending}
          />

          <div className="min-w-0">
            {documents.isPending ? (
              <LoadingState label="Loading documents…" />
            ) : documents.isError ? (
              <ErrorState message="Could not load the documents." />
            ) : documents.data.items.length === 0 ? (
              <EmptyState
                title="No documents here"
                message={
                  clientId || docType || search || confidentialOnly
                    ? "Nothing matches these filters. Try widening them."
                    : "Upload a document, or ask a client for one."
                }
              />
            ) : (
              <>
                <div className="table-wrap">
                  <table className="w-full min-w-[62rem]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Name</th>
                        <th className="th">Client</th>
                        <th className="th">Type</th>
                        <th className="th">Period</th>
                        <th className="th">Status</th>
                        <th className="th text-right">Size</th>
                        <th className="th">Uploaded by</th>
                        <th className="th">Uploaded</th>
                        <th className="th" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {documents.data.items.map((document) => (
                        <tr
                          key={document.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => setOpenDocumentId(document.id)}
                        >
                          <td className="td">
                            <span className="font-medium text-slate-900">{document.title}</span>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {document.file_name && (
                                <span className="text-[11px] text-slate-400">
                                  {document.file_name}
                                </span>
                              )}
                              {document.version_count > 1 && (
                                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                                  v{document.version_count}
                                </span>
                              )}
                              {document.is_confidential && (
                                <Badge tone="danger">Confidential</Badge>
                              )}
                              {document.from_client && <Badge tone="info">From client</Badge>}
                            </div>
                          </td>
                          <td className="td text-xs text-slate-600">
                            {document.client_id ? (
                              (clientNames.get(document.client_id) ?? "—")
                            ) : (
                              <span className="text-slate-400">Unfiled</span>
                            )}
                          </td>
                          <td className="td text-xs">{humanise(document.doc_type) || "—"}</td>
                          <td className="td text-xs text-slate-500">
                            {document.period_key ?? "—"}
                          </td>
                          <td className="td">
                            <Badge tone={documentStatusTone(document.status)}>
                              {humanise(document.status)}
                            </Badge>
                          </td>
                          <td className="td tabular text-right text-xs text-slate-600">
                            {document.size_bytes === null
                              ? "—"
                              : formatBytes(document.size_bytes)}
                          </td>
                          <td className="td text-xs">
                            {document.uploaded_by_name ? (
                              <span className="text-slate-700">{document.uploaded_by_name}</span>
                            ) : (
                              <span className="text-slate-400">Unknown</span>
                            )}
                          </td>
                          <td className="td text-xs text-slate-500">
                            {formatRelative(document.created_at)}
                          </td>
                          <td className="td text-right text-xs">
                            {document.current_version_id ? (
                              <a
                                href={`/api/documents/versions/${document.current_version_id}/content`}
                                className="font-medium text-slate-700 underline underline-offset-2"
                                onClick={(event) => event.stopPropagation()}
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-slate-400">No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  limit={limit}
                  total={documents.data.meta.total}
                  hasMore={documents.data.meta.has_more}
                  offset={offset}
                  onOffsetChange={setOffset}
                />
              </>
            )}
          </div>
        </div>
      </Card>

       <DocumentUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {requestOpen && (
        <DocumentRequestModal
          open={requestOpen}
          clients={clients.data}
          onClose={() => setRequestOpen(false)}
          onSubmit={(payload) => requestMutate.mutate(payload)}
          isPending={requestMutate.isPending}
          isError={requestMutate.isError}
          error={requestMutate.error instanceof ApiError ? requestMutate.error.message : undefined}
        />
      )}

      {openDocumentId && (
        <DocumentDetailDrawer
          documentId={openDocumentId}
          onClose={() => setOpenDocumentId(null)}
        />
      )}
    </div>
  );
}


/**
 * The client rail beside the list.
 *
 * A client filter rather than a folder tree: a document *is* filed under a client and a
 * financial year, so there is no folder record to nest. Counts come from
 * `/documents/summary`, built from the same conditions function the list uses — so
 * clicking a client narrows the table to exactly the number of documents the rail
 * claimed, never fewer.
 *
 * Only the busiest clients are listed, and the heading says so; a rail that silently
 * showed the first twelve would look like the firm's whole book.
 */
function ClientRail({
  summary,
  clientId,
  onSelect,
  loading,
}: {
  summary: DocumentSummary | undefined;
  clientId: string;
  onSelect: (value: string) => void;
  loading: boolean;
}) {
  const entries = summary?.by_client ?? [];

  return (
    <aside className="min-w-0 self-start rounded-lg border border-slate-200">
      <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Clients
      </p>
      <nav className="p-1.5">
        <button
          type="button"
          onClick={() => onSelect("")}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
            clientId === "" ? "bg-sky-50 font-medium text-sky-800" : "text-slate-700 hover:bg-slate-50",
          )}
        >
          <Icon name="folder-open" className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1 truncate">All documents</span>
          <span className="tabular shrink-0 text-[11px] text-slate-500">
            {summary?.total_files ?? 0}
          </span>
        </button>

        {loading && <p className="px-2 py-3 text-xs text-slate-400">Loading…</p>}

        {entries.map((entry) => {
          const isActive = entry.client_id === clientId;
          return (
            <button
              key={entry.client_id}
              type="button"
              onClick={() => onSelect(entry.client_id)}
              title={`${entry.client_name} — ${formatBytes(entry.size_bytes)}`}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                isActive
                  ? "bg-sky-50 font-medium text-sky-800"
                  : "text-slate-700 hover:bg-slate-50",
              )}
            >
              <Icon
                name={isActive ? "folder-open" : "folder"}
                className="h-4 w-4 shrink-0 text-slate-400"
              />
              <span className="min-w-0 flex-1 truncate">{entry.client_name}</span>
              <span className="tabular shrink-0 text-[11px] text-slate-500">{entry.count}</span>
            </button>
          );
        })}

        {!loading && entries.length === 0 && (
          <p className="px-2 py-3 text-xs text-slate-400">
            No documents filed under a client yet.
          </p>
        )}
      </nav>
      {entries.length > 0 && (
        <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
          Busiest {entries.length} client{entries.length === 1 ? "" : "s"} shown.
        </p>
      )}
    </aside>
  );
}

/** Inline modal for raising a document-request against a client, with no task. */
function DocumentRequestModal({
  open,
  clients,
  onClose,
  onSubmit,
  isPending,
  isError,
  error,
}: {
  open: boolean;
  clients: Page<ClientListItem> | undefined;
  onClose: () => void;
  onSubmit: (payload: {
    client_id: string;
    title: string;
    description?: string;
    due_date?: string;
    doc_type?: string;
  }) => void;
  isPending: boolean;
  isError: boolean;
  error?: string;
}) {
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [docType, setDocType] = useState("");

  const canSubmit = title.trim().length >= 2 && !!clientId && !isPending;

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default bg-slate-900/20"
      />
      <aside
        role="dialog"
        aria-label="Request document from client"
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <h3 className="text-sm font-semibold text-slate-900">Request document from client</h3>

          <div className="mt-3">
            <Select
              label="Client"
              value={clientId}
              onChange={setClientId}
              placeholder="Select a client…"
              options={(clients?.items ?? []).map((entry) => ({
                value: entry.id,
                label: entry.trade_name || entry.legal_name,
              }))}
            />
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="req-title">
              Title
            </label>
            <input
              id="req-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bank statements for the quarter"
              maxLength={200}
              aria-label="Request title"
            />
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="req-desc">
              Description (optional)
            </label>
            <textarea
              id="req-desc"
              className="input w-full resize-y text-xs"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What exactly do you need from them?"
              rows={2}
              aria-label="Description"
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              type="date"
              className="input text-xs"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
            />
            <input
              type="text"
              className="input text-xs"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              placeholder="Document type (optional)"
              aria-label="Document type"
            />
          </div>

          {isError && error && (
            <p role="alert" className="mt-2 text-xs text-rose-600">
              {error}
            </p>
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
              disabled={!canSubmit}
              onClick={() => {
                onSubmit({
                  client_id: clientId,
                  title: title.trim(),
                  description: description.trim() || undefined,
                  due_date: dueDate || undefined,
                  doc_type: docType || undefined,
                });
                setClientId("");
                setTitle("");
                setDescription("");
                setDueDate("");
                setDocType("");
              }}
            >
              {isPending ? "Requesting…" : "Request"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
