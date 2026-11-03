"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary",
        secondary:
          "border-secondary/20 bg-secondary/10 text-secondary-foreground",
        destructive:
          "border-destructive/20 bg-destructive/10 text-destructive",
        outline: "border-input text-foreground",
        success:
          "border-brand-success/20 bg-brand-success/10 text-brand-success",
        warning:
          "border-brand-warning/20 bg-brand-warning/10 text-brand-warning",
        danger:
          "border-brand-danger/20 bg-brand-danger/10 text-brand-danger",
        info:
          "border-brand-info/20 bg-brand-info/10 text-brand-info",
        neutral:
          "border-muted/20 bg-muted/10 text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-0.5",
        sm: "px-2 py-0.5",
        lg: "px-3.5 py-1",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "danger" | "info" | "neutral" | "progress";
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, size, tone, ...props }, ref) => {
  const resolvedVariant = tone === "progress" ? "info" : (tone ?? variant ?? "default");
  return (
    <span ref={ref} className={cn(badgeVariants({ variant: resolvedVariant, size }), className)} {...props} />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };
