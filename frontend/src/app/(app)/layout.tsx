"use client";

import "../globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { AppSidebar } from "@/components/AppSidebar";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useSession, useSignOut } from "@/lib/session";
import type { FinancialYearRow, FirmBillingSettings } from "@/lib/types";

interface NavItem {
  href?: string;
  label: string;
  icon: string;
  ready?: boolean;
  permission?: string | null;
  children?: NavItem[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", ready: true, permission: null },
  { href: "/clients", label: "Clients", icon: "clients", ready: true, permission: "client.read" },
  { href: "/tasks", label: "Tasks", icon: "tasks", ready: true, permission: "task.read" },
  { href: "/calendar", label: "Compliance", icon: "compliance", ready: true, permission: "compliance.read" },
  { href: "/audit", label: "Audit", icon: "audit", ready: false, permission: "compliance.read" },
  { href: "/documents", label: "Documents", icon: "documents", ready: true, permission: "document.read" },
  {
    label: "Billing",
    icon: "billing",
    ready: true,
    permission: "invoice.read",
    children: [
      { href: "/invoices", label: "Invoices", icon: "billing", ready: true, permission: "invoice.read" },
      { href: "/payments", label: "Payments & Receipts", icon: "receivables", ready: true, permission: "payment.read" },
      { href: "/receivables", label: "Receivables", icon: "receivables", ready: true, permission: "payment.read" },
      { href: "/billing/recurring", label: "Recurring Billing", icon: "calendar", ready: true, permission: "recurring.write" },
      { href: "/billing/reports", label: "Billing Reports", icon: "reports", ready: true, permission: "report.read" },
      { href: "/billing/settings", label: "Billing Settings", icon: "settings", ready: true, permission: "billing.settings" },
    ],
  },
  { href: "/team", label: "Team", icon: "team", ready: true, permission: "user.read" },
  { href: "/attendance", label: "Attendance", icon: "calendar", ready: true, permission: "user.read" },
  { href: "/reports", label: "Reports", icon: "reports", ready: true, permission: "report.read" },
  { href: "/services", label: "Services", icon: "check-circle", ready: true, permission: "service.read" },
  { href: "/integrations", label: "Integrations", icon: "integrations", ready: true, permission: "integration.read" },
  { href: "/communications", label: "Communications", icon: "communications", ready: true, permission: "communication.read" },
  { href: "/settings", label: "Settings", icon: "settings", ready: true, permission: "financial_year.read" },
  { href: "/assistant", label: "Assistant", icon: "assistant", ready: true, permission: "assistant.use" },
];

function activeNav(pathname: string): NavItem | undefined {
  for (const item of NAV) {
    if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
      return item;
    }
    if (item.children) {
      for (const child of item.children) {
        if (child.href && (pathname === child.href || pathname.startsWith(`${child.href}/`))) {
          return item;
        }
      }
    }
  }
  return undefined;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, error, isPending } = useSession();
  const signOut = useSignOut();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (error instanceof ApiError && error.isUnauthenticated) {
      router.replace("/login");
    }
  }, [error, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-hsl(var(--muted-foreground))">
        Loading your firm…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-hsl(var(--muted-foreground))">
        {error instanceof ApiError ? error.message : "Could not load your session. Please sign in again."}
      </div>
    );
  }

  const current = activeNav(pathname);

  return (
    <div className="flex min-h-screen bg-hsl(var(--background))">
      <AppSidebar
        pathname={pathname}
        permissions={session.permissions ?? []}
        signingOut={signOut.isPending}
        onSignOut={() => signOut.mutate(undefined, { onSettled: () => router.replace("/login") })}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          title={current?.label ?? "Dashboard"}
          fullName={session.user.full_name}
          designation={session.user.designation}
          onMobileMenu={() => setMobileMenuOpen((open) => !open)}
        />
        <main className="flex-1 bg-hsl(var(--background)) px-6 py-8 lg:px-10 lg:py-12 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
