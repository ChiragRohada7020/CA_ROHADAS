import { cn } from "@/lib/format";

/**
 * Form inputs.
 *
 * Kept separate from `ui.tsx` (which is display-only) so the interactive surface is
 * in one place.
 *
 * Every field takes `error` rather than rendering its own validation message. The API
 * is the only validator in this system — identifier checks, workflow guards and
 * permission rules all live server-side — so the form's job is to show what the API
 * said, next to the field it complained about where the API identifies one.
 */

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
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-700">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
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
          "input",
          error && "border-rose-300 focus:border-rose-400 focus:ring-rose-100 dark:focus:ring-rose-900/50",
        )}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
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
        className="input"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
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
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={disabled}
      >
        <option value="">{placeholder ?? "—"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300 dark:border-slate-600 dark:text-sky-500 dark:focus:ring-sky-800/50"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className="block text-sm text-slate-800 dark:text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * An error from the API, shown as a banner.
 *
 * When the API returns field-level details (`details.errors`, which is what Pydantic
 * produces) they are listed too — "The request payload failed validation" on its own
 * tells the user nothing about which field was wrong.
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
      className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/20 dark:ring-rose-800"
    >
      <p className="font-medium">{message}</p>
      {fieldErrors.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
          {fieldErrors.map((item, index) => (
            <li key={index}>
              <span className="font-mono">
                {Array.isArray(item.loc)
                  ? item.loc.filter((part) => part !== "body").join(".")
                  : "field"}
              </span>
              {": "}
              {item.msg}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-200">
      {message}
    </div>
  );
}

export function FormActions({
  submitLabel,
  busy,
  onCancel,
  disabled,
}: {
  submitLabel: string;
  busy?: boolean;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="submit" className="btn-primary" disabled={busy || disabled}>
        {busy ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      )}
    </div>
  );
}

/**
 * A label-and-control row for a side panel.
 *
 * The label column is fixed-width and the control takes the rest, so a stack of these
 * lines up into a column of values — which is the whole point of the panel they are
 * used in. `FormActions` above is for a form laid out in a grid; this is for the
 * narrow rail beside one, where a grid would wrap unpredictably.
 *
 * Lives here rather than beside either panel because the task screen and the create
 * screen both draw one, and two copies would drift.
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
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="w-28 shrink-0 pt-1.5 text-xs text-slate-500 dark:text-slate-400">
        {label}
        {hint && <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">{children}</span>
    </div>
  );
}

/** A read-only value chip, for identifiers that are looked at rather than typed. */
export function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </span>
  );
}
