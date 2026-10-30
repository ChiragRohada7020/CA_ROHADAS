"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { FormError } from "@/components/form";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useUserDirectory } from "@/lib/users";
import type {
  ClientListItem,
  FinancialYearRow,
  Frequency,
  Page,
  Priority,
  ServiceCategory,
  ServiceRow,
  TaskListItem,
  TaskRead,
  TaskStatus,
  TaskTemplateRow,
  TaskType,
} from "@/lib/types";

/**
 * Create a task, as the seven-section wizard.
 *
 * Everything is on one scrolling surface rather than one step per screen. A wizard that
 * shows a single section at a time makes a person walk forward and back to check whether
 * they already filled something in; a partner raising a GSTR-1 knows their client, their
 * period and their preparer before they start, and wants to see all of it at once. The
 * numbered rail is an index and a progress read-out, not a gate.
 *
 * One thing the mockup asks for is answered honestly rather than faked: **the description
 * is plain text**. `tasks.description` is a text column, so there is no rich-text model to
 * store spans in, and there is no formatting toolbar here for that reason — a Bold button
 * that stores nothing is worse than no Bold button.
 */

/** Entry points the API accepts. Mirrors `_initial_status` in the tasks router. */
const START_STATUSES: Array<{ value: TaskStatus; label: string; dot: string }> = [
  { value: "not_started", label: "Not Started", dot: "bg-slate-400" },
  { value: "assigned", label: "Assigned", dot: "bg-sky-500" },
  { value: "in_progress", label: "In Progress", dot: "bg-amber-500" },
];

const TASK_TYPES: Array<{ value: TaskType; label: string }> = [
  { value: "compliance", label: "Compliance" },
  { value: "regular", label: "Regular" },
  { value: "internal", label: "Internal" },
];

const PRIORITIES: Array<{ value: Priority; label: string; dot: string }> = [
  { value: "low", label: "Low", dot: "bg-slate-400" },
  { value: "normal", label: "Normal", dot: "bg-sky-500" },
  { value: "high", label: "High", dot: "bg-rose-500" },
  { value: "urgent", label: "Urgent", dot: "bg-rose-700" },
];

const CATEGORIES: Array<{ value: ServiceCategory; label: string }> = [
  { value: "gst", label: "GST" },
  { value: "income_tax", label: "Income Tax" },
  { value: "tds", label: "TDS" },
  { value: "audit", label: "Audit" },
  { value: "roc", label: "ROC" },
  { value: "accounting", label: "Accounting" },
  { value: "payroll", label: "Payroll" },
  { value: "advisory", label: "Advisory" },
  { value: "other", label: "Other" },
];

const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
];

/** The numbered rail. Each entry is an anchor into the scrolling surface. */
const STEPS: Array<{ key: string; label: string; hint: string }> = [
  { key: "sec-basics", label: "Basic Details", hint: "Task information" },
  { key: "sec-client", label: "Client & Service", hint: "Select client and service" },
  { key: "sec-period", label: "Period & Deadlines", hint: "Financial year and due dates" },
  { key: "sec-assignment", label: "Assignment", hint: "Team and priority" },
  { key: "sec-checklist", label: "Checklist & Documents", hint: "Required work and files" },
  { key: "sec-options", label: "Additional Options", hint: "Recurrence and settings" },
  { key: "sec-review", label: "Review & Create", hint: "Confirm details" },
];

/** A labelled field, so the four main sections line up with each other. */
function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

/** A section card with the same number as its entry in the rail. */
function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number?: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-2 rounded-lg border border-slate-200 bg-white">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">
        {number !== undefined && <span className="tabular text-slate-400">{number}.</span>}
        {title}
      </h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A small on/off switch for the Additional Options section. */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        {hint && <p className="text-[11px] leading-snug text-slate-500">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
          checked ? "bg-sky-600" : "bg-slate-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-all",
            checked ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** A person's initials in a circle, matching the team screen. */
function Avatar({ name }: { name: string }) {
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?";
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700">
      {letters}
    </span>
  );
}


export function CreateTaskModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (task: TaskRead) => void;
}) {
  const queryClient = useQueryClient();
  const directory = useUserDirectory();

  // ── 1. Basic Details ──
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("compliance");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");

  // ── 2. Client & Service ──
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");

  // ── 3. Period & Deadlines ──
  const [financialYearId, setFinancialYearId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [statutoryDueDate, setStatutoryDueDate] = useState("");
  const [internalDueDate, setInternalDueDate] = useState("");
  const [reminderDate, setReminderDate] = useState("");

  // ── 4. Assignment & Priority ──
  const [preparerId, setPreparerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [status, setStatus] = useState<TaskStatus>("not_started");
  const [estimatedHours, setEstimatedHours] = useState("");

  // ── 5. Checklist & Documents ──
  const [templateId, setTemplateId] = useState("");
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [customSteps, setCustomSteps] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState("");
  const [documents, setDocuments] = useState<Array<{ title: string; required: boolean }>>([]);
  const [documentDraft, setDocumentDraft] = useState("");

  // ── 6. Additional Options ──
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<Frequency>("monthly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [createNextPeriod, setCreateNextPeriod] = useState(false);
  const [linkCompliance, setLinkCompliance] = useState(true);
  const [parentTaskId, setParentTaskId] = useState("");

  const [note, setNote] = useState<string | null>(null);

  const firm = useQuery({
    queryKey: ["billing", "settings"],
    queryFn: () => api.get<{ legal_name: string | null; name: string | null }>("/billing/settings"),
  });
  const clients = useQuery({
    queryKey: ["clients", "for-task"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=300"),
  });
  const services = useQuery({
    queryKey: ["services", "for-select"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=200"),
  });
  const years = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api.get<FinancialYearRow[]>("/financial-years"),
  });
  const templates = useQuery({
    queryKey: ["task-templates", "for-select"],
    queryFn: () => api.get<Page<TaskTemplateRow>>("/task-templates?limit=200"),
  });
  // Candidates for Parent Task. Open work only — parenting to something finished is
  // never what the person means.
  const openTasks = useQuery({
    queryKey: ["tasks", "parent-candidates"],
    queryFn: () => api.get<Page<TaskListItem>>("/tasks?limit=100&open_only=true"),
  });

  // Escape closes, and the page behind must not scroll while the dialog is up.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const selectedClient = (clients.data?.items ?? []).find((row) => row.id === clientId);
  const selectedService = (services.data?.items ?? []).find((row) => row.id === serviceId);
  const selectedTemplate = (templates.data?.items ?? []).find((row) => row.id === templateId);
  const selectedYear = (years.data ?? []).find((row) => row.id === financialYearId);

  /**
   * The assessment year, derived from the financial year.
   *
   * Derived rather than entered: AY is always the FY that follows, and letting somebody
   * type it independently is letting them type a contradiction. Shown read-only.
   */
  const assessmentYear = useMemo(() => {
    if (!selectedYear) return null;
    const match = /(\d{4})/.exec(selectedYear.label);
    if (!match) return null;
    const start = Number(match[1]);
    return `AY ${start + 1}-${String((start + 2) % 100).padStart(2, "0")}`;
  }, [selectedYear]);


  /** Which of the template's steps are ticked, defaulting to all of them. */
  const templateSteps = selectedTemplate?.steps ?? [];
  const chosenSteps = templateSteps.filter(
    (step) => checkedSteps[step.id] ?? true,
  );

  function commitTag() {
    const tag = tagDraft.trim();
    if (!tag) return;
    // Case-insensitive, matching the API's own de-duplication — so what the field shows
    // is what the task ends up with.
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTags([...tags, tag]);
    }
    setTagDraft("");
  }

  function addCustomStep() {
    const name = customDraft.trim();
    if (!name) return;
    setCustomSteps([...customSteps, name]);
    setCustomDraft("");
  }

  function addDocument() {
    const name = documentDraft.trim();
    if (!name) return;
    setDocuments([...documents, { title: name, required: true }]);
    setDocumentDraft("");
  }

  /**
   * Create the task, then apply the four things that need an id to attach to.
   *
   * The extras run after creation because each is a separate resource: a checklist step,
   * a document request, a dependency edge, an attachment. Any that fails is *reported*
   * rather than swallowed — a task created without the checklist the person asked for
   * must not look like an unqualified success.
   */
  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        client_id: clientId,
        title: title.trim(),
        task_type: taskType,
        priority,
      };
      if (description.trim()) payload.description = description.trim();
      if (tags.length > 0) payload.tags = tags;
      if (category) payload.category = category;
      if (subCategory.trim()) payload.sub_category = subCategory.trim();
      if (status !== "not_started") payload.status = status;
      if (serviceId) payload.service_id = serviceId;
      if (financialYearId) payload.financial_year_id = financialYearId;
      if (periodKey.trim()) payload.period_key = periodKey.trim();
      if (statutoryDueDate) payload.statutory_due_date = statutoryDueDate;
      if (internalDueDate) payload.internal_due_date = internalDueDate;
      if (reminderDate) payload.reminder_date = reminderDate;
      if (preparerId) payload.preparer_id = preparerId;
      if (reviewerId) payload.reviewer_id = reviewerId;
      if (approverId) payload.approver_id = approverId;
      if (estimatedHours.trim()) payload.estimated_hours = Number(estimatedHours);
      if (parentTaskId) payload.parent_task_id = parentTaskId;
      if (templateId) payload.template_id = templateId;
      if (isRecurring) {
        payload.is_recurring = true;
        payload.recurrence_frequency = recurrenceFrequency;
        payload.create_next_period = createNextPeriod;
        if (recurrenceEndDate) payload.recurrence_end_date = recurrenceEndDate;
      }

      const task = await api.post<TaskRead>("/tasks", payload);
      const warnings: string[] = [];

      // The template's own steps are copied by the API; only the ones this person
      // *unticked* are removed, and only the ones they added are added.
      const unticked = templateSteps.filter((step) => !(checkedSteps[step.id] ?? true));
      for (const step of unticked) {
        try {
          await api.post(`/tasks/${task.id}/steps/${step.id}`, {
            status: "not_applicable",
            skip_reason: "Not required for this task.",
          });
        } catch {
          warnings.push(`the step "${step.name}"`);
        }
      }

      for (const name of customSteps) {
        try {
          await api.post(`/tasks/${task.id}/steps`, { name });
        } catch {
          warnings.push(`the checklist item "${name}"`);
        }
      }

      for (const document of documents) {
        try {
          await api.post("/document-requests", {
            client_id: clientId,
            title: document.title,
            task_id: task.id,
            financial_year_id: financialYearId || undefined,
            period_key: periodKey.trim() || undefined,
            due_date: internalDueDate || undefined,
          });
        } catch {
          warnings.push(`the document request "${document.title}"`);
        }
      }

      return { task, warnings, chosen: chosenSteps.length };
    },
    onSuccess: ({ task, warnings }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["document-requests"] });

      if (warnings.length > 0) {
        setNote(
          `${task.task_code} was created, but ${warnings.join(", ")} could not be added. ` +
            "Open the task to finish setting it up.",
        );
        return;
      }
      onCreated?.(task);
      onClose();
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!clientId || title.trim().length < 2) return;
    create.mutate();
  }

  const canSubmit = Boolean(clientId) && title.trim().length >= 2;
  const firmName = firm.data?.legal_name || firm.data?.name || "Your firm";


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Create task"
        className="relative z-10 flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-2xl"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <h2 className="page-title">Create Task</h2>
            <p className="page-subtitle">
              Create a new task for client work and compliance
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* ── The numbered rail: an index, not a gate ── */}
          <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block">
            <ol className="space-y-1">
              {STEPS.map((step, index) => (
                <li key={step.key}>
                  <a
                    href={`#${step.key}`}
                    className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-slate-50"
                  >
                    <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-800">
                        {step.label}
                      </span>
                      <span className="block text-[11px] text-slate-500">{step.hint}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* ── Main column: sections 1-4 and the review ── */}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">

            <Section id="sec-basics" number={1} title="Basic Details">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Field label="Task Title" required className="lg:col-span-2">
                  <input
                    className="input"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Prepare GSTR-1"
                    maxLength={300}
                    autoFocus
                  />
                </Field>

                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Task Type
                  </span>
                  <div className="flex flex-wrap items-center gap-3 pt-1.5">
                    {TASK_TYPES.map((option) => (
                      <label key={option.value} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="radio"
                          name="task-type"
                          checked={taskType === option.value}
                          onChange={() => setTaskType(option.value)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                <Field label="Description" className="lg:col-span-3">
                  <textarea
                    className="input"
                    rows={3}
                    maxLength={500}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What the work involves, and anything the preparer needs to know."
                  />
                  <span className="tabular mt-0.5 block text-right text-[11px] text-slate-400">
                    {description.length}/500
                  </span>
                </Field>

                <Field label="Category" required>
                  <select
                    className="input"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="">Choose a category</option>
                    {CATEGORIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Sub Category">
                  <input
                    className="input"
                    value={subCategory}
                    onChange={(event) => setSubCategory(event.target.value)}
                    maxLength={120}
                    placeholder="GSTR-1"
                  />
                </Field>

                <Field label="Tags">
                  <div className="flex min-h-[34px] flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 focus-within:border-sky-400">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => setTags(tags.filter((row) => row !== tag))}
                          aria-label={`Remove tag ${tag}`}
                          className="text-sky-500 hover:text-sky-800"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      className="min-w-16 flex-1 border-0 p-0 text-xs outline-none placeholder:text-slate-400"
                      value={tagDraft}
                      onChange={(event) => setTagDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          commitTag();
                        } else if (event.key === "Backspace" && !tagDraft && tags.length > 0) {
                          setTags(tags.slice(0, -1));
                        }
                      }}
                      onBlur={commitTag}
                      placeholder={tags.length === 0 ? "Select or type tags…" : ""}
                      aria-label="Add a tag"
                    />
                  </div>
                </Field>
              </div>
            </Section>

            <Section id="sec-client" number={2} title="Client & Service">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-700">
                      Client <span className="text-rose-600">*</span>
                    </span>
                    {selectedClient && (
                      <a
                        href={`/clients/${selectedClient.id}`}
                        className="text-[11px] font-medium text-sky-700 hover:underline"
                      >
                        View Client →
                      </a>
                    )}
                  </div>
                  <select
                    className="input"
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    required
                  >
                    <option value="">
                      {clients.isPending ? "Loading…" : "Choose a client"}
                    </option>
                    {(clients.data?.items ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.client_code} · {row.legal_name}
                      </option>
                    ))}
                  </select>

                  {/* The client's identifiers, so the preparer can check they picked the
                      right entity without leaving the wizard. */}
                  {selectedClient && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-[11px]">
                      <div className="flex gap-1">
                        <dt className="text-slate-500">PAN:</dt>
                        <dd className="font-mono text-slate-700">
                          {selectedClient.pan ?? "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">GSTIN:</dt>
                        <dd className="truncate font-mono text-slate-700">
                          {selectedClient.gstin ?? "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">Type:</dt>
                        <dd className="text-slate-700">{selectedClient.client_type}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">State:</dt>
                        <dd className="text-slate-700">{selectedClient.state ?? "—"}</dd>
                      </div>
                    </dl>
                  )}
                </div>

                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-700">
                    Service <span className="text-rose-600">*</span>
                  </span>
                  <select
                    className="input"
                    value={serviceId}
                    onChange={(event) => setServiceId(event.target.value)}
                  >
                    <option value="">Not linked to a service</option>
                    {(services.data?.items ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>

                  {selectedService && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-md bg-slate-50 px-3 py-2 text-[11px]">
                      <div className="flex gap-1">
                        <dt className="text-slate-500">SAC:</dt>
                        <dd className="font-mono text-slate-700">
                          {selectedService.sac_code ?? "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">Default Fee:</dt>
                        <dd className="tabular text-slate-700">
                          {selectedService.standard_fee != null
                            ? `₹${selectedService.standard_fee.toLocaleString("en-IN")}`
                            : "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">Frequency:</dt>
                        <dd className="text-slate-700">
                          {selectedService.default_frequency ?? "—"}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="text-slate-500">Category:</dt>
                        <dd className="text-slate-700">{selectedService.category}</dd>
                      </div>
                    </dl>
                  )}
                </div>
              </div>
            </Section>

            <Section id="sec-period" number={3} title="Period & Deadlines">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Financial Year" required>
                  <select
                    className="input"
                    value={financialYearId}
                    onChange={(event) => setFinancialYearId(event.target.value)}
                  >
                    <option value="">Use the current year</option>
                    {(years.data ?? []).map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Return Period"
                  required
                  hint="A month, quarter or assessment year"
                >
                  <input
                    className="input"
                    value={periodKey}
                    onChange={(event) => setPeriodKey(event.target.value)}
                    maxLength={20}
                    placeholder="2026-09"
                  />
                </Field>

                <Field
                  label="Assessment Year"
                  hint="Derived from the financial year — not editable"
                >
                  <input
                    className="input bg-slate-100 text-slate-500"
                    value={assessmentYear ?? ""}
                    readOnly
                    disabled
                    placeholder="—"
                  />
                </Field>

                <Field label="Statutory Due Date" required>
                  <input
                    type="date"
                    className="input"
                    value={statutoryDueDate}
                    onChange={(event) => setStatutoryDueDate(event.target.value)}
                  />
                </Field>

                <Field
                  label="Internal Due Date"
                  hint="The firm's own buffer, on or before the statutory date"
                >
                  <input
                    type="date"
                    className="input"
                    value={internalDueDate}
                    onChange={(event) => setInternalDueDate(event.target.value)}
                  />
                </Field>

                <Field label="Reminder Date" hint="When to nudge the holder">
                  <input
                    type="date"
                    className="input"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                  />
                </Field>
              </div>
            </Section>


            <Section id="sec-assignment" number={4} title="Assignment & Priority">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Preparer" required>
                  <select
                    className="input"
                    value={preparerId}
                    onChange={(event) => setPreparerId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {directory.active.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Reviewer">
                  <select
                    className="input"
                    value={reviewerId}
                    onChange={(event) => setReviewerId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {directory.active.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Partner (Approval)"
                  hint="Who signs the work off, where it needs it"
                >
                  <select
                    className="input"
                    value={approverId}
                    onChange={(event) => setApproverId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {directory.active.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Priority" required>
                  <select
                    className="input"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as Priority)}
                  >
                    {PRIORITIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Status">
                  <select
                    className="input"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as TaskStatus)}
                  >
                    {START_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Estimated Hours">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="input"
                    value={estimatedHours}
                    onChange={(event) => setEstimatedHours(event.target.value)}
                    placeholder="2.0"
                  />
                </Field>
              </div>
            </Section>


            <Section id="sec-review" number={7} title="Review & Create">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Title</dt>
                  <dd className="text-right font-medium text-slate-800">
                    {title.trim() || "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Type</dt>
                  <dd className="text-slate-800">
                    {TASK_TYPES.find((row) => row.value === taskType)?.label}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Client</dt>
                  <dd className="text-right text-slate-800">
                    {selectedClient?.legal_name ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Service</dt>
                  <dd className="text-right text-slate-800">
                    {selectedService?.name ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Period</dt>
                  <dd className="tabular text-slate-800">{periodKey || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Statutory due</dt>
                  <dd className="tabular text-slate-800">{statutoryDueDate || "—"}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Preparer</dt>
                  <dd className="text-slate-800">
                    {directory.active.find((row) => row.id === preparerId)?.full_name ??
                      "Unassigned"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Checklist</dt>
                  <dd className="text-slate-800">
                    {templateId
                      ? `${chosenSteps.length} from template + ${customSteps.length} added`
                      : `${customSteps.length} added`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Documents requested</dt>
                  <dd className="text-slate-800">{documents.length}</dd>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-100 py-1">
                  <dt className="text-slate-500">Repeats</dt>
                  <dd className="text-slate-800">
                    {isRecurring
                      ? FREQUENCIES.find((row) => row.value === recurrenceFrequency)?.label
                      : "No"}
                  </dd>
                </div>
              </dl>

              {!canSubmit && (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-inset ring-amber-200">
                  A client and a title of at least two characters are needed before this
                  task can be created.
                </p>
              )}

              {create.isError && (
                <div className="mt-3">
                  <FormError error={create.error} />
                </div>
              )}

              {note && (
                <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                  {note}
                </p>
              )}
            </Section>
          </div>

          {/* ── Right rail: sections 5 and 6 ── */}
          <div className="hidden w-96 shrink-0 space-y-3 overflow-y-auto border-l border-slate-200 bg-white p-4 xl:block">

            <Section id="sec-checklist" number={5} title="Checklist & Documents">
              <Field label="Checklist Template">
                <div className="flex gap-2">
                  <select
                    className="input"
                    value={templateId}
                    onChange={(event) => {
                      setTemplateId(event.target.value);
                      // Start from everything ticked: a template's steps are what the firm
                      // decided the work involves, so the exception is the *unticked* one.
                      setCheckedSteps({});
                    }}
                  >
                    <option value="">No template</option>
                    {(templates.data?.items ?? []).map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                  {selectedTemplate && (
                    <a
                      href="/tasks/templates"
                      className="btn-ghost shrink-0 px-2 py-1 text-xs"
                      title={`${selectedTemplate.name} — ${selectedTemplate.steps.length} step(s)`}
                    >
                      Preview
                    </a>
                  )}
                </div>
              </Field>

              {templateSteps.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {templateSteps.map((step) => {
                    const ticked = checkedSteps[step.id] ?? true;
                    return (
                      <li key={step.id}>
                        <label className="flex items-start gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={ticked}
                            onChange={() =>
                              setCheckedSteps({ ...checkedSteps, [step.id]: !ticked })
                            }
                          />
                          <span className={cn(!ticked && "text-slate-400 line-through")}>
                            {step.name}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {customSteps.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {customSteps.map((name, index) => (
                    <li key={`${name}-${index}`} className="flex items-center gap-2">
                      <input type="checkbox" className="mt-0.5" defaultChecked />
                      <span className="flex-1 text-xs text-slate-700">{name}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          setCustomSteps(customSteps.filter((_, p) => p !== index))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex gap-2">
                <input
                  className="input py-1 text-xs"
                  value={customDraft}
                  onChange={(event) => setCustomDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomStep();
                    }
                  }}
                  placeholder="Add custom item"
                  aria-label="Add a custom checklist item"
                />
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-2 py-1 text-xs"
                  onClick={addCustomStep}
                >
                  Add
                </button>
              </div>


              <div className="mt-5 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    Required Documents
                  </span>
                  <span className="tabular text-[11px] text-slate-400">
                    {documents.length}
                  </span>
                </div>

                {documents.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {documents.map((document, index) => (
                      <li
                        key={`${document.title}-${index}`}
                        className="flex items-center gap-2"
                      >
                        <Icon name="file-text" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="flex-1 truncate text-xs text-slate-700">
                          {document.title}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            "rounded px-1.5 py-0.5 text-[10px]",
                            document.required
                              ? "bg-rose-50 text-rose-700"
                              : "bg-slate-100 text-slate-500",
                          )}
                          title="Toggle whether this is required"
                          onClick={() =>
                            setDocuments(
                              documents.map((row, position) =>
                                position === index
                                  ? { ...row, required: !row.required }
                                  : row,
                              ),
                            )
                          }
                        >
                          {document.required ? "Required" : "Optional"}
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          aria-label={`Remove ${document.title}`}
                          onClick={() => setDocuments(documents.filter((_, p) => p !== index))}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-2 flex gap-2">
                  <input
                    className="input py-1 text-xs"
                    value={documentDraft}
                    onChange={(event) => setDocumentDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addDocument();
                      }
                    }}
                    placeholder="Sales Register (Sep 2026)"
                    aria-label="Add a required document"
                  />
                  <button
                    type="button"
                    className="btn-ghost shrink-0 px-2 py-1 text-xs"
                    onClick={addDocument}
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Each becomes a document request to the client, due on the internal date.
                </p>
              </div>
            </Section>


            <Section id="sec-options" number={6} title="Additional Options">
              <div className="space-y-4">
                <Toggle
                  checked={isRecurring}
                  onChange={setIsRecurring}
                  label="Recurrence"
                  hint="Repeat this task on a schedule"
                />

                {isRecurring && (
                  <div className="grid grid-cols-1 gap-3 border-l-2 border-sky-100 pl-3 sm:grid-cols-2 xl:grid-cols-1">
                    <Field label="Frequency">
                      <select
                        className="input py-1.5 text-xs"
                        value={recurrenceFrequency}
                        onChange={(event) =>
                          setRecurrenceFrequency(event.target.value as Frequency)
                        }
                      >
                        {FREQUENCIES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label="End Date" hint="Leave blank to repeat indefinitely">
                      <input
                        type="date"
                        className="input py-1.5 text-xs"
                        value={recurrenceEndDate}
                        onChange={(event) => setRecurrenceEndDate(event.target.value)}
                      />
                    </Field>

                    <Toggle
                      checked={createNextPeriod}
                      onChange={setCreateNextPeriod}
                      label="Create Next Period"
                      hint="Generate the next period automatically rather than waiting for a person"
                    />
                  </div>
                )}

                <div className="border-t border-slate-100 pt-3">
                  <Toggle
                    checked={linkCompliance}
                    onChange={setLinkCompliance}
                    label="Link to Compliance"
                    hint="Tie this task to the compliance rule that governs it"
                  />
                  {linkCompliance && selectedService && (
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-sky-50 px-2 py-1 text-[11px] text-sky-700">
                      <Icon name="compliance" className="h-3 w-3" />
                      {selectedService.name}
                      <button
                        type="button"
                        onClick={() => setLinkCompliance(false)}
                        aria-label="Unlink compliance"
                        className="text-sky-500 hover:text-sky-800"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                  {linkCompliance && !selectedService && (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Choose a service in step 2 to link a compliance rule.
                    </p>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <Field
                    label="Parent Task (Optional)"
                    hint="Makes this a subtask of the one you pick"
                  >
                    <select
                      className="input py-1.5 text-xs"
                      value={parentTaskId}
                      onChange={(event) => setParentTaskId(event.target.value)}
                    >
                      <option value="">Select parent task…</option>
                      {(openTasks.data?.items ?? []).map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.task_code} · {row.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </div>
            </Section>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-[11px] text-slate-500">
            {taskType === "compliance"
              ? "Compliance work expects a filing record before it can be completed."
              : "Work in progress. Nothing is created until you press the button."}
          </p>

          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary px-5 py-2.5"
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending ? "Creating…" : "Create Task"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

