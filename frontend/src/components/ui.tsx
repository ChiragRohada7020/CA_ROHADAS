"use client";

import { Children, cloneElement, createContext, useContext, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";

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
          <p className="text-[10px] font-medium text-hsl(var(--muted-foreground))">{label}</p>
          <p className={cn("tabular mt-0.5 text-xl font-semibold leading-tight", accent[tone])}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-hsl(var(--muted-foreground))">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <p className="text-xs font-semibold text-hsl(var(--muted-foreground)) uppercase tracking-wider">
        {label}
      </p>
      <p className={cn("tabular mt-1 text-2xl font-bold text-hsl(var(--foreground))")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-hsl(var(--muted-foreground))">{hint}</p>}
      {emphasis && value !== 0 && (
        <span className="mt-2 inline-block h-1 w-8 rounded-full bg-current opacity-40" />
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <p className="px-4 py-8 text-center text-sm text-hsl(var(--muted-foreground))">{label}</p>;
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
      <p role="alert" className="text-sm text-hsl(var(--destructive))">
        {message}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

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
        <p className="text-lg font-semibold text-hsl(var(--foreground))">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-hsl(var(--muted-foreground))">
          {message}
        </p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    );
  }
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-hsl(var(--muted-foreground))">{message}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
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
    <div className={cn("progress", className)}>
      <div
        className={cn("progress-bar", barClass(tone))}
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
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-hsl(var(--muted-foreground))"
          aria-hidden
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="input pl-8"
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
    <div className="flex items-center justify-between gap-3 border-t border-hsl(var(--border)) px-4 py-3">
      <p className="tabular text-xs text-hsl(var(--muted-foreground))">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-outline btn-sm disabled:opacity-50 disabled:pointer-events-none"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <span className="text-xs text-hsl(var(--muted-foreground))">
          Page {page}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-sm disabled:opacity-50 disabled:pointer-events-none"
          disabled={!hasMore}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

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
    <div className="page-header">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

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
    <div className="dialog-overlay">
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
          "dialog-content",
          width,
        )}
      >
        <div className="dialog-header">
          <div className="flex items-center justify-between">
            <h2 className="dialog-title">{title}</h2>
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
      className={cn("card", className)}
    >
      <div className="flex items-center gap-2 border-b border-hsl(var(--border)) px-4 py-2.5 text-sm font-semibold text-hsl(var(--muted-foreground))">
        {number !== undefined && <span className="tabular text-hsl(var(--muted-foreground))">{number}.</span>}
        {title}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ── Button ─────────────────────────────────────────────────────────────── */

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
          {loading && <span className="size-4 animate-pulse rounded-full border-2 border-current border-t-transparent" aria-hidden />}
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
      {loading && <span className="size-4 animate-pulse rounded-full border-2 border-current border-t-transparent" aria-hidden />}
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
    <label className="form-field">
      {label && <span className="label mb-1">{label}</span>}
      <input className={cn("input", error && "border-hsl(var(--destructive))", className)} {...props} />
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
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
    <label className="form-field">
      {label && <span className="label mb-1">{label}</span>}
      <textarea className={cn("input", error && "border-hsl(var(--destructive))", className)} {...props} />
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </label>
  );
}

/* ── Table primitives ────────────────────────────────────────────────────── */

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("table", className)}>{children}</table>;
}
export function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <thead className={cn("table-header", className)}>{children}</thead>;
}
export function TableBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn("divide-y divide-hsl(var(--border))", className)}>{children}</tbody>;
}
export function TableRow({ children, className, clickable, ...props }: { children: React.ReactNode; className?: string; clickable?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("table-row", clickable && "cursor-pointer", className)} {...props}>{children}</tr>;
}
export function TableHead({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("table-head", className)} {...props}>{children}</th>;
}
export function TableCell({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("table-cell", className)} {...props}>{children}</td>;
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */

export function Skeleton({ className, variant = "rectangular" }: { className?: string; variant?: "text" | "circular" | "rectangular" }) {
  const base = "animate-pulse bg-hsl(var(--muted))";
  const shape = variant === "circular" ? "rounded-full" : variant === "text" ? "rounded h-3" : "rounded-md";
  return <div className={cn(base, shape, className)} aria-hidden />;
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */

export function Tabs({ tabs, value, onChange }: { tabs: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "tabs-trigger",
            value === t.value ? "data-[state=active]" : "",
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
    <div className="dialog-overlay">
      <div className="w-full max-w-md dialog-content p-6 sm:p-6">
        <div className="dialog-header">
          <h3 className="dialog-title">{title}</h3>
        </div>
        <div className="mt-3 text-sm text-hsl(var(--foreground))">{description}</div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast system ────────────────────────────────────────────────────────── */

type ToastType = "success" | "error" | "warning" | "info";
interface ToastItem { id: string; type: ToastType; message: string; }

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
      <div className="toast">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            "toast-item",
            t.type === "success" && "toast-item-success",
            t.type === "error" && "toast-item-error",
            t.type === "warning" && "toast-item-warning",
            t.type === "info" && "toast-item-info",
          )}>
            <span className="flex shrink-0 items-center justify-center rounded-full bg-hsl(var(--background))/50 p-1.5">
              {t.type === "success" && <CheckCircle className="h-4 w-4 text-hsl(var(--success))" />}
              {t.type === "error" && <AlertCircle className="h-4 w-4 text-hsl(var(--destructive))" />}
              {t.type === "warning" && <AlertTriangle className="h-4 w-4 text-hsl(var(--warning))" />}
              {t.type === "info" && <Info className="h-4 w-4 text-hsl(var(--info))" />}
            </span>
            <p className="text-sm font-medium">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastContext.Provider");
  return ctx;
}

export function Toaster() {
  return null;
}
