"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui";
import { PermissionGate } from "@/components/PermissionGate";
import { ClientActions } from "@/components/ClientActions";
import { FormActions, FormError, SelectField, TextField, TextAreaField } from "@/components/form";
import { ApiError, api, buildQuery } from "@/lib/api";
import { cn, formatDate, humanise } from "@/lib/format";
import {
  clientStatusTone,
  engagementTone,
  kycTone,
  registrationStatusTone,
  riskTone,
  taskStatusTone,
} from "@/lib/status";
import { initials, userName, useUserDirectory } from "@/lib/users";
import type {
  ClientDetail,
  ClientProgressSummary,
  ClientUpdatePayload,
  DocumentRequestRow,
  DocumentRow,
  GenerateResult,
  Invoice,
  Page,
  ReceivablesSummary,
  TaskListItem,
} from "@/lib/types";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "billing", label: "Billing" },
];

export default function ClientDetailPage() {
  const { clientId } = useParams();
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen py-8">
      <PageContainer>
        <PageHeader
          title="Client Details"
          subtitle="View and manage client information."
          action={
            <Button>Edit Client</Button>
          }
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Clients", href: "/clients" }, { label: "Details" }]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Client Profile</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40 mb-4 text-muted-foreground font-bold text-2xl">
                    JC
                  </div>
                  <h3 className="text-lg font-bold text-foreground">Client Name</h3>
                  <p className="text-sm text-muted-foreground">client-code-001</p>
                  <Badge variant="success">Active</Badge>
                </div>
                <div className="my-6 border-t border-border"></div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 text-muted-foreground">B</div>
                    <div className="flex flex-col">
                      <p className="text-sm font-medium text-foreground">Company Name</p>
                      <p className="text-xs text-muted-foreground">Legal entity</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-8">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <div className="grid w-full grid-cols-5 border-b border-border">
                  {TABS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 px-2 py-3 text-sm font-medium transition-colors border-b-2 border-transparent",
                        tab === t.key
                          ? "border-hsl(var(--primary)) text-hsl(var(--primary))"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <div className="h-4 w-4">{t.label.charAt(0)}</div>
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="border-none p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Card className="p-4">
                    <CardHeader>
                      <CardTitle>Open Tasks</CardTitle>
                      <CardDescription>Tasks awaiting completion.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="tabular text-2xl font-bold text-foreground">12</p>
                          <p className="text-xs text-muted-foreground">3 overdue</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="p-4">
                    <CardHeader>
                      <CardTitle>Upcoming Deadlines</CardTitle>
                      <CardDescription>Compliance dates ahead.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="tabular text-2xl font-bold text-foreground">5</p>
                          <p className="text-xs text-muted-foreground">This month</p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <div className="h-5 w-5">C</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
