"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut, Menu, X } from "lucide-react";

import { Icon, type IconName } from "@/components/Icon";
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

interface AppSidebarProps {
  pathname: string;
  permissions: string[];
  signingOut: boolean;
  onSignOut: () => void;
}

export function AppSidebar({
  pathname,
  permissions,
  onSignOut,
  signingOut,
}: AppSidebarProps) {
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

  const [collapsed, setCollapsed] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sidebar transition-all duration-300",
          collapsed ? "sidebar-collapsed" : "",
        )}
      >
        <div className="sidebar-header">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent text-sm font-bold text-white">
            RC
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold tracking-tight text-white">
                Rohadas CA
              </p>
              <p className="truncate text-[11px] text-hsl(var(--sidebar-foreground))/60">
                CA Practice Management
              </p>
            </div>
          )}
          <button
            type="button"
            className="ml-auto p-1.5 text-hsl(var(--sidebar-foreground))/60 hover:text-hsl(var(--sidebar-foreground)) hover:bg-hsl(var(--sidebar-accent)) rounded-md transition-colors"
            aria-label="Toggle sidebar"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            <svg className="h-4 w-4" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
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
              const isGroupActive = item.children.some(
                (c) => c.href && (pathname === c.href || pathname.startsWith(`${c.href}/`)),
              );
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
                    className={cn(
                      "sidebar-item",
                      isGroupActive ? "sidebar-item-active" : "",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(
                        "h-[18px] w-[18px] transition-transform duration-200",
                        isExpanded ? "rotate-90" : "",
                        isGroupActive ? "text-hsl(var(--primary))" : "",
                      )}
                    />
                    {!collapsed && <span>{item.label}</span>}
                    <ChevronRight
                      className={cn(
                        "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
                        isExpanded ? "rotate-90" : "",
                      )}
                    />
                  </button>
                  {isExpanded && (
                    <div className="ml-3 space-y-0.5">
                      {item.children
                        .filter((c) => {
                          if (c.permission && !permissions.includes(c.permission)) return false;
                          if (!c.ready) return true;
                          return true;
                        })
                        .map((child) => {
                          if (!child.ready || !child.href) {
                            return (
                              <span
                                key={child.label}
                                aria-disabled="true"
                                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-hsl(var(--sidebar-foreground))/40"
                              >
                                <Icon
                                  name={child.icon}
                                  className="h-[18px] w-[18px]"
                                />
                                {!collapsed && <span>{child.label}</span>}
                              </span>
                            );
                          }
                          const isChildActive =
                            pathname === child.href ||
                            pathname.startsWith(`${child.href}/`);
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                                isChildActive
                                  ? "sidebar-item-active"
                                  : "",
                              )}
                            >
                              <Icon
                                name={child.icon}
                                className={cn(
                                  "h-[18px] w-[18px]",
                                  isChildActive
                                    ? "text-hsl(var(--primary))"
                                    : "",
                                )}
                              />
                              {!collapsed && <span>{child.label}</span>}
                            </Link>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            }
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            if (!item.ready || !item.href) {
              return (
                <span
                  key={item.label}
                  aria-disabled="true"
                  title="Coming next"
                  className={cn(
                    "sidebar-item",
                    "text-hsl(var(--sidebar-foreground))/40",
                  )}
                >
                  <Icon name={item.icon} className="h-[18px] w-[18px]" />
                  {!collapsed && <span>{item.label}</span>}
                  <span className="ml-auto rounded bg-hsl(var(--sidebar-accent)) px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-hsl(var(--sidebar-foreground))/50">
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
                  "sidebar-item",
                  isActive ? "sidebar-item-active" : "",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cn(
                    "h-[18px] w-[18px]",
                    isActive ? "text-hsl(var(--primary))" : "",
                  )}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="space-y-2 p-2">
            <div className="rounded-xl bg-hsl(var(--sidebar-accent)) px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-hsl(var(--sidebar-foreground))/60">
                Financial year
              </p>
              {years.isPending && (
                <p className="mt-0.5 text-xs text-hsl(var(--sidebar-foreground))/40">
                  Loading…
                </p>
              )}
              {years.isSuccess && activeYear && (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-hsl(var(--sidebar-foreground))">
                    {activeYear.label}
                  </p>
                  {activeYear.assessment_year && (
                    <p className="text-[11px] text-hsl(var(--sidebar-foreground))/50">
                      Assessment year {activeYear.assessment_year}
                    </p>
                  )}
                </>
              )}
              {years.isSuccess && !activeYear && (
                <p className="mt-0.5 text-xs text-hsl(var(--sidebar-foreground))/40">
                  None set up yet
                </p>
              )}
            </div>

            <div className="flex items-start gap-2 px-3 py-1">
              <Icon name="building" className="mt-0.5 h-4 w-4 shrink-0 text-hsl(var(--sidebar-foreground))/40" />
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-hsl(var(--sidebar-foreground))">
                  {firm.data?.legal_name || firm.data?.name || "Your firm"}
                </p>
                <p className="truncate text-[11px] text-hsl(var(--sidebar-foreground))/50">
                  {firm.data
                    ? [firm.data.city, firm.data.state].filter(Boolean).join(", ") ||
                      "No address set"
                    : "…"}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-danger w-full justify-center py-2 gap-2"
              disabled={signingOut}
              onClick={onSignOut}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && (
                <span>{signingOut ? "Signing out…" : "Sign out"}</span>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-hsl(var(--background))/80 backdrop-blur-lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 w-72 flex-col border-l border-hsl(var(--sidebar-border)) bg-hsl(var(--sidebar)) shadow-2xl lg:hidden"
          >
            <div className="flex items-center justify-between border-b border-hsl(var(--sidebar-border)) px-4 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent text-sm font-bold text-white">
                  RC
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-tight text-hsl(var(--sidebar-foreground))">
                    Rohadas CA
                  </p>
                  <p className="truncate text-[11px] text-hsl(var(--sidebar-foreground))/60">
                    CA Practice Management
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 text-hsl(var(--sidebar-foreground))/60 hover:text-hsl(var(--sidebar-foreground))"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
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
                  const isGroupActive = item.children.some(
                    (c) => c.href && (pathname === c.href || pathname.startsWith(`${c.href}/`)),
                  );
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
                          setMobileMenuOpen(false);
                        }}
                        className={cn(
                          "sidebar-item",
                          isGroupActive ? "sidebar-item-active" : "",
                        )}
                      >
                        <Icon
                          name={item.icon}
                          className={cn(
                            "h-[18px] w-[18px] transition-transform duration-200",
                            isExpanded ? "rotate-90" : "",
                            isGroupActive ? "text-hsl(var(--primary))" : "",
                          )}
                        />
                        <span>{item.label}</span>
                        <ChevronRight
                          className={cn(
                            "ml-auto h-4 w-4 shrink-0 transition-transform duration-200",
                            isExpanded ? "rotate-90" : "",
                          )}
                        />
                      </button>
                      {isExpanded && (
                        <div className="ml-3 space-y-0.5">
                          {item.children
                            .filter((c) => {
                              if (c.permission && !permissions.includes(c.permission)) return false;
                              if (!c.ready) return true;
                              return true;
                            })
                            .map((child) => {
                              if (!child.ready || !child.href) {
                                return (
                                  <span
                                    key={child.label}
                                    aria-disabled="true"
                                    className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-hsl(var(--sidebar-foreground))/40"
                                  >
                                    <Icon name={child.icon} className="h-[18px] w-[18px]" />
                                    <span>{child.label}</span>
                                  </span>
                                );
                              }
                              const isChildActive =
                                pathname === child.href ||
                                pathname.startsWith(`${child.href}/`);
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setMobileMenuOpen(false)}
                                  className={cn(
                                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                                    isChildActive
                                      ? "sidebar-item-active"
                                      : "",
                                  )}
                                >
                                  <Icon
                                    name={child.icon}
                                    className={cn(
                                      "h-[18px] w-[18px]",
                                      isChildActive
                                        ? "text-hsl(var(--primary))"
                                        : "",
                                    )}
                                  />
                                  <span>{child.label}</span>
                                </Link>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                }
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                if (!item.ready || !item.href) {
                  return (
                    <span
                      key={item.label}
                      aria-disabled="true"
                      title="Coming next"
                      className={cn(
                        "sidebar-item",
                        "text-hsl(var(--sidebar-foreground))/40",
                      )}
                    >
                      <Icon name={item.icon} className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                      <span className="ml-auto rounded bg-hsl(var(--sidebar-accent)) px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-hsl(var(--sidebar-foreground))/50">
                        next
                      </span>
                    </span>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "sidebar-item",
                      isActive ? "sidebar-item-active" : "",
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn(
                        "h-[18px] w-[18px]",
                        isActive ? "text-hsl(var(--primary))" : "",
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="sidebar-footer">
              <div className="space-y-2 p-2">
                <button
                  type="button"
                  className="btn btn-danger w-full justify-center py-2 gap-2"
                  disabled={signingOut}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSignOut();
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  <span>{signingOut ? "Signing out…" : "Sign out"}</span>
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* Mobile menu toggle button */}
      <button
        type="button"
        className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg border border-hsl(var(--border)) bg-hsl(var(--card)) text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) md:hidden"
        aria-label="Open navigation menu"
        onClick={() => setMobileMenuOpen((open) => !open)}
      >
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}
