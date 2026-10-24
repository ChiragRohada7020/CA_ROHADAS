"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

import { Icon } from "@/components/Icon";
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
import { humanise } from "@/lib/format";
import type { ClientRead, ClientUpdatePayload, Page, UserListItem } from "@/lib/types";

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

/** Types that describe a person rather than an entity, so the date field differs. */
const PERSONAL_TYPES = new Set(["individual", "huf"]);

export default function EditClientPage() {
  const router = useRouter();
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;
  const queryClient = useQueryClient();

  const client = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.get<ClientRead>(`/clients/${clientId}`),
    enabled: Boolean(clientId),
  });

  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [pan, setPan] = useState("");
  const [tan, setTan] = useState("");
  const [cin, setCin] = useState("");
  const [gstin, setGstin] = useState("");
  const [llpin, setLlpin] = useState("");
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

  useEffect(() => {
    if (client.data) {
      const row = client.data;
      setLegalName(row.legal_name);
      setTradeName(row.trade_name ?? "");
      setPan(row.pan ?? "");
      setTan(row.tan ?? "");
      setCin(row.cin ?? "");
      setGstin(row.gstin ?? "");
      setLlpin(row.llpin ?? "");
      setIncorporationDate(
        row.client_type === "individual" || row.client_type === "huf"
          ? (row.date_of_birth ?? "")
          : (row.date_of_incorporation ?? ""),
      );
      setAddressLine1(row.address_line1 ?? "");
      setAddressLine2(row.address_line2 ?? "");
      setCity(row.city ?? "");
      setDistrict(row.district ?? "");
      setState(row.state ?? "");
      setStateCode(row.state_code ?? "");
      setPincode(row.pincode ?? "");
      setRisk(row.risk_classification ?? "low");
      setPartnerId(row.partner_id ?? "");
      setManagerId(row.manager_id ?? "");
      setNotes(row.relationship_notes ?? "");
    }
  }, [client.data]);

  const staff = useQuery({
    queryKey: ["users", "for-select"],
    queryFn: () => api.get<Page<UserListItem>>("/users?limit=200"),
  });

  const update = useMutation({
    mutationFn: (payload: ClientUpdatePayload) =>
      api.patch<ClientRead>(`/clients/${clientId}`, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      router.back();
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload: ClientUpdatePayload = {
      legal_name: legalName.trim(),
      risk_classification: risk as ClientUpdatePayload["risk_classification"],
    };
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
    if (partnerId) payload.partner_id = partnerId;
    else payload.partner_id = null;
    if (managerId) payload.manager_id = managerId;
    else payload.manager_id = null;
    if (notes.trim()) payload.relationship_notes = notes.trim();
    if (addressLine1.trim()) payload.address_line1 = addressLine1.trim();
    if (addressLine2.trim()) payload.address_line2 = addressLine2.trim();
    if (city.trim()) payload.city = city.trim();
    if (district.trim()) payload.district = district.trim();
    if (state.trim()) payload.state = state.trim();
    if (stateCode.trim()) payload.state_code = stateCode.trim();
    if (pincode.trim()) payload.pincode = pincode.trim();
    if (incorporationDate) {
      if (PERSONAL_TYPES.has(client.data?.client_type ?? "other")) payload.date_of_birth = incorporationDate;
      else payload.date_of_incorporation = incorporationDate;
    }
    update.mutate(payload);
  }

  const staffOptions = (staff.data?.items ?? []).map((user) => ({
    value: user.id,
    label: user.designation ? `${user.full_name} — ${user.designation}` : user.full_name,
  }));

  const isPersonal = PERSONAL_TYPES.has(client.data?.client_type ?? "other");

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/clients/${clientId}`}
          className="text-xs font-medium text-[#64748B] underline-offset-2 hover:underline"
        >
          ← {client.data?.legal_name ?? "Client"}
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Edit client"
            subtitle="Update this client's details and identifiers."
          />
        </div>
      </div>

      {client.isPending && <div>Loading…</div>}

      {client.isSuccess && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {update.isError && <FormError error={update.error} />}

          {/* ── Basics ── */}
          <section className="client-section client-section-accent-basics">
            <div className="client-section-header">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <Icon name="user" className="h-4 w-4" />
              </div>
              <div>
                <h3 className="client-section-title">Basics</h3>
                <p className="client-section-subtitle">The fundamental identity of this client.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
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
                value={client.data.client_code}
                maxLength={30}
                disabled
                onChange={() => {}}
                hint="Client code cannot be changed"
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

          {/* ── Identifiers ── */}
          <section className="client-section client-section-accent-identifiers">
            <div className="client-section-header">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon name="file-text" className="h-4 w-4" />
              </div>
              <div>
                <h3 className="client-section-title">Identifiers</h3>
                <p className="client-section-subtitle">
                  Format-checked only. No government verification service is integrated, so nothing here is ever marked verified.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
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
              <TextField
                label="LLPIN"
                value={llpin}
                onChange={setLlpin}
                maxLength={8}
                placeholder="AAB1234"
              />
            </div>
          </section>

          {/* ── Address ── */}
          <section className="client-section client-section-accent-address">
            <div className="client-section-header">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                <Icon name="building" className="h-4 w-4" />
              </div>
              <div>
                <h3 className="client-section-title">Address</h3>
                <p className="client-section-subtitle">Where the client can be reached.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
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
          </section>

          {/* ── Who looks after them ── */}
          <section className="client-section client-section-accent-staff">
            <div className="client-section-header">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                <Icon name="team" className="h-4 w-4" />
              </div>
              <div>
                <h3 className="client-section-title">Who looks after them</h3>
                <p className="client-section-subtitle">Partner and manager assignments for this client.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
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
            </div>
          </section>

          <FormActions
            submitLabel="Save changes"
            busy={update.isPending}
            onCancel={() => router.push(`/clients/${clientId}`)}
            disabled={!legalName.trim()}
          />
        </form>
      )}
    </div>
  );
}
