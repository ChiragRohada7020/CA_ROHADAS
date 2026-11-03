"use client";

import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

export function PageContainer({ children }: { children: React.ReactNode }) {
  return <div className="space-y-8">{children}</div>;
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground tracking-tight">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 border-b border-border pb-4 mb-6">
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  message,
  label,
  action,
  icon,
}: {
  title?: string;
  description?: string;
  message?: string;
  label?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const displayTitle = label ?? title;
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      {icon && (
        <div className="mb-4 p-3 rounded-xl bg-muted/50 text-muted-foreground">
          {icon}
        </div>
      )}
      {displayTitle && <h3 className="text-lg font-semibold text-foreground">{displayTitle}</h3>}
      {message || description && <p className="mt-2 text-sm text-muted-foreground max-w-sm">{message || description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function LoadingSkeleton({
  className,
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("animate-pulse rounded-md bg-hsl(var(--muted))", className)}>
      {label && <span className="text-xs text-hsl(var(--muted-foreground)) mt-2 block">{label}</span>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <AlertCircle className="h-8 w-8 text-destructive mb-2" />
      <h3 className="text-lg font-semibold text-foreground">Error</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm">{message}</p>
    </div>
  );
}
