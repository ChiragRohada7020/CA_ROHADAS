"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import Link from "next/link";

import { DocumentDetailDrawer } from "@/components/DocumentDetailDrawer";
import { DocumentUploadModal } from "@/components/DocumentUploadModal";
import { Icon } from "@/components/Icon";
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SearchInput,
  Select,
} from "@/components/ui";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatBytes, formatDate, formatRelative, humanise } from "@/lib/format";
import { hasPermission, useSession } from "@/lib/session";
import { usePaging } from "@/lib/hooks";
import { documentRequestTone, documentStatusTone } from "@/lib/status";
import type {
  ClientListItem,
  DocumentRequestRow,
  DocumentRow,
  DocumentSummary,
  Page,
} from "@/lib/types";

const TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All documents" },
  { key: "requested", label: "Requested" },
  { key: "received", label: "Received" },
  { key: "under_review", label: "Under review" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
];

function tabParams(key: string): Record<string, string> {
  return key === "all" ? {} : { status: key };
}

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

const DOC_TILES: Array<{
  icon: string;
  label: string;
  tone: string;
  trend: string;
}> = [
  {
    icon: "documents",
    label: "Total files",
    tone: "violet",
    trend: "In this view",
  },
  {
    icon: "clients",
    label: "Clients",
    tone: "indigo",
    trend: "In the firm",
  },
  {
    icon: "folder",
    label: "Storage used",
    tone: "progress",
    trend: "Current versions only",
  },
  {
    icon: "clock",
    label: "Pending from clients",
    tone: "amber",
    trend: "Awaiting review",
  },
  {
    icon: "share",
    label: "Shared with client",
    tone: "emerald",
    trend: "Live links",
  },
];

const DOC_TONE_BG: Record<string, string> = {
  violet: "bg-[#F0E9FF] text-[#713FE6]",
  indigo: "bg-[#EBEEFF] text-[#5B31CC]",
  progress: "bg-[#F1ECFF] text-[#6D3AE8]",
  amber: "bg-[#FFF1DF] text-[#E58A24]",
  emerald: "bg-[#F0FAF4] text-[#39845A]",
};

function DocumentTile({
  tile,
  value,
}: {
  tile: typeof DOC_TILES[number];
  value: number | string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[#E5E4F4] bg-white p-4 shadow-[0_4px_16px_rgba(40,38,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_9px_24px_rgba(65,48,130,.09)]">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl", DOC_TONE_BG[tile.tone])}>
          <Icon name={tile.icon as any} className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#59617E]">{tile.label}</p>
          <p className="mt-1 text-[27px] font-bold leading-none tracking-[-.04em] text-[#171A32]">
            {typeof value === "number" ? value.toLocaleString("en-IN") : value}
          </p>
          <p className="mt-1 text-[10px] text-[#9298AE]">{tile.trend}</p>
        </div>
      </div>
      <span className="pointer-events-none absolute -bottom-5 -right-3 h-16 w-16 rounded-full bg-[#F2EEFF] opacity-70 blur-xl" />
    </div>
  );
}

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

  const s = summary.data;
  const hasFilters = Boolean(clientId || docType || search || confidentialOnly);

  return (
    <div className="min-h-full space-y-5 bg-[#F7F8FC] p-4 md:p-5 xl:p-6">

      {/* Page heading */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-[#777E9B]">
            <span>Workspace</span>
            <Icon name="chevron-right" className="h-3 w-3" />
            <span className="text-[#343A58]">Documents</span>
          </div>

          <h1 className="text-[28px] font-bold tracking-[-.045em] text-[#171A32]">
            Documents
          </h1>

          <p className="mt-1 text-sm text-[#737A96]">
            Store, organise and manage client documents securely.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-5 py-3 text-sm font-semibold text-[#454B68] transition hover:bg-[#F5F0FF] hover:border-[#CFC0F8]",
              showPending && "bg-amber-50/60 border-amber-100 text-[#9A5A0F]",
            )}
            onClick={() => setShowPending((current) => !current)}
            aria-pressed={showPending}
          >
            <Icon name="clock" className="h-4 w-4" />
            Pending from clients
            {s ? (
              <span className="tabular ml-1 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-[#9A5A0F]">
                {s.pending_from_clients}
              </span>
            ) : null}
          </button>
          {canUpload && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-5 py-3 text-sm font-semibold text-white shadow-[0_7px_18px_rgba(104,61,213,.22)] transition hover:-translate-y-0.5 hover:shadow-lg"
              onClick={() => setUploadOpen(true)}
            >
              <Icon name="upload" className="h-4 w-4" />
              Upload document
            </button>
          )}
          {canRequest && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-5 py-3 text-sm font-semibold text-[#454B68] transition hover:bg-[#F5F0FF] hover:border-[#CFC0F8]"
              onClick={() => setRequestOpen(true)}
            >
              <Icon name="file-text" className="h-4 w-4" />
              Request from client
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {DOC_TILES.map((tile) => {
          let value: number | string = 0;
          switch (tile.label) {
            case "Total files":
              value = s?.total_files ?? 0;
              break;
            case "Clients":
              value = s?.clients_count ?? 0;
              break;
            case "Storage used":
              value = s?.storage_used_display ?? "0 B";
              break;
            case "Pending from clients":
              value = s?.pending_from_clients ?? 0;
              break;
            case "Shared with client":
              value = s?.shared_with_client ?? 0;
              break;
          }
          return <DocumentTile key={tile.label} tile={tile} value={value} />;
        })}
      </div>

      {/* Pending from clients panel */}
      {showPending && (
        <section className="overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">
          <div className="flex items-center justify-between border-b border-[#EEF0F7] px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#171A32]">
              <Icon name="clock" className="h-4 w-4 text-[#9A5A0F]" />
              Pending from clients
            </h3>
            <button
              type="button"
              className="rounded-lg p-1.5 text-[#69718F] transition hover:bg-[#F3F3FA] hover:text-[#252B47]"
              aria-label="Hide pending documents"
              onClick={() => setShowPending(false)}
            >
              <Icon name="x" className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3">
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
                    <div className="border-b border-[#EEF0F7] px-2 py-1.5 text-xs font-semibold text-[#59617E] uppercase tracking-[.1em]">
                      Documents from clients
                    </div>
                    <div className="table-wrap">
                      <table className="w-full min-w-[52rem]">
                        <thead className="bg-[#F4F2FB]">
                          <tr>
                            <th className="th">Document</th>
                            <th className="th">Client</th>
                            <th className="th">Status</th>
                            <th className="th">Added</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EEF0F7]">
                          {(clientDocs.data?.items ?? []).map((doc) => (
                            <tr
                              key={doc.id}
                              className="cursor-pointer transition-colors hover:bg-[#F8F6FF]"
                              onClick={() => {
                                setShowPending(false);
                                setOpenDocumentId(doc.id);
                              }}
                            >
                              <td className="td">
                                <span className="font-medium text-[#252B47]">{doc.title}</span>
                                {doc.file_name && (
                                  <span className="ml-1 text-[11px] text-[#8A90A6]">{doc.file_name}</span>
                                )}
                              </td>
                              <td className="td text-xs text-[#8A90A6]">
                                {clientNames.get(doc.client_id ?? "") ?? "—"}
                              </td>
                              <td className="td">
                                <Badge tone={documentStatusTone(doc.status)}>
                                  {humanise(doc.status)}
                                </Badge>
                              </td>
                              <td className="td text-xs text-[#59617E]">
                                {formatRelative(doc.created_at)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(pending.data?.length ?? 0) > 0 && (
                  <div className="mt-4">
                    <div className="border-b border-[#EEF0F7] px-2 py-1.5 text-xs font-semibold text-[#59617E] uppercase tracking-[.1em]">
                      Outstanding requests
                    </div>
                    <div className="table-wrap">
                      <table className="w-full min-w-[52rem]">
                        <thead className="bg-[#F4F2FB]">
                          <tr>
                            <th className="th">Requested</th>
                            <th className="th">Client</th>
                            <th className="th">Due</th>
                            <th className="th">Status</th>
                            <th className="th text-right">Reminders</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EEF0F7]">
                          {pending.data.map((request) => (
                            <tr key={request.id} className="transition-colors hover:bg-[#F8F6FF]">
                              <td className="td text-xs font-medium text-[#252B47]">{request.title}</td>
                              <td className="td text-xs text-[#8A90A6]">
                                {clientNames.get(request.client_id) ?? "—"}
                              </td>
                              <td className="td text-xs">
                                {request.due_date ? (
                                  <span
                                    className={cn(
                                      "text-xs",
                                      request.is_overdue ? "text-rose-700" : "text-[#8A90A6]",
                                    )}
                                  >
                                    {formatDate(request.due_date)}
                                    {request.is_overdue && <span className="text-[#B91C1C]"> · overdue</span>}
                                  </span>
                                ) : (
                                  <span className="text-xs text-[#A1A1AA]">No date</span>
                                )}
                              </td>
                              <td className="td">
                                <Badge tone={documentRequestTone(request.status)}>
                                  {humanise(request.status)}
                                </Badge>
                              </td>
                              <td className="td tabular text-right text-xs text-[#59617E]">
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
          </div>
        </section>
      )}

      {/* Main content */}
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">

        {/* Documents table */}
        <section className="min-w-0 overflow-hidden rounded-2xl border border-[#E4E6F2] bg-white shadow-[0_8px_28px_rgba(38,35,82,.055)]">

          {/* Tabs */}
          <div className="border-b border-[#EEF0F7] bg-white px-4 py-3">
            <div className="flex items-center gap-1 overflow-x-auto">
              {TABS.map((entry) => {
                const isActive = entry.key === tab;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => changeTab(entry.key)}
                    className={cn(
                      "shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-xs font-semibold transition-all",
                      isActive
                        ? "bg-gradient-to-r from-[#7543E9] to-[#6032D4] text-white shadow-[0_5px_14px_rgba(104,61,213,.24)]"
                        : "text-[#69718F] hover:bg-[#F5F1FF] hover:text-[#6637D7]"
                    )}
                  >
                    {entry.label}

                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-[#F0EFF8] text-[#737A96]"
                      )}
                    >
                      {tabCount(s, entry.key)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active filter indicator */}
          {hasFilters && (
            <div className="flex items-center justify-between gap-3 border-b border-[#EEF0F7] bg-[#F8F5FF] px-4 py-2.5">
              <p className="text-xs text-[#8A90A6]">
                Showing {documents.data?.meta.total ?? 0} of {s?.total_files ?? 0} documents
              </p>

              <button
                type="button"
                className="text-xs font-semibold text-[#6D3AE8] hover:underline"
                onClick={() => {
                  paging.clearFilters();
                  setClientId("");
                  setDocType("");
                  setSearch("");
                  setConfidentialOnly(false);
                  setOffset(0);
                }}
              >
                Clear filters
              </button>
            </div>
          )}

          {documents.isPending && <LoadingState label="Loading documents…" />}

          {documents.isError && (
            <ErrorState message="Could not load the documents." />
          )}

          {documents.isSuccess && documents.data.items.length === 0 && !hasFilters && (
            <EmptyState
              title="No documents here"
              message="Upload a document, or ask a client for one."
            />
          )}

          {documents.isSuccess && documents.data.items.length === 0 && hasFilters && (
            <EmptyState
              title="No documents here"
              message="Nothing matches these filters. Try widening them."
            />
          )}

          {/* Table */}
          {documents.isSuccess && documents.data.items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[62rem]">
                  <thead className="bg-[#F4F2FB]">
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
                  <tbody className="divide-y divide-[#EEF0F7]">
                    {documents.data.items.map((document) => (
                      <tr
                        key={document.id}
                        className="cursor-pointer transition-colors hover:bg-[#F8F6FF]"
                        onClick={() => setOpenDocumentId(document.id)}
                      >
                        <td className="td">
                          <span className="font-medium text-[#252B47]">{document.title}</span>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {document.file_name && (
                              <span className="text-[11px] text-[#8A90A6]">
                                {document.file_name}
                              </span>
                            )}
                            {document.version_count > 1 && (
                              <span className="rounded border border-[#E5E4F4] px-1 py-0.5 text-[10px] text-[#59617E]">
                                v{document.version_count}
                              </span>
                            )}
                            {document.is_confidential && (
                              <Badge tone="danger">Confidential</Badge>
                            )}
                            {document.from_client && <Badge tone="info">From client</Badge>}
                          </div>
                        </td>
                        <td className="td text-xs text-[#8A90A6]">
                          {document.client_id ? (
                            (clientNames.get(document.client_id) ?? "—")
                          ) : (
                            <span className="text-[#A1A1AA]">Unfiled</span>
                          )}
                        </td>
                        <td className="td text-xs">{humanise(document.doc_type) || "—"}</td>
                        <td className="td text-xs text-[#59617E]">
                          {document.period_key ?? "—"}
                        </td>
                        <td className="td">
                          <Badge tone={documentStatusTone(document.status)}>
                            {humanise(document.status)}
                          </Badge>
                        </td>
                        <td className="td tabular text-right text-xs text-[#59617E]">
                          {document.size_bytes === null
                            ? "—"
                            : formatBytes(document.size_bytes)}
                        </td>
                        <td className="td text-xs">
                          {document.uploaded_by_name ? (
                            <span className="text-[#303653]">{document.uploaded_by_name}</span>
                          ) : (
                            <span className="text-[#A1A1AA]">Unknown</span>
                          )}
                        </td>
                        <td className="td text-xs text-[#59617E]">
                          {formatRelative(document.created_at)}
                        </td>
                        <td className="td text-right text-xs">
                          {document.current_version_id ? (
                            <a
                              href={`/api/documents/versions/${document.current_version_id}/content`}
                              className="font-medium text-[#6D3AE8] underline underline-offset-2 hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              Download
                            </a>
                          ) : (
                            <span className="text-[#A1A1AA]">No file</span>
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
        </section>

        {/* Filters and quick actions */}
        <aside className="space-y-4">

          <section className="overflow-hidden rounded-2xl border border-[#E4E2F3] bg-white shadow-[0_5px_18px_rgba(40,38,90,.05)]">
            <div className="flex items-center justify-between border-b border-[#EEF0F7] px-4 py-4">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[#171A32]">
                <Icon name="reports" className="h-4 w-4 text-[#713FE6]" />
                Filters
              </h2>

              {hasFilters && (
                <button
                  type="button"
                  onClick={() => {
                    paging.clearFilters();
                    setClientId("");
                    setDocType("");
                    setSearch("");
                    setConfidentialOnly(false);
                    setOffset(0);
                  }}
                  className="text-[10px] font-semibold text-[#6D3AE8] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="space-y-3 p-4">
              <label className="block text-[11px] font-semibold text-[#424966]">
                Search documents
                <input
                  className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                  type="search"
                  value={search}
                  onChange={(event) => changeFilter(setSearch, event.target.value)}
                  placeholder="Title, client, type…"
                />
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                Client
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
              </label>

              <label className="block text-[11px] font-semibold text-[#424966]">
                Document type
                <Select
                  label="Document type"
                  value={docType}
                  onChange={(value) => changeFilter(setDocType, value)}
                  placeholder="All types"
                  hideLabel
                  options={DOC_TYPES.map((entry) => ({ value: entry, label: humanise(entry) }))}
                />
              </label>

              <button
                type="button"
                onClick={() => {
                  setConfidentialOnly((current) => !current);
                  setOffset(0);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                  confidentialOnly
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-[#E3E5F0] text-[#69718F] hover:bg-[#F5F1FF] hover:border-[#CFC0F8]",
                )}
                aria-pressed={confidentialOnly}
              >
                <Icon name="eye" className="h-3.5 w-3.5" />
                Confidential only
              </button>

              <p className="rounded-lg bg-[#F7F4FF] px-3 py-2 text-[10px] text-[#77718F]">
                Filters update the document list automatically.
              </p>
            </div>
          </section>

          {/* Quick actions */}
          <section className="overflow-hidden rounded-2xl border border-[#E4E2F3] bg-white shadow-[0_5px_18px_rgba(40,38,90,.05)]">
            <div className="flex items-center gap-2 border-b border-[#EEF0F7] bg-gradient-to-r from-[#FBF9FF] to-[#F1EBFF] px-4 py-4">
              <Icon name="check-circle" className="h-4 w-4 text-[#713FE6]" />
              <h2 className="text-sm font-bold text-[#171A32]">
                Quick Actions
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3">
              <Link
                href="/documents/new"
                className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E8E0FF] bg-[#FBF9FF] px-2 py-3 text-center text-[10px] font-semibold text-[#343653] transition hover:border-[#C9B7FF] hover:bg-[#F4EEFF]"
              >
                <Icon name="plus" className="h-5 w-5 text-[#713FE6]" />
                New Document
              </Link>

              <button
                type="button"
                onClick={() => {
                  paging.clearFilters();
                  setClientId("");
                  setDocType("");
                  setSearch("");
                  setConfidentialOnly(false);
                  setOffset(0);
                }}
                className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-xl border border-[#E8E0FF] bg-[#FBF9FF] px-2 py-3 text-center text-[10px] font-semibold text-[#343653] transition hover:border-[#C9B7FF] hover:bg-[#F4EEFF]"
              >
                <Icon name="check-circle" className="h-5 w-5 text-[#713FE6]" />
                Reset List
              </button>
            </div>
          </section>
        </aside>
      </div>

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
    <aside className="min-w-0 self-start rounded-lg border border-[#E4E6F2] bg-white shadow-[0_5px_18px_rgba(40,38,90,.05)]">
      <p className="border-b border-[#EEF0F7] px-3 py-2 text-xs font-semibold uppercase tracking-[.1em] text-[#59617E]">
        Clients
      </p>
      <nav className="p-1.5">
        <button
          type="button"
          onClick={() => onSelect("")}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
            clientId === "" ? "bg-[#F0E9FF] font-medium text-[#713FE6]" : "text-[#69718F] hover:bg-[#F8F6FF]",
          )}
        >
          <Icon name="folder-open" className="h-4 w-4 shrink-0 text-[#A1A1AA]" />
          <span className="min-w-0 flex-1 truncate">All documents</span>
          <span className="tabular shrink-0 text-[11px] text-[#59617E]">
            {summary?.total_files ?? 0}
          </span>
        </button>

        {loading && <p className="px-2 py-3 text-xs text-[#A1A1AA]">Loading…</p>}

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
                  ? "bg-[#F0E9FF] font-medium text-[#713FE6]"
                  : "text-[#69718F] hover:bg-[#F8F6FF]",
              )}
            >
              <Icon
                name={isActive ? "folder-open" : "folder"}
                className="h-4 w-4 shrink-0 text-[#A1A1AA]"
              />
              <span className="min-w-0 flex-1 truncate">{entry.client_name}</span>
              <span className="tabular shrink-0 text-[11px] text-[#59617E]">{entry.count}</span>
            </button>
          );
        })}

        {!loading && entries.length === 0 && (
          <p className="px-2 py-3 text-xs text-[#A1A1AA]">
            No documents filed under a client yet.
          </p>
        )}
      </nav>
      {entries.length > 0 && (
        <p className="border-t border-[#EEF0F7] px-3 py-2 text-[11px] text-[#59617E]">
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
        className="fixed inset-0 z-40 cursor-default bg-[#171A32]/20"
      />
      <aside
        role="dialog"
        aria-label="Request document from client"
        className="fixed inset-0 z-50 flex items-center justify-center"
      >
        <div className="w-full max-w-md rounded-2xl border border-[#E4E6F2] bg-white p-5 shadow-[0_20px_40px_rgba(38,35,82,.12)]">
          <div className="flex items-center gap-2 mb-1">
            <Icon name="file-text" className="h-4 w-4 text-[#713FE6]" />
            <h3 className="text-sm font-bold text-[#171A32]">Request document from client</h3>
          </div>

          <div className="mt-4">
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

          <div className="mt-4">
            <label className="block text-[11px] font-semibold text-[#424966]">Title</label>
            <input
              className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Bank statements for the quarter"
              maxLength={200}
              aria-label="Request title"
            />
          </div>

          <div className="mt-4">
            <label className="block text-[11px] font-semibold text-[#424966]">
              Description (optional)
            </label>
            <textarea
              className="input mt-1.5 h-32 w-full resize-y rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What exactly do you need from them?"
              rows={2}
              aria-label="Description"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#424966]">Due date</label>
              <input
                type="date"
                className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="Due date"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#424966]">
                Document type (optional)
              </label>
              <input
                type="text"
                className="input mt-1.5 h-10 w-full rounded-xl border-[#E3E5F0] bg-white px-3 text-xs focus:border-[#9A7AEF] focus:ring-4 focus:ring-[#EEE8FF]"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="Document type"
                aria-label="Document type"
              />
            </div>
          </div>

          {isError && error && (
            <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl px-4 py-2 text-sm font-medium text-[#69718F] transition hover:bg-[#F3F3FA] hover:text-[#252B47]"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-xl bg-gradient-to-r from-[#7543E9] to-[#5B31CC] px-4 py-2 text-sm font-medium text-white shadow-[0_5px_14px_rgba(104,61,213,.22)] transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
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
