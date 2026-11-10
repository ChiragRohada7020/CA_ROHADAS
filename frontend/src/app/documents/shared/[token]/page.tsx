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
 * This remains a standalone, no-sign-in page with no app shell. The token endpoint
 * resolves exactly one document and streams its current version.
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

        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F8FD] px-5 py-16">
        <BackgroundGlow />
        <section
          aria-live="polite"
          className="relative w-full max-w-[440px] rounded-[24px] border border-[#E3E5F4] bg-white px-8 py-10 text-center shadow-[0_8px_32px_rgba(40,42,90,.06)]"
        >
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[#E9E3FF] bg-[#F4F0FF] text-[#6D3AE8]">
            <Icon name="file-text" className="h-6 w-6" />
          </div>
          <div className="mx-auto mt-6 h-2 w-28 overflow-hidden rounded-full bg-[#EEEAFB]">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-[#8055EA]" />
          </div>
          <h1 className="mt-5 text-[17px] font-bold tracking-[-.025em] text-[#171A32]">
            Preparing your document
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-[#747B98]">
            We’re securely retrieving the file shared by your firm.
          </p>
        </section>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F8FD] px-5 py-16">
        <BackgroundGlow />
        <section className="relative w-full max-w-[460px] rounded-[24px] border border-[#E3E5F4] bg-white px-8 py-10 text-center shadow-[0_8px_32px_rgba(40,42,90,.06)]">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[#F5DFE4] bg-[#FFF2F4] text-[#C34D68]">
            <Icon name="file-badge" className="h-6 w-6" />
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[.16em] text-[#C34D68]">
            Link unavailable
          </p>
          <h1 className="mt-2 text-[20px] font-bold tracking-[-.035em] text-[#171A32]">
            This document link can’t be opened
          </h1>
          <p className="mx-auto mt-3 max-w-[340px] text-[13px] leading-6 text-[#747B98]">
            {state.message}
          </p>
          <div className="mt-7 rounded-xl border border-[#EEF0F7] bg-[#FAFAFE] px-4 py-3 text-left">
            <div className="flex items-start gap-2.5">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 text-[#8A80B0]" />
              <p className="text-[11px] leading-5 text-[#747B98]">
                If you believe this link should work, contact the firm and request a new
                document link.
              </p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F8F8FD] px-5 py-16">
      <BackgroundGlow />
      <div className="relative w-full max-w-[480px]">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-[#6D3AE8] text-white shadow-[0_4px_12px_rgba(109,58,232,.22)]">
            <Icon name="documents" className="h-4 w-4" />
          </span>
          <span className="text-[14px] font-extrabold tracking-[-.04em] text-[#25213E]">
            ROHADAS <span className="font-medium text-[#8B83A7]">CA</span>
          </span>
        </div>

        <section className="overflow-hidden rounded-[24px] border border-[#E3E5F4] bg-white shadow-[0_10px_36px_rgba(40,42,90,.07)]">
          <div className="relative overflow-hidden border-b border-[#E9E5F8] bg-gradient-to-r from-[#F5F1FF] via-[#EDE9FF] to-[#E2DEFF] px-7 pb-7 pt-8 text-center">
            <div className="pointer-events-none absolute -right-8 -top-12 size-40 rounded-full bg-white/40 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-10 size-40 rounded-full bg-[#B9A6FF]/30 blur-2xl" />
            <div className="relative mx-auto flex size-[66px] items-center justify-center rounded-[20px] border border-white/80 bg-white/75 text-[#6D3AE8] shadow-[0_5px_18px_rgba(109,58,232,.10)]">
              <Icon name="file-text" className="h-8 w-8" />
              <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full border-2 border-[#EDE9FF] bg-[#6D3AE8] text-white">
                <Icon name="check-circle" className="h-3 w-3" />
              </span>
            </div>
            <p className="relative mt-5 text-[10px] font-bold uppercase tracking-[.17em] text-[#7657C2]">
              Secure document sharing
            </p>
            <h1 className="relative mt-2 text-[21px] font-extrabold tracking-[-.04em] text-[#171A32]">
              A document has been shared with you
            </h1>
            <p className="relative mx-auto mt-2 max-w-[330px] text-[12px] leading-5 text-[#6F7190]">
              Your firm has securely shared a file. It’s ready for you to download.
            </p>
          </div>

          <div className="px-6 pb-6 pt-5 sm:px-7">
            <div className="rounded-2xl border border-[#E8E8F3] bg-[#FCFBFF] p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#E9E3FF] bg-[#F1ECFF] text-[#6D3AE8]">
                  <Icon name="file-text" className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[13px] font-bold text-[#25213E]" title={state.fileName}>
                    {state.fileName}
                  </p>
                  <p className="mt-1 text-[11px] text-[#8589A3]">
                    Document <span className="mx-1 text-[#C5C4D4]">·</span> {formatBytes(state.size)}
                  </p>
                </div>
                <span className="rounded-lg border border-[#DDEFE6] bg-[#F0FAF4] px-2 py-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#39845A]">
                  Ready
                </span>
              </div>
            </div>

            <a
              href={state.url}
              download={state.fileName}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#6D3AE8] px-5 py-3 text-[13px] font-bold text-white shadow-[0_5px_14px_rgba(109,58,232,.22)] transition hover:bg-[#5D2FD0] hover:shadow-[0_7px_18px_rgba(109,58,232,.27)] focus:outline-none focus:ring-4 focus:ring-[#6D3AE8]/20"
            >
              <Icon name="download" className="h-[17px] w-[17px]" />
              Download document
            </a>

            <div className="mt-5 flex items-start justify-center gap-2 px-2">
              <Icon name="shield-check" className="mt-0.5 h-4 w-4 shrink-0 text-[#8B80B5]" />
              <p className="text-center text-[10px] leading-[18px] text-[#8A8EA6]">
                This is a secure, one-document link. If you weren’t expecting this file,
                don’t download it and contact the firm.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] tracking-[.01em] text-[#A0A2B5]">
          Shared privately by your accounting firm
        </p>
      </div>
    </main>
  );
}

function BackgroundGlow() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 top-[-110px] size-[340px] rounded-full bg-[#E8E1FF]/60 blur-[90px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-36 -right-24 size-[380px] rounded-full bg-[#E9E7FF]/70 blur-[100px]"
      />
    </>
  );
}

/** Pull the file name out of `Content-Disposition`, which the API always sets. */
function fileNameFrom(header: string | null): string {
  if (!header) return "document";
  const match = /filename="?([^";]+)"?/.exec(header);
  return match ? match[1] : "document";
}
