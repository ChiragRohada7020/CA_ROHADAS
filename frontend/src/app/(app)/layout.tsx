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
import { useSession, useSignOut } from "@/lib/session";
import type { FinancialYearRow, FirmBillingSettings } from "@/lib/types";

interface NavItem {
  href?: string;
  label: string;
  icon: IconName;
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
    if (item.href && (pathname === item.href || pathname.startsWith(item.href + "/"))) {
      return item;
    }
    if (item.children) {
      for (const child of item.children) {
        if (child.href && (pathname === child.href || pathname.startsWith(child.href + "/"))) {
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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
    <div className="flex min-h-screen bg-secondary">
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
          onMobileMenu={() => setMobileMenuOpen((open) => !open)}
        />
        <main className="flex-1 bg-secondary px-6 py-8 lg:px-10 lg:py-12 overflow-hidden">{children}</main>
      </div>

      {mobileMenuOpen && (
        <MobileSidebar
          pathname={pathname}
          permissions={session.permissions ?? []}
          signingOut={signOut.isPending}
          onSignOut={() => signOut.mutate(undefined, { onSettled: () => router.replace("/login") })}
          onClose={() => setMobileMenuOpen(false)}
        />
      )}
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

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex lg:sticky lg:top-0 lg:h-screen lg:z-10">
      <div className="flex-shrink-0 flex items-center gap-3 border-b border-sidebar-border px-4 py-4 bg-sidebar">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent text-sm font-bold text-white">
          CA
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-white">Rohadas CA</p>
          <p className="truncate text-[11px] text-muted-foreground">CA Practice Management</p>
        </div>
      </div>

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
            const isGroupActive = item.children.some((c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")));
            const isExpanded = expandedGroups.has(item.label) || isGroupActive;
            return (
              <div key={item.label} className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(expandedGroups);
                    if (next.has(item.label)) next.delete(item.label);
                    else next.add(item.label);
                    setExpandedGroups(next);
                  }}
                  className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200", isGroupActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                >
                  <Icon name={item.icon} className={cn("h-[18px] w-[18px] transition-transform duration-200", isExpanded ? "rotate-90" : "", isGroupActive ? "text-accent-foreground" : "text-sidebar-foreground/60")} />
                  {item.label}
                </button>
                {isExpanded && (
                  <div className="ml-6 space-y-1">
                    {item.children.filter((c) => {
                      if (c.permission && !permissions.includes(c.permission)) return false;
                      if (!c.ready) return true;
                      return true;
                    }).map((child) => {
                      if (!child.ready || !child.href) {
                        return (
                          <span key={child.label} aria-disabled="true" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/40">
                            <Icon name={child.icon} className="h-[18px] w-[18px]" />
                            {child.label}
                          </span>
                        );
                      }
                      const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-200",
                            isChildActive
                              ? "sidebar-item-active"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon name={child.icon} className={cn("h-[18px] w-[18px]", isChildActive ? "text-accent-foreground" : "text-sidebar-foreground/50")} />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          if (!item.ready || !item.href) {
            return (
              <span
                key={item.label}
                aria-disabled="true"
                title="Coming next"
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/40"
              >
                <Icon name={item.icon} className="h-[18px] w-[18px]" />
                {item.label}
                <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
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
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
                isActive
                  ? "sidebar-item-active"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                name={item.icon}
                className={cn("h-[18px] w-[18px]", isActive ? "text-accent-foreground" : "text-sidebar-foreground/50")}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex-shrink-0 border-t border-sidebar-border bg-sidebar">
        <div className="space-y-2 p-2">
          <div className="rounded-xl bg-sidebar-accent px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-sidebar-accent-foreground/70">
              Financial year
            </p>
            {years.isPending && <p className="mt-0.5 text-xs text-sidebar-foreground/50">Loading…</p>}
            {years.isSuccess && activeYear && (
              <>
                <p className="mt-0.5 text-sm font-semibold text-sidebar-foreground">{activeYear.label}</p>
                {activeYear.assessment_year && (
                  <p className="text-[11px] text-sidebar-foreground/50">
                    Assessment year {activeYear.assessment_year}
                  </p>
                )}
              </>
            )}
            {years.isSuccess && !activeYear && (
              <p className="mt-0.5 text-xs text-sidebar-foreground/50">None set up yet</p>
            )}
          </div>

          <div className="flex items-start gap-2 px-3 py-1">
            <Icon name="building" className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/50" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-sidebar-foreground">
                {firm.data?.legal_name || firm.data?.name || "Your firm"}
              </p>
              <p className="truncate text-[11px] text-sidebar-foreground/50">
                {firm.data
                  ? [firm.data.city, firm.data.state].filter(Boolean).join(", ") || "No address set"
                  : "…"}
              </p>
            </div>
          </div>

          <button type="button" className="btn btn-primary w-full justify-center py-2 gap-2" disabled={signingOut} onClick={onSignOut}>
            <Icon name="logout" className="h-4 w-4" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileSidebar({
  pathname,
  permissions,
  onSignOut,
  signingOut,
  onClose,
}: {
  pathname: string;
  permissions: string[];
  onSignOut: () => void;
  signingOut: boolean;
  onClose: () => void;
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

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-background/40 lg:hidden z-40"
        onClick={onClose}
        aria-label="Close menu"
      />
      <aside className="fixed inset-y-0 right-0 z-50 w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar shadow-lg lg:hidden">
        <div className="flex-shrink-0 flex items-center gap-3 border-b border-sidebar-border px-4 py-4 bg-sidebar relative">
          <button type="button" className="absolute left-4 top-1/2 -translate-y-1/2 p-1 text-sidebar-foreground/60 hover:text-sidebar-foreground" onClick={onClose} aria-label="Close">
            <Icon name="x" className="h-5 w-5" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent text-sm font-bold text-white">
            CA
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-tight text-white">Rohadas CA</p>
            <p className="truncate text-[11px] text-muted-foreground">CA Practice Management</p>
          </div>
        </div>

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
              const isGroupActive = item.children.some((c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/")));
              const isExpanded = expandedGroups.has(item.label) || isGroupActive;
              return (
                <div key={item.label} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(expandedGroups);
                      if (next.has(item.label)) next.delete(item.label);
                      else next.add(item.label);
                      setExpandedGroups(next);
                    }}
                    className={cn("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200", isGroupActive ? "sidebar-item-active" : "sidebar-item-inactive")}
                  >
                    <Icon name={item.icon} className={cn("h-[18px] w-[18px] transition-transform duration-200", isExpanded ? "rotate-90" : "", isGroupActive ? "text-accent-foreground" : "text-sidebar-foreground/60")} />
                    {item.label}
                  </button>
                  {isExpanded && (
                    <div className="ml-6 space-y-1">
                      {item.children.filter((c) => {
                        if (c.permission && !permissions.includes(c.permission)) return false;
                        if (!c.ready) return true;
                        return true;
                      }).map((child) => {
                        if (!child.ready || !child.href) {
                          return (
                            <span key={child.label} aria-disabled="true" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/40">
                              <Icon name={child.icon} className="h-[18px] w-[18px]" />
                              {child.label}
                            </span>
                          );
                        }
                        const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={onClose}
                            className={cn(
                              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-200",
                              isChildActive
                                ? "sidebar-item-active"
                                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            )}
                          >
                            <Icon name={child.icon} className={cn("h-[18px] w-[18px]", isChildActive ? "text-accent-foreground" : "text-sidebar-foreground/50")} />
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            if (!item.ready || !item.href) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  title="Coming next"
                  className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/40"
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {item.label}
                  <span className="ml-auto rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
                    next
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200",
                  isActive
                    ? "sidebar-item-active"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cn("h-[18px] w-[18px]", isActive ? "text-accent-foreground" : "text-sidebar-foreground/50")}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-sidebar-border bg-sidebar">
          <div className="space-y-2 p-2">
            <div className="rounded-xl bg-sidebar-accent px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-sidebar-accent-foreground/70">
                Financial year
              </p>
              {years.isPending && <p className="mt-0.5 text-xs text-sidebar-foreground/50">Loading…</p>}
              {years.isSuccess && activeYear && (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-sidebar-foreground">{activeYear.label}</p>
                  {activeYear.assessment_year && (
                    <p className="text-[11px] text-sidebar-foreground/50">
                      Assessment year {activeYear.assessment_year}
                    </p>
                  )}
                </>
              )}
              {years.isSuccess && !activeYear && (
                <p className="mt-0.5 text-xs text-sidebar-foreground/50">None set up yet</p>
              )}
            </div>

            <div className="flex items-start gap-2 px-3 py-1">
              <Icon name="building" className="mt-0.5 h-4 w-4 shrink-0 text-sidebar-foreground/50" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-sidebar-foreground">
                  {firm.data?.legal_name || firm.data?.name || "Your firm"}
                </p>
                <p className="truncate text-[11px] text-sidebar-foreground/50">
                  {firm.data
                    ? [firm.data.city, firm.data.state].filter(Boolean).join(", ") || "No address set"
                    : "…"}
                </p>
              </div>
            </div>

            <button type="button" className="btn btn-primary w-full justify-center py-2 gap-2" disabled={signingOut} onClick={onSignOut}>
              <Icon name="logout" className="h-4 w-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

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
  onMobileMenu,
}: {
  title: string;
  fullName: string;
  designation: string | null;
  onMobileMenu: () => void;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (!addOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAddOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background px-4 py-3">
      <button
        type="button"
        onClick={onMobileMenu}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground hover:bg-accent/10 md:hidden"
        aria-label="Open navigation menu"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{title}</h1>
      </div>

      <div
         className="hidden max-w-md flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 py-2 text-sm text-muted-foreground md:flex"
         title="Global search is not built yet"
       >
        <Icon name="search" className="h-4 w-4" />
        <span className="truncate">Search clients, tasks, documents…</span>
        <span className="ml-auto rounded bg-card px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
          next
        </span>
      </div>

      <div className="relative">
        <button
          type="button"
          className="btn btn-primary px-5 py-2.5"
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
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setAddOpen(false)}
            />
            <div
              role="menu"
             className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
             >
              {QUICK_ADD.map((item) => (
                <button
                  key={item.href}
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-accent/10"
                  onClick={() => {
                    setAddOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon name={item.icon} className="h-4 w-4 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <NotificationBell />

      <div className="flex items-center gap-2 border-l border-border pl-3">
        <Avatar name={fullName} />
        <div className="hidden min-w-0 sm:block">
          <p className="truncate text-xs font-semibold text-foreground">{fullName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{designation ?? "Staff"}</p>
        </div>
      </div>
    </header>
  );
}
