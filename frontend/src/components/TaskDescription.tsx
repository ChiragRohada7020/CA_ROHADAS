"use client";

import { useRef } from "react";

import { Icon } from "@/components/Icon";
import { cn } from "@/lib/format";

/**
 * The task description, as a small formatting surface.
 *
 * **This is not a rich-text editor, and it does not pretend to be one.** `description`
 * is a plain text column that half a dozen other screens render — the drawer beside the
 * task list, the client timeline, exported reports. Storing HTML in it would mean every
 * one of those had to start sanitising untrusted markup, and a description pasted from
 * an email would carry whatever the sender's editor put in it.
 *
 * So the toolbar writes **Markdown**, which is still plain text, and `DescriptionBody`
 * renders the subset back. The subset is deliberately small and written down:
 *
 * | Written          | Rendered as      |
 * |------------------|------------------|
 * | `**bold**`       | bold             |
 * | `*italic*`       | italic           |
 * | `__underline__`  | underline        |
 * | `` `code` ``     | inline code      |
 * | `[text](url)`    | a link           |
 * | `- item`         | a bullet list    |
 * | `1. item`        | a numbered list  |
 *
 * Underline has no Markdown spelling of its own — Markdown deliberately leaves it out,
 * because underlined text is indistinguishable from a link. It is included here anyway
 * because the toolbar offers it, and a button that does nothing is worse than one
 * documented deviation. It uses `__…__`, and nothing else in this app does.
 */

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\))/g;

/** What a wrap inserts when the selection is empty. */
const FALLBACKS: Record<string, string> = {
  bold: "bold text",
  italic: "italic text",
  underline: "underlined text",
  link: "link text",
};

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));

    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("__")) {
      nodes.push(<u key={key}>{token.slice(2, -2)}</u>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            // `noopener` matters: without it the opened page can reach back through
            // `window.opener` and rewrite this one.
            rel="noopener noreferrer"
            className="text-sky-700 underline underline-offset-2"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    cursor = start + token.length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** Renders the Markdown subset above. Anything outside it is shown literally. */
export function DescriptionBody({ text, className }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    const key = `p-${blocks.length}`;
    blocks.push(
      <p key={key} className="whitespace-pre-wrap">
        {renderInline(paragraph.join("\n"), key)}
      </p>,
    );
    paragraph = [];
  }

  function flushBullets() {
    if (bullets.length === 0) return;
    const key = `ul-${blocks.length}`;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-0.5">
        {bullets.map((item, index) => (
          <li key={index}>{renderInline(item, `${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  function flushNumbers() {
    if (numbers.length === 0) return;
    const key = `ol-${blocks.length}`;
    blocks.push(
      <ol key={key} className="ml-4 list-decimal space-y-0.5">
        {numbers.map((item, index) => (
          <li key={index}>{renderInline(item, `${key}-${index}`)}</li>
        ))}
      </ol>,
    );
    numbers = [];
  }

  for (const line of text.split("\n")) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);

    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1]);
      continue;
    }
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[1]);
      continue;
    }

    flushBullets();
    flushNumbers();
    if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushBullets();
  flushNumbers();

  if (blocks.length === 0) {
    return <p className={cn("text-sm italic text-slate-400", className)}>No description yet.</p>;
  }

  return <div className={cn("space-y-2 text-sm text-slate-700", className)}>{blocks}</div>;
}

/**
 * A textarea with a formatting toolbar.
 *
 * Every button edits the textarea's own selection through a ref rather than through
 * React state, because `selectionStart` is a property of the DOM node: reading it after
 * a re-render would give the position the caret had *before* the last keystroke.
 */
export function DescriptionEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function commit(next: string, selStart: number, selEnd: number) {
    onChange(next);
    // The DOM node catches up after React commits, so the selection is restored on the
    // next frame — setting it synchronously would be undone by the re-render.
    requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(selStart, selEnd);
    });
  }

  function wrap(before: string, after: string, fallbackKey: string) {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = element.value.slice(start, end) || FALLBACKS[fallbackKey];
    const next =
      element.value.slice(0, start) + before + selected + after + element.value.slice(end);
    commit(next, start + before.length, start + before.length + selected.length);
  }

  function prefixLines(prefix: string, numbered: boolean) {
    const element = ref.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;

    const lineStart = element.value.lastIndexOf("\n", Math.max(start - 1, 0)) + 1;
    const nextBreak = element.value.indexOf("\n", end);
    const lineEnd = nextBreak === -1 ? element.value.length : nextBreak;
    const block = element.value.slice(lineStart, lineEnd);

    const rewritten = block
      .split("\n")
      // Whatever list marker was already there is stripped first, so pressing the
      // button twice produces "item", not "- - item".
      .map(
        (line, index) =>
          `${numbered ? `${index + 1}. ` : prefix}${line.replace(/^\s*(?:[-*]|\d+\.)\s+/, "")}`,
      )
      .join("\n");

    const next = element.value.slice(0, lineStart) + rewritten + element.value.slice(lineEnd);
    commit(next, lineStart, lineStart + rewritten.length);
  }

  const button = "rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100";

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 focus-within:border-slate-400">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        <span className="px-2 text-xs text-slate-500">Normal</span>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-200" />
        <button
          type="button"
          className={cn(button, "font-bold")}
          title="Bold"
          aria-label="Bold"
          onClick={() => wrap("**", "**", "bold")}
        >
          B
        </button>
        <button
          type="button"
          className={cn(button, "italic")}
          title="Italic"
          aria-label="Italic"
          onClick={() => wrap("*", "*", "italic")}
        >
          I
        </button>
        <button
          type="button"
          className={cn(button, "underline")}
          title="Underline"
          aria-label="Underline"
          onClick={() => wrap("__", "__", "underline")}
        >
          U
        </button>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-200" />
        <button
          type="button"
          className={button}
          title="Bullet list"
          aria-label="Bullet list"
          onClick={() => prefixLines("- ", false)}
        >
          • List
        </button>
        <button
          type="button"
          className={button}
          title="Numbered list"
          aria-label="Numbered list"
          onClick={() => prefixLines("", true)}
        >
          1. List
        </button>
        <span aria-hidden="true" className="mx-1 h-4 w-px bg-slate-200" />
        <button
          type="button"
          className={cn(button, "inline-flex items-center gap-1")}
          title="Link"
          aria-label="Link"
          onClick={() => wrap("[", "](https://)", "link")}
        >
          <Icon name="link" className="h-3.5 w-3.5" />
        </button>
      </div>

      <textarea
        ref={ref}
        className="block w-full resize-y border-0 px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
