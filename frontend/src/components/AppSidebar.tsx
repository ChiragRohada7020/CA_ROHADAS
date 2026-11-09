"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

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
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onSignOut: () => void;
  fullName: string | null;
  email: string | null;
}

export function AppSidebar({
  pathname,
  permissions,
  onSignOut,
  signingOut,
  collapsed,
  setCollapsed,
  fullName,
  email,
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

  const [activeYear, setActiveYear] = useState<FinancialYearRow | null>(null);
  const queryClient = useQueryClient();

  // Sync active year with the server's active year
  useEffect(() => {
    const serverActive = years.data?.find((row) => row.is_active) || null;
    if (serverActive) {
      setActiveYear(serverActive);
    }
  }, [years.data]);

  const activateFY = useMutation({
    mutationFn: (fyId: string) =>
      api.patch<FinancialYearRow>(`/financial-years/${fyId}/activate`, {}),
    onSuccess: (updated) => {
      setActiveYear(updated);
      void queryClient.invalidateQueries({ queryKey: ["financial-years"] });
    },
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const renderNavigation = (mobile: boolean) => (
    <nav>
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
                  if (mobile) setMobileMenuOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-xs transition",
                  isGroupActive ? "bg-[#F1ECFF] text-[#6D3AE8] border border-[#E3E2F2]" : "text-[#8A90A6] hover:bg-[#FAFAFE]",
                )}
              >
                <Icon
                  name={item.icon}
                  className={cn(
                    "h-6 w-6 shrink-0 transition-transform duration-200",
                    isExpanded ? "rotate-90" : "",
                    isGroupActive ? "text-[#6D3AE8]" : "text-[#8A90A6]",
                  )}
                />
                {(!collapsed || mobile) && <span className="text-xs font-medium text-[#252B47]">{item.label}</span>}
                <ChevronRight
                  className={cn(
                    "ml-auto h-6 w-6 shrink-0 transition-transform duration-200",
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
                            className="flex items-center gap-3 rounded-xl px-3 py-2 text-[10px] text-[#8A90A6]"
                          >
                            <Icon name={child.icon} className="h-5 w-5" />
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
                          onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2 text-[10px] transition",
                            isChildActive
                              ? "bg-[#F1ECFF] text-[#6D3AE8] border border-[#E3E2F2]"
                              : "text-[#8A90A6] hover:bg-[#FAFAFE]",
                          )}
                        >
                          <Icon
                            name={child.icon}
                            className={cn(
                              "h-5 w-5 shrink-0",
                              isChildActive ? "text-[#6D3AE8]" : "text-[#8A90A6]",
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
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-[10px] text-[#8A90A6]"
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0 opacity-50" />
              {!collapsed && <span>{item.label}</span>}
              <span className="ml-auto text-[9px] font-semibold text-[#C9B7FF]">next</span>
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={mobile ? () => setMobileMenuOpen(false) : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-[10px] transition",
              isActive
                ? "bg-[#F1ECFF] text-[#6D3AE8] border border-[#E3E2F2]"
                : "text-[#8A90A6] hover:bg-[#FAFAFE]",
            )}
          >
            <Icon
              name={item.icon}
              className={cn(
                "h-5 w-5 shrink-0",
                isActive ? "text-[#6D3AE8]" : "text-[#8A90A6]",
              )}
            />
            {(!collapsed || mobile) && <span className="text-xs font-medium text-[#252B47]">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (mobile = false) => (
      <div className="space-y-2 border-t border-[#EEF0F7] p-3">
        {/* User card */}
        <div className="flex items-center gap-2 rounded-xl border border-[#EEF0F7] bg-[#F8F5FF] px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#EEF0F7] bg-[#FAFAFE] text-[#6D3AE8]">
            <Icon name="user" className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#252B47]">
              {fullName ?? "User"}
            </p>
            <p className="truncate text-[10px] text-[#858BA2]">{email ?? "—"}</p>
          </div>
        </div>

        {/* Sign out button */}
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#E3E2F2] bg-[#F1ECFF] text-[#6D3AE8] font-semibold text-xs transition hover:border-[#6D3AE8]/50 hover:bg-[#F1ECFF]/80 disabled:cursor-not-allowed disabled:opacity-50",
            collapsed && "px-0 justify-center",
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {collapsed ? (
            <span className="sr-only">Sign out</span>
          ) : (
            signingOut ? "Signing out…" : "Sign out"
          )}
        </button>
      </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col overflow-y-auto border-r border-[#EEF0F7] bg-[#FAFAFE] text-[#252B47] shadow-[8px_0_30px_rgba(40,42,90,.045)] transition-[width] duration-300 lg:flex",
          collapsed ? "w-[78px]" : "w-[272px]",
        )}
      >
        <div className={cn("flex h-[76px] shrink-0 items-center gap-3 border-b border-[#EEF0F7] px-4", collapsed && "justify-center px-2")}>
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#6D3AE8] to-[#5730CB] text-lg font-bold text-white shadow-[0_5px_16px_rgba(103,64,220,.35)] ring-1 ring-white/15">
            CA
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold tracking-[-.02em] text-[#11162F]">Rohadas CA</p>
              <p className="truncate text-sm text-[#858BA2]">CA Practice Management</p>
            </div>
          )}
          {!collapsed && (
            <button type="button" onClick={() => setCollapsed(true)} aria-label="Collapse sidebar" className="rounded-lg p-1.5 text-[#8A90A6] transition hover:bg-[#FAFAFE] hover:text-[#252B47]">
              <PanelLeftClose className="h-6 w-6" />
            </button>
          )}
          {collapsed && (
            <button type="button" onClick={() => setCollapsed(false)} aria-label="Expand sidebar" className="absolute right-1 top-[86px] rounded-md bg-[#FFFFFF] border border-[#EEF0F7] p-1 text-[#6D3AE8] hover:text-[#252B47]">
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto space-y-2 p-3">
          {renderNavigation(false)}
        </nav>

        {footer(false)}
      </aside>

      {/* Mobile sidebar trigger */}
        <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 grid h-10 w-10 place-items-center rounded-xl border border-[#E3E5F4] bg-white text-[#222844] shadow-sm lg:hidden"
      >
        <Menu className="h-6 w-6" />
      </button>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
              <button type="button" aria-label="Close navigation overlay" onClick={() => setMobileMenuOpen(false)} className="absolute inset-0 bg-[#080B1C]/55 backdrop-blur-[2px]" />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r border-[#EEF0F7] bg-[#FAFAFE] text-[#252B47] shadow-2xl">
            <div className="flex h-[76px] shrink-0 items-center gap-3 border-b border-[#EEF0F7] px-4">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#6D3AE8] to-[#5730CB] text-sm font-bold text-white">CA</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#11162F]">Rohadas CA</p>
                <p className="text-[10px] text-[#858BA2]">CA Practice Management</p>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" className="rounded-lg p-2 text-[#8A90A6] hover:bg-[#FAFAFE] hover:text-[#252B47]"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-2 p-3">
              {renderNavigation(true)}
            </nav>
            {footer(true)}
          </aside>
        </div>
      )}
    </>
  );
}
