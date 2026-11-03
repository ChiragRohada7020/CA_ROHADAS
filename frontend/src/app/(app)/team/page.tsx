"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users, User, ShieldCheck, Building2, Clock, Activity } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

const TEAM_TABS = [
  { key: "overview", label: "Overview" },
  { key: "members", label: "Members" },
  { key: "roles", label: "Roles" },
  { key: "workload", label: "Workload" },
];

export default function TeamPage() {
  const { data, isPending } = useQuery({
    queryKey: ["users", "directory"],
    queryFn: () => api.get<any>("/users?limit=500&include_inactive=true"),
    staleTime: 10 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Team" subtitle="Manage firm staff and permissions." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
        </div>
      </div>
    );
  }

  const members = data?.items ?? [];
  const active = members.filter((m: any) => m.status === "active");

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Team"
          subtitle="Manage staff, roles, and workload distribution."
          action={
            <Button>Add Member</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Team" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Members</p>
                <p className="tabular text-2xl font-bold text-foreground">{members.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
                <p className="tabular text-2xl font-bold text-foreground">{active.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <User className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Open Tasks</p>
                <p className="tabular text-2xl font-bold text-foreground">0</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Activity className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. Utilisation</p>
                <p className="tabular text-2xl font-bold text-foreground">—%</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>All firm staff with roles and contact details.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(members.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No team members yet.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Name</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Designation</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Department</TableHead>
                    <TableHead className="text-left hidden lg:table-cell">Email</TableHead>
                    <TableHead className="text-center hidden xl:table-cell">Status</TableHead>
                    <TableHead className="text-right w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member: any) => (
                    <TableRow key={member.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex size-6 items-center justify-center rounded-full bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                            {member.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{member.full_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {member.designation ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {member.department ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                        {member.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-center hidden xl:table-cell">
                        <Badge variant={member.status === "active" ? "success" : "neutral"} className="text-[10px] px-2.5 py-0.5">
                          {humanise(member.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right w-20">
                        <Button variant="outline" size="sm" className="w-full">
                          <ArrowRight className="h-3 w-3" />
                        </Button>
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
