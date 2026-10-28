"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/charts";
import { NotificationBell } from "@/components/NotificationBell";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/format";
import { ThemeToggle } from "@/lib/theme";
import { useSession, useSignOut } from "@/lib/session";
import type { FinancialYearRow, FirmBillingSettings } from "@/lib/types";

/**
 * The application shell: a firm-branded sidebar and a working top bar.
 *
 * Two conventions carried over deliberately:
 *
 * 1. **Modules that do not exist are shown as inert, not as links.** The product's shape
 *    is useful to see; a link that 404s is not. They keep the `next` badge.
 * 2. **Nothing here invents a figure.** The financial-year selector reads the firm's own
 *    `financial_years`, and the firm card reads the same record the invoice letterhead
 *    prints from — so the name in the corner cannot disagree with the name on an invoice.
 */

interface NavItem {
  href?: string;
  label: string;
  icon: IconName;
  ready?: boolean;
  /** Permission code that gates visibility. `null` means always visible (e.g. Dashboard). */
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
  { href: "/reports", label: "Reports", icon: "reports", ready: true, permission: "report.read" },
  { href: "/services", label: "Services", icon: "check-circle", ready: true, permission: "service.read" },
  { href: "/integrations", label: "Integrations", icon: "integrations", ready: true, permission: "integration.read" },
  { href: "/communications", label: "Communications", icon: "communications", ready: true, permission: "communication.read" },
  { href: "/settings", label: "Settings", icon: "settings", ready: true, permission: "financial_year.read" },
  { href: "/assistant", label: "Assistant", icon: "assistant", ready: true, permission: "assistant.use" },
];

/** The nav entry a path belongs to — longest matching prefix, so `/invoices/abc` is Billing. */
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

  useEffect(() => {
    // A 401 here means there is no usable session, so send them to sign in. Any
    // other error is left on screen rather than being disguised as a logout.
    if (error instanceof ApiError && error.isUnauthenticated) {
      router.replace("/login");
    }
  }, [error, router]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Loading your firm…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-slate-600">
        {error instanceof ApiError
          ? error.message
          : "Could not load your session. Please sign in again."}
      </div>
    );
  }

  const current = activeNav(pathname);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        pathname={pathname}
        permissions={session.permissions ?? []}
        signingOut={signOut.isPending}
        onSignOut={() => signOut.mutate(undefined, { onSettled: () => router.replace("/login") })}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={current?.label ?? "Dashboard"}
          fullName={session.user.full_name}
          designation={session.user.designation}
        />
        <main className="flex-1 bg-slate-50 px-5 py-8 lg:px-8 lg:py-10 dark:bg-slate-950">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({
  pathname,
  permissions,
  onSignOut,
  signingOut,
}: {
  pathname: string;
  permissions: string[];
  onSignOut: () => void;
  signingOut: boolean;
}) {
  const firm = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<FirmBillingSettings>("/billing/settings"),
    staleTime: 10 * 60 * 1000,
  });

  const years = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api.get<FinancialYearRow[]>("/financial-years"),
    staleTime: 10 * 60 * 1000,
  });

  const activeYear = years.data?.find((row) => row.is_active);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-700 lg:flex lg:sticky lg:top-0 lg:h-screen lg:z-10">
      {/* Fixed header - logo & firm name */}
      <div className="flex-shrink-0 flex items-center gap-3 border-b border-slate-200 px-4 py-4 bg-white dark:border-slate-700">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 text-sm font-bold text-white">
          CA
        </span>
        <div className="min-w-0">
        <p className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-200">Rohadas CA</p>
        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">CA Practice Management</p>
        </div>
      </div>

      {/* Scrollable navigation area */}
      <nav className="flex-1 overflow-y-auto space-y-0.5 p-2">
        {NAV.filter((item) => {
          if (item.children) {
            if (item.permission && !permissions.includes(item.permission)) return false;
            return true;
          }
          if (!item.ready) return true;
          if (item.permission === null || item.permission === undefined) return true;
          return permissions.includes(item.permission);
        }).map((item) => {
          if (item.children) {
            const isGroupActive = item.children.some((c) => c.href && (pathname === c.href || pathname.startsWith(`${c.href}/`)));
            return (
              <div key={item.label} className="space-y-1">
                <div className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", isGroupActive ? "text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-300")}>
                  <Icon name={item.icon} className={cn("h-[18px] w-[18px]", isGroupActive ? "text-sky-600" : "text-slate-400")} />
                  {item.label}
                </div>
                <div className="ml-6 space-y-1">
                  {item.children.filter((c) => {
                    if (c.permission && !permissions.includes(c.permission)) return false;
                    if (!c.ready) return true;
                    return true;
                  }).map((child) => {
                    if (!child.ready || !child.href) {
                      return (
                        <span key={child.label} aria-disabled="true" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 dark:text-slate-500">
                          <Icon name={child.icon} className="h-[18px] w-[18px]" />
                          {child.label}
                        </span>
                      );
                    }
                    const isChildActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                          isChildActive
                            ? "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-900/20 dark:text-sky-300 dark:ring-sky-800"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200",
                        )}
                      >
                        <Icon name={child.icon} className={cn("h-[18px] w-[18px]", isChildActive ? "text-sky-600" : "text-slate-400")} />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (!item.ready || !item.href) {
            return (
              <span
                key={item.label}
                aria-disabled="true"
                title="Coming next"
                 className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 dark:text-slate-500 dark:bg-slate-800/30"
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                {item.label}
                <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  next
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon
                name={item.icon}
                className={cn("h-[18px] w-[18px]", isActive ? "text-sky-600" : "text-slate-400")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer - financial year, firm info, sign out */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-2 p-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Financial year
            </p>
            {years.isPending && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Loading…</p>}
            {years.isSuccess && activeYear && (
              <>
                <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">{activeYear.label}</p>
                {activeYear.assessment_year && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Assessment year {activeYear.assessment_year}
                  </p>
                )}
              </>
            )}
            {years.isSuccess && !activeYear && (
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">None set up yet</p>
            )}
          </div>

          <div className="flex items-start gap-2 px-3 py-1">
            <Icon name="building" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                {firm.data?.legal_name || firm.data?.name || "Your firm"}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {firm.data
                  ? [firm.data.city, firm.data.state].filter(Boolean).join(", ") || "No address set"
                  : "…"}
              </p>
            </div>
          </div>

          <button type="button" className="btn-ghost w-full" disabled={signingOut} onClick={onSignOut}>
            <Icon name="logout" className="h-4 w-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** The real "create something" actions, which is what the + button is for. */
const QUICK_ADD = [
  { href: "/clients/new", label: "New client", icon: "clients" as IconName },
  { href: "/tasks/new", label: "New task", icon: "tasks" as IconName },
  { href: "/tasks/generate", label: "Generate this year's work", icon: "calendar" as IconName },
  { href: "/invoices", label: "Raise an invoice", icon: "billing" as IconName },
];

function TopBar({
  title,
  fullName,
  designation,
}: {
  title: string;
  fullName: string;
  designation: string | null;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  // Close the menu on Escape and on route change — a menu that survives a navigation
  // looks like it belongs to the new page.
  useEffect(() => {
    if (!addOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 dark:text-slate-200">{title}</h1>
      </div>

      {/*
        Global search is not built. It is shown, disabled and labelled rather than
        omitted, because the sidebar already establishes that convention for modules
        that do not exist yet — and a search box that silently does nothing would be
        worse than one that says so.
      */}
      <div
         className="hidden max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 md:flex dark:border-slate-700 dark:bg-slate-800"
         title="Global search is not built yet"
       >
        <Icon name="search" className="h-4 w-4" />
        <span className="truncate">Search clients, tasks, documents…</span>
        <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-slate-700 dark:text-slate-400 dark:ring-slate-600">
          next
        </span>
      </div>

      <div className="relative">
        <button
          type="button"
          className="btn-primary"
          aria-expanded={addOpen}
          aria-haspopup="menu"
          onClick={() => setAddOpen((open) => !open)}
        >
          <Icon name="plus" className="h-4 w-4" />
          Add
          <Icon name="chevron-down" className="h-3.5 w-3.5" />
        </button>

        {addOpen && (
          <>
            {/* A full-screen backdrop so a click anywhere closes the menu. */}
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setAddOpen(false)}
            />
            <div
              role="menu"
             className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
             >
              {QUICK_ADD.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700"
                  onClick={() => {
                    setAddOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon name={item.icon} className="h-4 w-4 text-slate-400" />
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <NotificationBell />

      <ThemeToggle />

      <div className="flex items-center gap-2 border-l border-slate-200 pl-3 dark:border-slate-700">
        <Avatar name={fullName} />
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-200">{fullName}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{designation ?? "Staff"}</p>
        </div>
      </div>
    </header>
  );
}
