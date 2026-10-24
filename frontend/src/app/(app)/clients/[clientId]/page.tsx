"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Badge, Card, EmptyState, ErrorState, LoadingState, Modal } from "@/components/ui";
import { Icon } from "@/components/Icon";
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

/**
 * The work-centre tabs.
 *
 * Only Overview has a bespoke layout; the rest render the same records the dedicated
 * screens do, scoped to this client. That is deliberate — a client's documents are
 * documents, and re-inventing a thinner version here would mean two places to fix when
 * the real one changes.
 */
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "tasks", label: "Tasks" },
  { key: "documents", label: "Documents" },
  { key: "billing", label: "Billing" },
  { key: "notes", label: "Notes" },
  { key: "timeline", label: "Timeline" },
] as const;

function Detail({ label, value, mono = false }: {
  label: React.ReactNode;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
        <dt className="text-xs font-medium uppercase tracking-wide text-[#64748B]">{label}</dt>
        <dd className={cn("mt-0.5 text-sm text-[#101B3D]", mono && "font-mono")}>
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
  const [relationshipNotes, setRelationshipNotes] = useState(client.relationship_notes ?? "");
  const [dateOfIncorporation, setDateOfIncorporation] = useState(client.date_of_incorporation ?? "");
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
    if (pan.trim()) payload.pan = pan.trim().toUpperCase();
    else payload.pan = null;
    if (tan.trim()) payload.tan = tan.trim().toUpperCase();
    else payload.tan = null;
    if (cin.trim()) payload.cin = cin.trim().toUpperCase();
    else payload.cin = null;
    if (gstin.trim()) payload.gstin = gstin.trim().toUpperCase();
    else payload.gstin = null;
    if (llpin.trim()) payload.llpin = llpin.trim().toUpperCase();
    else payload.llpin = null;
    if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
    if (city.trim()) payload.city = city.trim();
    if (state.trim()) payload.state = state.trim();
    if (stateCode.trim()) payload.state_code = stateCode.trim();
    if (pincode.trim()) payload.pincode = pincode.trim();
    if (kycStatus) payload.kyc_status = kycStatus as ClientUpdatePayload["kyc_status"];
    if (riskClassification)
      payload.risk_classification = riskClassification as ClientUpdatePayload["risk_classification"];
    if (relationshipNotes.trim()) payload.relationship_notes = relationshipNotes.trim();
    if (dateOfIncorporation) payload.date_of_incorporation = dateOfIncorporation;
    else payload.date_of_incorporation = null;
    if (dateOfBirth) payload.date_of_birth = dateOfBirth;
    else payload.date_of_birth = null;
    mutation.mutate(payload);
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit client details" size="xl">
      <form className="space-y-4 p-6" onSubmit={handleSubmit}>
        {mutation.isError && <FormError error={mutation.error} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField label="Legal name" value={legalName} onChange={setLegalName} required />
          <TextField label="Trade name" value={tradeName} onChange={setTradeName} />
          <TextField label="PAN" value={pan} onChange={setPan} placeholder="AAAAA1234A" />
          <TextField label="TAN" value={tan} onChange={setTan} placeholder="AAAAA1234A" />
          <TextField label="CIN" value={cin} onChange={setCin} placeholder="U123456789012345678" />
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
          <TextField label="Date of birth" value={dateOfBirth} onChange={setDateOfBirth} type="date" />
          <TextField label="Address" value={addressLine1} onChange={setAddressLine1} required />
          <TextField label="Address (line 2)" value={addressLine2} onChange={setAddressLine2} />
          <TextField label="City" value={city} onChange={setCity} />
          <TextField label="State" value={state} onChange={setState} />
          <TextField label="State code" value={stateCode} onChange={setStateCode} />
          <TextField label="Pincode" value={pincode} onChange={setPincode} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="KYC status"
            value={kycStatus}
            onChange={setKycStatus}
            options={KYC_STATUSES.map((v) => ({ value: v, label: humanise(v) }))}
          />
          <SelectField
            label="Risk classification"
            value={riskClassification}
            onChange={setRiskClassification}
            options={RISK_LEVELS.map((v) => ({ value: v, label: humanise(v) }))}
          />
        </div>
        <TextAreaField
          label="Relationship notes"
          value={relationshipNotes}
          onChange={setRelationshipNotes}
        />
        <FormActions submitLabel="Save" busy={mutation.isPending} onCancel={onClose} />
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
      <form className="space-y-4 p-6" onSubmit={handleSubmit}>
        {mutation.isError && <FormError error={mutation.error} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Partner"
            value={partnerId}
            onChange={setPartnerId}
            options={directory.active
              .filter((u) => u.is_partner)
              .map((u) => ({ value: u.id, label: userName(directory.byId, u.id) }))}
            placeholder="Unassigned"
          />
          <SelectField
            label="Manager"
            value={managerId}
            onChange={setManagerId}
            options={directory.active
              .filter((u) => u.roles.includes("manager"))
              .map((u) => ({ value: u.id, label: userName(directory.byId, u.id) }))}
            placeholder="Unassigned"
          />
        </div>
        <FormActions submitLabel="Save" busy={mutation.isPending} onCancel={onClose} />
      </form>
    </Modal>
  );
}

/** A status pill for a task, so the period table reads at a glance. */
function TaskStatusBadge({ status }: { status: string }) {
  return <Badge tone={taskStatusTone(status)}>{humanise(status)}</Badge>;
}

export default function ClientWorkCentrePage() {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;
  const searchParams = useSearchParams();
  const activationFailed = searchParams.get("activation") === "failed";
  const queryClient = useQueryClient();
  const directory = useUserDirectory();
  const [tab, setTab] = useState<string>("overview");
  const [editMode, setEditMode] = useState<"none" | "details" | "assignment">("none");

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

  const progress = useQuery({
    queryKey: ["client", clientId, "progress"],
    queryFn: () => api.get<ClientProgressSummary>(`/clients/${clientId}/progress`),
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
      api.get<Page<TaskListItem>>(`/tasks${buildQuery({ client_id: clientId, limit: 100 })}`),
    enabled: Boolean(clientId),
  });

  const documents = useQuery({
    queryKey: ["client", clientId, "documents"],
    queryFn: () =>
      api.get<Page<DocumentRow>>(`/documents${buildQuery({ client_id: clientId, limit: 10 })}`),
    enabled: Boolean(clientId),
  });

  const invoices = useQuery({
    queryKey: ["client", clientId, "invoices"],
    queryFn: () =>
      api.get<Page<Invoice>>(`/invoices${buildQuery({ client_id: clientId, limit: 10 })}`),
    enabled: Boolean(clientId),
  });

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
      <div className="card flex items-start gap-3 p-4">
        <span
          aria-hidden
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            iconColor,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#64748B]">{label}</p>
          <p className="tabular mt-0.5 text-lg font-semibold text-[#101B3D]">{value}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#94A3B8]">{subtext}</p>
        </div>
      </div>
    );
  }

  // The client's line in the firm-wide receivables report. Fetched whole rather than
  // per-client because that endpoint has no client filter, and the report is small.
  const receivables = useQuery({
    queryKey: ["receivables", "summary"],
    queryFn: () => api.get<ReceivablesSummary>("/billing/receivables"),
    enabled: Boolean(clientId),
  });

  // What *would* be invoiced for this client's completed work. A dry run: the endpoint
  // writes nothing unless `apply` is set, so this is a preview rather than a side effect.
  const unbilled = useQuery({
    queryKey: ["client", clientId, "unbilled"],
    queryFn: () =>
      api.post<GenerateResult>("/invoices/generate", { client_id: clientId, apply: false }),
    enabled: Boolean(clientId),
  });

  if (client.isPending) return <LoadingState label="Loading client…" />;
  if (client.isError) {
    return (
      <ErrorState
        message={
          client.error instanceof ApiError ? client.error.message : "Could not load this client."
        }
      />
    );
  }

  const row = client.data;
  const financials = receivables.data?.by_client.find((entry) => entry.client_id === clientId);
  const unbilledTotal = (unbilled.data?.invoices ?? []).reduce(
    (sum, invoice) => sum + invoice.total,
    0,
  );
  const taskRows = tasks.data?.items ?? [];
  const openTasks = taskRows.filter(
    (task) => !["completed", "delivered", "filed", "cancelled"].includes(task.status),
  );
  const upcoming = [...openTasks]
    .filter((task) => task.statutory_due_date)
    .sort((a, b) => (a.statutory_due_date ?? "").localeCompare(b.statutory_due_date ?? ""))
    .slice(0, 5);
  const recentDocuments = documents.data?.items ?? [];

  // Phone and email live on the *contact*, not the client: a company does not have a phone
  // number, its people do. The primary contact is what the record shows, falling back to
  // whoever is on file first.
  const primaryContact = row.contacts.find((contact) => contact.is_primary) ?? row.contacts[0];

  return (
    <div className="space-y-5">
       <div>
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1 text-xs text-[#64748B]">
          <Link href="/clients" className="font-medium text-[#64748B] hover:text-[#101B3D]">
            Clients
          </Link>
          <Icon name="chevron-right" className="h-3 w-3 text-[#CBD5E1]" />
          <span className="text-[#101B3D]">{row.legal_name}</span>
        </nav>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-base font-semibold text-sky-700">
                {initials(row.legal_name)}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-[#101B3D]">
                    {row.legal_name}
                  </h2>
                  <Badge tone={clientStatusTone(row.status)}>{humanise(row.status)}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-[#64748B]">
                  {humanise(row.client_type)}
                  {" · Client Code: "}
                  <span className="tabular font-mono text-[#101B3D]">{row.client_code}</span>
                  {row.trade_name ? ` · ${row.trade_name}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditMode("details")}
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-3 py-1.5 text-xs font-medium text-[#101B3D] shadow-sm hover:bg-[#F6F8FC]"
              >
                <Icon name="pencil" className="h-3 w-3" />
                Edit client
              </button>
              <Badge tone={kycTone(row.kyc_status)}>KYC: {humanise(row.kyc_status)}</Badge>
              <Badge tone={riskTone(row.risk_classification)}>
                Risk: {humanise(row.risk_classification)}
              </Badge>
            </div>
          </div>
        </div>

      <ClientActions
        client={row}
        onChanged={() => {
          void queryClient.invalidateQueries({ queryKey: ["client", clientId, "progress"] });
          void queryClient.invalidateQueries({
            queryKey: ["client", clientId, "missing-documents"],
          });
        }}
      />

      {activationFailed && (
        <p
          role="alert"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          The client was created, but activating it did not succeed — so it is still a
          prospect and no recurring work will be generated for it. Use{" "}
          <strong>Change status</strong> above to activate it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1 border-b border-[#E2E8F0]">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === entry.key
                ? "border-[#1677FF] text-[#1677FF]"
                : "border-transparent text-[#64748B] hover:text-[#101B3D]",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          {/* ── Operational Summary Cards ── */}
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
              iconColor="bg-[#F0F9FF] text-[#1677FF]"
              label="Outstanding Receivables"
              value={financials ? `₹${financials.outstanding.toLocaleString("en-IN")}` : "₹0"}
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

          {/* ── Detailed Information Grid (2 columns) ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Left Column */}
            <div className="space-y-4">
              <Card
                title="Basic Details"
                action={
                  <button
                    type="button"
                    onClick={() => setEditMode("details")}
                    className="text-xs font-medium text-sky-700 hover:underline"
                  >
                    Edit
                  </button>
                }
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                  <Detail label="Client Code" value={row.client_code} mono />
                  <Detail label="PAN" value={row.pan} mono />
                  <Detail label="GSTIN" value={row.gstin} mono />
                  <Detail label="Type" value={humanise(row.client_type)} />
                  <Detail label="TAN" value={row.tan} mono />
                  <Detail label="CIN" value={row.cin} mono />
                  <Detail label="LLPIN" value={row.llpin} mono />
                  <Detail label="Phone" value={primaryContact?.phone ?? null} />
                  <Detail label="Email" value={primaryContact?.email ?? null} />
                  <Detail
                    label="Address"
                    value={[row.address_line1, row.address_line2].filter(Boolean).join(", ") || null}
                  />
                  <Detail
                    label="Location"
                    value={[row.city, row.state, row.pincode].filter(Boolean).join(", ") || null}
                  />
                </dl>
              </Card>

              <Card
                title="Key Contacts"
                subtitle={row.contacts.length === 0 ? undefined : `${row.contacts.length} on file`}
                action={
                  row.contacts.length > 0 ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-sky-700 hover:underline"
                      onClick={() => {
                        const evt = new Event("open-add-contact");
                        window.dispatchEvent(evt);
                      }}
                    >
                      Add
                    </button>
                  ) : undefined
                }
              >
                {row.contacts.length === 0 ? (
                  <EmptyState message="No contacts recorded yet." />
                ) : (
                  <ul className="divide-y divide-[#E2E8F0]">
                    {row.contacts.map((contact) => (
                      <li key={contact.id} className="flex items-start gap-3 px-4 py-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-semibold text-sky-700">
                          {initials(contact.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#101B3D]">
                            {contact.name}
                            {contact.is_primary && (
                              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
                                Primary
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-[#64748B]">{humanise(contact.role)}</p>
                          {contact.designation && (
                            <p className="text-xs text-[#94A3B8]">{contact.designation}</p>
                          )}
                          {contact.phone && (
                            <p className="tabular text-xs text-[#64748B]">{contact.phone}</p>
                          )}
                          {contact.email && (
                            <p className="truncate text-xs text-[#64748B]">{contact.email}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card
                title="Who looks after them"
                action={
                  <button
                    type="button"
                    onClick={() => setEditMode("assignment")}
                    className="text-xs font-medium text-sky-700 hover:underline"
                  >
                    Edit
                  </button>
                }
              >
                <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 sm:grid-cols-2">
                  <Detail
                    label={
                      <span className="flex items-center gap-1.5">
                        <Icon name="users-round" className="h-3 w-3" /> Partner
                      </span>
                    }
                    value={userName(directory.byId, row.partner_id)}
                  />
                  <Detail
                    label={
                      <span className="flex items-center gap-1.5">
                        <Icon name="user-round" className="h-3 w-3" /> Manager
                      </span>
                    }
                    value={userName(directory.byId, row.manager_id)}
                  />
                  <Detail
                    label={
                      <span className="flex items-center gap-1.5">
                        <Icon name="calendar-days" className="h-3 w-3" /> Onboarded
                      </span>
                    }
                    value={row.onboarded_on ? formatDate(row.onboarded_on) : null}
                  />
                  <Detail
                    label={
                      <span className="flex items-center gap-1.5">
                        <Icon name="building" className="h-3 w-3" /> Country
                      </span>
                    }
                    value={row.country}
                  />
                </dl>
              </Card>

              <ClientDetailsForm
                client={row}
                open={editMode === "details"}
                onClose={() => {
                  setEditMode("none");
                  queryClient.invalidateQueries({ queryKey: ["client", clientId] });
                  queryClient.invalidateQueries({ queryKey: ["clients"] });
                }}
              />
              <ClientAssignmentForm
                client={row}
                directory={directory}
                open={editMode === "assignment"}
                onClose={() => {
                  setEditMode("none");
                  queryClient.invalidateQueries({ queryKey: ["client", clientId] });
                  queryClient.invalidateQueries({ queryKey: ["clients"] });
                }}
              />
              </div>

              {/* ── Right: what we do for them, and where it stands ── */}
              <div className="space-y-4">
                <Card
                  title="Compliance & Services"
                subtitle="What the firm has been engaged to do"
                action={
                  <button
                    type="button"
                    className="text-xs font-medium text-sky-700 hover:underline"
                    onClick={() => setTab("services")}
                  >
                    Attach Service
                  </button>
                }
              >
              {row.services.length === 0 ? (
                <EmptyState message="No services recorded for this client." />
              ) : (
                <ul className="divide-y divide-[#E2E8F0]">
                  {row.services.map((link) => (
                    <li key={link.id} className="flex items-start justify-between gap-3 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs text-emerald-700">
                          ✓
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#101B3D]">
                            {link.service?.name ?? "Service"}
                          </p>
                          <p className="text-xs text-[#64748B]">
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

            <Card
              title={`Current Period Status${
                progress.data?.financial_year ? ` (FY ${progress.data.financial_year})` : ""
              }`}
              subtitle="This client's work, earliest deadline first"
            >
              {tasks.isPending && <LoadingState label="Loading work…" />}
              {tasks.isSuccess && taskRows.length === 0 && (
                <EmptyState message="No work generated for this client yet." />
              )}
              {taskRows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#F6F8FC]">
                      <tr>
                        <th className="th">Task</th>
                        <th className="th">Due Date</th>
                        <th className="th">Status</th>
                        <th className="th">Assigned To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {[...taskRows]
                        .sort((a, b) =>
                          (a.statutory_due_date ?? "").localeCompare(b.statutory_due_date ?? ""),
                        )
                        .slice(0, 8)
                        .map((task) => (
                          <tr key={task.id} className="hover:bg-[#F6F8FC]">
                            <td className="td">
                              <Link
                                href={`/tasks/${task.id}`}
                                className="text-xs font-medium text-[#101B3D] underline-offset-2 hover:underline"
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
                            <td className="td text-xs text-[#64748B]">
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
              {taskRows.length > 8 && (
                <p className="border-t border-[#E2E8F0] px-4 py-2 text-xs text-[#64748B]">
                  Showing the 8 soonest of {taskRows.length} tasks.{" "}
                  <button
                    type="button"
                    className="font-medium text-sky-700 hover:underline"
                    onClick={() => setTab("tasks")}
                  >
                    See all
                  </button>
                </p>
              )}
            </Card>

            {missing.isSuccess && missing.data.length > 0 && (
              <Card title="Documents we are waiting for" subtitle="Chased by the daily job">
                <ul className="divide-y divide-[#E2E8F0]">
                  {missing.data.map((request) => (
                    <li key={request.id} className="flex items-start justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#101B3D]">{request.title}</p>
                        {request.doc_type && (
                          <p className="text-xs text-[#64748B]">{humanise(request.doc_type)}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {request.due_date && (
                          <span className="tabular text-xs text-[#64748B]">
                            Due {formatDate(request.due_date)}
                          </span>
                        )}
                        {request.is_overdue && <Badge tone="danger">Overdue</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
        </>
      )}

      {tab === "services" && (
        <Card title="Services" subtitle="Everything this client has taken on">
          {row.services.length === 0 ? (
            <EmptyState message="No services recorded for this client." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F6F8FC]">
                  <tr>
                    <th className="th">Service</th>
                    <th className="th">Category</th>
                    <th className="th">Frequency</th>
                    <th className="th">Fee</th>
                    <th className="th">Started</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {row.services.map((link) => (
                    <tr key={link.id} className="hover:bg-[#F6F8FC]">
                      <td className="td text-sm">{link.service?.name ?? "—"}</td>
                      <td className="td text-xs">
                        {humanise(link.service?.category ?? "other")}
                      </td>
                      <td className="td text-xs">
                        {link.service?.default_frequency
                          ? humanise(link.service.default_frequency)
                          : "—"}
                      </td>
                      <td className="td tabular text-xs">
                        {link.service?.standard_fee != null
                          ? `₹${link.service.standard_fee.toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="td tabular text-xs">
                        {link.start_date ? formatDate(link.start_date) : "—"}
                      </td>
                      <td className="td">
                        <Badge tone={link.is_active ? "success" : "neutral"}>
                          {link.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "tasks" && (
        <Card title="Tasks" subtitle={`${taskRows.length} task(s) for this client`}>
          {tasks.isPending && <LoadingState label="Loading work…" />}
          {tasks.isSuccess && taskRows.length === 0 && (
            <EmptyState message="No work generated for this client yet." />
          )}
          {taskRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F6F8FC]">
                  <tr>
                    <th className="th">Task</th>
                    <th className="th">Status</th>
                    <th className="th">Due Date</th>
                    <th className="th">Assigned To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {[...taskRows]
                    .sort((a, b) =>
                      (a.statutory_due_date ?? "").localeCompare(b.statutory_due_date ?? ""),
                    )
                    .map((task) => (
                      <tr key={task.id} className="hover:bg-[#F6F8FC]">
                        <td className="td">
                          <Link
                            href={`/tasks/${task.id}`}
                            className="text-sm font-medium text-[#101B3D] underline-offset-2 hover:underline"
                          >
                            {task.title}
                          </Link>
                        </td>
                        <td className="td">
                          <TaskStatusBadge status={task.status} />
                        </td>
                        <td className="td tabular text-xs">
                          {task.statutory_due_date ? formatDate(task.statutory_due_date) : "—"}
                        </td>
                        <td className="td text-xs text-[#64748B]">
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
        <Card title="Documents" subtitle="Filed against this client">
          {documents.isPending && <LoadingState label="Loading documents…" />}
          {documents.isSuccess && recentDocuments.length === 0 && (
            <EmptyState message="No documents on file." />
          )}
          {recentDocuments.length > 0 && (
            <ul className="divide-y divide-[#E2E8F0]">
              {recentDocuments.map((document) => (
                <li key={document.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#101B3D]">
                      {document.title}
                    </p>
                    <p className="text-xs text-[#64748B]">{humanise(document.doc_type)}</p>
                  </div>
                  <span className="tabular shrink-0 text-xs text-[#64748B]">
                    {document.created_at ? formatDate(document.created_at.slice(0, 10)) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "billing" && (
        <div className="space-y-4">
          <Card
            title="Financial Summary"
            action={
              <button
                type="button"
                className="text-xs font-medium text-sky-700 hover:underline"
                onClick={() => setTab("billing")}
              >
                Show all invoices
              </button>
            }
          >
            <dl className="grid grid-cols-2 gap-3 p-4">
              <Detail
                label="Invoiced"
                value={
                  financials ? `₹${financials.billed.toLocaleString("en-IN")}` : "₹0"
                }
              />
              <Detail
                label="Collected"
                value={
                  financials ? `₹${financials.collected.toLocaleString("en-IN")}` : "₹0"
                }
              />
              <Detail
                label="Outstanding"
                value={
                  financials ? `₹${financials.outstanding.toLocaleString("en-IN")}` : "₹0"
                }
              />
              <Detail
                label="Overdue"
                value={
                  financials
                    ? `₹${financials.overdue_outstanding.toLocaleString("en-IN")}`
                    : "₹0"
                }
              />
              <Detail
                label="Unbilled work"
                value={`₹${unbilledTotal.toLocaleString("en-IN")}`}
              />
              <Detail
                label="Invoices"
                value={String(financials?.invoice_count ?? 0)}
              />
            </dl>
            {unbilled.data && unbilled.data.invoices.length > 0 && (
              <p className="border-t border-[#E2E8F0] px-4 py-2 text-xs text-[#64748B]">
                {unbilled.data.invoices.length} invoice(s) could be raised for completed work.
              </p>
            )}
          </Card>
          <Card title="Invoices" subtitle="Invoices raised against this client">
          {invoices.isPending && <LoadingState label="Loading invoices…" />}
          {invoices.isSuccess && (invoices.data?.items.length ?? 0) === 0 && (
            <EmptyState message="No invoices raised for this client yet." />
          )}
          {(invoices.data?.items.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#F6F8FC]">
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">Date</th>
                    <th className="th">Due</th>
                    <th className="th">Status</th>
                    <th className="th">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {(invoices.data?.items ?? []).map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-[#F6F8FC]">
                      <td className="td">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-mono text-xs font-medium text-[#101B3D] underline-offset-2 hover:underline"
                        >
                          {invoice.invoice_number ?? "(draft)"}
                        </Link>
                      </td>
                      <td className="td tabular text-xs">{formatDate(invoice.invoice_date)}</td>
                      <td className="td tabular text-xs">{formatDate(invoice.due_date)}</td>
                      <td className="td text-xs">{humanise(invoice.status)}</td>
                      <td className="td tabular text-xs">
                        ₹{invoice.total.toLocaleString("en-IN")}
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
        <Card title="Notes" subtitle="Relationship notes held against the client record">
          {row.relationship_notes ? (
            <p className="whitespace-pre-wrap p-4 text-sm text-[#64748B]">
              {row.relationship_notes}
            </p>
          ) : (
            <EmptyState message="No notes recorded for this client." />
          )}
        </Card>
      )}

      {tab === "timeline" && (
        <div className="space-y-4">
          <Card title="Registrations" subtitle="Statutory registrations on file">
            {row.registrations.length === 0 ? (
              <EmptyState message="No registrations recorded." />
            ) : (
              <ul className="divide-y divide-[#E2E8F0]">
                {row.registrations.map((registration) => (
                  <li
                    key={registration.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-[#101B3D]">{registration.number}</p>
                      <p className="text-xs text-[#64748B]">
                        {humanise(registration.registration_type)}
                        {registration.place_of_business
                          ? ` · ${registration.place_of_business}`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={registrationStatusTone(registration.status)}>
                      {humanise(registration.status)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Engagements" subtitle="The commercial relationship">
            {row.engagements.length === 0 ? (
              <EmptyState message="No engagements recorded." />
            ) : (
              <ul className="divide-y divide-[#E2E8F0]">
                {row.engagements.map((engagement) => (
                  <li key={engagement.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[#101B3D]">
                        {engagement.title}
                      </span>
                      <Badge tone={engagementTone(engagement.status)}>
                        {humanise(engagement.status)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-[#64748B]">
                      <span className="font-mono">{engagement.code}</span>
                      {" · "}
                      {humanise(engagement.fee_model)}
                      {engagement.fee_amount !== null &&
                        ` · ₹${engagement.fee_amount.toLocaleString("en-IN")}`}
                      {engagement.end_date && ` · ends ${formatDate(engagement.end_date)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
