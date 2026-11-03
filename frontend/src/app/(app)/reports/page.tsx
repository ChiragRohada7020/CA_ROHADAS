"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Clock, FileText, Users, PiggyBank, AlertTriangle, TrendingUp, Banknote } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, formatMoney, humanise } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

const REPORT_TABS = [
  { key: "revenue", label: "Revenue" },
  { key: "clients", label: "Clients" },
  { key: "tasks", label: "Tasks" },
  { key: "compliance", label: "Compliance" },
  { key: "team", label: "Team" },
];

export default function ReportsPage() {
  const { data, isPending } = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => api.get<any>("/reports/dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Reports" subtitle="View practice analytics and insights." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
          <div className="h-4 w-16 bg-muted rounded animate-pulse mx-auto" />
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mt-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Reports & Analytics"
          subtitle="Practice performance, compliance, and financial insights."
          action={
            <Button>Export</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]}
        />

        <Tabs defaultValue="revenue" className="[&_[role=tablist]]:border-none">
          <TabsList className="grid w-full grid-cols-5 border-b border-border">
            {REPORT_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="flex flex-col items-center gap-1.5 px-2 py-3 text-sm font-medium transition-colors border-b-2 border-transparent">
                <BarChart3 className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="revenue" className="border-none p-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Total Revenue</CardTitle>
                  <CardDescription>Fees invoiced this period.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="tabular text-3xl font-bold text-foreground">
                        ₹0
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        <TrendingUp className="h-3 w-3 mr-1" /> 12% from last month
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <PiggyBank className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Outstanding</CardTitle>
                  <CardDescription>Amounts owed by clients.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="tabular text-3xl font-bold text-foreground">
                        ₹0
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        <AlertTriangle className="h-3 w-3 mr-1" /> ₹0 overdue
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Collected</CardTitle>
                  <CardDescription>Payments received this period.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="tabular text-3xl font-bold text-foreground">
                        ₹0
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        <TrendingUp className="h-3 w-3 mr-1" /> Steady collection
                      </p>
                    </div>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Banknote className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="clients" className="border-none p-6">
            <Card>
              <CardHeader>
                <CardTitle>Client Growth</CardTitle>
                <CardDescription>Client acquisition over time.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <EmptyState
                  title="No client data"
                  description="Client reports will appear here once clients are added."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="border-none p-6">
            <Card>
              <CardHeader>
                <CardTitle>Task Performance</CardTitle>
                <CardDescription>Task completion and turnaround.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <EmptyState
                  title="No task data"
                  description="Task reports will appear once work is generated."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compliance" className="border-none p-6">
            <Card>
              <CardHeader>
                <CardTitle>Compliance Status</CardTitle>
                <CardDescription>Filing deadlines and status.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <EmptyState
                  title="No compliance data"
                  description="Compliance reports will appear once rules are configured."
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="border-none p-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Productivity</CardTitle>
                <CardDescription>Staff workload and utilisation.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <EmptyState
                  title="No team data"
                  description="Team reports will appear once staff are added."
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </PageContainer>
    </div>
  );
}
