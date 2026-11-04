"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, HelpCircle, Menu, Search, User } from "lucide-react";

import { Icon } from "@/components/Icon";
import { ApiError, api } from "@/lib/api";
import { useSession, useSignOut } from "@/lib/session";
import type { FinancialYearRow, FirmBillingSettings } from "@/lib/types";

interface AppHeaderProps {
  title: string;
  fullName: string;
  designation: string | null;
  onMobileMenu: () => void;
}

const QUICK_ADD = [
  { href: "/clients/new", label: "New client", icon: "clients" as const },
  { href: "/tasks/new", label: "New task", icon: "tasks" as const },
  { href: "/tasks/generate", label: "Generate this year's work", icon: "calendar" as const },
  { href: "/invoices", label: "Raise an invoice", icon: "billing" as const },
];

export function AppHeader({
  title,
  fullName,
  designation,
  onMobileMenu,
}: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, error, isPending } = useSession();
  const signOut = useSignOut();
  const [addOpen, setAddOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  useEffect(() => {
    if (error instanceof ApiError && error.isUnauthenticated) {
      router.replace("/login");
    }
  }, [error, router]);

  useEffect(() => {
    if (!addOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setAddOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  if (isPending) return null;

  return (
    <header className="top-nav">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onMobileMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-hsl(var(--border)) bg-hsl(var(--card)) text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative search-bar">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-hsl(var(--text-muted))" />
          <input
            type="search"
            placeholder="Search clients, invoices, tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 h-full bg-hsl(var(--surface)) border border-hsl(var(--border)) rounded-lg text-sm text-hsl(var(--foreground)) focus:outline-none focus:ring-2 focus:ring-hsl(var(--primary))"
            aria-label="Search clients, invoices, tasks..."
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-hsl(var(--text-muted))">
            Ctrl K
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative">
          <select
            className="fy-select w-32"
            defaultValue={activeYear?.label || "FY 2025-26"}
            aria-label="Financial year"
          >
            <option>FY 2025-26</option>
            <option>FY 2026-27</option>
          </select>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="header-icon"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 bg-hsl(var(--danger)) rounded-full border-2 border-hsl(var(--surface))"></span>
          </button>

          <button
            type="button"
            className="header-icon"
            aria-label="Help"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <div className="relative">
            <div className="profile-avatar cursor-pointer">
              {session?.user?.full_name?.charAt(0) ?? fullName.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
