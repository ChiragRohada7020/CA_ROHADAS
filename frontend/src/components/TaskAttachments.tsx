"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { cn, formatBytes, formatDateTime } from "@/lib/format";
import type { DocumentDetail, DocumentRow, Page, TaskDetail } from "@/lib/types";

/** Matches `MAX_INLINE_UPLOAD_BYTES` in the backend. */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * The files attached to one task.
 *
 * These are ordinary documents carrying a `task_id`, not a separate attachment table.
 * That is deliberate: a document uploaded while working a task is the same document the
 * client sees in the portal, the same one a filing record cites, and the same one the
 * document register counts. A parallel "attachments" store would mean two places to look
 * and two answers to "is this file here".
 *
 * The size check happens before the request rather than after it. A Vercel Function
 * request body is capped at 4.5 MB, so a larger file would be refused upstream with a
 * less useful message, after the user had waited for the upload to finish.
 */
export function TaskAttachments({ task }: { task: TaskDetail }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const documents = useQuery({
    queryKey: ["task-documents", task.id],
    queryFn: () => api.get<Page<DocumentRow>>(`/documents?task_id=${task.id}&limit=50`),
  });

  const upload = useMutation({
    mutationFn: (form: FormData) => api.upload<DocumentDetail>("/documents/upload", form),
    onSuccess: () => {
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["task-documents", task.id] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      if (inputRef.current) inputRef.current.value = "";
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "The upload failed. Please try again."),
  });

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const oversized = files.find((file) => file.size > INLINE_LIMIT_BYTES);
    if (oversized) {
      setError(
        `"${oversized.name}" is ${formatBytes(oversized.size)}, above the ` +
          `${formatBytes(INLINE_LIMIT_BYTES)} limit for an upload through the API.`,
      );
      return;
    }

    setError(null);
    for (const file of files) {
      const form = new FormData();
      form.append("file", file);
      form.append("task_id", task.id);
      // The client link comes from the task, so a file attached here is filed against
      // the right client without anyone having to remember to set it.
      form.append("client_id", task.client_id);
      if (task.period_key) form.append("period_key", task.period_key);
      upload.mutate(form);
    }
  }

  const rows = documents.data?.items ?? [];

  return (
    <Card
      title={`Attachments${rows.length > 0 ? ` (${rows.length})` : ""}`}
      subtitle="Files filed against this task, and against its client"
      action={
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFiles}
            aria-label="Files to attach"
          />
          <button
            type="button"
            className="btn-ghost inline-flex items-center gap-1 text-xs"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            {upload.isPending ? "Uploading…" : "Add more"}
          </button>
        </>
      }
    >
      {error && (
        <p
          role="alert"
          className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700"
        >
          {error}
        </p>
      )}

      {documents.isPending && <LoadingState label="Loading attachments…" />}
      {documents.isError && (
        <ErrorState
          message={
            documents.error instanceof ApiError
              ? documents.error.message
              : "Could not load the attachments."
          }
        />
      )}
      {documents.isSuccess && rows.length === 0 && (
        <EmptyState message="Nothing attached yet. Files up to 4 MB can be added here." />
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-4 py-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded",
                  row.from_client ? "bg-sky-50 text-sky-600" : "bg-slate-100 text-slate-500",
                )}
              >
                <Icon name="file-text" className="h-4 w-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {row.file_name ?? row.title}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {formatBytes(row.size_bytes)}
                  {row.uploaded_by_name ? ` · Uploaded by ${row.uploaded_by_name}` : ""}
                  {` · ${formatDateTime(row.created_at)}`}
                </p>
              </div>

              {row.from_client && (
                <span className="shrink-0 text-xs text-sky-700">from client</span>
              )}

              {row.current_version_id && (
                <a
                  href={`/api/documents/versions/${row.current_version_id}/content`}
                  className="btn-icon shrink-0"
                  title={`Download ${row.file_name ?? row.title}`}
                  aria-label={`Download ${row.file_name ?? row.title}`}
                >
                  <Icon name="download" className="h-4 w-4" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
