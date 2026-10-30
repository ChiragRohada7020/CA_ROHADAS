"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field } from "./form";
import { Modal } from "./ui";
import { ApiError, api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { ClientListItem, DocumentDetail, Page } from "@/lib/types";

/** Matches `MAX_INLINE_UPLOAD_BYTES` in the backend. */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

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

export interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  clientId?: string;
  taskId?: string;
}

/**
 * Upload one or more files.
 *
 * Uses `api.upload`, not `api.post`: the JSON path sets `Content-Type: application/json`
 * and stringifies the body, which turns a `FormData` into `{}` and makes the request
 * unparseable as multipart. The multipart path leaves the header unset so the browser
 * can add its own boundary.
 *
 * The size check happens here rather than after a round trip, because a Vercel Function
 * request body is capped at 4.5 MB — a 5 MB file would be refused upstream with a less
 * useful message, after the user had already waited for the upload.
 */
export function DocumentUploadModal({
  open,
  onClose,
  clientId,
  taskId,
}: DocumentUploadModalProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [client, setClient] = useState(clientId ?? "");
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["clients", "for-select"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=200"),
    enabled: open,
  });

  const upload = useMutation({
    mutationFn: (form: FormData) => api.upload<DocumentDetail>("/documents/upload", form),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      void queryClient.invalidateQueries({ queryKey: ["document-summary"] });
      setFiles([]);
      setTitle("");
      setDocType("");
      setError(null);
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "The upload failed. Please try again."),
  });

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setFiles(Array.from(event.target.files ?? []));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one file.");
      return;
    }
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
      if (client) form.append("client_id", client);
      if (taskId) form.append("task_id", taskId);
      if (title) form.append("title", title);
      if (docType) form.append("doc_type", docType);
      if (category) form.append("category", category);
      upload.mutate(form);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Upload documents" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div className="rounded-md border-2 border-dashed border-slate-300 p-4">
          <input
            type="file"
            multiple
            onChange={handleFiles}
            className="w-full text-sm"
            aria-label="Files to upload"
          />
          {files.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {files.map((file) => (
                <li key={file.name} className="text-xs text-slate-600">
                  {file.name} — {formatBytes(file.size)}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-400">
            Up to {formatBytes(INLINE_LIMIT_BYTES)} per file. Re-uploading a corrected file
            adds a version rather than replacing the original.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Client">
            <select
              className="input"
              value={client}
              onChange={(event) => setClient(event.target.value)}
            >
              <option value="">No client (firm-wide)</option>
              {(clients.data?.items ?? []).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.client_code} · {entry.trade_name || entry.legal_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              className="input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Unclassified</option>
              {CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Document type">
            <input
              className="input"
              value={docType}
              placeholder="bank_statement"
              onChange={(event) => setDocType(event.target.value)}
            />
          </Field>
          <Field label="Title">
            <input
              className="input"
              value={title}
              placeholder="Defaults to the file name"
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>

        {error && (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary px-5 py-2.5"
            disabled={upload.isPending || files.length === 0}
          >
            {upload.isPending ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

