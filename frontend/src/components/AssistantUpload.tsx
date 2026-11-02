"use client";

import { useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { formatBytes } from "@/lib/format";

/**
 * Attach files to the current assistant conversation.
 *
 * Files are uploaded to ``POST /api/assistant/upload`` which extracts their
 * text and stashes it in the session store. The model only "reads" what it is
 * given, so the extracted text travels with the next message — the user does
 * not need to paste anything.
 *
 * This is a focused, always-visible control (a paperclip + hidden file input)
 * rather than a modal: the assistant is a conversation, and attachments belong
 * in the input bar, exactly like a chat client.
 */
export function AssistantUpload({
  sessionId,
  onUploaded,
  disabled,
}: {
  sessionId: string | null;
  onUploaded: (file: { id: string; name: string; size_bytes: number; mime_type: string; extracted_chars: number }, sessionId: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        if (sessionId) form.append("session_id", sessionId);
        const res = await api.upload<{
          session_id: string;
          file: { id: string; name: string; size_bytes: number; mime_type: string; extracted_chars: number };
        }>("/assistant/upload", form);
        onUploaded(res.file, res.session_id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setPending(false);
      // Reset so the same file can be re-chosen after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={onChange}
        disabled={disabled || pending}
        className="hidden"
        aria-label="Attach files to the conversation"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || pending}
        title="Attach files (PDF, Word, spreadsheet, or text)"
        className="flex h-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        <Icon name="paperclip" className="h-4 w-4" />
      </button>
      {pending && <span className="text-[10px] text-slate-400">Uploading…</span>}
      {error && <span className="text-[10px] text-rose-600">{error}</span>}
    </div>
  );
}