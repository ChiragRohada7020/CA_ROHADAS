"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";

import { Icon, type IconName } from "@/components/Icon";
import { Modal, PageHeader } from "@/components/ui";
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

type ShortcutModifiers = { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };

type Shortcut = { modifiers: ShortcutModifiers; key: string; target: string };

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
    if (llpin.trim()) payload.llpin = llpin.trim().toUpperCase();
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
    if (mobile.trim()) payload.mobile = mobile.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (email.trim()) payload.email = email.trim();
    if (locality.trim()) payload.locality = locality.trim();
    if (fatherName.trim()) payload.father_name = fatherName.trim();
    if (aadhaarNo.trim()) payload.aadhaar_no = aadhaarNo.trim();
    if (residentialStatus.trim()) payload.residential_status = residentialStatus.trim();
    if (passportNo.trim()) payload.passport_no = passportNo.trim();
    if (fileNo.trim()) payload.file_no = fileNo.trim();
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

  const defaultShortcuts: Record<string, Shortcut> = {
    "1": { modifiers: { ctrl: true, alt: false, shift: false, meta: false }, key: "1", target: "basics" },
    "2": { modifiers: { ctrl: true, alt: false, shift: false, meta: false }, key: "2", target: "identifiers" },
    "3": { modifiers: { ctrl: true, alt: false, shift: false, meta: false }, key: "3", target: "address" },
    "4": { modifiers: { ctrl: true, alt: false, shift: false, meta: false }, key: "4", target: "mis" },
    "5": { modifiers: { ctrl: true, alt: false, shift: false, meta: false }, key: "5", target: "team" },
  };

  const isLoading = create.isPending;
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editingShortcut, setEditingShortcut] = useState<string | null>(null);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, Shortcut>>(defaultShortcuts);

  const shortcutsQuery = useQuery({
    queryKey: ["users", "me", "shortcuts"],
    queryFn: () => api.get<Record<string, Shortcut>>("/users/me/shortcuts"),
    select: (data) => {
      if (!data || Object.keys(data).length === 0) return defaultShortcuts;
      return {
        "1": { ...defaultShortcuts["1"], ...(data["1"] as Shortcut) },
        "2": { ...defaultShortcuts["2"], ...(data["2"] as Shortcut) },
        "3": { ...defaultShortcuts["3"], ...(data["3"] as Shortcut) },
        "4": { ...defaultShortcuts["4"], ...(data["4"] as Shortcut) },
        "5": { ...defaultShortcuts["5"], ...(data["5"] as Shortcut) },
      };
    },
  });

  const saveShortcuts = useMutation({
    mutationFn: (sc: Record<string, Shortcut>) =>
      api.patch("/users/me/shortcuts", { shortcuts: sc }),
  });

  useEffect(() => {
    if (shortcutsQuery.data) {
      setCustomShortcuts(shortcutsQuery.data);
    }
  }, [shortcutsQuery.data]);

  function formatShortcut(s: Shortcut): string {
    const parts: string[] = [];
    if (s.modifiers.ctrl) parts.push("Ctrl");
    if (s.modifiers.alt) parts.push("Alt");
    if (s.modifiers.shift) parts.push("Shift");
    if (s.modifiers.meta) parts.push("Cmd");
    parts.push(s.key.toUpperCase());
    return parts.join("+");
  }

  function matchesShortcut(event: KeyboardEvent, s: Shortcut): boolean {
    return (
      event.ctrlKey === s.modifiers.ctrl &&
      event.altKey === s.modifiers.alt &&
      event.shiftKey === s.modifiers.shift &&
      event.metaKey === s.modifiers.meta &&
      event.key.toLowerCase() === s.key.toLowerCase()
    );
  }

  const shortcutsRef = useRef(customShortcuts);
  shortcutsRef.current = customShortcuts;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (editingShortcut) {
        event.preventDefault();
        const key = event.key;
        if (["Control", "Alt", "Shift", "Meta"].includes(key)) return;
        setCustomShortcuts((prev) => {
          const next = {
            ...prev,
            [editingShortcut]: {
              modifiers: {
                ctrl: event.ctrlKey,
                alt: event.altKey,
                shift: event.shiftKey,
                meta: event.metaKey,
              },
              key,
              target: shortcutsRef.current[editingShortcut].target,
            },
          };
          saveShortcuts.mutate(next);
          return next;
        });
        setEditingShortcut(null);
        return;
      }
      Object.values(shortcutsRef.current).forEach((s) => {
        if (matchesShortcut(event, s)) {
          event.preventDefault();
          const el = document.getElementById(`new-${s.target}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingShortcut]);

  return (
    <div className="min-h-full space-y-5 rounded-2xl bg-[#F7F8FC] p-3 sm:p-5 lg:p-6">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => {
            window.history.back();
          }}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#737A96] transition hover:text-[#6637D7]"
        >
          <Icon name="arrow-left" className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          type="button"
          onClick={() => setShowShortcuts(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#ECEAF4] bg-[#FCFBFF] px-3 py-2 text-xs font-semibold text-[#454B68] hover:bg-[#F5F0FF] transition-colors"
        >
          <Icon name="settings" className="h-3 w-3" />
          Shortcuts
        </button>

        <div className="overflow-hidden rounded-2xl border border-[#E5DDFB] bg-white shadow-[0_8px_28px_rgba(54,35,105,.07)]">
          <div className="relative flex flex-col justify-between gap-5 overflow-hidden bg-gradient-to-r from-[#45209D] via-[#6739D2] to-[#8A62EA] px-5 py-6 text-white sm:flex-row sm:items-center sm:px-7">
            <div className="pointer-events-none absolute -right-6 -top-16 h-20 w-20 rounded-full border-[20px] border-white/10" />
            <div className="relative flex items-center gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-inner">
                <Icon name="user" className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[.16em] text-white/70">
                  Client onboarding
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
                  Add a new client
                </h1>
                <p className="mt-1 text-sm text-white/80">
                  Enter identity, statutory details, contact information and team ownership.
                </p>
              </div>
            </div>
            <div className="relative rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/65">
                Client code
              </p>
              <p className="mt-1 font-mono text-sm font-bold">
                {clientCode || "Auto-generated"}
              </p>
              <p className="mt-1 max-w-[220px] truncate text-xs text-white/75">
                Leave blank to let the firm's counter allocate the next one.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-5 sm:gap-3 sm:p-4">
            {[
              { label: "Basics", icon: "user-round", target: "new-basics" },
              { label: "Identifiers", icon: "file-text", target: "new-identifiers" },
              { label: "Address", icon: "map-pin", target: "new-address" },
              { label: "MIS details", icon: "clipboard-list", target: "new-mis" },
              { label: "Team & notes", icon: "users-round", target: "new-team" },
            ].map((item, index) => (
              <a
                key={item.target}
                id={item.target}
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
            Creating client…
          </div>
        )}

        {create.isError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
            Could not create this client. Please try again.
          </div>
        )}

        {!isLoading && !create.isError && (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* ── Basics ── */}
            <section id="new-basics" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
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
                  hint="Leave blank to let the firm's counter allocate the next one"
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

            {/* ── Identifiers ── */}
            <section id="new-identifiers" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
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
            <section id="new-address" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
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
            <section id="new-mis" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
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
            <section id="new-team" className="overflow-hidden rounded-2xl border border-[#E7E4F0] bg-white shadow-[0_5px_20px_rgba(40,35,90,.04)] transition-shadow hover:shadow-[0_9px_26px_rgba(40,35,90,.07)]">
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

            <div className="sticky bottom-3 z-10 rounded-2xl border border-[#DCD3F2] bg-white/95 p-3 shadow-[0_10px_35px_rgba(39,31,83,.14)] backdrop-blur-xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="hidden text-xs text-[#858BA4] sm:block">
                  Review your entries before creating the client profile.
                </p>
                <div className="ml-auto">
                  <FormActions
                    submitLabel="Create client"
                    busy={create.isPending}
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

      <Modal
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
        title="Keyboard shortcuts"
        size="md"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowShortcuts(false)}
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#737A96] hover:text-[#6637D7]"
            >
              <Icon name="arrow-left" className="h-3.5 w-3.5" />
              Back
            </button>
          </div>
          <p className="text-xs text-[#858BA4]">
            Click a row, then press any key combination (e.g. <span className="font-semibold">Alt+K</span>, <span className="font-semibold">Ctrl+Shift+S</span>, <span className="font-semibold">F2</span>).
          </p>
          <div className="space-y-3">
            {[
              { key: "1", label: "Basics", target: "basics" },
              { key: "2", label: "Identifiers", target: "identifiers" },
              { key: "3", label: "Address", target: "address" },
              { key: "4", label: "MIS details", target: "mis" },
              { key: "5", label: "Team & notes", target: "team" },
            ].map((item) => {
              const s = customShortcuts[item.key];
              const isEditing = editingShortcut === item.key;
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-sm font-medium text-[#252B47]">{item.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingShortcut(item.key)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                        isEditing
                          ? "bg-[#F0EAFE] border-[#7042D8] text-[#7042D8]"
                          : "bg-[#FAFAFE] border-[#E3E2F2] text-[#6B7280] hover:border-[#C0ADE8]"
                      }`}
                    >
                      {isEditing ? "Press any key…" : formatShortcut(s)}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomShortcuts((prev) => ({
                          ...prev,
                          [item.key]: {
                            modifiers: { ctrl: true, alt: false, shift: false, meta: false },
                            key: item.key,
                            target: item.target,
                          },
                        }));
                        setEditingShortcut(null);
                      }}
                      className="text-xs text-[#858BA4] hover:text-[#DC2626] p-1"
                      title="Reset"
                    >
                      ↺
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#858BA4]">
            Use <span className="font-semibold">Tab</span> to move between fields.
          </p>
        </div>
      </Modal>
    </div>
  );
}
