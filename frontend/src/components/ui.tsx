import { useEffect } from "react";

import { badgeClasses, barClass, type Tone } from "@/lib/status";
import { cn } from "@/lib/format";

/**
 * Re-exported from `form.tsx`, not redefined.
 *
 * `form.tsx` owns the interactive surface and says so. This exists only so a dialog
 * author has one import for the pieces a dialog is made of — `Modal`, `Section`, and the
 * `Field` inside them — instead of reaching into two modules for three things that
 * always travel together. The definition stays in one place.
 */
export { Field } from "./form";

export function Card({
  title,
  subtitle,
  action,
  icon,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {title && (
        <header className="card-header">
          <div className="flex items-center gap-2">
            {icon}
            <div className="min-w-0">
              <h2 className="card-title">{title}</h2>
              {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn(badgeClasses(tone), className)}>{children}</span>;
}

/**
 * A single headline figure.
 *
 * `hint` exists so a number is never left ambiguous — "Unverified deadlines" means
 * nothing without "statutory dates no person has confirmed".
 *
 * `icon` is optional. When given, the figure is laid out beside a tinted chip, which is
 * how the dashboard and the list screens present their totals. One component rather than
 * a copy per screen: three near-identical tiles drifting apart is exactly what makes an
 * app feel assembled rather than designed.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  emphasis = false,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
  emphasis?: boolean;
  icon?: React.ReactNode;
}) {
  const accent: Record<Tone, string> = {
    neutral: "text-slate-900",
    info: "text-sky-700",
    progress: "text-indigo-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
    success: "text-emerald-700",
  };

  const chip: Record<Tone, string> = {
    neutral: "bg-slate-100 text-slate-600",
    info: "bg-sky-50 text-sky-600",
    progress: "bg-indigo-50 text-indigo-600",
    warning: "bg-amber-50 text-amber-600",
    danger: "bg-rose-50 text-rose-600",
    success: "bg-emerald-50 text-emerald-600",
  };

  if (icon) {
    return (
      <div className="card flex items-start gap-3 p-4">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            chip[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={cn("tabular mt-0.5 text-2xl font-semibold leading-tight", accent[tone])}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <p className="section-title">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", accent[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {emphasis && value !== 0 && (
        <span className="mt-2 inline-block h-1 w-8 rounded-full bg-current opacity-40" />
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{label}</p>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="px-4 py-8 text-center text-sm text-rose-600">
      {message}
    </p>
  );
}

/**
 * The "nothing here" state.
 *
 * `title` is optional and `message` is required, so a caller cannot produce an empty
 * state that says nothing useful. The two-line form exists because "Coming soon" alone
 * tells a reader nothing about what will appear.
 */
export function EmptyState({ message, title }: { message: string; title?: string }) {
  if (title) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{message}</p>
      </div>
    );
  }
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{message}</p>;
}

export function ProgressBar({
  percent,
  tone = "progress",
  className,
}: {
  percent: number;
  tone?: Tone;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200", className)}>
      <div
        className={cn("h-full rounded-full", barClass(tone))}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** For a filter bar, where the placeholder already names the field. */
  hideLabel?: boolean;
}) {
  return (
    <label className="block">
      <span className={hideLabel ? "sr-only" : "label mb-1"}>{label}</span>
      <select
        className="select py-1.5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        <option value="">{placeholder ?? "All"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A search box with a leading icon.
 *
 * The icon is what distinguishes it from every other text input at a glance, which
 * matters on a screen that also has filter dropdowns beside it.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  hideLabel = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hideLabel?: boolean;
}) {
  return (
    <label className="block">
      <span className={hideLabel ? "sr-only" : "label mb-1"}>Search</span>
      <span className="relative block">
        <span
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400"
          aria-hidden
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="input py-1.5 pl-8"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type="search"
          aria-label="Search"
        />
      </span>
    </label>
  );
}

/**
 * Offset paging controls.
 *
 * Shows the range and the total so a partner always knows whether they are looking
 * at all of something or the first page of it — a list that silently truncates is
 * how work gets missed.
 */
export function Pagination({
  page,
  limit,
  total,
  hasMore,
  offset,
  onOffsetChange,
}: {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  offset: number;
  onOffsetChange: (offset: number) => void;
}) {
  if (total === 0) return null;
  const first = offset + 1;
  const last = Math.min(offset + limit, total);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
      <p className="tabular text-xs text-slate-500">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <span className="text-xs text-slate-500">Page {page}</span>
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          disabled={!hasMore}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * The heading of a screen.
 *
 * Every page uses this rather than writing its own `<h2>`, so titles sit at the same
 * size and baseline wherever you land. It deliberately carries no bottom margin: pages
 * already space their blocks with `space-y-4`, and adding a margin here made pages that
 * used this component 16px looser than pages that did not.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="page-title">{title}</h2>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * A dialog.
 *
 * Rendered inline rather than through a portal, because every caller already sits inside
 * the app shell and nothing here needs to escape a stacking context. `Escape` closes and
 * the page behind is frozen, which are the two things a hand-rolled overlay always
 * forgets.
 *
 * `size` widens the panel; the default is a comfortable form width.
 */
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: "md" | "lg" | "xl";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full max-w-2xl rounded-[10px] border border-[#E2E8F0] bg-white shadow-2xl",
          width,
        )}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-3">
          <h2 className="text-base font-semibold text-[#101B3D]">{title}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A titled block inside a dialog or a page.
 *
 * `number` is for the numbered sections of a wizard; `id` makes the heading an anchor,
 * so a numbered rail can link to it.
 */
export function Section({
  id,
  number,
  title,
  children,
  className,
}: {
  id?: string;
  number?: number;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-2 rounded-lg border border-slate-200 bg-white", className)}
    >
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
        {number !== undefined && <span className="tabular text-slate-400">{number}.</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}
