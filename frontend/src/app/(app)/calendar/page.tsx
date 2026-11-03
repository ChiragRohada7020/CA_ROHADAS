"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, Clock, FileText, ShieldCheck, AlertTriangle, CheckCircle, Users, Building2 } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function CalendarPage() {
  const { data, isPending } = useQuery({
    queryKey: ["calendar"],
    queryFn: () => api.get<any>("/calendar?limit=100"),
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Compliance Calendar" subtitle="Track compliance deadlines and filings." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Compliance Calendar"
          subtitle="Track statutory deadlines, filings, and compliance tasks."
          action={
            <Button>Add Deadline</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Compliance" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Deadlines</p>
                <p className="tabular text-2xl font-bold text-foreground">{data?.total ?? 0}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Calendar className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overdue</p>
                <p className="tabular text-2xl font-bold text-destructive">{data?.overdue_count ?? 0}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unverified</p>
                <p className="tabular text-2xl font-bold text-foreground">{data?.unverified_count ?? 0}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">This Week</p>
                <p className="tabular text-2xl font-bold text-foreground">0</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
            <CardDescription>Statutory dates and compliance tasks.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(entries.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-500 mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Deadline</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Client</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Filing Type</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Status</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Days</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry: any) => (
                    <TableRow key={entry.task_id ?? entry.deadline_id ?? entry.client_id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex size-5 items-center justify-center rounded-md bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                            {Number(entry.statutory_due_date?.slice(8, 10) ?? "1")}
                          </div>
                          <span className="font-medium text-foreground">{entry.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {entry.client_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {entry.filing_type ?? "—"}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <Badge variant={entry.verified ? "success" : "warning"} className="text-[10px] px-2.5 py-0.5">
                          {entry.verified ? "Verified" : "Unverified"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden xl:table-cell">
                        <span className={cn(
                          "tabular text-xs font-medium",
                          entry.days_remaining! < 0 ? "text-destructive" : entry.days_remaining! <= 7 ? "text-amber-600" : "text-emerald-600",
                        )}>
                          {entry.days_remaining! < 0 ? `${Math.abs(entry.days_remaining)}d late` : entry.days_remaining! === 0 ? "Today" : `${entry.days_remaining}d`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right w-16">
                        <Link href={`/tasks/${entry.task_id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </PageContainer>
    </div>
  );
}
