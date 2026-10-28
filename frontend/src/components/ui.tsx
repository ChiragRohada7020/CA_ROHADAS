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
  style,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={cn("card", className)} style={style}>
      {title && (
        <header className="card-header">
          <div className="flex items-center gap-2">
            {icon}
            <div className="min-w-0">
              <h2 className="card-title">{title}</h2>
              {subtitle && <p className="card-subtitle">{subtitle}</p>}
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
    neutral: "text-slate-900 dark:text-slate-100",
    info: "text-sky-700 dark:text-sky-300",
    progress: "text-indigo-700 dark:text-indigo-300",
    warning: "text-amber-700 dark:text-amber-300",
    danger: "text-rose-700 dark:text-rose-300",
    success: "text-emerald-700 dark:text-emerald-300",
  };

  const chip: Record<Tone, string> = {
    neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    info: "bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-300",
    progress: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/25 dark:text-indigo-300",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300",
    danger: "bg-rose-50 text-rose-600 dark:bg-rose-900/25 dark:text-rose-300",
    success: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/25 dark:text-emerald-300",
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
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className={cn("tabular mt-0.5 text-2xl font-semibold leading-tight", accent[tone])}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <p className="section-title">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-semibold", accent[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      {emphasis && value !== 0 && (
        <span className="mt-2 inline-block h-1 w-8 rounded-full bg-current opacity-40" />
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{label}</p>;
}

export function ErrorState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p role="alert" className="text-sm text-rose-600">
        {message}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/**
 * The "nothing here" state.
 *
 * `title` is optional and `message` is required, so a caller cannot produce an empty
 * state that says nothing useful. The two-line form exists because "Coming soon" alone
 * tells a reader nothing about what will appear. An `action` gives the state a way
 * forward, which is the difference between "nothing here" and "nothing here yet".
 */
export function EmptyState({
  message,
  title,
  action,
}: {
  message: string;
  title?: string;
  action?: React.ReactNode;
}) {
  if (title) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{message}</p>
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    );
  }
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
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
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700", className)}>
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
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-slate-400 dark:text-slate-500"
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
    <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 px-4 py-3">
      <p className="tabular text-xs text-slate-500 dark:text-slate-400">
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
        <span className="text-xs text-slate-500 dark:text-slate-400">Page {page}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 sm:p-8 dark:bg-slate-950/60">
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
          "relative z-10 w-full max-w-2xl rounded-[10px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 flex flex-col max-h-[calc(100vh-4rem)]",
          width,
        )}
      >
        <div className="flex-shrink-0 border-b border-slate-200 dark:border-slate-700 px-5 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="overflow-y-auto">
          {children}
        </div>
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
      className={cn("scroll-mt-2 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", className)}
    >
      <h3 className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
        {number !== undefined && <span className="tabular text-slate-400 dark:text-slate-500">{number}.</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ── Button ─────────────────────────────────────────────────────────────── */

import { Children, cloneElement, useState } from "react";

/**
 * The one button. Every action in the app goes through this so that a primary
 * gradient, a ghosted toolbar control and a destructive action all read as the
 * same family.
 *
 * `asChild` lets a `<Link>` wear the button's classes without duplicating them —
 * the navigation target stays a real anchor, which is what screen readers and
 * the prefetcher expect. Only the class and the children are merged onto the
 * child; anything button-specific (`disabled`, `formAction`) is dropped, because
 * an anchor has no such concept.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconPosition = "left",
  asChild = false,
  children,
  className,
  disabled,
  ...props
}: {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass: Record<string, string> = {
    primary: "btn-primary",
    secondary: "btn-ghost",
    ghost: "btn-ghost",
    outline: "btn-outline",
    danger: "btn-danger",
    subtle: "btn-ghost",
  };
  const sizeClass: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "",
    lg: "px-4 py-2.5 text-base",
  };
  const cls = cn(variantClass[variant], sizeClass[size], className);

  if (asChild) {
    const child = Children.only(children) as React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    const childProps = child.props as React.HTMLAttributes<HTMLElement> & {
      className?: string;
      children?: React.ReactNode;
    };
    return cloneElement(child, {
      className: cn(cls, childProps.className),
      children: (
        <>
          {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {!loading && icon && iconPosition === "left" && icon}
          {childProps.children}
          {!loading && icon && iconPosition === "right" && icon}
        </>
      ),
    });
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cls}
    >
      {loading && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {!loading && icon && iconPosition === "left" && icon}
      {children}
      {!loading && icon && iconPosition === "right" && icon}
    </button>
  );
}

/* ── Input / Textarea ────────────────────────────────────────────────────── */

export function Input({
  label,
  hint,
  error,
  className,
  ...props
}: { label?: string; hint?: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="label mb-1">{label}</span>}
      <input className={cn("input", error && "border-rose-400", className)} {...props} />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </label>
  );
}

export function Textarea({
  label,
  hint,
  error,
  className,
  ...props
}: { label?: string; hint?: string; error?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="label mb-1">{label}</span>}
      <textarea className={cn("input", error && "border-rose-400", className)} {...props} />
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </label>
  );
}

/* ── Table primitives ────────────────────────────────────────────────────── */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full text-sm", className)}>{children}</table>;
}
export function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <thead className={cn("border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60", className)}>{children}</thead>;
}
export function TableBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn("divide-y divide-slate-100 dark:divide-slate-700/60", className)}>{children}</tbody>;
}
export function TableRow({ children, className, clickable, ...props }: { children: React.ReactNode; className?: string; clickable?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("dashboard-row", clickable && "cursor-pointer", className)} {...props}>{children}</tr>;
}
export function TableHead({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400", className)} {...props}>{children}</th>;
}
export function TableCell({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 py-3 text-slate-700 dark:text-slate-300", className)} {...props}>{children}</td>;
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

export function Skeleton({ className, variant = "rectangular" }: { className?: string; variant?: "text" | "circular" | "rectangular" }) {
  const base = "animate-pulse bg-slate-200 dark:bg-slate-700";
  const shape = variant === "circular" ? "rounded-full" : variant === "text" ? "rounded h-3" : "rounded-md";
  return <div className={cn(base, shape, className)} aria-hidden />;
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */

export function Tabs({ tabs, value, onChange }: { tabs: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "px-3 py-2 text-sm font-medium transition",
            value === t.value ? "border-b-2 border-sky-600 text-sky-700 dark:border-sky-500" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ── ConfirmDialog ───────────────────────────────────────────────────────── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "default";
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 dark:bg-slate-950/60">
      <div className="w-full max-w-md rounded-[10px] border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>{cancelText}</Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmText}</Button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast system ────────────────────────────────────────────────────────── */

type ToastType = "success" | "error" | "warning" | "info";
interface ToastItem { id: string; type: ToastType; message: string; }

import { createContext, useContext } from "react";
const ToastContext = createContext<{ push: (t: Omit<ToastItem, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function push(t: Omit<ToastItem, "id">) {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn("rounded-md px-4 py-2 text-sm text-white shadow-lg",
            t.type === "success" && "bg-emerald-600",
            t.type === "error" && "bg-rose-600",
            t.type === "warning" && "bg-amber-600",
            t.type === "info" && "bg-sky-600",
          )}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function Toaster() {
  return null;
}
