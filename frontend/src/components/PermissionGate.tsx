/**
 * PermissionGate — conditionally render children based on the current user's
 * effective permissions.
 *
 * Usage:
 *   <PermissionGate code="invoice.read">
 *     <InvoiceList />
 *   </PermissionGate>
 *
 * When `fallback` is provided and the permission is denied, the fallback is
 * rendered instead. Otherwise the component renders nothing.
 */
"use client";

import { ReactNode } from "react";

import { canSee } from "@/lib/session";
import { useSession } from "@/lib/session";

interface Props {
  code: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGate({ code, children, fallback }: Props) {
  const { data: session, isPending } = useSession();

  // While loading, render children to avoid flicker — the permission check is
  // not a security boundary (the backend enforces), just a UX hint.
  if (isPending) {
    return <>{children}</>;
  }

  if (canSee(session, code)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
}

/**
 * SectionTitle — a small wrapper that shows a locked icon when the user lacks
 * the permission to see a section.
 */
interface SectionTitleProps {
  code: string;
  title: string;
}

export function SectionTitle({ code, title }: SectionTitleProps) {
  const { data: session, isPending } = useSession();

  if (isPending || canSee(session, code)) {
    return <h2 className="text-lg font-semibold text-slate-900 mb-4">{title}</h2>;
  }

  return (
    <div className="flex items-center gap-2 text-slate-400 mb-4">
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs bg-slate-100 px-2 py-0.5 rounded">No access</span>
    </div>
  );
}
