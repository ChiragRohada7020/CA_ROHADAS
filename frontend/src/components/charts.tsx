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
  activeKey,
  onSegmentClick,
}: {
  segments: DonutSegment[];
  total: number;
  totalLabel?: string;
  size?: number;
  thickness?: number;
  className?: string;
  activeKey?: string | null;
  onSegmentClick?: (key: string) => void;
}) {
  const drawable = segments.filter((segment) => segment.value > 0);
  let offset = 0;

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6 sm:items-start", className)}>
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
              className="stroke-slate-200"
            />
            {drawable.map((segment) => {
              const fraction = total > 0 ? segment.value / total : 0;
              const length = fraction * CIRCUMFERENCE;
              const dash = `${length} ${CIRCUMFERENCE - length}`;
              const isActive = activeKey === segment.key;
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
                  className={cn(
                    segment.className,
                    isActive ? "ring-2 ring-current" : "transition-all duration-200 hover:brightness-90 hover:opacity-90",
                  )}
                  style={{
                    cursor: onSegmentClick ? "pointer" : "default",
                    opacity: activeKey !== null && activeKey !== segment.key ? 0.35 : 1,
                  }}
                  onClick={() => onSegmentClick?.(segment.key)}
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
          <span className="tabular text-3xl font-black text-slate-900">{total}</span>
          {totalLabel && (
            <span className="mt-1 max-w-[7rem] text-center text-[12px] leading-tight text-slate-500 font-medium tracking-tight">
              {totalLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="min-w-[10rem] space-y-2.5">
        {segments.map((segment) => {
          const percent = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          const isActive = activeKey === segment.key;
          return (
            <li
              key={segment.key}
              className={cn(
                "flex items-center justify-between gap-3 text-sm cursor-pointer transition-all duration-150",
                isActive ? "bg-slate-50 rounded-lg p-1" : "hover:bg-slate-50 hover:rounded-lg hover:p-1",
              )}
              onClick={() => onSegmentClick?.(segment.key)}
            >
              <span className={cn("flex items-center gap-2.5 text-slate-600", isActive ? "font-medium text-slate-900" : "font-medium")}>
                <span
                  aria-hidden="true"
                  className={cn("h-3 w-3 shrink-0 rounded-full", dotClass(segment.className), isActive ? "ring-2 ring-white ring-offset-1" : "")}
                />
                <span className={cn(isActive ? "text-slate-900" : "text-slate-700")}>
                  {segment.label}
                </span>
              </span>
              <span className={cn("tabular", isActive ? "text-slate-900 font-black" : "text-slate-700 font-medium")}>
                {segment.value}
                <span className="ml-1 text-xs text-slate-400 font-medium">({percent}%)</span>
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
  danger: "bg-rose-50 text-rose-600 ring-rose-100",
  warning: "bg-amber-50 text-amber-600 ring-amber-100",
  info: "bg-sky-50 text-sky-600 ring-sky-100",
  progress: "bg-indigo-50 text-indigo-600 ring-indigo-100",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
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
      <span className="text-xs text-slate-500">
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
      {comparedTo && <span className="ml-1 font-normal text-slate-500">{comparedTo}</span>}
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
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-200", trackClassName)}>
      <div
        className={cn("h-full rounded-full", className ?? "bg-slate-400")}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** A small round monogram. The colour is derived from the name, so it is stable. */
const AVATAR_TONES = [
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
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
