"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, PiggyBank, Banknote, AlertTriangle, CheckCircle, FileText, Users, TrendingDown, TrendingUp, Coins } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatMoney, humanise } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function ReceivablesPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["receivables"],
    queryFn: () => api.get<any>("/receivables/summary"),
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Receivables" subtitle="Track outstanding client payments." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Receivables" subtitle="Could not load receivables data." />
      </div>
    );
  }

  const summary = data ?? { 
    as_of: "", 
    invoiced_total: 0, 
    collected_total: 0, 
    outstanding_total: 0, 
    overdue_total: 0, 
    draft_count: 0, 
    draft_value: 0, 
    cancelled_count: 0, 
    ageing: {}, 
    ageing_counts: {}, 
    by_client: [], 
    oldest_overdue: null, 
    notes: [] 
  };

  const ageingEntries = Object.entries(summary.ageing).map(([bucket, amount]) => ({
    bucket,
    label: bucket === "current" ? "Current" : bucket.replace(/-/g, " to "),
    amount: amount as number,
    count: (summary.ageing_counts as any)?.[bucket] ?? 0,
  }));

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Receivables"
          subtitle="Monitor outstanding invoices and client payments."
          action={
            <Link href="/invoices">
              <Button variant="outline">View Invoices</Button>
            </Link>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Receivables" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Outstanding</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {formatMoney(summary.outstanding_total)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {summary.draft_count + summary.cancelled_count} drafts/cancelled
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <PiggyBank className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overdue</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {formatMoney(summary.overdue_total)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Ageing analysis below
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Collected</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {formatMoney(summary.collected_total)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Received this period
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Banknote className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Collection Rate</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {summary.outstanding_total > 0
                    ? ((summary.collected_total / (summary.collected_total + summary.outstanding_total)) * 100).toFixed(0) + "%"
                    : "100%"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Paid vs outstanding
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Ageing Analysis</CardTitle>
              <CardDescription>Outstanding amounts by how late they are.</CardDescription>
            </CardHeader>
            <CardContent className="p-5">
              {(ageingEntries.length ?? 0) === 0 ? (
                <EmptyState title="No outstanding amounts" description="All invoices are paid or none are outstanding." />
              ) : (
                <div className="space-y-4">
                  {ageingEntries.map((row) => (
                    <div key={row.bucket} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            row.bucket === "current" ? "bg-hsl(var(--muted-foreground))" :
                            row.bucket.startsWith("1-") ? "bg-blue-500" :
                            row.bucket.startsWith("31-") ? "bg-amber-500" :
                            "bg-rose-500",
                          )}
                        />
                        <span className="text-sm text-foreground">{row.label}</span>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-sm font-semibold text-foreground">
                          {formatMoney(row.amount)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.count} invoice(s)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <CardTitle>Top Debtors</CardTitle>
              <CardDescription>Clients with the highest outstanding balances.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {(summary.by_client?.length ?? 0) === 0 ? (
                <div className="p-6 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No client data available.</p>
                </div>
              ) : (
                <Table className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-left">Client</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.by_client.map((row: any) => (
                      <TableRow key={row.client_id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                              {row.client_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-foreground">{row.client_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm tabular text-right text-foreground">
                          {formatMoney(row.outstanding)}
                        </TableCell>
                        <TableCell className="text-sm tabular text-right">
                          <span className={cn(
                            "text-[10px] font-medium",
                            row.overdue > 0 ? "text-destructive" : "text-emerald-600",
                          )}>
                            {row.overdue > 0 ? formatMoney(row.overdue) : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardFooter>
              <Link href="/clients" className="text-sm text-hsl(var(--primary)) hover:underline flex items-center gap-1">
                View all clients <ArrowRight className="h-3 w-3" />
              </Link>
            </CardFooter>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest receipts recorded against invoices.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-6 text-center">
              <Banknote className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Payment history available on invoice detail pages.</p>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
}
