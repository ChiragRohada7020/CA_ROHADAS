/**
 * Formatting helpers.
 *
 * The firm reasons in IST, and the backend already does every "how many days until"
 * calculation in IST (`today_local()`). The frontend therefore never recomputes a
 * deadline — it only renders what the API sent. That matters: a browser in another
 * timezone must not silently disagree with the firm about whether something is
 * overdue.
 */

const IST = "Asia/Kolkata";

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A calendar date from the API, e.g. `2026-05-15`.
 *
 * Formatted by splitting the string rather than through `Date`, because
 * `new Date("2026-05-15")` is parsed as UTC midnight and would render as the
 * previous day anywhere west of Greenwich. A due date is a calendar date, not an
 * instant, and must never shift.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  const monthLabel = MONTHS[Number(month) - 1] ?? month;
  return `${day} ${monthLabel} ${year}`;
}

/** A timestamp from the API, rendered in IST. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return DATE_TIME.format(parsed);
}

/** Short relative time, for activity feeds. */
export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/** `awaiting_client` → `Awaiting client`. */
export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Today's date **in IST**, as `YYYY-MM-DD`.
 *
 * Used to seed date-range inputs. The browser's own date is not good enough: a user
 * travelling, or a laptop with the wrong timezone, would default the calendar to the
 * wrong day — and the whole point of the compliance calendar is that the firm agrees
 * on which day it is.
 */
export function todayInIST(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/** Add days to a `YYYY-MM-DD` string, without timezone drift. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${Math.round(value * 60)}m`;
  return `${value.toFixed(1)}h`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Rupee amounts, grouped the Indian way (`₹1,25,000` not `₹125,000`).
 *
 * `null` is "no fee set" rather than zero — a service with no agreed fee and a
 * service costing nothing are different things, and the catalogue needs to show
 * which it is.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

/** `0.85` → `85%`. The API sends a percentage already, so this just rounds. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

/** Minimal class-name joiner, so no dependency is needed for conditional classes. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
