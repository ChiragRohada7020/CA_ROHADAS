"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Mail, Smartphone, FileText, Clock, AlertTriangle, CheckCircle, Users, ShieldCheck } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster } from "@/components/ui";
import { api } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import { channelTone, notificationStatusTone } from "@/lib/status";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/PageContainer";

export default function CommunicationsPage() {
  const { data, isPending } = useQuery({
    queryKey: ["communications"],
    queryFn: () => api.get<any>("/communications?limit=100"),
    staleTime: 5 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Communications" subtitle="View client communications and notifications." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  const communications = data?.items ?? [];

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Communications"
          subtitle="Track emails, WhatsApp messages, and notifications sent to clients."
          action={
            <Button>Send Communication</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Communications" }]}
        />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Messages</p>
                <p className="tabular text-2xl font-bold text-foreground">{communications.length}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Mail className="h-5 w-5" />
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sent</p>
                <p className="tabular text-2xl font-bold text-emerald-600">
                  {communications.filter((c: any) => c.status === "sent").length}
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Failed</p>
                <p className="tabular text-2xl font-bold text-destructive">
                  {communications.filter((c: any) => c.status === "failed").length}
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
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Queued</p>
                <p className="tabular text-2xl font-bold text-amber-600">
                  {communications.filter((c: any) => c.status === "queued").length}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Clock className="h-5 w-5" />
              </div>
            </div>
          </Card>
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Communication Log</CardTitle>
            <CardDescription>All messages sent to clients and their delivery status.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {(communications.length ?? 0) === 0 ? (
              <div className="p-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No communications yet.</p>
              </div>
            ) : (
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left">Template</TableHead>
                    <TableHead className="text-left hidden sm:table-cell">Channel</TableHead>
                    <TableHead className="text-left hidden md:table-cell">Recipient</TableHead>
                    <TableHead className="text-center hidden lg:table-cell">Status</TableHead>
                    <TableHead className="text-right hidden xl:table-cell">Sent At</TableHead>
                    <TableHead className="w-16 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {communications.map((comm: any) => (
                    <TableRow key={comm.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm">
                        <span className="font-medium text-foreground">{comm.title}</span>
                        <p className="text-[11px] text-muted-foreground">{comm.template}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">
                        {humanise(comm.channel)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {comm.client_name ?? comm.recipient_email ?? "—"}
                      </TableCell>
                      <TableCell className="text-center hidden lg:table-cell">
                        <Badge variant={notificationStatusTone(comm.status) as any} className="text-[10px] px-2.5 py-0.5">
                          {humanise(comm.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden xl:table-cell">
                        <span className="tabular text-xs text-muted-foreground">
                          {formatDate(comm.sent_at ?? comm.created_at)}
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
