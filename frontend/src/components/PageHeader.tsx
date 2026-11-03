"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock, FileText, Users, PiggyBank, BarChart3, ShieldCheck, Folder, TrendingUp, CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function PageHeader({ title, subtitle, action, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex flex-col gap-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <ChevronIcon />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

interface StatCardProps {
  title?: string;
  label?: string;
  value: number | string;
  hint?: string;
  icon?: React.ElementType;
  tone?: "primary" | "success" | "warning" | "danger" | "info" | "neutral" | "progress";
  trend?: { delta: number; label: string; good?: boolean };
  href?: string;
}

const STAT_TONES: Record<string, string> = {
  primary: "bg-primary/10 text-primary border-primary/20",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-200/50",
  warning: "bg-amber-500/10 text-amber-600 border-amber-200/50",
  danger: "bg-rose-500/10 text-rose-600 border-rose-200/50",
  info: "bg-blue-500/10 text-blue-600 border-blue-200/50",
  neutral: "bg-muted/10 text-muted-foreground border-muted/30",
};

export function StatCard({
  title,
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
  trend,
  href,
}: StatCardProps & { label?: string }) {
  const displayTitle = label ?? title;
  const cardClassName = cn(
    "group relative overflow-hidden border-border/50 hover:border-border hover:shadow-lg transition-all duration-200",
    href ? "cursor-pointer block" : "",
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        <CardHeader className="flex flex-row items-start justify-between py-5 px-6 sm:py-6 sm:px-6 border-b border-border/30 pb-5 sm:pb-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", STAT_TONES[tone])}>
                {Icon ? <Icon className="h-4 w-4" /> : null}
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground tracking-tight">
              {title}
            </p>
          </div>
          {trend && (
            <Badge
              variant={trend.good ? "success" : trend.delta < 0 ? "danger" : "warning"}
              className="text-[10px] px-2 py-1"
            >
              {trend.delta > 0 ? "↑" : "↓"} {Math.abs(trend.delta)} {trend.label}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="pt-5 sm:pt-6 pb-6 sm:pb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-bold tabular text-foreground">
              {value}
            </span>
            {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
          </div>
        </CardContent>
      </Link>
    );
  }

  return (
    <Card className={cardClassName}>
      <CardHeader className="flex flex-row items-start justify-between py-5 px-6 sm:py-6 sm:px-6 border-b border-border/30 pb-5 sm:pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", STAT_TONES[tone])}>
              {Icon ? <Icon className="h-4 w-4" /> : null}
            </div>
          </div>
          <p className="text-xs font-medium text-muted-foreground tracking-tight">
            {displayTitle}
          </p>
        </div>
        {trend && (
          <Badge
            variant={trend.good ? "success" : trend.delta < 0 ? "danger" : "warning"}
            className="text-[10px] px-2 py-1"
          >
            {trend.delta > 0 ? "↑" : "↓"} {Math.abs(trend.delta)} {trend.label}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pt-5 sm:pt-6 pb-6 sm:pb-6">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-bold tabular text-foreground">
            {value}
          </span>
          {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

interface QuickActionCardProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  href: string;
  tone?: string;
}

export function QuickActionCard({ title, subtitle, icon: Icon, href, tone = "bg-card" }: QuickActionCardProps) {
  return (
    <Card className="p-6 h-full hover:bg-accent transition-all duration-200 group">
      <Link href={href} className="flex flex-col items-start justify-between gap-4 w-full">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200 group-hover:scale-110", tone)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-auto" />
      </Link>
    </Card>
  );
}
