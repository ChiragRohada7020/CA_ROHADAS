"use client";

import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorState, LoadingState, Modal, StatCard } from "@/components/ui";
import { Icon } from "@/components/Icon";
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

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "billing", label: "Billing" },
  { key: "notes", label: "Notes" },
  { key: "timeline", label: "Timeline" },
] as const;

function Detail({
  label,
  value,
  mono = false,
}: {
  label: React.ReactNode;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-[#737A96]">
        {label}
      </dt>
      <dd className={cn("mt-0.5 text-sm text-[#171A32]", mono && "font-mono")}>
        {value || "—"}
      </dd>
    </div>
  );
}

const KYC_STATUSES = ["pending", "verified", "expired", "rejected"] as const;
const RISK_LEVELS = ["low", "medium", "high"] as const;

function ClientDetailsForm({
  client,
  open,
  onClose,
}: {
  client: ClientDetail;
  open: boolean;
  onClose: () => void;
}) {
  const [legalName, setLegalName] = useState(client.legal_name ?? "");
  const [tradeName, setTradeName] = useState(client.trade_name ?? "");
  const [pan, setPan] = useState(client.pan ?? "");
  const [tan, setTan] = useState(client.tan ?? "");
  const [cin, setCin] = useState(client.cin ?? "");
  const [gstin, setGstin] = useState(client.gstin ?? "");
  const [llpin, setLlpin] = useState(client.llpin ?? "");
  const [addressLine1, setAddressLine1] = useState(client.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(client.address_line2 ?? "");
  const [city, setCity] = useState(client.city ?? "");
  const [state, setState] = useState(client.state ?? "");
  const [stateCode, setStateCode] = useState(client.state_code ?? "");
  const [pincode, setPincode] = useState(client.pincode ?? "");
  const [kycStatus, setKycStatus] = useState<string>(client.kyc_status ?? "");
  const [riskClassification, setRiskClassification] = useState<string>(
    client.risk_classification ?? "",
  );
  const [relationshipNotes, setRelationshipNotes] = useState(
    client.relationship_notes ?? "",
  );
  const [dateOfIncorporation, setDateOfIncorporation] = useState(
    client.date_of_incorporation ?? "",
  );
  const [dateOfBirth, setDateOfBirth] = useState(client.date_of_birth ?? "");

  const mutation = useMutation({
    mutationFn: (payload: ClientUpdatePayload) =>
      api.patch<ClientDetail>(`/clients/${client.id}`, payload),
    onSuccess: onClose,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ClientUpdatePayload = {};

    if (legalName.trim()) payload.legal_name = legalName.trim();
    if (tradeName.trim()) payload.trade_name = tradeName.trim();

    payload.pan = pan.trim() ? pan.trim().toUpperCase() : null;
    payload.tan = tan.trim() ? tan.trim().toUpperCase() : null;
    payload.cin = cin.trim() ? cin.trim().toUpperCase() : null;
    payload.gstin = gstin.trim() ? gstin.trim().toUpperCase() : null;
    payload.llpin = llpin.trim() ? llpin.trim().toUpperCase() : null;

    if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
    if (city.trim()) payload.city = city.trim();
    if (state.trim()) payload.state = state.trim();
    if (stateCode.trim()) payload.state_code = stateCode.trim();
    if (pincode.trim()) payload.pincode = pincode.trim();

    if (kycStatus) {
      payload.kyc_status = kycStatus as ClientUpdatePayload["kyc_status"];
    }

    if (riskClassification) {
      payload.risk_classification =
        riskClassification as ClientUpdatePayload["risk_classification"];
    }

    if (relationshipNotes.trim()) {
      payload.relationship_notes = relationshipNotes.trim();
    }

    payload.date_of_incorporation = dateOfIncorporation || null;
    payload.date_of_birth = dateOfBirth || null;

    mutation.mutate(payload);
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit client details" size="xl">
      <form
        className="space-y-5 bg-[#FCFBFF] p-5 sm:p-6"
        onSubmit={handleSubmit}
      >
        {mutation.isError && <FormError error={mutation.error} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="Legal name"
            value={legalName}
            onChange={setLegalName}
            required
          />
          <TextField
            label="Trade name"
            value={tradeName}
            onChange={setTradeName}
          />
          <TextField
            label="PAN"
            value={pan}
            onChange={setPan}
            placeholder="AAAAA1234A"
          />
          <TextField
            label="TAN"
            value={tan}
            onChange={setTan}
            placeholder="AAAAA1234A"
          />
          <TextField
            label="CIN"
            value={cin}
            onChange={setCin}
            placeholder="U123456789012345678"
          />
          <TextField
            label="GSTIN"
            value={gstin}
            onChange={setGstin}
            placeholder="27AAAAA123456789Z"
          />
          <TextField label="LLPIN" value={llpin} onChange={setLlpin} />
          <TextField
            label="Date of incorporation"
            value={dateOfIncorporation}
            onChange={setDateOfIncorporation}
            type="date"
          />
          <TextField
            label="Date of birth"
            value={dateOfBirth}
            onChange={setDateOfBirth}
            type="date"
          />
          <TextField
            label="Address"
            value={addressLine1}
            onChange={setAddressLine1}
            required
          />
          <TextField
            label="Address (line 2)"
            value={addressLine2}
            onChange={setAddressLine2}
          />
          <TextField label="City" value={city} onChange={setCity} />
          <TextField label="State" value={state} onChange={setState} />
          <TextField
            label="State code"
            value={stateCode}
            onChange={setStateCode}
          />
          <TextField
            label="Pincode"
            value={pincode}
            onChange={setPincode}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="KYC status"
            value={kycStatus}
            onChange={setKycStatus}
            options={KYC_STATUSES.map((v) => ({
              value: v,
              label: humanise(v),
            }))}
          />
          <SelectField
            label="Risk classification"
            value={riskClassification}
            onChange={setRiskClassification}
            options={RISK_LEVELS.map((v) => ({
              value: v,
              label: humanise(v),
            }))}
          />
        </div>

        <TextAreaField
          label="Relationship notes"
          value={relationshipNotes}
          onChange={setRelationshipNotes}
        />

        <FormActions
          submitLabel="Save"
          busy={mutation.isPending}
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}

function ClientAssignmentForm({
  client,
  directory,
  open,
  onClose,
}: {
  client: ClientDetail;
  directory: ReturnType<typeof useUserDirectory>;
  open: boolean;
  onClose: () => void;
}) {
  const [partnerId, setPartnerId] = useState(client.partner_id ?? "");
  const [managerId, setManagerId] = useState(client.manager_id ?? "");

  const mutation = useMutation({
    mutationFn: (payload: ClientUpdatePayload) =>
      api.patch<ClientDetail>(`/clients/${client.id}`, payload),
    onSuccess: onClose,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      partner_id: partnerId || null,
      manager_id: managerId || null,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit team assignment" size="md">
      <form
        className="space-y-5 bg-[#FCFBFF] p-5 sm:p-6"
        onSubmit={handleSubmit}
      >
        {mutation.isError && <FormError error={mutation.error} />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Partner"
            value={partnerId}
            onChange={setPartnerId}
            options={directory.active
              .filter((u) => u.is_partner)
              .map((u) => ({
                value: u.id,
                label: userName(directory.byId, u.id),
              }))}
            placeholder="Unassigned"
          />
          <SelectField
            label="Manager"
            value={managerId}
            onChange={setManagerId}
            options={directory.active
              .filter((u) => u.roles.includes("manager"))
              .map((u) => ({
                value: u.id,
                label: userName(directory.byId, u.id),
              }))}
            placeholder="Unassigned"
          />
        </div>

        <FormActions
          submitLabel="Save"
          busy={mutation.isPending}
          onCancel={onClose}
        />
      </form>
    </Modal>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  return <Badge tone={taskStatusTone(status)}>{humanise(status)}</Badge>;
}

function SummaryCard({
  icon,
  iconColor,
  label,
  value,
  subtext,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  subtext: string;
}) {
  return (
    <div className="group relative flex items-start gap-3 overflow-hidden rounded-2xl border border-[#E6E4F2] bg-white p-4 shadow-[0_5px_18px_rgba(40,35,90,.045)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(65,48,130,.09)]">
      <span
        aria-hidden
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          iconColor,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#737A96]">{label}</p>
        <p className="tabular mt-1 text-[25px] font-bold leading-none tracking-[-.04em] text-[#171A32]">
          {value}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[#9298AE]">{subtext}</p>
      </div>
    </div>
  );
}

export default function ClientWorkCentrePage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const activationFailed = searchParams.get("activation") === "failed";
  const queryClient = useQueryClient();
  const directory = useUserDirectory();

  const [tab, setTab] = useState<string>("overview");
  const [editMode, setEditMode] = useState<
    "none" | "details" | "assignment"
  >("none");

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

  const progress = useQuery({
    queryKey: ["client", clientId, "progress"],
    queryFn: () =>
      api.get<ClientProgressSummary>(`/clients/${clientId}/progress`),
    enabled: Boolean(clientId),
  });

  const missing = useQuery({
    queryKey: ["client", clientId, "missing-documents"],
    queryFn: () =>
      api.get<DocumentRequestRow[]>(
        `/document-requests/missing${buildQuery({ client_id: clientId })}`,
      ),
    enabled: Boolean(clientId),
  });

  const tasks = useQuery({
    queryKey: ["client", clientId, "tasks"],
    queryFn: () =>
      api.get<Page<TaskListItem>>(
        `/tasks${buildQuery({ client_id: clientId, limit: 100 })}`,
      ),
    enabled: Boolean(clientId),
  });

  const documents = useQuery({
    queryKey: ["client", clientId, "documents"],
    queryFn: () =>
      api.get<Page<DocumentRow>>(
        `/documents${buildQuery({ client_id: clientId, limit: 10 })}`,
      ),
    enabled: Boolean(clientId),
  });

  const invoices = useQuery({
    queryKey: ["client", clientId, "invoices"],
    queryFn: () =>
      api.get<Page<Invoice>>(
        `/invoices${buildQuery({ client_id: clientId, limit: 10 })}`,
      ),
    enabled: Boolean(clientId),
  });

  const receivables = useQuery({
    queryKey: ["receivables", "summary"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
    enabled: Boolean(clientId),
  });

  const unbilled = useQuery({
    queryKey: ["client", clientId, "unbilled"],
    queryFn: () =>
      api.post<GenerateResult>("/invoices/generate", {
        client_id: clientId,
        apply: false,
      }),
    enabled: Boolean(clientId),
  });

  if (client.isPending) {
    return <LoadingState label="Loading client…" />;
  }

  if (client.isError) {
    return (
      <ErrorState
        message={
          client.error instanceof ApiError
            ? client.error.message
            : "Could not load this client."
        }
      />
    );
  }

  const row = client.data;
  const financials = receivables.data?.by_client.find(
    (entry) => entry.client_id === clientId,
  );

  const unbilledTotal = (unbilled.data?.invoices ?? []).reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  );

  const taskRows = tasks.data?.items ?? [];
  const openTasks = taskRows.filter(
    (task) =>
      !["completed", "delivered", "filed", "cancelled"].includes(task.status),
  );

  const upcoming = [...openTasks]
    .filter((task) => task.statutory_due_date)
    .sort((a, b) =>
      (a.statutory_due_date ?? "").localeCompare(
        b.statutory_due_date ?? "",
      ),
    )
    .slice(0, 5);

  const recentDocuments = documents.data?.items ?? [];

  const primaryContact =
    row.contacts.find((contact) => contact.is_primary) ?? row.contacts[0];

  const completedCount = progress.data?.completed_tasks ?? 0;
  const openCount = progress.data?.open_tasks ?? 0;
  const reviewCount = progress.data?.awaiting_review ?? 0;
  const todoCount = progress.data?.overdue_tasks ?? 0;
  const totalCount = completedCount + openCount + reviewCount + todoCount;

  const completedArc = totalCount > 0 ? Math.round((completedCount / totalCount) * 88) : 0;
  const openArc = totalCount > 0 ? Math.round((openCount / totalCount) * 88) : 0;
  const reviewArc = totalCount > 0 ? Math.round((reviewCount / totalCount) * 88) : 0;
  const todoArc = totalCount > 0 ? Math.round((todoCount / totalCount) * 88) : 0;

  return (
    <div className="min-h-full space-y-5 rounded-2xl bg-[#F7F8FC] p-3 sm:p-4 lg:p-5">
      <div>
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex items-center gap-2 text-xs font-medium text-[#858BA4]"
        >
          <Link
            href="/clients"
            className="font-medium text-[#737A96] hover:text-[#171A32]"
          >
            Clients
          </Link>
          <Icon
            name="chevron-right"
            className="h-3 w-3 text-[#CBD5E1]"
          />
          <span className="text-[#171A32]">{row.legal_name}</span>
        </nav>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E6E2F5] bg-white p-4 shadow-[0_5px_20px_rgba(40,35,90,.045)] sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#EEE8FF] text-base font-semibold text-[#6D3AE8]">
              {initials(row.legal_name)}
            </span>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold tracking-[-.04em] text-[#171A32]">
                  {row.legal_name}
                </h2>
                <Badge tone={clientStatusTone(row.status)}>
                  {humanise(row.status)}
                </Badge>
              </div>

              <p className="mt-0.5 text-sm text-[#737A96]">
                {humanise(row.client_type)}
                {" · Client Code: "}
                <span className="tabular font-mono text-[#171A32]">
                  {row.client_code}
                </span>
                {row.trade_name ? ` · ${row.trade_name}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/clients/${clientId}/edit`)}
              className="flex items-center gap-1.5 rounded-lg border border-[#E7E6F2] bg-white px-3 py-1.5 text-xs font-medium text-[#171A32] shadow-sm hover:bg-[#F7F6FC]"
            >
              <Icon name="pencil" className="h-3 w-3" />
              Edit Client
            </button>

            <Badge tone={kycTone(row.kyc_status)}>
              KYC: {humanise(row.kyc_status)}
            </Badge>

            <Badge tone={riskTone(row.risk_classification)}>
              Risk: {humanise(row.risk_classification)}
            </Badge>
          </div>

          <button className="ml-auto px-4 py-2 rounded-lg border border-[#E6E2F5] bg-white text-[#6D3AE8] font-medium text-xs hover:bg-[#F7F6FC] hover:text-[#7543E9] transition-colors">
            Client Actions
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="tag" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">PAN</p>
              <p className="tabular text-xs text-[#737A96]">{row.pan ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="file-text" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">GSTIN</p>
              <p className="tabular text-xs text-[#737A96]">{row.gstin ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="calendar" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">Incorporation</p>
              <p className="tabular text-xs text-[#737A96]">{formatDate(row.date_of_incorporation ?? "") || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="building" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">Location</p>
              <p className="tabular text-xs text-[#737A96]">
                {row.city}, {row.state}, {row.pincode}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="user-round" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">Primary Contact</p>
              <p className="tabular text-xs text-[#737A96]">
                {primaryContact?.name ?? "—"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-[#E6E2F5] bg-white p-3">
            <Icon name="envelope" className="h-5 w-5 text-[#CBD5E1]" />
            <div>
              <p className="text-xs font-medium text-[#171A32]">Email</p>
              <p className="tabular text-xs text-[#737A96]">
                {primaryContact?.email ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <section
        className="overflow-hidden rounded-2xl border border-[#E6E2F5] bg-white shadow-[0_5px_20px_rgba(40,35,90,.045)]"
        aria-labelledby="client-quick-actions"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EEEFF6] px-4 py-3 sm:px-5">
          <div>
            <h3
              id="client-quick-actions"
              className="text-sm font-bold text-[#171A32]"
            >
              Quick Actions
            </h3>
            <p className="mt-0.5 text-xs text-[#9298AE]">
              Common tasks for this client
            </p>
          </div>

          <span className="rounded-full bg-[#F3EFFF] px-2.5 py-1 text-[10px] font-semibold text-[#6D3AE8]">
            CLIENT SHORTCUTS
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-6 sm:p-4">
          {[
            {
              label: "Create Task",
              hint: "Assign work",
              href: `/tasks/new?client_id=${encodeURIComponent(clientId)}`,
              icon: "tasks" as const,
              tone: "bg-[#EAF3FF] text-[#3478D4]",
            },
            {
              label: "Add Document",
              hint: "Upload a file",
              href: `/documents?client_id=${encodeURIComponent(clientId)}`,
              icon: "file-text" as const,
              tone: "bg-[#FFF1E8] text-[#D97736]",
            },
            {
              label: "Create Invoice",
              hint: "Bill this client",
              href: `/invoices/new?client_id=${encodeURIComponent(clientId)}`,
              icon: "receipt" as const,
              tone: "bg-[#F1EAFF] text-[#7543E9]",
            },
            {
              label: "Record Payment",
              hint: "Update collection",
              href: `/receivables?client_id=${encodeURIComponent(clientId)}`,
              icon: "wallet" as const,
              tone: "bg-[#E8F8EF] text-[#22965A]",
            },
          ].map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] p-3 transition duration-200 hover:-translate-y-0.5 hover:border-[#CFC0F8] hover:bg-[#F7F3FF] hover:shadow-[0_6px_16px_rgba(90,60,160,.08)]"
            >
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-xl ${action.tone}`}
              >
                <Icon name={action.icon} className="h-[18px] w-[18px]" />
              </span>

              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-[#252B47] group-hover:text-[#6032D4]">
                  {action.label}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-[#9298AE]">
                  {action.hint}
                </span>
              </span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => setTab("services")}
            className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#CFC0F8] hover:bg-[#F7F3FF] hover:shadow-[0_6px_16px_rgba(90,60,160,.08)]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#E8F7F7] text-[#168B8B]">
              <Icon
                name="briefcase-business"
                className="h-[18px] w-[18px]"
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[#252B47] group-hover:text-[#6032D4]">
                Manage Services
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-[#9298AE]">
                View engagements
              </span>
            </span>
          </button>

              <button
                type="button"
                onClick={() => router.push(`/clients/${clientId}/edit`)}
                className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-[#CFC0F8] hover:bg-[#F7F3FF] hover:shadow-[0_6px_16px_rgba(90,60,160,.08)]"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#FFF0F3] text-[#D84C72]">
                  <Icon name="pencil" className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-[#252B47] group-hover:text-[#6032D4]">
                    Edit Client
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-[#9298AE]">
                    Update profile
                  </span>
                </span>
              </button>
        </div>
      </section>

      {activationFailed && (
        <p
          role="alert"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          The client was created, but activating it did not succeed — so it is
          still a prospect and no recurring work will be generated for it. Use{" "}
          <strong>Change status</strong> above to activate it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E7E3F3] bg-white p-2 shadow-[0_4px_16px_rgba(40,35,90,.04)]">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === entry.key
                ? "bg-gradient-to-r from-[#7543E9] to-[#6032D4] text-white shadow-[0_5px_14px_rgba(104,61,213,.22)]"
                : "text-[#69718F] hover:bg-[#F5F1FF] hover:text-[#6637D7]",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* Summary Cards */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard
              icon={<Icon name="tasks" className="h-6 w-6" />}
              iconColor="bg-[#E0F2FE] text-[#0EA5E9]"
              label="Open Tasks"
              value={String(openTasks.length)}
              subtext="Tasks needing attention"
            />
            <SummaryCard
              icon={<Icon name="file-text" className="h-6 w-6" />}
              iconColor="bg-[#FEF3C7] text-[#F59E0B]"
              label="Pending Documents"
              value={String(missing.data?.length ?? 0)}
              subtext="Documents awaited from clients"
            />
            <SummaryCard
              icon={<Icon name="briefcase-business" className="h-6 w-6" />}
              iconColor="bg-[#DCFCE7] text-[#16A34A]"
              label="Active Services"
              value={String(row.services.filter((s) => s.is_active).length)}
              subtext="Services assigned to this client"
            />
            <SummaryCard
              icon={<Icon name="receivables" className="h-6 w-6" />}
              iconColor="bg-[#F0F9FF] text-[#713FE6]"
              label="Outstanding Receivables"
              value={
                financials
                  ? `₹${financials.outstanding.toLocaleString("en-IN")}`
                  : "₹0"
              }
              subtext="Unpaid invoice balance"
            />
            <SummaryCard
              icon={<Icon name="calendar" className="h-6 w-6" />}
              iconColor="bg-[#FEF2F2] text-[#DC2626]"
              label="Next Deadline"
              value={formatDate(upcoming[0]?.statutory_due_date ?? "") || "—"}
              subtext={upcoming[0]?.title ?? "Nothing scheduled"}
            />
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-4">

              {/* Client Information */}
              <Card title="Client Information" subtitle="Core client details">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                  <Detail label="Client Code" value={row.client_code} mono />
                  <Detail label="Legal Name" value={row.legal_name} />
                  <Detail label="Trade Name" value={row.trade_name ?? null} />
                  <Detail label="Type" value={humanise(row.client_type)} />
                  <Detail label="Status" value={humanise(row.status)} />
                  <Detail label="KYC Status" value={humanise(row.kyc_status)} />
                  <Detail label="Risk Classification" value={humanise(row.risk_classification)} />
                  <Detail label="Phone" value={primaryContact?.phone ?? null} />
                  <Detail label="Email" value={primaryContact?.email ?? null} />
                  <Detail
                    label="Address"
                    value={
                      [row.address_line1, row.address_line2]
                        .filter(Boolean)
                        .join(", ") || null
                    }
                  />
                  <Detail
                    label="Location"
                    value={
                      [row.city, row.state, row.pincode]
                        .filter(Boolean)
                        .join(", ") || null
                    }
                  />
                </dl>
              </Card>

              {/* Recent Tasks */}
              <Card title="Recent Tasks" subtitle={`${taskRows.length} tasks`} action={
                <Link
                  href={`/tasks?client_id=${encodeURIComponent(clientId)}`}
                  className="text-xs font-medium text-[#6D3AE8] hover:underline"
                >
                  View All →
                </Link>
              }>
                {tasks.isPending ? (
                  <LoadingState label="Loading tasks…" />
                ) : taskRows.length === 0 ? (
                  <EmptyState message="No tasks have been created for this client." />
                ) : (
                  <ul className="divide-y divide-[#EEEFF6]">
                    {[...taskRows]
                      .sort((a, b) =>
                        (a.statutory_due_date ?? "").localeCompare(
                          b.statutory_due_date ?? "",
                        ),
                      )
                      .slice(0, 5)
                      .map((task) => (
                        <li
                          key={task.id}
                          className="flex items-start justify-between gap-3 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-sm font-medium text-[#171A32] hover:text-[#6D3AE8]"
                            >
                              {task.title}
                            </Link>
                            <p className="mt-0.5 text-xs text-[#737A96]">
                              {formatDate(task.statutory_due_date ?? "") || "—"}
                            </p>
                          </div>
                          <Badge tone={taskStatusTone(task.status)}>
                            {humanise(task.status)}
                          </Badge>
                        </li>
                      ))}
                  </ul>
                )}
              </Card>

            </div>

            {/* Right Column */}
            <div className="space-y-4">

              {/* Engagement Health */}
<Card title="Engagement Health" subtitle="Work completion rate">
                <div className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Donut Chart */}
                    <div className="relative w-28 h-28 flex-shrink-0">
                      <svg className="w-full h-full" viewBox="0 0 36 36">
                        {/* Background track */}
                        <circle
                          className="text-[#E6E4F2]"
                          stroke="#E6E4F2"
                          strokeWidth="4"
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          strokeLinecap="round"
                        />
                        {totalCount > 0 && (
                          <>
                            {/* Completed - Green */}
                            <circle
                              stroke="#16A34A"
                              strokeWidth="4"
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray="88"
                              strokeDashoffset={
                                88 -
                                (completedCount / totalCount) * 88
                              }
                              transform={`rotate(${-90} 18 18)`}
                            />
                            {/* In Progress - Purple */}
                            <circle
                              stroke="#7543E9"
                              strokeWidth="4"
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray="88"
                              strokeDashoffset={
                                88 - (openCount / totalCount) * 88
                              }
                              transform={`rotate(${-90 + (completedCount / totalCount) * 360} 18 18)`}
                            />
                            {/* Review - Orange */}
                            <circle
                              stroke="#F59E0B"
                              strokeWidth="4"
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray="88"
                              strokeDashoffset={
                                88 - (reviewCount / totalCount) * 88
                              }
                              transform={`rotate(${-90 + ((completedCount + openCount) / totalCount) * 360} 18 18)`}
                            />
                            {/* To Do - Gray */}
                            <circle
                              stroke="#9298AE"
                              strokeWidth="4"
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray="88"
                              strokeDashoffset={
                                88 - (todoCount / totalCount) * 88
                              }
                              transform={`rotate(${-90 + ((completedCount + openCount + reviewCount) / totalCount) * 360} 18 18)`}
                            />
                          </>
                        )}
                        {/* Center percentage */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-[20px] font-bold text-[#171A32]">
                            {progress.data?.progress_percent ?? 76}%
                          </span>
                          <span className="text-[11px] text-[#737A96] uppercase tracking-wide">
                            Complete
                          </span>
                        </div>
                      </svg>
                    </div>

                    {/* Progress Stats */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                        <span className="text-xs text-[#737A96]">Completed</span>
                        <span className="text-xs font-medium text-[#171A32] ml-auto">
                          {progress.data?.completed_tasks ?? 19}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#7543E9]" />
                        <span className="text-xs text-[#737A96]">In Progress</span>
                        <span className="text-xs font-medium text-[#171A32] ml-auto">
                          {progress.data?.open_tasks ?? 4}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#F59E0B]" />
                        <span className="text-xs text-[#737A96]">Review</span>
                        <span className="text-xs font-medium text-[#171A32] ml-auto">
                          {progress.data?.awaiting_review ?? 2}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#9298AE]" />
                        <span className="text-xs text-[#737A96]">To Do</span>
                        <span className="text-xs font-medium text-[#171A32] ml-auto">
                          {progress.data?.overdue_tasks ?? 3}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Receivables Summary */}
              <Card title="Receivables Summary" subtitle="Billing and collection status">
                <dl className="grid grid-cols-1 gap-y-2 p-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[#737A96]">Total Billed</span>
                    <span className="ml-auto tabular text-xs font-semibold text-[#171A32]">
                      ₹{financials?.billed?.toLocaleString("en-IN") ?? "0"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[#737A96]">Collected</span>
                    <span className="ml-auto tabular text-xs font-semibold text-[#171A32]">
                      ₹{financials?.collected?.toLocaleString("en-IN") ?? "0"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[#737A96] text-[#D84C72]">Outstanding</span>
                    <span className="ml-auto tabular text-xs font-semibold text-[#D84C72]">
                      ₹{financials?.outstanding?.toLocaleString("en-IN") ?? "0"}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-[#737A96] text-[#EF4444]">Overdue</span>
                    <span className="ml-auto tabular text-xs font-semibold text-[#EF4444]">
                      ₹{financials?.overdue_outstanding?.toLocaleString("en-IN") ?? "0"}
                    </span>
                  </div>
                </dl>
              </Card>

              {/* Recent Documents */}
              <Card title="Recent Documents" subtitle={`${recentDocuments.length} documents`} action={
                <Link
                  href={`/documents?client_id=${encodeURIComponent(clientId)}`}
                  className="text-xs font-medium text-[#6D3AE8] hover:underline"
                >
                  Add Document →
                </Link>
              }>
                {documents.isPending ? (
                  <LoadingState label="Loading documents…" />
                ) : recentDocuments.length === 0 ? (
                  <EmptyState message="No documents have been uploaded for this client." />
                ) : (
                  <ul className="divide-y divide-[#EEEFF6]">
                    {recentDocuments.slice(0, 5).map((document) => (
                      <li
                        key={document.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#DC4545]">
                            <Icon name="file-text" className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[#252B47]">
                              {document.title}
                            </p>
                            <p className="text-xs text-[#9298AE]">
                              {humanise(document.doc_type ?? "document")}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-[#737A96]">
                          {document.created_at ? formatDate(document.created_at) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Relationship Notes */}
              <Card title="Relationship Notes" subtitle="Client relationship context">
                <div className="p-4">
                  {row.relationship_notes ? (
                    <div className="whitespace-pre-wrap p-4 rounded-lg bg-[#F7F6FC] text-sm text-[#737A96]">
                      {row.relationship_notes}
                    </div>
                  ) : (
                    <EmptyState message="No relationship notes have been added." />
                  )}
                </div>
              </Card>

            </div>
          </div>
        </>
      )}
      {tab === "services" && (
        <div className="space-y-4">
          <Card
            title="Client Services"
            subtitle="Services currently associated with this client"
          >
            {row.services.length === 0 ? (
              <EmptyState message="No services are assigned to this client yet." />
            ) : (
              <ul className="divide-y divide-[#EEEFF6]">
                {row.services.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#F1EAFF] text-[#7543E9]">
                        <Icon name="briefcase-business" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-[#171A32]">
                          {link.service?.name ?? "Service"}
                        </p>
                        <p className="mt-1 text-xs text-[#737A96]">
                          {humanise(link.service?.category ?? "other")}
                          {link.service?.default_frequency
                            ? ` · ${humanise(link.service.default_frequency)}`
                            : ""}
                          {link.service?.standard_fee != null
                            ? ` · ₹${link.service.standard_fee.toLocaleString("en-IN")}`
                            : ""}
                        </p>
                      </div>
                    </div>
                    <Badge tone={link.is_active ? "success" : "neutral"}>
                      {link.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "tasks" && (
        <Card
          title="Client Tasks"
          subtitle={`${taskRows.length} tasks associated with this client`}
          action={
            <Link
              href={`/tasks/new?client_id=${encodeURIComponent(clientId)}`}
              className="rounded-lg bg-[#6D3AE8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5D2CCB]"
            >
              + Create Task
            </Link>
          }
        >
          {tasks.isPending ? (
            <LoadingState label="Loading tasks…" />
          ) : tasks.isError ? (
            <ErrorState message="Could not load client tasks." />
          ) : taskRows.length === 0 ? (
            <EmptyState message="No tasks have been created for this client." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F7F6FC]">
                  <tr>
                    <th className="th">Task</th>
                    <th className="th">Due Date</th>
                    <th className="th">Status</th>
                    <th className="th">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEFF6]">
                  {taskRows.map((task) => (
                    <tr key={task.id} className="hover:bg-[#FAF9FF]">
                      <td className="td py-3">
                        <Link
                          href={`/tasks/${task.id}`}
                          className="text-sm font-medium text-[#252B47] hover:text-[#6D3AE8]"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="td tabular text-xs">
                        {task.statutory_due_date
                          ? formatDate(task.statutory_due_date)
                          : "—"}
                      </td>
                      <td className="td">
                        <TaskStatusBadge status={task.status} />
                      </td>
                      <td className="td text-xs text-[#737A96]">
                        {task.preparer_id
                          ? userName(directory.byId, task.preparer_id)
                          : "Unassigned"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "documents" && (
        <Card
          title="Client Documents"
          subtitle="Documents uploaded and stored for this client"
          action={
            <Link
              href={`/documents?client_id=${encodeURIComponent(clientId)}`}
              className="rounded-lg bg-[#6D3AE8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5D2CCB]"
            >
              Add Document
            </Link>
          }
        >
          {documents.isPending ? (
            <LoadingState label="Loading documents…" />
          ) : documents.isError ? (
            <ErrorState message="Could not load client documents." />
          ) : recentDocuments.length === 0 ? (
            <EmptyState message="No documents have been uploaded for this client." />
          ) : (
            <ul className="divide-y divide-[#EEEFF6]">
              {recentDocuments.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFF0F0] text-[#DC4545]">
                      <Icon name="file-text" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#252B47]">
                        {document.title}
                      </p>
                      <p className="text-xs text-[#9298AE]">
                        {humanise(document.doc_type ?? "document")}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-[#737A96]">
                    {document.created_at
                      ? formatDate(document.created_at)
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total Billed"
              value={`₹${(financials?.billed ?? 0).toLocaleString("en-IN")}`}
              hint="Invoices raised"
            />
            <StatCard
              label="Collected"
              value={`₹${(financials?.collected ?? 0).toLocaleString("en-IN")}`}
              hint="Payments received"
            />
            <StatCard
              label="Outstanding"
              value={`₹${(financials?.outstanding ?? 0).toLocaleString("en-IN")}`}
              hint="Pending collection"
            />
          </div>

          <Card
            title="Invoices"
            subtitle="Billing history for this client"
            action={
              <Link
                href={`/invoices/new?client_id=${encodeURIComponent(clientId)}`}
                className="rounded-lg bg-[#6D3AE8] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5D2CCB]"
              >
                Create Invoice
              </Link>
            }
          >
            {invoices.isPending ? (
              <LoadingState label="Loading invoices…" />
            ) : invoices.isError ? (
              <ErrorState message="Could not load client invoices." />
            ) : (invoices.data?.items ?? []).length === 0 ? (
              <EmptyState message="No invoices have been raised for this client." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#F7F6FC]">
                    <tr>
                      <th className="th">Invoice</th>
                      <th className="th">Date</th>
                      <th className="th">Due Date</th>
                      <th className="th">Amount</th>
                      <th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEEFF6]">
                    {(invoices.data?.items ?? []).map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-[#FAF9FF]">
                        <td className="td py-3">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="font-medium text-[#6D3AE8] hover:underline"
                          >
                            {invoice.invoice_number}
                          </Link>
                        </td>
                        <td className="td text-xs">
                          {formatDate(invoice.invoice_date)}
                        </td>
                        <td className="td text-xs">
                          {formatDate(invoice.due_date)}
                        </td>
                        <td className="td tabular text-xs font-semibold">
                          ₹{invoice.total.toLocaleString("en-IN")}
                        </td>
                        <td className="td">
                          <Badge tone={invoice.status === "paid" ? "success" : "warning"}>
                            {humanise(invoice.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "notes" && (
        <Card
          title="Relationship Notes"
          subtitle="Internal notes and client relationship context"
        >
          {row.relationship_notes ? (
            <div className="whitespace-pre-wrap p-5 text-sm leading-7 text-[#454B68]">
              {row.relationship_notes}
            </div>
          ) : (
            <EmptyState message="No relationship notes have been added." />
          )}
        </Card>
      )}

      {tab === "timeline" && (
        <div className="space-y-4">
          <Card
            title="Client Timeline"
            subtitle="Registrations and engagements associated with this client"
          >
            <div className="space-y-5 p-4">
              <div className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#E8F8EF] text-[#22965A]">
                  <Icon name="plus" className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[#252B47]">
                    Client created
                  </p>
                  <p className="text-xs text-[#9298AE]">
                    {row.created_at ? formatDate(row.created_at) : "Date unavailable"}
                  </p>
                </div>
              </div>

              {row.services.map((engagement) => (
                <div key={engagement.id} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F1EAFF] text-[#7543E9]">
                    <Icon name="briefcase-business" className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#252B47]">
                      {engagement.service?.name ?? "Service engagement"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#737A96]">
                      <span className="font-mono">{engagement.service?.code}</span>
                      {" · "}
                      {engagement.service?.is_recurring ? "Recurring" : "One-off"}
                      {engagement.service?.standard_fee != null &&
                        ` · ₹${engagement.service?.standard_fee.toLocaleString("en-IN")}`}
                      {engagement.end_date &&
                        ` · ends ${formatDate(engagement.end_date)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Edit Client Modal */}
      {editMode === "details" && (
        <ClientDetailsForm
          client={row}
          open={true}
          onClose={() => setEditMode("none")}
        />
      )}

      {/* Edit Assignment Modal */}
      {editMode === "assignment" && (
        <ClientAssignmentForm
          client={row}
          directory={directory}
          open={true}
          onClose={() => setEditMode("none")}
        />
      )}
    </div>
  );
}