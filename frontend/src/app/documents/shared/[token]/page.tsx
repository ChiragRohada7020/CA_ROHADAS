"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Icon } from "@/components/Icon";
import { formatBytes } from "@/lib/format";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; url: string; fileName: string; size: number };

/**
 * A document, opened from the link the firm sent.
 *
 * No sign-in and no app shell. The endpoint behind it resolves exactly one document from
 * a 256-bit token and streams that document's current version; there is nothing else
 * reachable from here and no way to enumerate.
 *
 * The file is fetched as a blob rather than linked directly, so a withdrawn, expired or
 * used-up link can say so in words instead of dropping the visitor onto a bare 404 from
 * the API. The download button then uses the fetched blob, not the API URL — otherwise
 * one visit would count as two opens.
 *
 * Note what the counter counts: the endpoint records a `share_link_open` and increments
 * `download_count` per request, so a link's limit is a limit on *opens*, not on clicks
 * of the download button.
 */
export default function SharedDocumentPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/documents/shared/${token}`);
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          if (!cancelled) {
            setState({
              kind: "error",
              message:
                body?.error?.message ??
                "This document link is not valid. Please ask the firm for a current link.",
            });
          }
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) return;
        setState({
          kind: "ready",
          url: objectUrl,
          fileName: fileNameFrom(response.headers.get("content-disposition")),
          size: blob.size,
        });
      } catch {
        if (!cancelled) {
          setState({
            kind: "error",
            message: "Could not reach the server. Check your connection and try again.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      // Revoke, or the blob stays alive for the life of the tab.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <p className="text-sm text-slate-500">Loading your document…</p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-lg font-semibold text-slate-900">This document link is not valid</h1>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-24">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <span
          aria-hidden
          className="mx-auto flex size-12 items-center justify-center rounded-full bg-sky-50 text-sky-600"
        >
          <Icon name="file-text" className="h-6 w-6" />
        </span>
        <h1 className="mt-3 text-base font-semibold text-slate-900">A document has been shared with you</h1>
        <p className="mt-1 text-sm text-slate-600">
          <span className="font-medium text-slate-800">{state.fileName}</span>
          {" · "}
          {formatBytes(state.size)}
        </p>
        <a
          href={state.url}
          download={state.fileName}
          className="btn-primary mt-5 inline-flex"
        >
          <Icon name="download" className="h-4 w-4" />
          Download
        </a>
        <p className="mt-4 text-xs text-slate-400">
          If you were not expecting this, ignore the link and tell the firm.
        </p>
      </div>
    </div>
  );
}

/** Pull the file name out of `Content-Disposition`, which the API always sets. */
function fileNameFrom(header: string | null): string {
  if (!header) return "document";
  const match = /filename="?([^";]+)"?/.exec(header);
  return match ? match[1] : "document";
}
