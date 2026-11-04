"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

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
  const [mobile, setMobile] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [locality, setLocality] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [aadhaarNo, setAadhaarNo] = useState("");
  const [residentialStatus, setResidentialStatus] = useState("");
  const [passportNo, setPassportNo] = useState("");
  const [fileNo, setFileNo] = useState("");
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
      setMobile(row.mobile ?? "");
      setPhone(row.phone ?? "");
      setEmail(row.email ?? "");
      setLocality(row.locality ?? "");
      setFatherName(row.father_name ?? "");
      setAadhaarNo(row.aadhaar_no ?? "");
      setResidentialStatus(row.residential_status ?? "");
      setPassportNo(row.passport_no ?? "");
      setFileNo(row.file_no ?? "");
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
    if (mobile.trim()) payload.mobile = mobile.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (locality.trim()) payload.locality = locality.trim();
    if (fatherName.trim()) payload.father_name = fatherName.trim();
    if (aadhaarNo.trim()) payload.aadhaar_no = aadhaarNo.trim();
    if (residentialStatus.trim()) payload.residential_status = residentialStatus.trim();
    if (passportNo.trim()) payload.passport_no = passportNo.trim();
    if (fileNo.trim()) payload.file_no = fileNo.trim();
    if (incorporationDate) {
      if (PERSONAL_TYPES.has(client.data?.client_type ?? "other"))
        payload.date_of_birth = incorporationDate;
      else payload.date_of_incorporation = incorporationDate;
    }
    update.mutate(payload);
  }

  const staffOptions = (staff.data?.items ?? []).map((user) => ({
    value: user.id,
    label: user.designation ? `${user.full_name} — ${user.designation}` : user.full_name,
  }));

  const isPersonal = PERSONAL_TYPES.has(client.data?.client_type ?? "other");

  const isLoading = client.isPending || (!client.isError && !client.isSuccess);

  return (
    <div className="min-h-full space-y-5 rounded-2xl bg-[#F7F8FC] p-3 sm:p-5 lg:p-6">
      <div className="space-y-4">
        <Link
          href={`/clients/${clientId}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#737A96] transition hover:text-[#6637D7]"
        >
          <Icon name="arrow-right" className="h-3.5 w-3.5 rotate-180" />
          Back to client profile
        </Link>

        <div className="overflow-hidden rounded-2xl border border-[#E5DDFB] bg-white shadow-[0_8px_28px_rgba(54,35,105,.07)]">
          <div className="relative flex flex-col justify-between gap-5 overflow-hidden bg-gradient-to-r from-[#45209D] via-[#6739D2] to-[#8A62EA] px-5 py-6 text-white sm:flex-row sm:items-center sm:px-7">
            <div className="pointer-events-none absolute -right-6 -top-16 h-20 w-20 rounded-full border-[20px] border-white/10" />
            <div className="relative flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-inner">
                <Icon name="user-round" className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/70">
                  Client workspace
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
                  Edit client profile
                </h1>
                <p className="mt-1 text-sm text-white/80">
                  Update identity, statutory details, contact information and team ownership.
                </p>
              </div>
            </div>
            <div className="relative rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/65">
                Client code
              </p>
              <p className="mt-1 font-mono text-sm font-bold">
                {client.data?.client_code ?? "Loading…"}
              </p>
              <p className="mt-1 max-w-[220px] truncate text-xs text-white/75">
                {client.data?.legal_name ?? "Client details"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 sm:gap-3 sm:p-4">
            {[
              { label: "Basics", icon: "user-round", target: "edit-basics" },
              { label: "Identifiers", icon: "file-text", target: "edit-identifiers" },
              { label: "Address", icon: "map-pin", target: "edit-address" },
              { label: "MIS details", icon: "clipboard-list", target: "edit-mis" },
              { label: "Team & notes", icon: "users-round", target: "edit-team" },
            ].map((item, index) => (
              <a
                key={item.target}
                href={`#${item.target}`}
                className="group flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2.5 transition hover:border-[#CFC0F8] hover:bg-[#F5F0FF]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F0EAFE] text-[#7042D8]">
                  <Icon name={item.icon as IconName} className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold text-[#454B68] group-hover:text-[#6032D4]">
                  {item.label}
                </span>
                <span className="ml-auto text-[10px] text-[#A3A0B5]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </a>
            ))}
          </div>
        </div>

        {isLoading && (
          <div className="rounded-2xl border border-[#E7E4F0] bg-white p-10 text-center text-sm text-[#737A96] shadow-sm">
            <span className="mx-auto mb-3 block size-7 animate-spin rounded-full border-2 border-[#E7DFFC] border-t-[#7042D8]" />
            Loading client details…
          </div>
        )}

        {client.isError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Could not load this client. Please go back and try again.
          </div>
        )}

        {client.isSuccess && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {update.isError && <FormError error={update.error} />}

            {/* ── Basics ── */}
            <section id="edit-basics" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
              <div className="flex items-center gap-3 border-b border-[#EEEAF5] bg-gradient-to-r from-[#FCFBFF] to-white px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <Icon name="user-round" className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-[-.01em] text-[#202440]">
                    Basics
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#858BA4]">
                    The fundamental identity of this client.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
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
            <section id="edit-identifiers" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
              <div className="flex items-center gap-3 border-b border-[#EEEAF5] bg-gradient-to-r from-[#FCFBFF] to-white px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <Icon name="file-text" className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-[-.01em] text-[#202440]">
                    Identifiers
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#858BA4]">
                    Format-checked only. No government verification service is integrated, so nothing here is ever marked verified.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
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
            <section id="edit-address" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
              <div className="flex items-center gap-3 border-b border-[#EEEAF5] bg-gradient-to-r from-[#FCFBFF] to-white px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <Icon name="building" className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-[-.01em] text-[#202440]">
                    Address
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#858BA4]">
                    Where the client can be reached.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
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

            {/* ── MIS report fields ── */}
            <section id="edit-mis" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
              <div className="flex items-center gap-3 border-b border-[#EEEAF5] bg-gradient-to-r from-[#FCFBFF] to-white px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                  <Icon name="clipboard-list" className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-[-.01em] text-[#202440]">
                    MIS report fields
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#858BA4]">
                    Columns from the Winman CA-ERP MIS report.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
                <TextField label="Mobile number" value={mobile} onChange={setMobile} maxLength={20} placeholder="9028122760" />
                <TextField label="Telephone" value={phone} onChange={setPhone} maxLength={20} />
                <TextField label="Email ID" value={email} onChange={setEmail} type="email" maxLength={255} placeholder="itr4321@gmail.com" />
                <TextField label="Area / locality" value={locality} onChange={setLocality} maxLength={255} placeholder="Sindhi Colony" />
                <TextField label="Father name" value={fatherName} onChange={setFatherName} maxLength={200} />
                <TextField label="Aadhaar number" value={aadhaarNo} onChange={setAadhaarNo} maxLength={20} placeholder="507041227510" />
                <SelectField
                  label="Residential status"
                  value={residentialStatus}
                  onChange={setResidentialStatus}
                  options={["Resident", "Non-Resident", "Not Available"].map((v) => ({ value: v, label: v }))}
                  placeholder="Choose one"
                />
                <TextField label="Passport number" value={passportNo} onChange={setPassportNo} maxLength={20} />
                <TextField label="File number" value={fileNo} onChange={setFileNo} maxLength={100} />
              </div>
            </section>

            {/* ── Who looks after them ── */}
            <section id="edit-team" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
              <div className="flex items-center gap-3 border-b border-[#EEEAF5] bg-gradient-to-r from-[#FCFBFF] to-white px-5 py-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <Icon name="team" className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-[-.01em] text-[#202440]">
                    Who looks after them
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-[#858BA4]">
                    Partner and manager assignments for this client.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 p-5 sm:grid-cols-2 sm:p-6">
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

            <div className="sticky bottom-3 z-10 rounded-2xl border border-[#DCD3F2] bg-white/95 p-3 shadow-[0_10px_35px_rgba(39,31,83,.14)] backdrop-blur-xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="hidden text-xs text-[#858BA4] sm:block">
                  Review your changes before saving the client profile.
                </p>
                <div className="ml-auto">
                  <FormActions
                    submitLabel="Save changes"
                    busy={update.isPending}
                    onCancel={() => router.push(`/clients`)}
                    disabled={!legalName.trim()}
                    className="bg-[#6D3AE8] hover:bg-[#5D2CCB]"
                  />
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
