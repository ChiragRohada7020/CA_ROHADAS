"use client";

import { cn } from "@/lib/utils";

export function ProgressBar({
  percent,
  className,
  tone,
}: {
  percent: number;
  className?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info" | "progress";
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color =
    tone === "success" ? "bg-emerald-500" :
    tone === "warning" ? "bg-amber-500" :
    tone === "danger" ? "bg-rose-500" :
    tone === "info" || tone === "progress" ? "bg-blue-500" :
    "bg-primary";

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted/20", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-300", color)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
