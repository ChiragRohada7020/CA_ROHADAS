import { cn } from "@/lib/format";

/**
 * Charts and circular chips.
 *
 * Hand-built SVG rather than a charting library. A donut is a few arcs and a circle;
 * pulling in a dependency for that would add a bundle, a version to track and a theming
 * system to fight, in exchange for nothing this needs.
 *
 * Every chart here states its own total, because a ring with no centre figure makes a
 * reader estimate — and estimating a number that is available exactly is a strange
 * thing to ask for.
 */

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  /** A Tailwind `stroke-*` colour class; the legend dot is derived from it. */
  className: string;
}

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A ring chart with a centre total and a legend.
 *
 * Segments are drawn with `stroke-dasharray` on concentric circles, rotated so the
 * first starts at twelve o'clock — where a reader expects to start, and where a gap is
 * least likely to be mistaken for a segment.
 *
 * A zero total renders an empty track rather than nothing, so "no work yet" and "the
 * chart failed to load" do not look the same.
 */
export function DonutChart({
  segments,
  total,
  totalLabel,
  size = 168,
  thickness = 14,
  className,
}: {
  segments: DonutSegment[];
  total: number;
  totalLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const drawable = segments.filter((segment) => segment.value > 0);
  let offset = 0;

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          role="img"
          aria-label={totalLabel ?? "Total"}
        >
          <g transform="rotate(-90 50 50)">
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              strokeWidth={thickness}
              className="stroke-slate-200 dark:stroke-slate-700"
            />
            {drawable.map((segment) => {
              const fraction = total > 0 ? segment.value / total : 0;
              const length = fraction * CIRCUMFERENCE;
              const dash = `${length} ${CIRCUMFERENCE - length}`;
              const element = (
                <circle
                  key={segment.key}
                  cx="50"
                  cy="50"
                  r={RADIUS}
                  fill="none"
                  strokeWidth={thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  className={segment.className}
                >
                  <title>{`${segment.label}: ${segment.value}`}</title>
                </circle>
              );
              offset += length;
              return element;
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-slate-900 dark:text-slate-100">{total}</span>
          {totalLabel && (
            <span className="mt-0.5 max-w-[6rem] text-center text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              {totalLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="min-w-[10rem] flex-1 space-y-2">
        {segments.map((segment) => {
          const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          return (
            <li key={segment.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <span
                  aria-hidden="true"
                  className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass(segment.className))}
                />
                {segment.label}
              </span>
              <span className="tabular text-slate-700 dark:text-slate-300">
                {segment.value}
                <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">({percent}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** `stroke-emerald-500` → `bg-emerald-500`, so the legend dot matches its arc. */
function dotClass(strokeClass: string): string {
  return strokeClass.replace(/^stroke-/, "bg-");
}

/**
 * A circular tinted icon — the coloured "ball" beside a statistic.
 *
 * `tone` picks the wash and the glyph inherits it, so a chip cannot end up with a blue
 * circle around a red icon.
 */
const CHIP_TONES: Record<string, string> = {
  danger: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800",
  warning: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-900/20 dark:text-amber-300 dark:ring-amber-800",
  info: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:ring-sky-800",
  progress: "bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:ring-indigo-800",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
  violet: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-900/20 dark:text-violet-300 dark:ring-violet-800",
} as const;

export type ChipTone = keyof typeof CHIP_TONES;

export function IconChip({
  tone = "neutral",
  size = "md",
  children,
}: {
  tone?: ChipTone;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}) {
  const dimensions = {
    sm: "h-7 w-7 text-[13px]",
    md: "h-10 w-10 text-base",
    lg: "h-11 w-11 text-lg",
  }[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
        CHIP_TONES[tone],
        dimensions,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A change since a comparison point, e.g. "↓ 3 from last week".
 *
 * `goodDirection` decides the colour, not the sign: three fewer overdue tasks is an
 * improvement and must not be painted red merely because the number fell. Where there
 * is no honest comparison, the caller renders nothing — an invented trend is worse than
 * a missing one, because it looks like information.
 */
export function TrendPill({
  delta,
  comparedTo,
  goodDirection = "down",
}: {
  delta: number;
  comparedTo?: string;
  goodDirection?: "up" | "down" | "none";
}) {
  if (delta === 0) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">
        No change{comparedTo ? ` ${comparedTo}` : ""}
      </span>
    );
  }

  const rising = delta > 0;
  const good =
    goodDirection === "none"
      ? false
      : (rising && goodDirection === "up") || (!rising && goodDirection === "down");

  return (
    <span
      className={cn("text-xs font-medium", good ? "text-emerald-600" : "text-rose-600")}
      title={`${rising ? "+" : ""}${delta}${comparedTo ? ` ${comparedTo}` : ""}`}
    >
      {rising ? "↑" : "↓"} {Math.abs(delta)}
      {comparedTo && <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">{comparedTo}</span>}
    </span>
  );
}

/** A thin progress bar, for utilisation and share-of-total columns. */
export function MiniBar({
  percent,
  className,
  trackClassName,
}: {
  percent: number;
  className?: string;
  trackClassName?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700", trackClassName)}>
      <div
        className={cn("h-full rounded-full", className ?? "bg-slate-400 dark:bg-slate-500")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** A small round monogram. The colour is derived from the name, so it is stable. */
const AVATAR_TONES = [
  "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Hash the name so the same person keeps the same colour between renders and reloads,
  // rather than a colour that changes on every paint.
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 997;
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[hash % AVATAR_TONES.length],
        size === "sm" ? "h-7 w-7 text-[11px]" : "h-9 w-9 text-xs",
      )}
      title={name}
    >
      {initials || "?"}
    </span>
  );
}
