"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  CheckboxField,
  FormActions,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form";
import { Button, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import type {
  FeeModel,
  ServiceCategoryOption,
  ServiceDetailRow,
  ServiceRow,
} from "@/lib/types";

export const FEE_MODELS: Array<{ value: FeeModel; label: string }> = [
  { value: "fixed", label: "Fixed fee" },
  { value: "hourly", label: "Hourly" },
  { value: "recurring", label: "Recurring (monthly retainer)" },
  { value: "milestone", label: "Milestone based" },
  { value: "retainer", label: "Annual retainer" },
  { value: "per_return", label: "Per return filed" },
];

export const FREQUENCIES = [
  { value: "one_time", label: "One time" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half yearly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

function useCategoryOptions() {
  const query = useQuery({
    queryKey: ["services", "categories"],
    queryFn: () => api.get<ServiceCategoryOption[]>("/services/categories"),
  });
  return (query.data ?? []).map((row) => ({ value: row.value, label: row.label }));
}

/**
 * A not-yet-saved checklist step typed by the Add-service form. The backend
 * `POST /task-templates/{id}/steps` accepts the same flags, so this maps 1:1
 * onto `TaskTemplateStepRow` minus the server-generated identity.
 */
interface StepDraft {
  name: string;
  is_mandatory: boolean;
  requires_review: boolean;
  requires_approval: boolean;
  requires_filing: boolean;
  requires_document: boolean;
}

function newStep(): StepDraft {
  return {
    name: "",
    is_mandatory: true,
    requires_review: false,
    requires_approval: false,
    requires_filing: false,
    requires_document: false,
  };
}

/** Add a service line to the catalogue. */
export function AddServiceForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useCategoryOptions();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [priority, setPriority] = useState("normal");
  const [feeModel, setFeeModel] = useState("");
  const [standardFee, setStandardFee] = useState("");
  const [sacCode, setSacCode] = useState("9982");
  const [addChecklist, setAddChecklist] = useState(false);
  const [checklistName, setChecklistName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>(() => [newStep()]);

  const create = useMutation({
    mutationFn: async () => {
      const created = await api.post<ServiceRow>("/services", {
        code: code.trim(),
        name: name.trim(),
        category,
        description: description.trim() || null,
        is_recurring: isRecurring,
        default_frequency: isRecurring ? frequency || null : null,
        default_priority: priority,
        default_fee_model: feeModel || null,
        standard_fee: standardFee === "" ? null : Number(standardFee),
        sac_code: sacCode.trim() || "9982",
      });

      // Optionally seed the service's checklist: one task template carrying the
      // steps the user defined. The service id is only known after creation.
      if (addChecklist) {
        await api.post("/task-templates", {
          service_id: created.id,
          code: `${created.code}-CHK`,
          name: checklistName.trim() || created.name || "Checklist",
          is_recurring: isRecurring,
          frequency: isRecurring ? frequency : null,
          steps: steps
            .filter((s) => s.name.trim())
            .map((s, i) => ({
              sequence: i + 1,
              name: s.name.trim(),
              is_mandatory: s.is_mandatory,
              requires_review: s.requires_review,
              requires_approval: s.requires_approval,
              requires_filing: s.requires_filing,
              requires_document: s.requires_document,
            })),
        });
      }

      return created;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["services"] });
      void queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      void queryClient.invalidateQueries({ queryKey: ["service", created.id] });
      toast.push({ type: "success", message: "Service added." });
      onDone();
    },
  });

  const canSubmit =
    code.trim().length > 0 &&
    name.trim().length > 0 &&
    category !== "" &&
    (!isRecurring || frequency !== "");

  return (
    <form
      className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate();
      }}
    >
      <h2 className="text-sm font-semibold text-slate-900">Add a service</h2>
      {create.isError && <FormError error={create.error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Name"
          value={name}
          onChange={setName}
          placeholder="GST Audit under section 65"
          required
          maxLength={150}
        />
        <TextField
          label="Code"
          value={code}
          onChange={setCode}
          placeholder="GST-AUDIT"
          hint="A short unique identifier. Saved in capitals."
          required
          maxLength={30}
        />
        <SelectField
          label="Category"
          value={category}
          onChange={setCategory}
          options={categories}
          placeholder="Choose a category"
          required
        />
        <SelectField
          label="Default priority"
          value={priority}
          onChange={setPriority}
          options={PRIORITIES}
        />
      </div>

      <TextAreaField
        label="Description"
        value={description}
        onChange={setDescription}
        rows={2}
        maxLength={600}
        placeholder="What this engagement covers."
      />

      <CheckboxField
        label="Recurring service"
        checked={isRecurring}
        onChange={setIsRecurring}
        hint="Recurring services generate work automatically from their templates."
      />
      {isRecurring && (
        <SelectField
          label="Frequency"
          value={frequency}
          onChange={setFrequency}
          options={FREQUENCIES}
          placeholder="How often?"
          required
          hint="Required — without it nothing can schedule the work."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Billing method"
          value={feeModel}
          onChange={setFeeModel}
          options={FEE_MODELS}
          placeholder="Not set"
        />
        <TextField
          label="Standard fee (₹)"
          value={standardFee}
          onChange={setStandardFee}
          type="number"
          placeholder="25000"
          hint="Leave blank if no fee has been agreed."
        />
        <TextField
          label="SAC code"
          value={sacCode}
          onChange={setSacCode}
          placeholder="9982"
          maxLength={10}
          hint="Printed on invoices. 9982 is legal and accounting services; 998231 narrows it to tax consultancy."
        />
      </div>

      <CheckboxField
        label="Add a checklist"
        checked={addChecklist}
        onChange={setAddChecklist}
        hint="Define the task template and its steps now, so recurring work generates correctly from day one."
      />
      {addChecklist && (
        <div className="space-y-4 rounded-lg border border-slate-200 p-4">
          <TextField
            label="Checklist name"
            value={checklistName}
            onChange={setChecklistName}
            placeholder={name ? `${name} checklist` : "e.g. Compliance checklist"}
            maxLength={150}
          />

          <div className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <StepEditor
                key={i}
                index={i}
                step={step}
                isOnly={steps.length === 1}
                onChange={(field, value) =>
                  setSteps((prev) =>
                    prev.map((s, j) => (j === i ? { ...s, [field]: value } : s)),
                  )
                }
                onRemove={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSteps((prev) => [...prev, newStep()])}
          >
            + Add step
          </Button>
        </div>
      )}

      <FormActions
        submitLabel="Add service"
        busy={create.isPending}
        disabled={!canSubmit}
        onCancel={onDone}
      />
    </form>
  );
}


interface StepEditorProps {
  index: number;
  step: StepDraft;
  isOnly: boolean;
  onChange: (field: keyof StepDraft, value: string | boolean) => void;
  onRemove: () => void;
}

function StepEditor({ index, step, isOnly, onChange, onRemove }: StepEditorProps) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <TextField
          label={`Step ${index + 1}`}
          value={step.name}
          onChange={(v) => onChange("name", v)}
          placeholder="e.g. Reconcile with GSTR-2B"
          required
          maxLength={250}
        />
        {!isOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
          >
            Remove
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CheckboxField
          label="Mandatory"
          checked={step.is_mandatory}
          onChange={(v) => onChange("is_mandatory", v)}
        />
        <CheckboxField
          label="Requires review"
          checked={step.requires_review}
          onChange={(v) => onChange("requires_review", v)}
        />
        <CheckboxField
          label="Requires approval"
          checked={step.requires_approval}
          onChange={(v) => onChange("requires_approval", v)}
        />
        <CheckboxField
          label="Requires filing"
          checked={step.requires_filing}
          onChange={(v) => onChange("requires_filing", v)}
          hint="Stops the task closing before the ARN is recorded."
        />
        <CheckboxField
          label="Requires document"
          checked={step.requires_document}
          onChange={(v) => onChange("requires_document", v)}
        />
      </div>
    </div>
  );
}


/**
 * Edit a service, including its fee and billing method.
 *
 * Only changed fields are sent, which is what makes the API's partial-update
 * semantics worth having: renaming a service cannot deactivate it or wipe its fee.
 * Clearing a fee sends `clear_fee` rather than a null, because the API cannot tell a
 * null from an omitted field once the body is parsed.
 */
export function EditServiceForm({
  service,
  onCancel,
}: {
  service: ServiceDetailRow;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const categories = useCategoryOptions();

  const [name, setName] = useState(service.name);
  const [category, setCategory] = useState<string>(service.category);
  const [description, setDescription] = useState(service.description ?? "");
  const [isRecurring, setIsRecurring] = useState(service.is_recurring);
  const [frequency, setFrequency] = useState(service.default_frequency ?? "");
  const [priority, setPriority] = useState(service.default_priority);
  const [feeModel, setFeeModel] = useState<string>(service.default_fee_model ?? "");
  const [standardFee, setStandardFee] = useState(
    service.standard_fee === null ? "" : String(service.standard_fee),
  );
  const [sacCode, setSacCode] = useState(service.sac_code ?? "9982");
  const [isActive, setIsActive] = useState(service.is_active);
  const [sortOrder, setSortOrder] = useState(String(service.sort_order));

  const update = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};

      if (name.trim() !== service.name) payload.name = name.trim();
      if (category !== service.category) payload.category = category;
      if (description.trim() !== (service.description ?? "")) {
        payload.description = description.trim() || null;
      }
      if (isRecurring !== service.is_recurring) payload.is_recurring = isRecurring;
      if (frequency !== (service.default_frequency ?? "")) {
        payload.default_frequency = frequency || null;
      }
      if (priority !== service.default_priority) payload.default_priority = priority;
      if (feeModel !== (service.default_fee_model ?? "")) {
        payload.default_fee_model = feeModel || null;
      }
      if (isActive !== service.is_active) payload.is_active = isActive;
      if (Number(sortOrder) !== service.sort_order) payload.sort_order = Number(sortOrder);

      // The fee needs three-way handling: unchanged, set to a number, or cleared.
      const currentFee = service.standard_fee === null ? "" : String(service.standard_fee);
      if (standardFee !== currentFee) {
        if (standardFee === "") payload.clear_fee = true;
        else payload.standard_fee = Number(standardFee);
      }

      const nextSac = sacCode.trim() || "9982";
      if (nextSac !== service.sac_code) payload.sac_code = nextSac;

      return api.patch<ServiceRow>(`/services/${service.id}`, payload);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["services"] });
      void queryClient.invalidateQueries({ queryKey: ["service", service.id] });
      toast.push({ type: "success", message: "Service updated." });
    },
  });

  return (
    <form
      className="space-y-4 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate();
      }}
    >
      {update.isError && <FormError error={update.error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" value={name} onChange={setName} required maxLength={150} />
        <SelectField
          label="Category"
          value={category}
          onChange={setCategory}
          options={categories}
        />
        <SelectField
          label="Default priority"
          value={priority}
          onChange={setPriority}
          options={PRIORITIES}
        />
        <TextField
          label="Sort order"
          value={sortOrder}
          onChange={setSortOrder}
          type="number"
          hint="Lower numbers appear first in pickers."
        />
      </div>

      <TextAreaField
        label="Description"
        value={description}
        onChange={setDescription}
        rows={2}
        maxLength={600}
      />

      <CheckboxField
        label="Recurring service"
        checked={isRecurring}
        onChange={setIsRecurring}
        hint="Recurring services generate work automatically from their templates."
      />
      {isRecurring && (
        <SelectField
          label="Frequency"
          value={frequency}
          onChange={setFrequency}
          options={FREQUENCIES}
          placeholder="How often?"
          hint="Required — without it nothing can schedule the work."
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Billing method"
          value={feeModel}
          onChange={setFeeModel}
          options={FEE_MODELS}
          placeholder="Not set"
        />
        <TextField
          label="Standard fee (₹)"
          value={standardFee}
          onChange={setStandardFee}
          type="number"
          hint="Clear this and save to remove the agreed fee."
        />
        <TextField
          label="SAC code"
          value={sacCode}
          onChange={setSacCode}
          maxLength={10}
          hint="Printed on invoice lines for this service."
        />
      </div>

      <CheckboxField
        label="Active"
        checked={isActive}
        onChange={setIsActive}
        hint="Retiring a service hides it from pickers without deleting its history."
      />

      <FormActions
        submitLabel="Save changes"
        busy={update.isPending}
        disabled={!name.trim() || (isRecurring && !frequency)}
        onCancel={onCancel}
      />
    </form>
  );
}
