"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Separator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement> & {
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
    className?: string;
  }
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <hr
    ref={ref}
    aria-orientation={orientation}
    role={decorative ? "none" : "separator"}
    className={cn(
      "shrink-0 border-border",
      orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
      className,
    )}
    {...props}
  />
));
Separator.displayName = "Separator";

export { Separator };
