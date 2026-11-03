"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Folder,
  Receipt,
  PiggyBank,
  BarChart3,
  Settings,
  Bot,
  Activity,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Building2,
  Clock,
  Mail,
  Smartphone,
  Building,
  Briefcase,
  Coins,
  TrendingUp,
  MailOpen,
  Lock,
  UserRound,
  UsersRound,
  Target,
  Award,
  GraduationCap,
  Link as LinkIcon,
  Download,
  Upload,
  Plus,
  Search,
  Bell,
  User,
  ArrowRight,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Share2,
  Wallet,
  CreditCard,
  Banknote,
  Percent,
  Tag,
  Hash,
  Target as TargetIcon,
  ShieldCheck,
} from "lucide-react";

import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession, useSignOut } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/tasks", label: "Tasks", icon: FileText },
  { href: "/calendar", label: "Compliance", icon: Calendar },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/receivables", label: "Receivables", icon: PiggyBank },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/team", label: "Team", icon: UsersRound },
  { href: "/services", label: "Services", icon: Briefcase },
  { href: "/integrations", label: "Integrations", icon: LinkIcon },
  { href: "/communications", label: "Communications", icon: MailOpen },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/assistant", label: "Assistant", icon: Bot },
];

interface GroupNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface GroupNavGroup {
  label: string;
  items: GroupNavItem[];
}

const GROUP_NAV: GroupNavGroup[] = [
  {
    label: "Billing",
    items: [
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/receivables", label: "Receivables", icon: Coins },
      { href: "/billing/settings", label: "Billing Settings", icon: Settings },
    ],
  },
];

interface UserAvatarProps {
  name: string;
  className?: string;
}

function UserAvatar({ name, className }: UserAvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  const tones = [
    "bg-primary/10 text-primary",
    "bg-emerald-500/10 text-emerald-600",
    "bg-rose-500/10 text-rose-600",
    "bg-amber-500/10 text-amber-600",
    "bg-violet-500/10 text-violet-600",
    "bg-indigo-500/10 text-indigo-600",
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        tones[hash % tones.length],
        className,
      )}
      title={name}
    >
      {initials}
    </span>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, error, isPending } = useSession();
  const signOut = useSignOut();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
      <div className="flex min-h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-8 w-24 rounded-full bg-muted animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading your firm…</p>
        </motion.div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center text-sm text-muted-foreground">
        {error instanceof ApiError ? error.message : "Could not load your session. Please sign in again."}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 shrink-0 flex-col border-r border-border bg-sidebar-background transition-all duration-300",
          sidebarCollapsed ? "w-16" : "translate-x-0",
        )}
        aria-label="Navigation"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-5 bg-sidebar-background shrink-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sidebar-foreground tracking-tight">
                Rohadas CA
              </p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">
                CA Practice Management
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            className="ml-auto p-1.5 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md transition-colors"
            aria-label="Toggle sidebar"
          >
            <svg className="h-4 w-4" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50")} />
                {!sidebarCollapsed && <span className="text-sidebar-foreground/80">{item.label}</span>}
              </Link>
            );
          })}

                {GROUP_NAV.map((group) => {
                  const GroupIcon = group.items[0].icon;
                  const isGroupActive = group.items.some(
                    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
                  );
                  return (
                    <div key={group.label} className="space-y-1">
                      <button
                        type="button"
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isGroupActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <GroupIcon className={cn("h-5 w-5 shrink-0", isGroupActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50")} />
                        {!sidebarCollapsed && <span className="text-sidebar-foreground/80">{group.label}</span>}
                        <ChevronRight className={cn("ml-auto h-4 w-4 shrink-0 transition-transform duration-200", isGroupActive ? "rotate-90" : "")} />
                      </button>
                {isGroupActive && (
                  <div className="ml-3 space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
                            isActive
                              ? "bg-sidebar-accent/50 text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/40")} />
                          {!sidebarCollapsed && (
                            <span className={cn("text-sidebar-foreground/70", isActive && "text-sidebar-accent-foreground")}>
                              {item.label}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-shrink-0 border-t border-border p-3">
          <button
            type="button"
            className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => {
              signOut.mutate(undefined, { onSettled: () => router.replace("/login") });
            }}
            disabled={signOut.isPending}
          >
            <LogOut className="h-4 w-4" />
            {!sidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col relative">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-border bg-background/80 backdrop-blur-md px-6">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="mr-2 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-1.5">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <span className="hidden sm:inline text-sm font-semibold text-foreground tracking-tight">
                Rohadas CA
              </span>
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-4">
              <button type="button" className="text-foreground/60 hover:text-foreground transition-colors" aria-label="Search">
                <Search className="h-4 w-4" />
              </button>
              <button type="button" className="text-foreground/60 hover:text-foreground transition-colors" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-l border-border pl-4">
              <div className="hidden md:flex flex-col min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {session.user.full_name}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {session.user.designation ?? "Staff"}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-accent transition-colors">
                    <UserAvatar name={session.user.full_name} className="h-7 w-7" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem className="text-sm">
                    <User className="mr-2 h-4 w-4" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm">
                    <Lock className="mr-2 h-4 w-4" /> Security
                  </DropdownMenuItem>
                  <Separator />
                  <DropdownMenuItem
                    className="text-sm text-destructive"
                    onClick={() => {
                      signOut.mutate(undefined, { onSettled: () => router.replace("/login") });
                    }}
                    disabled={signOut.isPending}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-auto bg-background p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-background/90 backdrop-blur lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ translateX: "100%" }}
              animate={{ translateX: 0 }}
              exit={{ translateX: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed inset-y-0 right-0 z-50 w-72 flex-col border-l border-border bg-sidebar-background shadow-xl lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-border px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-semibold text-foreground tracking-tight">Rohadas CA</span>
                </div>
                <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-1 text-foreground/60 hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {NAV.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50")} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
              <div className="border-t border-border p-3">
                <button
                  type="button"
                  onClick={() => {
                    signOut.mutate(undefined, { onSettled: () => router.replace("/login") });
                    setMobileMenuOpen(false);
                  }}
                  disabled={signOut.isPending}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
