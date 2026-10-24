"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { FormError, SelectField, TextField } from "@/components/form";
import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import type { BranchRow, Page, RolesResponse, UserCreatePayload, UserDetailRow } from "@/lib/types";

const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "senior_associate", label: "Senior Associate" },
  { value: "ca_senior", label: "CA Senior" },
  { value: "article_assistant", label: "Article Assistant" },
  { value: "accounts_staff", label: "Accounts Staff" },
  { value: "accountant", label: "Accountant" },
  { value: "partner", label: "Partner" },
  { value: "branch_partner", label: "Branch Partner" },
  { value: "firm_owner", label: "Firm Owner" },
];

const DEPARTMENTS = [
  "Taxation",
  "Audit",
  "Accounts",
  "Compliance",
  "Management",
  "Advisory",
  "Payroll",
] as const;

export function CreateTeamMemberModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [department, setDepartment] = useState("");
  const [phone, setPhone] = useState("");
  const [branchId, setBranchId] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [weeklyCapacity, setWeeklyCapacity] = useState("");
  const [isPartner, setIsPartner] = useState(false);
  const [roleCode, setRoleCode] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const branches = useQuery({
    queryKey: ["users", "branches"],
    queryFn: () => api.get<BranchRow[]>("/branches"),
  });

  const roles = useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => api.get<RolesResponse>("/roles"),
    retry: (count) => count < 2,
  });

  // Build the role picker from the live roles API instead of a hardcoded list.
  // Falls back to ROLE_OPTIONS if the query hasn't resolved yet or has errored.
  const roleOptions: Array<{ value: string; label: string }> = roles.data
    ? roles.data.roles.map((r) => ({ value: r.code, label: r.name }))
    : ROLE_OPTIONS;

  const create = useMutation({
    mutationFn: (payload: UserCreatePayload) => api.post<UserDetailRow>("/users", payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setEmail("");
      setFullName("");
      setEmployeeCode("");
      setDesignation("");
      setDepartment("");
      setPhone("");
      setBranchId("");
      setDateOfJoining("");
      setWeeklyCapacity("");
      setIsPartner(false);
      setRoleCode("");
      setTemporaryPassword("");
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload: UserCreatePayload = {
      email: email.trim().toLowerCase(),
      full_name: fullName.trim(),
    };
    if (employeeCode.trim()) payload.employee_code = employeeCode.trim();
    if (designation.trim()) payload.designation = designation.trim();
    if (department) payload.department = department;
    if (phone.trim()) payload.phone = phone.trim();
    if (branchId) payload.branch_id = branchId;
    if (dateOfJoining) payload.date_of_joining = dateOfJoining;
    if (weeklyCapacity.trim()) payload.weekly_capacity_hours = Number(weeklyCapacity);
    if (isPartner) payload.is_partner = true;
    if (roleCode) payload.role_code = roleCode as UserCreatePayload["role_code"];
    if (temporaryPassword.trim()) payload.password = temporaryPassword;
    create.mutate(payload);
  }

  const branchOptions: Array<{ value: string; label: string }> = (
    branches.data ?? []
  ).map((row) => ({ value: row.id, label: row.name }));

  const canSubmit = Boolean(email.trim()) && Boolean(fullName.trim());

  return (
    <Modal open={open} onClose={onClose} title="Add Team Member" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {create.isError && <FormError error={create.error} />}

        <section className="team-section team-section-accent-basics">
          <div className="team-section-header">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <Icon name="user" className="h-4 w-4" />
            </div>
            <div>
              <h3 className="team-section-title">Basics</h3>
              <p className="team-section-subtitle">Their identity and role in the firm.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                label="Email"
                value={email}
                onChange={setEmail}
                required
                type="email"
                placeholder="jane.rohira@firm.example"
                hint="An invitation link will be sent to this address."
              />
            </div>
            <TextField
              label="Full name"
              value={fullName}
              onChange={setFullName}
              required
              placeholder="Jane Rohira"
              maxLength={200}
            />
            <TextField
              label="Employee code"
              value={employeeCode}
              onChange={setEmployeeCode}
              placeholder="STF-007"
              maxLength={30}
            />
            <TextField
              label="Designation"
              value={designation}
              onChange={setDesignation}
              placeholder="Senior Associate"
              maxLength={120}
            />
            <SelectField
              label="Department"
              value={department}
              onChange={setDepartment}
              placeholder="Not set"
              options={DEPARTMENTS.map((value) => ({ value, label: value }))}
            />
            <TextField
              label="Phone"
              value={phone}
              onChange={setPhone}
              type="tel"
              placeholder="+91 98765 43210"
              maxLength={20}
            />
            <SelectField
              label="Branch"
              value={branchId}
              onChange={setBranchId}
              placeholder="Head Office (default)"
              disabled={branches.isPending}
              options={branchOptions}
            />
            <TextField
              label="Date of joining"
              value={dateOfJoining}
              onChange={setDateOfJoining}
              type="date"
            />
            <TextField
              label="Weekly capacity (hours)"
              value={weeklyCapacity}
              onChange={setWeeklyCapacity}
              type="number"
              placeholder="40"
              hint="Used for workload balancing"
            />
            <div className="flex items-end">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                  checked={isPartner}
                  onChange={(event) => setIsPartner(event.target.checked)}
                />
                <span className="text-sm text-slate-700">Is partner</span>
              </label>
            </div>
            <SelectField
              label="Role"
              value={roleCode}
              onChange={setRoleCode}
              placeholder="No role assigned"
              options={roleOptions}
              hint="Roles grant bundles of permissions. The staff member can still be added without one."
            />
            <TextField
              label="Temporary password (optional)"
              value={temporaryPassword}
              onChange={setTemporaryPassword}
              type="password"
              placeholder="Auto-generated if blank"
              hint={
                "Sets the password immediately so the member is active and can sign in at once. If left blank, the member is created in \"invited\" status — but invitation delivery (email with a set-password link) is not yet built, so they cannot sign in until an admin sets a password."
              }
            />
          </div>
        </section>

        {!canSubmit && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-inset ring-amber-200">
            An email and full name are required before this person can be invited.
          </p>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <p className="text-[11px] text-slate-500">
            {temporaryPassword.trim()
              ? "The member is created active and can sign in immediately with the password above."
              : "The member is created in 'invited' status. Invitation delivery is not yet built — set a temporary password above so they can sign in."}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending ? "Adding…" : "Add Member"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
