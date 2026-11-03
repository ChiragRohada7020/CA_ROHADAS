"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Link as LinkIcon, Building2, Mail, Smartphone, ShieldCheck, FileText, Clock } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function IntegrationsPage() {
  const { data, isPending } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => api.get<any>("/integrations/providers"),
    staleTime: 10 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Integrations" subtitle="Connect Winman, Tally, and other services." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  const providers = data ?? [];

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Integrations"
          subtitle="Connect your firm's tools and data sources."
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Integrations" }]}
        />

        <Card>
          <CardHeader>
            <CardTitle>Available Integrations</CardTitle>
            <CardDescription>File-based integrations with Winman, Tally, and more.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(providers.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <LinkIcon className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No integrations configured.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Provider</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Mechanism</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Status</TableHead>
                    <TableHead className="text-right w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider: any) => (
                    <TableRow key={provider.provider} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex size-5 items-center justify-center rounded-md bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                            {provider.name.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{provider.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {provider.mechanism ?? "—"}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <Badge variant={provider.status === "connected" ? "success" : "neutral"} className="text-[10px] px-2.5 py-0.5">
                          {provider.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right w-24">
                        <Link href="/integrations/import">
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
