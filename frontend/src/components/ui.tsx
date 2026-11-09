"use client";

import Link from "next/link";
import { Children, cloneElement, createContext, useContext, useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/format";

/** ── Button ── */
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
    primary: "bg-[#b85c38] text-white hover:bg-[#9a4a2d] shadow-sm",
    secondary: "bg-transparent text-[#1a1814] hover:bg-[#f0ede8]",
    ghost: "bg-transparent text-[#1a1814] hover:bg-[#f0ede8]",
    outline: "border border-[#e5e2dc] bg-transparent text-[#1a1814] hover:bg-[#f0ede8]",
    danger: "bg-[#ef4444] text-white hover:bg-[#dc2626]",
    subtle: "bg-transparent text-[#1a1814] hover:bg-[#f0ede8]",
  };
  const sizeClass: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs",
    md: "px-5 py-2.5 text-sm",
    lg: "px-4 py-2.5 text-base",
  };
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38] disabled:cursor-not-allowed disabled:opacity-50",
    variantClass[variant],
    sizeClass[size],
    className,
  );

  if (asChild) {
    const child = Children.only(children) as React.ReactElement<
      React.HTMLAttributes<HTMLElement>
    >;
    const childProps = child.props as React.HTMLAttributes<HTMLElement> & {
      className?: string;
      children?: React.ReactNode;
    };
    return cloneElement(child, {
      className: cn(cls, childProps.className),
      children: (
        <>
          {loading && (
            <span className="size-4 animate-pulse rounded-full border-2 border-current border-t-transparent" aria-hidden />
          )}
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
      {loading && (
        <span className="size-4 animate-pulse rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {!loading && icon && iconPosition === "left" && icon}
      {children}
      {!loading && icon && iconPosition === "right" && icon}
    </button>
  );
}

/** ── Card ── */
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
    <section className={cn("rounded-xl border border-[#e5e2dc] bg-white text-[#1a1814] shadow-sm", className)} style={style}>
      {title && (
        <header className="flex items-center justify-between border-b border-[#e5e2dc] px-6 py-4">
          <div className="flex items-center gap-2">
            {icon && (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0ede8] text-[#b85c38]">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[#1a1814]">{title}</h2>
              {subtitle && <p className="text-sm text-[#6b6357]">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className="p-6">{children}</div>
    </section>
  );
}

/** ── Badge ── */
export function Badge({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  const toneClass: Record<string, string> = {
    default: "border-[#b85c38]/20 bg-[#b85c38]/10 text-[#b85c38]",
    secondary: "border-[#e5e2dc]/20 bg-[#e5e2dc]/10 text-[#6b6357]",
    destructive: "border-[#ef4444]/20 bg-[#ef4444]/10 text-[#ef4444]",
    success: "border-[#16a36a]/20 bg-[#16a36a]/10 text-[#16a36a]",
    warning: "border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]",
    danger: "border-[#ef4444]/20 bg-[#ef4444]/10 text-[#ef4444]",
    info: "border-[#2583eb]/20 bg-[#2583eb]/10 text-[#2583eb]",
    neutral: "border-[#e5e2dc]/20 bg-[#e5e2dc]/10 text-[#6b6357]",
    progress: "border-[#b85c38]/20 bg-[#b85c38]/10 text-[#b85c38]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        toneClass[tone] || toneClass.default,
        className,
      )}
    >
      {children}
    </span>
  );
}

/** ── StatCard ── */
export function StatCard({
  title,
  value,
  hint,
  tone = "neutral",
  emphasis = false,
  icon,
}: {
  label?: string;
  value: number | string;
  hint?: string;
  tone?: string;
  emphasis?: boolean;
  icon?: React.ReactNode;
} & { title?: string }) {
  const label = title || value !== undefined ? "" : "";
  const accent: Record<string, string> = {
    neutral: "text-[#1a1814]",
    info: "text-[#2583eb]",
    progress: "text-[#b85c38]",
    warning: "text-[#f59e0b]",
    danger: "text-[#ef4444]",
    success: "text-[#16a36a]",
  };
  const chip: Record<string, string> = {
    neutral: "bg-[#f0ede8] text-[#b85c38]",
    info: "bg-[#eaf3ff] text-[#2583eb]",
    progress: "bg-[#b85c38]/10 text-[#b85c38]",
    warning: "bg-[#fff5df] text-[#f59e0b]",
    danger: "bg-[#feecec] text-[#ef4444]",
    success: "bg-[#e8f8f0] text-[#16a36a]",
  };

  if (icon) {
    return (
      <div className="rounded-xl border border-[#e5e2dc] bg-white text-[#1a1814] shadow-sm flex items-start gap-3 p-4">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            chip[tone] || chip.neutral,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-[#6b6357]">{title}</p>
          <p className={cn("tabular mt-0.5 text-xl font-semibold leading-tight truncate whitespace-nowrap overflow-hidden", accent[tone] || accent.neutral)}>
            {value}
          </p>
          {hint && <p className="mt-0.5 text-[11px] text-[#6b6357]">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#e5e2dc] bg-white text-[#1a1814] shadow-sm p-4">
      <p className="text-xs font-semibold text-[#6b6357] uppercase tracking-wider">
        {title}
      </p>
      <p className={cn("tabular mt-1 text-2xl font-bold text-[#1a1814]")}>
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-[#6b6357]">{hint}</p>}
      {emphasis && value !== 0 && (
        <span className="mt-2 inline-block h-1 w-8 rounded-full bg-current opacity-40" />
      )}
    </div>
  );
}

/** ── Input ── */
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
      <input
        className={cn(
          "flex h-10 w-full rounded-lg border border-[#e5e2dc] bg-[#f8f7f4] px-4 py-3 text-sm text-[#1a1814] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38] disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-[#ef4444]",
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-[#ef4444]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[#6b6357]">{hint}</p>
      ) : null}
    </label>
  );
}

/** ── Textarea ── */
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
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-[#e5e2dc] bg-[#f8f7f4] px-4 py-3 text-sm text-[#1a1814] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38] disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-[#ef4444]",
          className,
        )}
        {...props}
      />
      {error ? (
        <p className="mt-1 text-xs text-[#ef4444]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[#6b6357]">{hint}</p>
      ) : null}
    </label>
  );
}

/** ── Table primitives ── */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return <table className={cn("w-full text-sm caption-bottom text-[#1a1814]", className)}>{children}</table>;
}
export function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <thead className={cn("border-b border-[#e5e2dc]", className)}>{children}</thead>;
}
export function TableBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn("divide-y divide-[#e5e2dc]", className)}>{children}</tbody>;
}
export function TableRow({ children, className, clickable, ...props }: { children: React.ReactNode; className?: string; clickable?: boolean } & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-[#f0ede8]",
        clickable && "cursor-pointer",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}
export function TableHead({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 px-4 text-left align-middle font-medium text-[#6b6357] text-xs uppercase tracking-[0.08em]",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}
export function TableCell({ children, className, ...props }: { children?: React.ReactNode; className?: string } & React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-4 align-middle text-[#1a1814]", className)} {...props}>{children}</td>;
}

/** ── Tabs ── */
export function Tabs({ tabs, value, onChange }: { tabs: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#e5e2dc] bg-[#f0ede8]/30 p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === t.value
              ? "bg-[#b85c38] text-white"
              : "text-[#6b6357] hover:bg-[#f0ede8] hover:text-[#1a1814]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** ── Select ── */
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
      {label && !hideLabel && <span className="label mb-1">{label}</span>}
      <select
        className="flex h-10 w-full items-center justify-between rounded-lg border border-[#e5e2dc] bg-[#f8f7f4] px-4 py-3 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38] disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        style={{
          backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='1.5'%3e%3cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'%3e%3c/path%3e%3c/svg%3e\")",
          backgroundPosition: "right 0.5rem center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "1em 1em",
          paddingRight: "2.5rem",
        }}
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

/** ── SearchInput ── */
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
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[#6b6357]"
          aria-hidden
        >
          <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="9" cy="9" r="5.5" />
            <path d="M13.5 13.5L17 17" strokeLinecap="round" />
          </svg>
        </span>
        <input
          className="flex h-10 w-full rounded-lg border border-[#e5e2dc] bg-[#f8f7f4] px-4 py-3 text-sm text-[#1a1814] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b85c38] pl-8"
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

/** ── Pagination ── */
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
    <div className="flex items-center justify-between gap-3 border-t border-[#e5e2dc] px-4 py-3">
      <p className="tabular text-xs text-[#6b6357]">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium border border-[#e5e2dc] bg-white text-[#1a1814] hover:bg-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <span className="tabular text-xs text-[#6b6357]">Page {page}</span>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium border border-[#e5e2dc] bg-white text-[#1a1814] hover:bg-[#f0ede8] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasMore}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** ── ConfirmDialog ── */
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
    <div className="fixed inset-0 z-50 bg-[#1a1814]/30 backdrop-blur-sm">
      <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#e5e2dc] bg-white p-6 shadow-lg rounded-xl">
        <div className="flex flex-col space-y-1.5 px-6 py-1.5 text-center sm:text-left">
          <h3 className="text-xl font-semibold leading-none tracking-tight text-[#1a1814]">{title}</h3>
        </div>
        <div className="mt-3 text-sm text-[#1a1814]">{description}</div>
        <div className="mt-6 flex flex-row-reverse gap-2 px-6 py-1.5 sm:pb-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
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

/** ── Skeleton ── */
export function Skeleton({ className, variant = "rectangular" }: { className?: string; variant?: "text" | "circular" | "rectangular" }) {
  const base = "animate-pulse rounded-md bg-[#e5e2dc]";
  const shape =
    variant === "circular"
      ? "rounded-full"
      : variant === "text"
        ? "rounded h-3"
        : "rounded-md";
  return <div className={cn(base, shape, className)} aria-hidden />;
}

/** ── EmptyState ── */
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
        <p className="text-lg font-semibold text-[#1a1814]">{title}</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#6b6357]">
          {message}
        </p>
        {action && <div className="mt-6 flex justify-center">{action}</div>}
      </div>
    );
  }
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm text-[#6b6357]">{message}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

/** ── ErrorState ── */
export function ErrorState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-8 text-center">
      <p role="alert" className="text-sm text-[#ef4444]">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** ── LoadingState ── */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-[#6b6357]">{label}</p>
  );
}

/** ── ProgressBar ── */
export function ProgressBar({
  percent,
  tone = "progress",
  className,
}: {
  percent: number;
  tone?: string;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const toneColor: Record<string, string> = {
    default: "bg-[#b85c38]",
    success: "bg-[#16a36a]",
    warning: "bg-[#f59e0b]",
    danger: "bg-[#ef4444]",
    info: "bg-[#2583eb]",
    progress: "bg-[#b85c38]",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[#e5e2dc]/30", className)}>
      <div className={cn("h-full rounded-full transition-all duration-300", toneColor[tone] || toneColor.progress)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** ── PageHeader ── */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex flex-col gap-1">
        {subtitle && <p className="text-sm text-[#6b6357]">{subtitle}</p>}
        {title && <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1a1814]">{title}</h1>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
}

export { Children, cloneElement };

/** ── FilterBar ── */
export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4 mb-6">{children}</div>;
}

/** ── Modal ── */
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

  const width = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-xl", xl: "max-w-5xl" }[size];

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1814]/30 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border border-[#e5e2dc] bg-white p-6 shadow-lg rounded-xl",
          width,
        )}
      >
        <div className="flex flex-col space-y-1.5 px-6 py-1.5 text-center sm:text-left">
          <h2 className="text-xl font-semibold leading-none tracking-tight text-[#1a1814]">{title}</h2>
        </div>
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}

/** ── Toast system ── */
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
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={cn(
            "relative flex items-center gap-4 rounded-md border bg-white p-4 shadow-lg border-[#e5e2dc]",
            t.type === "success" && "border-[#16a36a] bg-[#e8f8f0] text-[#16a36a]",
            t.type === "error" && "border-[#ef4444] bg-[#feecec] text-[#ef4444]",
            t.type === "warning" && "border-[#f59e0b] bg-[#fff5df] text-[#f59e0b]",
            t.type === "info" && "border-[#2583eb] bg-[#eaf3ff] text-[#2583eb]",
          )}>
            <span className="flex shrink-0 items-center justify-center rounded-full bg-[#f8f7f4]/50 p-1.5">
              {t.type === "success" && <CheckCircle className="h-4 w-4 text-[#16a36a]" />}
              {t.type === "error" && <AlertCircle className="h-4 w-4 text-[#ef4444]" />}
              {t.type === "warning" && <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />}
              {t.type === "info" && <Info className="h-4 w-4 text-[#2583eb]" />}
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
