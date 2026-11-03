"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Bell, Menu, Search, User } from "lucide-react";

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
    <header className="top-bar">
      <button
        type="button"
        onClick={onMobileMenu}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-hsl(var(--border)) bg-hsl(var(--card)) text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) md:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1.5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent text-sm font-bold text-white">
            RC
          </div>
          <span className="hidden sm:inline text-sm font-semibold text-hsl(var(--foreground)) tracking-tight">
            Rohadas CA
          </span>
        </Link>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-4">
          <button
            type="button"
            className="text-hsl(var(--foreground))/60 hover:text-hsl(var(--foreground)) transition-colors"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="text-hsl(var(--foreground))/60 hover:text-hsl(var(--foreground)) transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-l border-hsl(var(--border)) pl-4">
          <div className="hidden md:flex flex-col min-w-0">
            <p className="text-sm font-semibold text-hsl(var(--foreground)) truncate">
              {session?.user?.full_name ?? fullName}
            </p>
            <p className="text-[11px] text-hsl(var(--muted-foreground)) truncate">
              {session?.user?.designation ?? designation ?? "Staff"}
            </p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-hsl(var(--border)) bg-hsl(var(--card)) text-hsl(var(--foreground)) hover:bg-hsl(var(--secondary)) transition-colors">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    </header>
  );
}
