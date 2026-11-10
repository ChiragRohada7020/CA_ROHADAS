"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Chip, FormError, PanelRow, SelectField, TextField } from "@/components/form";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui";
import { DescriptionEditor } from "@/components/TaskDescription";
import { ApiError, api } from "@/lib/api";
import { cn, formatBytes, humanise } from "@/lib/format";
import type {
  ClientListItem,
  DocumentDetail,
  FinancialYearRow,
  Frequency,
  Page,
  Priority,
  ServiceRow,
  TaskCreatePayload,
  TaskRead,
  UserListItem,
} from "@/lib/types";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
const MAX_TAG_LENGTH = 40;
const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
];

/** Matches `MAX_INLINE_UPLOAD_BYTES` in the backend. */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

type ShortcutModifiers = { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };

type Shortcut = { modifiers: ShortcutModifiers; key: string; target: string };

const defaultShortcuts: Record<string, Shortcut> = {
  "1": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "1", target: "save" },
  "2": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "2", target: "cancel" },
  "3": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "3", target: "title" },
  "4": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "4", target: "client" },
  "5": { modifiers: { ctrl: true, alt: false, shift: true, meta: false }, key: "5", target: "priority" },
};

/**
 * Raising a task — same shape as the task screen that follows it.
 *
 * Left column is what the task *is*: description, attachments, checklist steps.
 * Right column is what it is *set to*: client, assignee, deadlines, priority.
 * Creating and editing are the same act at different times, so they share one UI.
 *
 * Steps/checklist are created as real child steps after the task exists — they carry
 * their own status (pending / in_progress / completed) so the parent's progress bar
 * stays honest. Attachments are uploaded once the task id is returned.
 */
export default function NewTaskPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================
  const titleRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLSelectElement>(null);
  const priorityRef = useRef<HTMLSelectElement>(null);
  const shortcutsRef = useRef<Record<string, Shortcut>>(defaultShortcuts);

  const [localShortcuts, setLocalShortcuts] = useState<Record<string, Shortcut>>(() => {
    try {
      const raw = localStorage.getItem("task-new-shortcuts");
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...defaultShortcuts, ...parsed };
      }
    } catch {}
    return defaultShortcuts;
  });
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

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

  function handleShortcut(target: string) {
    switch (target) {
      case "save":
        (document.getElementById("new-task-form") as HTMLFormElement)?.requestSubmit();
        break;
      case "cancel":
        router.push("/tasks");
        break;
      case "title":
        titleRef.current?.focus();
        break;
      case "client":
        clientRef.current?.focus();
        break;
      case "priority":
        priorityRef.current?.focus();
        break;
    }
  }

  // Single keyboard listener added ONCE on mount
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();

      // Ignore modifier-only keys
      if (["control", "alt", "shift", "meta"].includes(key)) return;

      Object.values(shortcutsRef.current).forEach((s) => {
        if (matchesShortcut(event, s)) {
          event.preventDefault();
          event.stopPropagation();
          handleShortcut(s.target);
        }
      });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Sync ref with local state whenever it changes
  useEffect(() => {
    shortcutsRef.current = localShortcuts;
  }, [localShortcuts]);

  // Persist shortcuts to localStorage so they survive refreshes
  useEffect(() => {
    try {
      localStorage.setItem("task-new-shortcuts", JSON.stringify(localShortcuts));
    } catch {}
  }, [localShortcuts]);

  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [financialYearId, setFinancialYearId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [internalDueDate, setInternalDueDate] = useState("");
  const [statutoryDueDate, setStatutoryDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<Frequency>("monthly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
const [preparerId, setPreparerId] = useState("");
const [reviewerId, setReviewerId] = useState("");
  const [steps, setSteps] = useState<{ name: string }[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ["clients", "for-task"],
    queryFn: () => api.get<Page<ClientListItem>>("/clients?limit=300"),
  });

  const staff = useQuery({
    queryKey: ["users", "for-select"],
    queryFn: () => api.get<Page<UserListItem>>("/users?limit=200"),
  });

  const services = useQuery({
    queryKey: ["services", "for-select"],
    queryFn: () => api.get<Page<ServiceRow>>("/services?limit=200"),
  });

  const years = useQuery({
    queryKey: ["financial-years"],
    queryFn: () => api.get<FinancialYearRow[]>("/financial-years"),
  });

  const create = useMutation({
    mutationFn: async (payload: TaskCreatePayload) => {
      const task = await api.post<TaskRead>("/tasks", payload);

      // Steps (checklist) become real child steps after the task exists.
      for (const step of steps) {
        await api.post(`/tasks/${task.id}/steps`, { name: step.name });
      }

      const failures: string[] = [];
      for (const file of attachments) {
        const form = new FormData();
        form.append("file", file);
        form.append("task_id", task.id);
        form.append("client_id", payload.client_id);
        if (payload.period_key) form.append("period_key", payload.period_key);
        try {
          await api.upload<DocumentDetail>("/documents/upload", form);
        } catch {
          failures.push(file.name);
        }
      }

      return { task, failures };
    },
    onSuccess: ({ task, failures }) => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["my-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["documents"] });

      if (failures.length > 0) {
        setUploadWarning(
          `${task.task_code} was created, but ${failures.length} file(s) could not be ` +
            `attached: ${failures.join(", ")}. Add them from the task screen.`,
        );
        return;
      }
      router.replace(`/tasks/${task.id}`);
    },
  });

  function addTag() {
    const tag = tagInput.trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) return;
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTags((current) => [...current, tag]);
    }
    setTagInput("");
  }

  function addStep() {
    const name = stepInput.trim();
    if (!name) return;
    setSteps((current) => [...current, { name }]);
    setStepInput("");
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const oversized = files.filter((file) => file.size > INLINE_LIMIT_BYTES);
    if (oversized.length > 0) {
      setUploadWarning(
        `${oversized.map((file) => file.name).join(", ")} exceed the ` +
          `${formatBytes(INLINE_LIMIT_BYTES)} limit and were not added.`,
      );
    }
    setAttachments((current) => [
      ...current,
      ...files.filter((file) => file.size <= INLINE_LIMIT_BYTES),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload: TaskCreatePayload = {
      client_id: clientId,
      title: title.trim(),
      priority,
    };
    if (description.trim()) payload.description = description.trim();
    if (tags.length > 0) payload.tags = tags;
    if (serviceId) payload.service_id = serviceId;
    if (financialYearId) payload.financial_year_id = financialYearId;
    if (periodKey.trim()) payload.period_key = periodKey.trim();
    if (internalDueDate) payload.internal_due_date = internalDueDate;
    if (statutoryDueDate) payload.statutory_due_date = statutoryDueDate;
    if (estimatedHours.trim()) payload.estimated_hours = Number(estimatedHours);
    if (isRecurring) {
      payload.is_recurring = true;
      payload.recurrence_frequency = recurrenceFrequency;
      if (recurrenceEndDate.trim()) payload.recurrence_end_date = recurrenceEndDate.trim();
    }
    if (preparerId) payload.preparer_id = preparerId;
    if (reviewerId) payload.reviewer_id = reviewerId;
    create.mutate(payload);
  }

  const clientOptions = clients.data?.items ?? [];
  const currentClient = clientOptions.find((row) => row.id === clientId);
  const staffOptions = staff.data?.items ?? [];
  const ready = clientId !== "" && title.trim().length >= 2;

  return (
    <>
      <form id="new-task-form" onSubmit={handleSubmit} className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
      <section className="relative isolate overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-r from-[#4c1d95] via-[#6d28d9] to-[#8b5cf6] px-5 py-5 text-white shadow-[0_12px_30px_-18px_rgba(76,29,149,0.65)] sm:px-6">
        <div className="pointer-events-none absolute -right-12 -top-20 size-56 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/15 shadow-inner">
              <Icon name="clipboard-list" className="h-6 w-6 text-white" />
            </span>
            <div className="min-w-0">
              <nav aria-label="Breadcrumb" className="mb-1 flex items-center gap-2 text-xs font-medium text-violet-100">
                <Link href="/tasks" className="transition hover:text-white">Tasks</Link>
                <span aria-hidden="true" className="text-violet-200/70">/</span>
                <span className="text-white">New task</span>
              </nav>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Create New Task</h1>
              <p className="mt-1 text-xs text-violet-100 sm:text-sm">Organise client work, assign ownership and set deadlines.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
            <span className="size-1.5 rounded-full bg-emerald-300" /> New task
          </span>
          <button
            type="button"
            onClick={() => setShowShortcuts(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition"
          >
            <Icon name="settings" className="h-3 w-3" />
            Shortcuts
          </button>
        </div>
      </section>


      <section className="rounded-2xl border border-violet-100 bg-white p-4 shadow-[0_8px_24px_-20px_rgba(76,29,149,0.35)] sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <Icon name="file-text" className="h-4 w-4" />
          </span>
          <label htmlFor="new-task-title" className="text-sm font-semibold text-slate-800">Task title <span className="text-rose-500">*</span></label>
          <span className="text-xs text-slate-400">Required</span>
        </div>
        <input
          id="new-task-title"
          ref={titleRef}
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-lg font-semibold tracking-tight text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-violet-500 focus:ring-0 sm:text-xl"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Prepare and file GSTR-1 for April"
          maxLength={300}
          autoFocus
        />
        <p className="mt-2 text-xs text-slate-500">
          {currentClient ? currentClient.legal_name : "Select a client in Task details"}
          {periodKey.trim() ? ` · ${periodKey.trim()}` : ""}
          {statutoryDueDate ? ` · statutory due ${statutoryDueDate}` : ""}
        </p>
      </section>

      {create.isError && <FormError error={create.error} />}
      {uploadWarning && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
        >
          {uploadWarning}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── What the task is ── */}
        <div className="min-w-0 space-y-4">
          {/* Description */}
          <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_-20px_rgba(76,29,149,0.35)]">
            <div className="border-b border-violet-100/80 bg-[#faf9ff] px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900">Description</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Markdown: **bold**, *italic*, `code`, [link](url), - bullets
                </p>
              </div>
            </div>
            <div className="p-4">
              <DescriptionEditor
                value={description}
                onChange={setDescription}
                placeholder="What the work involves, and anything the preparer needs to know."
                rows={8}
              />
            </div>
          </div>

          {/* Checklist / Steps */}
          <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_-20px_rgba(76,29,149,0.35)]">
            <div className="border-b border-violet-100/80 bg-[#faf9ff] px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900">Checklist</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Progress is computed from these steps
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="input min-w-0 flex-1 rounded-xl border-slate-200 text-sm focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={stepInput}
                  placeholder="New step name…"
                  maxLength={200}
                  onChange={(e) => setStepInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && stepInput.trim()) {
                      addStep();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-primary inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                  disabled={!stepInput.trim()}
                  onClick={addStep}
                >
                  Add step
                </button>
              </div>
            </div>
            <div className="p-4">
              {steps.length === 0 ? (
                <p className="text-sm italic text-slate-400">
                  No steps yet. Add checklist items below.
                </p>
              ) : (
                <div className="space-y-1">
                  {steps.map((step, index) => (
                    <div
                      key={step.name}
                      className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 rounded-xl border border-violet-100 bg-[#fcfbff]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="tabular text-xs text-slate-400">{index + 1}.</span>
                        <span className="min-w-0 truncate text-sm text-slate-800">
                          {step.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="p-1 cursor-pointer text-slate-400 hover:text-rose-600"
                        onClick={() =>
                          setSteps((current) => current.filter((_, i) => i !== index))
                        }
                        aria-label="Remove step"
                      >
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_-20px_rgba(76,29,149,0.35)]">
            <header className="border-b border-violet-100/80 bg-[#faf9ff] px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-900">Attachments</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Held until the task is created, then filed against it
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                Add file
              </button>
            </header>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFiles}
              aria-label="Files to attach"
            />

            {attachments.length === 0 ? (
              <p className="mx-5 my-5 flex flex-col items-center rounded-xl border border-dashed border-violet-200 bg-[#faf9ff] px-4 py-9 text-center text-sm text-slate-500">
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
                  <Icon name="upload" className="h-6 w-6" />
                </span>
                <span className="font-semibold text-slate-700">Drop files here or add an attachment</span>
                <span className="mt-1 text-xs text-slate-400">Files up to {formatBytes(INLINE_LIMIT_BYTES)} each</span>
              </p>
            ) : (
              <ul className="divide-y divide-violet-100">
                {attachments.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded bg-violet-50 text-slate-500"
                    >
                      <Icon name="file-text" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      className="btn-icon shrink-0"
                      aria-label={`Remove ${file.name}`}
                      onClick={() =>
                        setAttachments((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── What it is set to ── */}
        <div className="space-y-4 xl:sticky xl:top-5">
          <div className="card divide-y divide-slate-100 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-[0_8px_24px_-20px_rgba(76,29,149,0.35)]">
            <div className="border-b border-violet-100/80 bg-[#faf9ff] px-4 py-3.5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <Icon name="settings" className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Task settings</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Client, ownership and deadlines</p>
                </div>
              </div>
            </div>
            <div className="p-4">
              <PanelRow label="Client" hint="Required">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  ref={clientRef}
                  value={clientId}
                  aria-label="Client"
                  required
                  disabled={clients.isPending}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">
                    {clients.isPending ? "Loading clients…" : "Choose a client"}
                  </option>
                  {clientOptions.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.legal_name}
                    </option>
                  ))}
                </select>
              </PanelRow>

              {currentClient && (
                <>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pb-1">
                    {currentClient.pan && <Chip>PAN {currentClient.pan}</Chip>}
                    {currentClient.gstin && <Chip>GSTIN {currentClient.gstin}</Chip>}
                  </div>
                  <div className="pb-1 text-right">
                    <Link
                      href={`/clients/${currentClient.id}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                    >
                      <Icon name="user" className="h-3.5 w-3.5" />
                      View client
                      <Icon name="arrow-right" className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </>
              )}

              <PanelRow label="Linked service">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={serviceId}
                  aria-label="Linked service"
                  disabled={services.isPending}
                  onChange={(event) => setServiceId(event.target.value)}
                >
                  <option value="">No service linked</option>
                  {(services.data?.items ?? []).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </PanelRow>

              <PanelRow label="Financial year">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={financialYearId}
                  aria-label="Financial year"
                  disabled={years.isPending}
                  onChange={(event) => setFinancialYearId(event.target.value)}
                >
                  <option value="">Not year-specific</option>
                  {(years.data ?? []).map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </PanelRow>

              <PanelRow label="Period">
                <input
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={periodKey}
                  aria-label="Period"
                  placeholder="July 2026"
                  maxLength={20}
                  onChange={(event) => setPeriodKey(event.target.value)}
                />
              </PanelRow>

              <PanelRow label="Recurrence" hint="Repeat this task on a schedule">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="rounded border-slate-200 bg-white text-violet-600 focus:ring-violet-500 focus:ring-2"
                    checked={isRecurring}
                    onChange={(event) => setIsRecurring(event.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-700">Recurring task</span>
                </div>
                {isRecurring && (
                  <div className="mt-4 rounded-xl border border-[#ECEAF2] bg-[#F8F7FB] p-3 sm:p-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <SelectField
                        label="Frequency"
                        value={recurrenceFrequency}
                        onChange={(value) => setRecurrenceFrequency(value as Frequency)}
                        options={FREQUENCIES.map((option) => ({ value: option.value, label: option.label }))}
                      />
                      <TextField
                        label="End date"
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(value) => setRecurrenceEndDate(value)}
                        placeholder="Ongoing"
                      />
                    </div>
                    <p className="mt-3 text-[10px] text-[#858BA2]">
                      Work will regenerate on the chosen cadence until the end date.
                    </p>
                  </div>
                )}
              </PanelRow>
            </div>

            <div className="p-4">
              <PanelRow label="Assignee">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={preparerId}
                  aria-label="Assignee"
                  disabled={staff.isPending}
                  onChange={(event) => setPreparerId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {staffOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.designation
                        ? `${user.full_name} — ${user.designation}`
                        : user.full_name}
                    </option>
                  ))}
                </select>
              </PanelRow>

              <PanelRow label="Reviewer">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={reviewerId}
                  aria-label="Reviewer"
                  disabled={staff.isPending}
                  onChange={(event) => setReviewerId(event.target.value)}
                >
                  <option value="">Select reviewer</option>
                  {staffOptions.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.designation
                        ? `${user.full_name} — ${user.designation}`
                        : user.full_name}
                    </option>
                  ))}
                </select>
              </PanelRow>

              <PanelRow label="Priority">
                <select
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  ref={priorityRef}
                  value={priority}
                  aria-label="Priority"
                  onChange={(event) => setPriority(event.target.value as Priority)}
                >
                  {PRIORITIES.map((value) => (
                    <option key={value} value={value}>
                      {humanise(value)}
                    </option>
                  ))}
                </select>
              </PanelRow>

              <PanelRow label="Due date" hint="The firm's own buffer">
                <input
                  type="date"
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={internalDueDate}
                  aria-label="Internal due date"
                  onChange={(event) => setInternalDueDate(event.target.value)}
                />
              </PanelRow>

              <PanelRow label="Statutory due" hint="Blank means unconfirmed">
                <input
                  type="date"
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={statutoryDueDate}
                  aria-label="Statutory due date"
                  onChange={(event) => setStatutoryDueDate(event.target.value)}
                />
              </PanelRow>

              <PanelRow label="Estimated time">
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={0.5}
                  className="input w-full rounded-xl border-slate-200 bg-white py-2.5 text-sm shadow-sm transition duration-200 hover:border-violet-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={estimatedHours}
                  aria-label="Estimated hours"
                  placeholder="2.5"
                  onChange={(event) => setEstimatedHours(event.target.value)}
                />
                <span className="shrink-0 text-xs text-slate-500">h</span>
              </PanelRow>

              <div className="flex items-start justify-between gap-3 py-1.5">
                <span className="w-28 shrink-0 pt-1 text-xs text-slate-500">Tags</span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-1 text-[11px] text-slate-700"
                    >
                      {tag}
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-600"
                        aria-label={`Remove tag ${tag}`}
                        onClick={() =>
                          setTags((current) => current.filter((existing) => existing !== tag))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    className="w-24 border-0 border-b border-dashed border-violet-200 bg-transparent px-1 py-1 text-[11px] outline-none focus:border-violet-500"
                    value={tagInput}
                    placeholder="+ tag"
                    aria-label="Add a tag"
                    maxLength={MAX_TAG_LENGTH}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                  />
                </div>
              </div>
            </div>

            <div className="bg-[#faf9ff] p-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-700 via-violet-600 to-purple-600 px-4 py-3 font-semibold text-white shadow-[0_10px_22px_-10px_rgba(109,40,217,0.65)] transition duration-200 hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-50"
                  disabled={!ready || create.isPending}
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {create.isPending ? "Creating…" : "Create task"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost rounded-xl border border-violet-200 bg-white px-5 py-3 text-violet-700 hover:bg-violet-50"
                  disabled={create.isPending}
                  onClick={() => router.push("/tasks")}
                >
                  Cancel
                </button>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                {ready
                  ? "It starts at Not started; the workflow moves it on from there."
                  : "A title and a client are needed before this can be created."}
              </p>
            </div>
          </div>
        </div>
      </div>
      </form>

      <Modal open={showShortcuts} onClose={() => setShowShortcuts(false)} title="Keyboard shortcuts" size="md">
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
              { key: "1", label: "Create task", target: "save" },
              { key: "2", label: "Cancel", target: "cancel" },
              { key: "3", label: "Focus title", target: "title" },
              { key: "4", label: "Focus client", target: "client" },
              { key: "5", label: "Focus priority", target: "priority" },
            ].map((item) => {
              const s = shortcutsRef.current[item.key];
              const isEditing = editingShortcutId === item.key;
              return (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#252B47]">{item.label}</span>
                  <div className="flex items-center gap-1">
                    {isEditing ? (
                      <input
                        type="text"
                        autoFocus
                        maxLength={1}
                        className="w-8 h-6 text-center text-xs font-mono border border-[#7042D8] bg-[#F0EAFE] px-1 outline-none focus:ring-1 focus:ring-[#7042D8]/30"
                        onKeyDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const key = e.key.toLowerCase();
                          if (["control", "alt", "shift", "meta"].includes(key)) return;
                          const next = {
                            ...shortcutsRef.current,
                            [item.key]: {
                              modifiers: {
                                ctrl: e.ctrlKey,
                                alt: e.altKey,
                                shift: e.shiftKey,
                                meta: e.metaKey,
                              },
                              key,
                              target: item.target,
                            },
                          };
                          shortcutsRef.current = next;
                          setLocalShortcuts(next);
                          setEditingShortcutId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingShortcutId(item.key)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded-lg border transition-colors ${isEditing ? "bg-[#F0EAFE] border-[#7042D8] text-[#7042D8]" : "bg-[#FAFAFE] border-[#E3E2F2] text-[#6B7280] hover:border-[#C0ADE8]"}`}
                      >
                        {formatShortcut(s)}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const next = {
                          ...shortcutsRef.current,
                          [item.key]: {
                            modifiers: { ctrl: true, alt: false, shift: true, meta: false },
                            key: item.key,
                            target: item.target,
                          },
                        };
                        shortcutsRef.current = next;
                        setLocalShortcuts(next);
                        setEditingShortcutId(null);
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
    </>
  );
}
