"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Chip, FormError, PanelRow } from "@/components/form";
import { Icon } from "@/components/Icon";
import { DescriptionEditor } from "@/components/TaskDescription";
import { ApiError, api } from "@/lib/api";
import { cn, formatBytes, humanise } from "@/lib/format";
import type {
  ClientListItem,
  DocumentDetail,
  FinancialYearRow,
  Page,
  Priority,
  ServiceRow,
  TaskCreatePayload,
  TaskRead,
  UserListItem,
} from "@/lib/types";

const PRIORITIES: Priority[] = ["low", "normal", "high", "urgent"];
const MAX_TAG_LENGTH = 40;

/** Matches `MAX_INLINE_UPLOAD_BYTES` in the backend. */
const INLINE_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Raising a task.
 *
 * Deliberately the same shape as the task screen that follows it — breadcrumb, title,
 * what the work is on the left, what it is set to on the right. Creating a task and
 * editing one are the same act at different times, so they should not be two different
 * mental models. A wizard that asks for the same fields in a different order, then hands
 * over to a screen that looks nothing like it, makes people re-learn the form.
 *
 * Two things here are *not* form fields, and are worth saying out loud because both were
 * previously collected and then silently discarded:

 * - **Attachments are uploaded after the task exists.** A document row needs a
 *   `task_id`, and there is no task until the create call returns. The files are held in
 *   memory and posted once it does.
 * - **Subtasks become real child tasks**, not a text blob. They are created with
 *   `parent_task_id` set, which is what makes the parent's checklist and the child's
 *   status agree later.
 *
 * Both are best-effort *after* the task is created. If an upload fails the task still
 * exists and the screen says so, because losing a correctly-created task to a failed
 * optional extra would be the worse outcome.
 */
export default function NewTaskPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [preparerId, setPreparerId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState("");
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

      // Children first, so a parent never briefly exists with no checklist under it.
      for (const name of subtasks) {
        await api.post<TaskRead>("/tasks", {
          client_id: payload.client_id,
          title: name,
          parent_task_id: task.id,
          service_id: payload.service_id,
          financial_year_id: payload.financial_year_id,
          period_key: payload.period_key,
          priority: payload.priority,
        });
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
        // The task is created; only the optional extras failed. Navigating straight to
        // it would hide that, so the warning is shown here before the user leaves.
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
    // Case-insensitive de-duplication, matching how the API normalises tags.
    if (!tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setTags((current) => [...current, tag]);
    }
    setTagInput("");
  }

  function addSubtask() {
    const name = subtaskInput.trim();
    if (!name) return;
    setSubtasks((current) => [...current, name]);
    setSubtaskInput("");
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
    if (preparerId) payload.preparer_id = preparerId;
    if (reviewerId) payload.reviewer_id = reviewerId;
    create.mutate(payload);
  }

  const clientOptions = clients.data?.items ?? [];
  const currentClient = clientOptions.find((row) => row.id === clientId);
  const staffOptions = staff.data?.items ?? [];
  const ready = clientId !== "" && title.trim().length >= 2;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500"
      >
        <Link href="/tasks" className="hover:underline">
          Tasks
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-slate-700">New task</span>
      </nav>

      <header>
        <label className="block">
          <span className="sr-only">Task title</span>
          <input
            className="w-full border-0 bg-transparent p-0 text-2xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reply to GST notice dated 12 April"
            maxLength={300}
            autoFocus
          />
        </label>
        <p className="mt-1 text-sm text-slate-500">
          {currentClient ? currentClient.legal_name : "No client chosen yet"}
          {periodKey.trim() ? ` · ${periodKey.trim()}` : ""}
          {statutoryDueDate ? ` · statutory due ${statutoryDueDate}` : ""}
        </p>
      </header>

      {create.isError && <FormError error={create.error} />}
      {uploadWarning && (
        <p
          role="status"
          className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          {uploadWarning}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── What the work is ── */}
        <div className="space-y-5">
          <div className="card">
            <header className="card-header">
              <div className="min-w-0">
                <h2 className="card-title">Attachments</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Held until the task is created, then filed against it
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost inline-flex items-center gap-1 text-xs"
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
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Nothing attached. Files up to {formatBytes(INLINE_LIMIT_BYTES)} can be added.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {attachments.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500"
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

          <div className="card">
            <header className="card-header">
              <div className="min-w-0">
                <h2 className="card-title">Description</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Markdown: **bold**, *italic*, __underline__, `code`, [link](url), - bullets
                </p>
              </div>
            </header>
            <div className="p-4">
              <DescriptionEditor
                value={description}
                onChange={setDescription}
                placeholder="What the work involves, and anything the preparer needs to know."
                rows={8}
              />
            </div>
          </div>

          <div className="card">
            <header className="card-header">
              <div className="min-w-0">
                <h2 className="card-title">Subtasks</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Created as child tasks, so each one carries its own status
                </p>
              </div>
            </header>
            <div className="p-4">
              {subtasks.length > 0 && (
                <ul className="mb-3 space-y-1.5">
                  {subtasks.map((name, index) => (
                    <li
                      key={`${name}-${index}`}
                      className="flex items-center gap-2 rounded-md bg-[#f7f6f3] px-2 py-1.5"
                    >
                      <span className="tabular text-xs text-slate-400">{index + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{name}</span>
                      <button
                        type="button"
                        className="btn-icon shrink-0"
                        aria-label={`Remove subtask ${name}`}
                        onClick={() =>
                          setSubtasks((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Icon name="x" className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  value={subtaskInput}
                  placeholder="Collect the sales register"
                  maxLength={300}
                  aria-label="New subtask"
                  onChange={(event) => setSubtaskInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      // Enter adds a subtask rather than submitting the form — otherwise
                      // typing the first subtask raises a half-built task.
                      event.preventDefault();
                      addSubtask();
                    }
                  }}
                />
                <button type="button" className="btn btn-ghost px-5 py-2.5" onClick={addSubtask}>
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── What it is set to ── */}
        <div className="space-y-5 xl:sticky xl:top-4">
          <div className="card divide-y divide-slate-100">
            <div className="p-4">
              <PanelRow label="Client" hint="Required">
                <select
                  className="input w-full py-1.5 text-xs"
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
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
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
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
                  value={periodKey}
                  aria-label="Period"
                  placeholder="July 2026"
                  maxLength={20}
                  onChange={(event) => setPeriodKey(event.target.value)}
                />
              </PanelRow>
            </div>

            <div className="p-4">
              <PanelRow label="Assignee">
                <select
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
                  value={internalDueDate}
                  aria-label="Internal due date"
                  onChange={(event) => setInternalDueDate(event.target.value)}
                />
              </PanelRow>

              <PanelRow label="Statutory due" hint="Blank means unconfirmed">
                <input
                  type="date"
                  className="input w-full py-1.5 text-xs"
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
                  className="input w-full py-1.5 text-xs"
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
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700"
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
                    className="w-24 border-0 border-b border-dashed border-slate-300 bg-transparent px-1 py-1 text-[11px] outline-none focus:border-slate-500"
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

            <div className="p-4">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5"
                  disabled={!ready || create.isPending}
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {create.isPending ? "Creating…" : "Create task"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-5 py-2.5"
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
  );
}
