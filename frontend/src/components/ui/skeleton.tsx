"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Skeleton = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "text" | "circular" | "rectangular";
    className?: string;
  }
>(({ className, variant = "rectangular", ...props }, ref) => {
  const styles = {
    text: "h-4 w-24",
    circular: "h-8 w-8 rounded-full",
    rectangular: "h-4 w-32 rounded-sm",
  };

  return (
    <span
      ref={ref}
      role="status"
      aria-label="loading"
      className={cn(
        "animate-pulse rounded-md bg-muted",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
});
Skeleton.displayName = "Skeleton";

export { Skeleton };
