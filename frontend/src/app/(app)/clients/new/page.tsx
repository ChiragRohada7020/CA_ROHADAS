"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { Card, PageHeader } from "@/components/ui";
import {
  CheckboxField,
  FormActions,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { api } from "@/lib/api";
import { humanise } from "@/lib/format";
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

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/clients"
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          ← All clients
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Add a client"
            subtitle="Only the name and type are required. Everything else can be added later."
            action={
              <button
                type="button"
                className="btn btn-ghost px-5 py-2.5"
                onClick={() => router.push("/clients")}
              >
                Back to clients
              </button>
            }
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {create.isError && <FormError error={create.error} />}

        {/* ── Basics ── */}
        <Card
          title="Basics"
          subtitle="The fundamental identity of this client."
          icon={<Icon name="user" className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 p-6">
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
        </Card>

        {/* ── Identifiers ── */}
        <Card
          title="Tax IDs & Licences"
          subtitle="PAN, GSTIN, CIN and other government identifiers."
          icon={<Icon name="file-text" className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 p-6">
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
        </Card>

        {/* ── Address ── */}
        <Card title="Address" subtitle="Where the client can be reached." icon={<Icon name="building" className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 p-6">
            <div className="sm:col-span-3">
              <TextField label="Address line 1" value={addressLine1} onChange={setAddressLine1} placeholder="123, Main Street, Mumbai" />
            </div>
            <div className="sm:col-span-3">
              <TextField label="Address line 2" value={addressLine2} onChange={setAddressLine2} placeholder="Near the main square" />
            </div>
            <TextField label="City" value={city} onChange={setCity} placeholder="Mumbai" />
            <TextField label="District" value={district} onChange={setDistrict} />
            <div className="sm:col-span-2">
              <TextField label="State" value={state} onChange={setState} placeholder="Maharashtra" />
            </div>
            <TextField
              label="State code"
              value={stateCode}
              onChange={setStateCode}
              maxLength={2}
              placeholder="27"
              hint="Used to derive place of supply"
            />
            <TextField label="PIN code" value={pincode} onChange={setPincode} maxLength={10} placeholder="400001" />
          </div>
        </Card>

        {/* ── Relationship ── */}
        <Card title="Relationship" subtitle="Partner, manager and anything worth remembering." icon={<Icon name="team" className="h-4 w-4" />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 p-6">
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
        </Card>

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
    </div>
  );
}
