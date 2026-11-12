import { cn } from "@/lib/format";
import { Button } from "./ui";

/**
 * Shared form primitives.
 *
 * Validation remains API-driven: these components display server errors but do not
 * duplicate identifier, workflow, or permission validation in the browser.
 */

const fieldControl =
  "flex w-full rounded-xl border border-[#E3E5F4] bg-white px-3.5 text-sm text-[#171A32] shadow-[0_1px_2px_rgba(40,42,90,.025)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[#A1A6BA] hover:border-[#CFC8ED] focus:border-[#8B6BE8] focus:ring-4 focus:ring-[#7543E9]/[0.10] disabled:cursor-not-allowed disabled:bg-[#F6F6FB] disabled:text-[#9298AE] disabled:opacity-80";

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold tracking-[0.01em] text-[#454B68]">
        {label}
        {required && (
          <span aria-hidden="true" className="text-[#C34D68]">
            *
          </span>
        )}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-[#C34D68]">
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="mt-0.5 h-3.5 w-3.5 shrink-0">
            <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.8v3.7M8 11.1v.1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error}
        </span>
      ) : (
        hint && <span className="mt-1.5 block text-xs leading-5 text-[#9298AE]">{hint}</span>
      )}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  placeholder,
  type = "text",
  maxLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  type?: "text" | "email" | "date" | "number" | "tel" | "password";
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <input
        className={cn(
          fieldControl,
          "h-11",
          error && "border-[#E7A7B4] bg-[#FFFAFB] focus:border-[#C34D68] focus:ring-[#C34D68]/10",
        )}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={!!error}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  error,
  rows = 3,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string | null;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <textarea
        className={cn(
          fieldControl,
          "min-h-[104px] resize-y py-3 leading-6",
          error && "border-[#E7A7B4] bg-[#FFFAFB] focus:border-[#C34D68] focus:ring-[#C34D68]/10",
        )}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={!!error}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  error,
  required,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string;
  error?: string | null;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        <select
          className={cn(
            fieldControl,
            "h-11 appearance-none pr-10",
            error && "border-[#E7A7B4] bg-[#FFFAFB] focus:border-[#C34D68] focus:ring-[#C34D68]/10",
          )}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          aria-invalid={!!error}
        >
          <option value="">{placeholder ?? "Select an option"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#858BA5]"
        >
          <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-3 rounded-xl border border-[#E9E7F5] bg-[#FCFBFF] px-3.5 py-3 transition-colors hover:border-[#D7CFF2] hover:bg-[#F8F5FF]">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-[#C9C5DC] text-[#6D3AE8] accent-[#6D3AE8] focus:ring-2 focus:ring-[#7543E9]/25 focus:ring-offset-2 focus:ring-offset-[#FCFBFF]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#343A58]">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-5 text-[#9298AE]">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * API error banner. Pydantic field-level details are surfaced when available.
 */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;

  const message = error instanceof Error ? error.message : String(error);
  const details =
    error && typeof error === "object" && "details" in error
      ? (error as { details?: Record<string, unknown> | null }).details
      : null;
  const fieldErrors = Array.isArray(details?.errors)
    ? (details.errors as Array<{ loc?: unknown[]; msg?: string }>)
    : [];

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-[#F1D5DC] bg-[#FFF8FA] px-4 py-3 text-sm text-[#A83D58] shadow-[0_2px_8px_rgba(160,50,80,.035)]"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FCE9EE] text-[#C34D68]">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path d="M10 2.5 18 17H2L10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M10 7v4.5M10 14.2v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-5">{message}</p>
        {fieldErrors.length > 0 && (
          <ul className="mt-2 space-y-1 border-t border-[#F1DDE2] pt-2 text-xs leading-5">
            {fieldErrors.map((item, index) => (
              <li key={index} className="flex flex-wrap gap-x-1.5">
                <span className="font-mono font-semibold text-[#8F344C]">
                  {Array.isArray(item.loc)
                    ? item.loc.filter((part) => part !== "body").join(".")
                    : "field"}
                </span>
                <span>{item.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-xl border border-[#CDE9D8] bg-[#F4FBF6] px-4 py-3 text-sm font-medium text-[#23764A]"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#E1F4E8]">
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path d="m4.5 10.2 3.6 3.5 7.4-7.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {message}
    </div>
  );
}

export function FormActions({
  submitLabel,
  busy,
  onCancel,
  disabled,
  className,
}: {
  submitLabel: string;
  busy?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2.5 border-t border-[#EEF0F7] pt-4", className)}>
      <Button type="submit" variant="primary" size="sm" disabled={busy || disabled}>
        {busy && (
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="mr-2 inline-block h-4 w-4 animate-spin">
            <circle cx="10" cy="10" r="7" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
            <path d="M17 10a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
        {busy ? "Saving…" : submitLabel}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      )}
    </div>
  );
}

/**
 * Compact label-and-control row for side panels.
 */
export function PanelRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#F0F0F7] py-3 last:border-b-0">
      <span className="w-28 shrink-0 pt-1 text-xs font-medium text-[#747B98]">
        {label}
        {hint && <span className="mt-1 block text-[10px] font-normal leading-4 text-[#A0A5B8]">{hint}</span>}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right text-sm text-[#343A58]">
        {children}
      </span>
    </div>
  );
}

/** Read-only identifier chip. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-lg border border-[#E6E1F5] bg-[#F6F2FF] px-2.5 py-1.5 font-mono text-[11px] font-medium leading-4 text-[#6540B8]">
      {children}
    </span>
  );
}
