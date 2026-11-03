"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users, FileText, Folder, Clock, AlertTriangle, CheckCircle, Mail, Smartphone } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { documentStatusTone } from "@/lib/status";
import type { DocumentRow } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function DocumentsPage() {
  const { data, isPending } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.get<any>("/documents?limit=100"),
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Documents" subtitle="Manage client documents and files." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  const documents = data?.items ?? [];

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Documents"
          subtitle="Store, track, and manage client documents."
          action={
            <Button>Upload Document</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Documents" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Files</p>
                <p className="tabular text-2xl font-bold text-foreground">{documents.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Folder className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending from Clients</p>
                <p className="tabular text-2xl font-bold text-amber-600">0</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shared</p>
                <p className="tabular text-2xl font-bold text-emerald-600">0</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Used</p>
                <p className="tabular text-2xl font-bold text-foreground">0 MB</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Document Repository</CardTitle>
            <CardDescription>All documents organized by client and category.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(documents.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <Folder className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No documents yet.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Document</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Client</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Status</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Updated</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc: any) => (
                    <TableRow key={doc.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-2">
                          <div className="flex size-5 items-center justify-center rounded-md bg-muted/40 text-[10px] font-semibold text-muted-foreground">
                            {doc.title.split(" ").map((n: string) => n[0]).join("").toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{doc.title}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {doc.client_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {doc.category ?? "—"}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <Badge variant={documentStatusTone(doc.status) as any} className="text-[10px] px-2.5 py-0.5">
                          {humanise(doc.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden xl:table-cell">
                        <span className="tabular text-xs text-muted-foreground">
                          {formatDate(doc.updated_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right w-16">
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
