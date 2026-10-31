"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import {
  CheckboxField,
  FormActions,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { api } from "@/lib/api";
import { cn, humanise } from "@/lib/format";
import type { ClientCreatePayload, ClientRead, Page, UserListItem } from "@/lib/types";

const CLIENT_TYPES = [
  "individual",
  "huf",
  "proprietorship",
  "partnership",
  "llp",
  "company",
  "trust",
  "society",
  "aop",
  "other",
] as const;

const RISK_LEVELS = ["low", "medium", "high"] as const;

const PERSONAL_TYPES = new Set(["individual", "huf"]);

const SECTIONS: Array<{
  key: string;
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
}> = [
  {
    key: "basics",
    title: "Client Identity",
    subtitle: "Name, type, and risk profile — the foundation of this record.",
    icon: "user",
    color: "sky",
  },
  {
    key: "identifiers",
    title: "Tax IDs & Licences",
    subtitle: "PAN, GSTIN, CIN and other government identifiers.",
    icon: "file-text",
    color: "indigo",
  },
  {
    key: "address",
    title: "Address",
    subtitle: "Where the client can be reached and served.",
    icon: "building",
    color: "teal",
  },
  {
    key: "team",
    title: "Relationship",
    subtitle: "Partner, manager and anything worth remembering.",
    icon: "team",
    color: "violet",
  },
];

export default function NewClientPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [clientType, setClientType] = useState<string>("company");
  const [legalName, setLegalName] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [pan, setPan] = useState("");
  const [tan, setTan] = useState("");
  const [cin, setCin] = useState("");
  const [gstin, setGstin] = useState("");
  const [incorporationDate, setIncorporationDate] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [pincode, setPincode] = useState("");
  const [risk, setRisk] = useState("low");
  const [partnerId, setPartnerId] = useState("");
  const [managerId, setManagerId] = useState("");
  const [notes, setNotes] = useState("");
  const [activateNow, setActivateNow] = useState(true);
  const [activeSection, setActiveSection] = useState("basics");

  const staff = useQuery({
    queryKey: ["users", "for-select"],
    queryFn: () => api.get<Page<UserListItem>>("/users?limit=200"),
  });

  const create = useMutation({
    mutationFn: async (payload: ClientCreatePayload) => {
      const client = await api.post<ClientRead>("/clients", payload);
      let activationFailed = false;
      if (activateNow) {
        try {
          await api.post(`/clients/${client.id}/status`, {
            status: "active",
            reason: "Activated when the client record was created.",
          });
        } catch {
          activationFailed = true;
        }
      }
      return { client, activationFailed };
    },
    onSuccess: ({ client, activationFailed }) => {
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      const suffix = activationFailed ? "?activation=failed" : "";
      router.replace(`/clients/${client.id}${suffix}`);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload: ClientCreatePayload = {
      client_type: clientType as ClientCreatePayload["client_type"],
      legal_name: legalName.trim(),
      risk_classification: risk as ClientCreatePayload["risk_classification"],
    };
    if (clientCode.trim()) payload.client_code = clientCode.trim();
    if (tradeName.trim()) payload.trade_name = tradeName.trim();
    if (pan.trim()) payload.pan = pan.trim().toUpperCase();
    if (tan.trim()) payload.tan = tan.trim().toUpperCase();
    if (cin.trim()) payload.cin = cin.trim().toUpperCase();
    if (gstin.trim()) payload.gstin = gstin.trim().toUpperCase();
    if (incorporationDate) {
      if (PERSONAL_TYPES.has(clientType)) payload.date_of_birth = incorporationDate;
      else payload.date_of_incorporation = incorporationDate;
    }
    if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
    if (city.trim()) payload.city = city.trim();
    if (district.trim()) payload.district = district.trim();
    if (state.trim()) payload.state = state.trim();
    if (stateCode.trim()) payload.state_code = stateCode.trim();
    if (pincode.trim()) payload.pincode = pincode.trim();
    if (partnerId) payload.partner_id = partnerId;
    if (managerId) payload.manager_id = managerId;
    if (notes.trim()) payload.relationship_notes = notes.trim();

    create.mutate(payload);
  }

  const staffOptions = (staff.data?.items ?? []).map((user) => ({
    value: user.id,
    label: user.designation ? `${user.full_name} — ${user.designation}` : user.full_name,
  }));
  const isPersonal = PERSONAL_TYPES.has(clientType);
  const completedSections = [
    Boolean(legalName.trim()),
    Boolean(pan.trim() || gstin.trim()),
    Boolean(addressLine1.trim() && city.trim()),
    Boolean(partnerId || managerId || notes.trim()),
  ].filter(Boolean).length;
  const progress = Math.round((completedSections / SECTIONS.length) * 100);

  return (
    <div className="min-h-screen bg-[#f7f6f3] space-y-0">
      {/* Hero banner */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-indigo-600 opacity-90">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&q=80&w=1920')] opacity-10" />
        </div>
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 py-8">
          <Link
            href="/clients"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur text-white/90 hover:bg-white/30 text-sm font-medium transition-colors"
          >
            <Icon name="chevron-left" className="h-4 w-4" /> All clients
          </Link>
          <div className="mt-6 sm:mt-8 lg:mt-10">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Add a client
            </h1>
            <p className="mt-2 text-white/90 text-sm sm:text-base max-w-xl">
              Build the client record that powers invoices, compliance, and reporting.
              Only the legal name and type are required — everything else can be
              completed later.
            </p>
          </div>
        </div>
        <div className="absolute -bottom-8 left-0 w-full h-20 bg-gradient-to-t from-sky-500 via-transparent to-transparent opacity-90" />
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 h-1 bg-slate-200 rounded-full overflow-hidden">
            {SECTIONS.map((_, i) => (
              <div
                key={i}
                className="h-full flex-1 bg-white"
                style={{ width: `${progress}%` }}
              />
            ))}
          </div>
          <span className="ml-4 text-xs font-medium text-slate-600">
            {progress}% complete
          </span>
        </div>

        {create.isError && <FormError error={create.error} />}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section navigation */}
          <div className="flex flex-wrap gap-2 mb-4">
            {SECTIONS.map((section) => (
              <button
                key={section.key}
                type="button"
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  "px-3 py-2 rounded-xl text-sm font-medium transition-all",
                  activeSection === section.key
                    ? `bg-${section.color}-100 text-${colorToTailwind(section.color)}-700 shadow-sm`
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                <Icon name={section.icon} className={`h-4 w-4 mr-2`} />
                {section.title}
              </button>
            ))}
          </div>

          {/* Basics */}
          <section
            id="basics"
            className="client-card mb-6"
            data-section="basics"
          >
            <div className="card-header">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Icon name="user" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="card-title">Client Identity</h3>
                <p className="card-subtitle">
                  Name, type, and risk profile — the foundation of this record.
                </p>
              </div>
            </div>
            <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 p-6">
              <SelectField
                label="Client type"
                value={clientType}
                onChange={setClientType}
                required
                options={CLIENT_TYPES.map((value) => ({ value, label: humanise(value) }))}
                placeholder="Choose a type"
              />
              <TextField
                label="Legal name"
                value={legalName}
                onChange={setLegalName}
                required
                maxLength={250}
                placeholder="ABC Industries Pvt Ltd"
              />
              <TextField
                label="Trade name"
                value={tradeName}
                onChange={setTradeName}
                maxLength={250}
                hint="Only if it differs from the legal name"
              />
              <TextField
                label="Client code"
                value={clientCode}
                onChange={setClientCode}
                maxLength={30}
                hint="Leave blank and the firm's counter allocates the next one"
                placeholder="C00001"
              />
              <TextField
                label={isPersonal ? "Date of birth" : "Date of incorporation"}
                value={incorporationDate}
                onChange={setIncorporationDate}
                type="date"
              />
              <SelectField
                label="Risk classification"
                value={risk}
                onChange={setRisk}
                options={RISK_LEVELS.map((value) => ({ value, label: humanise(value) }))}
              />
            </div>
          </section>

          {/* Identifiers */}
          <section
            id="identifiers"
            className="client-card mb-6"
            data-section="identifiers"
          >
            <div className="card-header">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon name="file-text" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="card-title">Tax IDs & Licences</h3>
                <p className="card-subtitle">
                  PAN, GSTIN, CIN and other government identifiers.
                </p>
              </div>
            </div>
            <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 p-6">
              <TextField
                label="PAN"
                value={pan}
                onChange={setPan}
                maxLength={10}
                placeholder="AAACB1234C"
                hint="10 characters"
              />
              <TextField
                label="TAN"
                value={tan}
                onChange={setTan}
                maxLength={10}
                placeholder="MUMA12345B"
              />
              <TextField
                label="CIN"
                value={cin}
                onChange={setCin}
                maxLength={21}
                placeholder="U12345MH2020PTC123456"
              />
              <TextField
                label="GSTIN"
                value={gstin}
                onChange={setGstin}
                maxLength={15}
                placeholder="27AAACB1234C1Z5"
                hint="A wrong check digit is a warning, not a rejection"
              />
            </div>
          </section>

          {/* Address */}
          <section id="address" className="client-card mb-6" data-section="address">
            <div className="card-header">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                <Icon name="building" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="card-title">Address</h3>
                <p className="card-subtitle">Where the client can be reached.</p>
              </div>
            </div>
            <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 p-6">
              <div className="sm:col-span-3">
                <TextField
                  label="Address line 1"
                  value={addressLine1}
                  onChange={setAddressLine1}
                  placeholder="123, Main Street, Mumbai"
                />
              </div>
              <div className="sm:col-span-3">
                <TextField
                  label="Address line 2"
                  value={addressLine2}
                  onChange={setAddressLine2}
                  placeholder="Near the main square"
                />
              </div>
              <TextField label="City" value={city} onChange={setCity} placeholder="Mumbai" />
              <TextField label="District" value={district} onChange={setDistrict} />
              <div className="sm:col-span-2">
                <TextField
                  label="State"
                  value={state}
                  onChange={setState}
                  placeholder="Maharashtra"
                />
              </div>
              <TextField
                label="State code"
                value={stateCode}
                onChange={setStateCode}
                maxLength={2}
                placeholder="27"
                hint="Used to derive place of supply"
              />
              <TextField
                label="PIN code"
                value={pincode}
                onChange={setPincode}
                maxLength={10}
                placeholder="400001"
              />
            </div>
          </section>

          {/* Relationship */}
          <section id="team" className="client-card mb-8" data-section="team">
            <div className="card-header">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <Icon name="team" className="h-5 w-5" />
              </div>
              <div>
                <h3 className="card-title">Relationship</h3>
                <p className="card-subtitle">
                  Partner, manager and anything worth remembering.
                </p>
              </div>
            </div>
            <div className="card-body grid grid-cols-1 gap-4 sm:grid-cols-2 p-6">
              <SelectField
                label="Partner"
                value={partnerId}
                onChange={setPartnerId}
                options={staffOptions}
                placeholder="Not assigned"
              />
              <SelectField
                label="Manager"
                value={managerId}
                onChange={setManagerId}
                options={staffOptions}
                placeholder="Not assigned"
              />
              <div className="sm:col-span-2">
                <TextAreaField
                  label="Relationship notes"
                  value={notes}
                  onChange={setNotes}
                  placeholder="How the firm came to act for them, and anything worth remembering."
                />
              </div>
              <div className="sm:col-span-2 flex items-end">
                <CheckboxField
                  label="Activate this client now"
                  checked={activateNow}
                  onChange={setActivateNow}
                  hint="Recurring compliance work is only generated for active clients. Without this the client stays a prospect."
                />
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-slate-600">
                {create.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full border-2 border-slate-300 border-t-sky-600 animate-spin" />
                    Creating…
                  </span>
                ) : (
                  `Ready to create ${legalName.trim() || "this client"}.`
                )}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <FormActions
                  submitLabel="Create client"
                  busy={create.isPending}
                  onCancel={() => router.push("/clients")}
                  disabled={!legalName.trim()}
                />
              </div>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

function colorToTailwind(color: string): string {
  const map: Record<string, string> = {
    sky: "sky",
    indigo: "indigo",
    teal: "teal",
    violet: "violet",
  };
  return map[color] ?? "slate";
}
