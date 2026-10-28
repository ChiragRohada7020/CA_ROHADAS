"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { RoleRow, UserDetailRow } from "@/lib/types";

/**
 * A slide-over edit form for a team member.
 *
 * Pre-fetches the member's detail (GET /users/{id}), lets the owner change
 * profile fields, role, and status, then PATCHes back. On success it
 * invalidates the user-list query so the table refreshes.
 */
export function EditTeamMemberModal({
  memberId,
  onClose,
}: {
  memberId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["user", memberId],
    queryFn: () => api.get<UserDetailRow>(`/users/${memberId}`),
    staleTime: 30_000,
  });

  const roles = useQuery({
    queryKey: ["roles", "list"],
    queryFn: () => api.get<{ roles: RoleRow[]; assignable: string[] }>("/roles"),
    staleTime: 60_000,
  });

  const roleOptions = (roles.data?.roles ?? []).filter((r) =>
    roles.data?.assignable.includes(r.code),
  );

  const [form, setForm] = useState<Partial<Record<string, unknown>>>({});
  const [error, setError] = useState<string | null>(null);

  const row = detail.data;

  const update = useMutation({
    mutationFn: (changes: Record<string, unknown>) =>
      api.patch<UserDetailRow>(`/users/${memberId}`, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["user", memberId] });
      onClose();
    },
    onError: (err: unknown) => {
      setError(
        err instanceof ApiError ? err.message : "Could not update the member.",
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!row) return;
    const fd = e.currentTarget as HTMLFormElement;
    const data = new FormData(fd);
    const changes: Record<string, unknown> = {
      full_name: data.get("full_name")?.toString().trim() || undefined,
      email: data.get("email")?.toString().trim() || undefined,
      designation: data.get("designation")?.toString().trim() || undefined,
      department: data.get("department")?.toString().trim() || undefined,
      employee_code: data.get("employee_code")?.toString().trim() || undefined,
      phone: data.get("phone")?.toString().trim() || undefined,
      status: data.get("status")?.toString() || undefined,
      is_partner: data.get("is_partner") === "on",
      role_code: data.get("role_code")?.toString() || undefined,
    };
    const password = data.get("password")?.toString().trim();
    if (password) changes.password = password;
    update.mutate(changes);
  };

  if (detail.isPending) {
    return (
      <Modal
        title="Edit Member"
        open
        onClose={onClose}
      >
        <div className="p-6 text-slate-500">Loading…</div>
      </Modal>
    );
  }

  if (detail.isError || !row) {
    return (
      <Modal title="Edit Member" open onClose={onClose}>
        <div className="p-6 text-rose-700">
          {detail.error instanceof ApiError ? detail.error.message : "Could not load the member."}
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Edit Member" open onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">Full Name</label>
            <input
              name="full_name"
              defaultValue={row.full_name}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Email</label>
            <input
              name="email"
              type="email"
              defaultValue={row.email}
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Role</label>
            <select
              name="role_code"
              defaultValue={row.roles?.[0] ?? ""}
              className="input"
              disabled={roles.isPending}
            >
              <option value="">No role assigned</option>
              {roleOptions.map((r) => (
                <option key={r.id} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Status</label>
            <select name="status" defaultValue={row.status} className="input">
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="suspended">Suspended</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Designation</label>
            <input name="designation" defaultValue={row.designation ?? ""} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Department</label>
            <input name="department" defaultValue={row.department ?? ""} className="input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Employee Code</label>
            <input name="employee_code" defaultValue={row.employee_code ?? ""} className="input" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="is_partner"
                defaultChecked={row.is_partner}
              />
              <span>Partner</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">
            New Password (optional)
          </label>
          <input
            name="password"
            type="password"
            placeholder="Leave blank to keep current password"
            className="input"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={update.isPending}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={update.isPending}
          >
            {update.isPending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
