"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Card, Modal } from "@/components/ui";
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
import type {
  ClientDetail,
  ClientServiceCreatePayload,
  ContactCreatePayload,
  Page,
  RegistrationCreatePayload,
  ServiceRow,
} from "@/lib/types";

const REGISTRATION_TYPES = [
  "pan",
  "tan",
  "gst",
  "professional_tax",
  "esi",
  "pf",
  "iec",
  "dsc",
  "shops_establishment",
  "msme",
  "labour_welfare",
  "other",
] as const;

const CONTACT_ROLES = [
  "primary",
  "authorised_signatory",
  "finance",
  "management",
  "other",
] as const;

const CLIENT_STATUSES = [
  "prospect",
  "onboarding",
  "active",
  "inactive",
  "on_hold",
  "closed",
] as const;

type Panel = "none" | "status" | "registration" | "contact" | "service";

/**
 * The actions a client record needs after it exists.
 *
 * These are what make a client *work* rather than merely exist: without a service
 * attached, the compliance generator skips the client entirely, and without a
 * registration the rules that key off GST or TAN never match. Both are silent —
 * nothing errors, the calendar is just empty — so this panel is the difference
 * between "the app is broken" and "the client has no services yet".
 */
export function ClientActions({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<Panel>("none");

  const closePanel = () => {
    setPanel("none");
    queryClient.invalidateQueries({ queryKey: ["client", client.id] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    onChanged();
  };

  const toggle = (target: Panel) => setPanel((current) => (current === target ? "none" : target));

  return (
    <>
      <Card
        title="Manage this client"
        subtitle="Registrations and services decide which compliance rules apply"
      >
        <div className="flex flex-wrap gap-2 p-4">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => toggle("status")}
          >
            Change status
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => toggle("registration")}
          >
            Add registration
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => toggle("contact")}
          >
            Add contact
          </button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => toggle("service")}
          >
            Attach service
          </button>
        </div>
      </Card>

      <Modal
        open={panel === "status"}
        onClose={() => setPanel("none")}
        title="Change status"
      >
        <div className="p-2">
          <StatusForm clientId={client.id} current={client.status} onDone={closePanel} />
        </div>
      </Modal>

      <Modal
        open={panel === "registration"}
        onClose={() => setPanel("none")}
        title="Add registration"
      >
        <div className="p-2">
          <RegistrationForm clientId={client.id} onDone={closePanel} />
        </div>
      </Modal>

      <Modal
        open={panel === "contact"}
        onClose={() => setPanel("none")}
        title="Add contact"
      >
        <div className="p-2">
          <ContactForm clientId={client.id} onDone={closePanel} />
        </div>
      </Modal>

      <Modal
        open={panel === "service"}
        onClose={() => setPanel("none")}
        title="Attach service"
      >
        <div className="p-2">
          <ServiceForm clientId={client.id} onDone={closePanel} />
        </div>
      </Modal>
    </>
  );
}

function StatusForm({
  clientId,
  current,
  onDone,
}: {
  clientId: string;
  current: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: { status: string; reason: string }) =>
      api.post(`/clients/${clientId}/status`, payload),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({ status, reason: reason.trim() });
      }}
    >
      {mutation.isError && <FormError error={mutation.error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="New status"
          value={status}
          onChange={setStatus}
          required
          options={CLIENT_STATUSES.filter((value) => value !== current).map((value) => ({
            value,
            label: humanise(value),
          }))}
          placeholder={`Currently ${humanise(current)}`}
          hint="Only active clients get recurring compliance work generated"
        />
        <TextField
          label="Reason"
          value={reason}
          onChange={setReason}
          required
          placeholder="Engagement letter signed"
          hint="Recorded in the audit trail — a status change without one is not explainable later"
        />
      </div>
      <FormActions
        submitLabel="Change status"
        busy={mutation.isPending}
        onCancel={onDone}
        disabled={!status || !reason.trim()}
      />
    </form>
  );
}

function RegistrationForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [registrationType, setRegistrationType] = useState("");
  const [number, setNumber] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [registeredOn, setRegisteredOn] = useState("");
  const [validUpto, setValidUpto] = useState("");

  const mutation = useMutation({
    mutationFn: (payload: RegistrationCreatePayload) =>
      api.post(`/clients/${clientId}/registrations`, payload),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload: RegistrationCreatePayload = {
          registration_type: registrationType as RegistrationCreatePayload["registration_type"],
          number: number.trim().toUpperCase(),
        };
        if (stateCode.trim()) payload.state_code = stateCode.trim();
        if (registeredOn) payload.registered_on = registeredOn;
        if (validUpto) payload.valid_upto = validUpto;
        mutation.mutate(payload);
      }}
    >
      {mutation.isError && <FormError error={mutation.error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField
          label="Registration type"
          value={registrationType}
          onChange={setRegistrationType}
          required
          options={REGISTRATION_TYPES.map((value) => ({ value, label: humanise(value) }))}
          placeholder="Choose a type"
        />
        <TextField
          label="Number"
          value={number}
          onChange={setNumber}
          required
          maxLength={30}
          placeholder="27AAACB1234C1Z5"
        />
        <TextField
          label="State code"
          value={stateCode}
          onChange={setStateCode}
          maxLength={2}
          placeholder="27"
          hint="GST registrations are state-specific"
        />
        <TextField
          label="Registered on"
          value={registeredOn}
          onChange={setRegisteredOn}
          type="date"
        />
        <TextField label="Valid up to" value={validUpto} onChange={setValidUpto} type="date" />
      </div>
      <FormActions
        submitLabel="Add registration"
        busy={mutation.isPending}
        onCancel={onDone}
        disabled={!registrationType || !number.trim()}
      />
    </form>
  );
}

function ContactForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("finance");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [isSignatory, setIsSignatory] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: ContactCreatePayload) =>
      api.post(`/clients/${clientId}/contacts`, payload),
    onSuccess: onDone,
  });

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload: ContactCreatePayload = {
          name: name.trim(),
          role: role as ContactCreatePayload["role"],
          is_primary: isPrimary,
          is_authorised_signatory: isSignatory,
        };
        if (designation.trim()) payload.designation = designation.trim();
        if (email.trim()) payload.email = email.trim();
        if (phone.trim()) payload.phone = phone.trim();
        if (whatsapp.trim()) payload.whatsapp_number = whatsapp.trim();
        mutation.mutate(payload);
      }}
    >
      {mutation.isError && <FormError error={mutation.error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          required
          placeholder="Priya Sharma"
        />
        <SelectField
          label="Role"
          value={role}
          onChange={setRole}
          options={CONTACT_ROLES.map((value) => ({ value, label: humanise(value) }))}
        />
        <TextField
          label="Designation"
          value={designation}
          onChange={setDesignation}
          placeholder="Finance Head"
        />
        <TextField label="Email" value={email} onChange={setEmail} type="email" />
        <TextField label="Phone" value={phone} onChange={setPhone} type="tel" />
        <TextField
          label="WhatsApp"
          value={whatsapp}
          onChange={setWhatsapp}
          type="tel"
          hint="Used to chase this contact for outstanding documents. Falls back to the phone number."
        />
        <div className="flex flex-col justify-center gap-2">
          <CheckboxField label="Primary contact" checked={isPrimary} onChange={setIsPrimary} />
          <CheckboxField
            label="Authorised signatory"
            checked={isSignatory}
            onChange={setIsSignatory}
          />
        </div>
      </div>
      <FormActions
        submitLabel="Add contact"
        busy={mutation.isPending}
        onCancel={onDone}
        disabled={!name.trim()}
      />
    </form>
  );
}

function ServiceForm({ clientId, onDone }: { clientId: string; onDone: () => void }) {
  const [serviceId, setServiceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const services = useQuery({
    queryKey: ["services", "for-select"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=200"),
  });

  const mutation = useMutation({
    mutationFn: (payload: ClientServiceCreatePayload) =>
      api.post(`/clients/${clientId}/services`, payload),
    onSuccess: onDone,
  });

  const selected = services.data?.items.find((row) => row.id === serviceId);

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload: ClientServiceCreatePayload = { service_id: serviceId };
        if (startDate) payload.start_date = startDate;
        if (endDate) payload.end_date = endDate;
        if (notes.trim()) payload.notes = notes.trim();
        mutation.mutate(payload);
      }}
    >
      {mutation.isError && <FormError error={mutation.error} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Service"
          value={serviceId}
          onChange={setServiceId}
          required
          options={(services.data?.items ?? []).map((row) => ({
            value: row.id,
            label: `${row.name} · ${humanise(row.category)}`,
          }))}
          placeholder={services.isPending ? "Loading services…" : "Choose a service"}
          hint="Recurring services generate compliance work for this client"
        />
        <TextField
          label="Start date"
          value={startDate}
          onChange={setStartDate}
          type="date"
          hint="Defaults to today if left blank"
        />
        <TextField label="End date" value={endDate} onChange={setEndDate} type="date" />
        <TextField
          label="Notes"
          value={notes}
          onChange={setNotes}
          hint={
            selected
              ? `Default frequency: ${humanise(selected.default_frequency ?? "not set")}`
              : undefined
          }
        />
      </div>
      <FormActions
        submitLabel="Attach service"
        busy={mutation.isPending}
        onCancel={onDone}
        disabled={!serviceId}
      />
    </form>
  );
}
