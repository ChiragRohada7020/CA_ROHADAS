import type { ReactNode } from "react";

/**
 * A small Markdown renderer for the assistant's answers.
 *
 * The model answers in Markdown - headings, bold, lists, and *tables* - and the
 * previous UI dropped all of it into a `<pre>` in a monospace font, which is why
 * a compliance summary arrived as a wall of pipes and asterisks.
 *
 * Deliberately hand-written rather than pulling in a Markdown library: the
 * subset the assistant actually emits is small and predictable, and a parser
 * plus its plugin chain would be a large dependency to render it. Anything not
 * recognised falls through as plain text, so an unexpected construct degrades to
 * readable prose instead of disappearing.
 */

const HEADING_CLASSES: Record<number, string> = {
  1: "mt-4 mb-2 text-lg font-semibold tracking-tight text-slate-900 first:mt-0",
  2: "mt-4 mb-1.5 text-base font-semibold tracking-tight text-slate-900 first:mt-0",
  3: "mt-3 mb-1 text-sm font-semibold text-slate-800 first:mt-0",
};

/** `**bold**`, `` `code` ``, `*italic*`, `[label](href)` - in one pass. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  const parts = text.split(pattern);

  return parts.filter((part) => part !== "").map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-slate-800"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return (
        <a
          key={key}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-800"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
}

function Table({ rows, keyPrefix }: { rows: string[][]; keyPrefix: string }) {
  const [header, ...body] = rows;
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50">
          <tr>
            {header.map((cell, index) => (
              <th
                key={index}
                className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {renderInline(cell, `${keyPrefix}-h-${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-slate-100">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2 align-top text-slate-700">
                  {renderInline(cell, `${keyPrefix}-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AssistantMarkdown({ content }: { content: string }) {
  const lines = (content ?? "").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const key = `b${index}`;

    // Blank line: block separator.
    if (!line.trim()) {
      index += 1;
      continue;
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key} className="my-4 border-slate-200" />);
      index += 1;
      continue;
    }

    // Table: a pipe row followed by a separator row.
    if (line.trim().startsWith("|") && isSeparatorRow(lines[index + 1] ?? "")) {
      const rows: string[][] = [splitRow(line)];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      blocks.push(<Table key={key} rows={rows} keyPrefix={key} />);
      continue;
    }

    // Heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const Tag = `h${level}` as "h1" | "h2" | "h3";
      blocks.push(
        <Tag key={key} className={HEADING_CLASSES[level]}>
          {renderInline(heading[2], key)}
        </Tag>,
      );
      index += 1;
      continue;
    }

    // Bullet list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={key} className="my-2 space-y-1 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span aria-hidden className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
              <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={key} className="my-2 space-y-1 pl-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold tabular text-sky-600">
                {itemIndex + 1}
              </span>
              <span>{renderInline(item, `${key}-${itemIndex}`)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote
          key={key}
          className="my-3 border-l-2 border-sky-300 bg-sky-50/50 py-2 pl-3 pr-2 text-sm text-slate-700"
        >
          {quoted.map((item, itemIndex) => (
            <p key={itemIndex}>{renderInline(item, `${key}-${itemIndex}`)}</p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Paragraph: consecutive plain lines.
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[index]) &&
      !lines[index].trim().startsWith("|") &&
      !/^(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*[-*+]\s+/.test(lines[index]) &&
      !/^\s*\d+[.)]\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={key} className="my-2 text-sm leading-relaxed text-slate-700 first:mt-0">
        {renderInline(paragraph.join(" "), key)}
      </p>,
    );
  }

  return <div className="max-w-none">{blocks}</div>;
}

