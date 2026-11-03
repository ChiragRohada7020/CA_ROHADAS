"use client";

import Link from "next/link";
import { ArrowRight, Settings, Building2, Mail, Smartphone, Clock, ShieldCheck, FileText, CreditCard, Banknote } from "lucide-react";

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Toaster, Tabs, TabsContent, TabsList, TabsTrigger, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { PageContainer } from "@/components/PageContainer";

const SETTINGS_TABS = [
  { key: "firm", label: "Firm Profile" },
  { key: "invoice", label: "Invoice Settings" },
  { key: "tax", label: "Tax Settings" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
];

export default function SettingsPage() {
  const { data: firm, isPending } = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<any>("/billing/settings"),
    staleTime: 10 * 60 * 1000,
  });

  if (isPending) {
    return (
      <div className="min-h-screen py-8">
        <PageHeader title="Settings" subtitle="Configure your firm settings." />
        <div className="p-8 text-center">
          <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <Toaster />
      <PageContainer>
        <PageHeader
          title="Settings"
          subtitle="Manage firm profile, invoices, tax, and notifications."
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Settings" }]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <Tabs defaultValue="firm" className="[&_[role=tablist]]:flex-col [&_[role=tablist]]:border-none [&_[role=tablist]]:gap-2">
                  <TabsList className="flex flex-col gap-1">
                    {SETTINGS_TABS.map((tab) => (
                      <TabsTrigger
                        key={tab.key}
                        value={tab.key}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-sm font-medium transition-colors rounded-lg border-l-2 border-transparent"
                      >
                        <Settings className="h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-6 space-y-6">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {firm?.legal_name ?? firm?.name ?? "Your Firm"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {firm?.city && firm?.state ? `${firm.city}, ${firm.state}` : "No address set"}
                      </p>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{firm?.email ?? "Not configured"}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{firm?.phone ?? "Not configured"}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-9">
            <TabsContent value="firm" className="border-none">
              <Card>
                <CardHeader>
                  <CardTitle>Firm Profile</CardTitle>
                  <CardDescription>Configure your firm's identity and contact details.</CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Firm Name</label>
                      <Input defaultValue={firm?.legal_name ?? firm?.name ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Firm Slug</label>
                      <Input defaultValue={firm?.slug ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Owner Name</label>
                      <Input defaultValue={firm?.owner_name ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Owner Email</label>
                      <Input type="email" defaultValue={firm?.owner_email ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Address Line 1</label>
                      <Input defaultValue={firm?.address_line1 ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">City</label>
                      <Input defaultValue={firm?.city ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">State</label>
                      <Input defaultValue={firm?.state ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">PIN Code</label>
                      <Input defaultValue={firm?.pincode ?? ""} className="input" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">State Code (GST)</label>
                      <Select defaultValue="" onValueChange={() => {}}>
                        <SelectTrigger className="input w-full">
                          <SelectValue placeholder="Select state code" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="27">Maharashtra (27)</SelectItem>
                          <SelectItem value="29">Karnataka (29)</SelectItem>
                          <SelectItem value="07">Delhi (07)</SelectItem>
                          <SelectItem value="09">Uttar Pradesh (09)</SelectItem>
                          <SelectItem value="03">Punjab (03)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center gap-3">
                    <Button>Save Changes</Button>
                    <Button variant="outline">Discard</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
