"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CheckCircle, Clock, FileText, Users, Mail, Smartphone } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { clientStatusTone, kycTone, riskTone } from "@/lib/status";
import type { ClientDetail, ClientRead } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function ServicesPage() {
  const { data, isPending } = useQuery({
    queryKey: ["services", "catalogue"],
    queryFn: () => api.get<any>("/services?limit=100"),
    staleTime: 10 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Services" subtitle="Manage your service catalogue." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto mb-2" />
        </div>
      </div>
    );
  }

  const services = data?.items ?? [];
  const categories = [...new Set(services.map((s: any) => s.category))];

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Services"
          subtitle="Define service lines, set fees, and track client assignments."
          action={
            <Button>Add Service</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Services" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Services</p>
                <p className="tabular text-2xl font-bold text-foreground">{services.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Categories</p>
                <p className="tabular text-2xl font-bold text-foreground">{categories.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <FileText className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {services.filter((s: any) => s.is_active).length}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignments</p>
                <p className="tabular text-2xl font-bold text-foreground">
                  {services.reduce((sum: number, s: any) => sum + (s.client_count ?? 0), 0)}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Service Catalogue</CardTitle>
            <CardDescription>All services offered by the firm.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(services.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No services defined yet.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Service</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Category</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Fee Model</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Standard Fee</TableHead>
                    <TableHead className="text-center hidden xl:table-cell">Clients</TableHead>
                    <TableHead className="text-right w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map((service: any) => (
                    <TableRow key={service.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <span className="font-medium text-foreground">{service.name}</span>
                        <p className="text-[11px] text-muted-foreground">{service.code}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {humanise(service.category)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {service.default_fee_model ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular text-right text-foreground hidden lg:table-cell">
                        {service.standard_fee ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(service.standard_fee) : "—"}
                      </TableCell>
                      <TableCell className="text-center hidden xl:table-cell">
                        <span className="tabular text-xs font-medium text-foreground">
                          {service.client_count}
                        </span>
                      </TableCell>
                      <TableCell className="w-24">
                        <Badge variant={service.is_active ? "success" : "neutral"} className="text-[10px]">
                          {service.is_active ? "Active" : "Inactive"}
                        </Badge>
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
