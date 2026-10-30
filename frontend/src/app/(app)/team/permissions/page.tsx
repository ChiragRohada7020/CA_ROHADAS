"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import type {
  Page,
  PermissionDef,
  RolesResponse,
  UserListItem,
  UserPermissionInfo,
} from "@/lib/types";

interface OverrideRow {
  permission_code: string;
  action: "grant" | "revoke";
  scope?: "code" | "module" | "section" | "role";
  module?: string | null;
  expires_at?: string | null;
}

/** Group permission definitions by their parent module. */
function groupByModule(perms: PermissionDef[]): Record<string, PermissionDef[]> {
  const out: Record<string, PermissionDef[]> = {};
  for (const p of perms) {
    (out[p.module] ??= []).push(p);
  }
  return out;
}

/**
 * A "section" is a high-level dashboard area. We map permission modules to
 * these sections so the UI shows a clean toggle matrix.
 */
const SECTION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Clients",
  tasks: "Tasks",
  compliance: "Compliance",
  documents: "Documents",
  billing: "Billing",
  receivables: "Payments",
  reports: "Reports",
  settings: "Settings",
  team: "Team",
};

const MODULE_ORDER = [
  "dashboard",
  "clients",
  "tasks",
  "compliance",
  "documents",
  "billing",
  "receivables",
  "reports",
  "settings",
  "team",
];

function sectionLabel(module: string): string {
  return SECTION_LABELS[module] ?? module.charAt(0).toUpperCase() + module.slice(1);
}

function moduleIcon(module: string) {
  const icons: Record<string, React.ComponentProps<typeof Icon>["name"]> = {
    dashboard: "dashboard",
    clients: "users-round",
    tasks: "tasks",
    compliance: "shield-check",
    documents: "file-text",
    billing: "receipt",
    receivables: "wallet",
    reports: "chart-no-axes",
    settings: "settings",
    team: "team",
  };
  return icons[module] ?? "settings";
}

/**
 * Determine the primary permission code for a section. E.g. "invoice" module →
 * "invoice.read". If the section has only one permission, use that.
 */
function primaryPermissionForSection(perms: PermissionDef[]): string | null {
  const readPerms = perms.filter((p) => p.action.includes("read"));
  if (readPerms.length > 0) {
    // Prefer the base read permission (no extra suffix)
    const baseRead = readPerms.find((p) => !p.code.includes("."));
    return baseRead?.code ?? readPerms[0].code;
  }
  return perms[0]?.code ?? null;
}

export default function TeamPermissionsPage() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const isOwner =
    session.data?.roles?.includes("firm_owner") ?? false;

  // ── Data fetching ─────────────────────────────────────────────────────
  const catalogue = useQuery({
    queryKey: ["permissions", "catalogue"],
    queryFn: () => api.get<RolesResponse>("/roles"),
    select: (data) => data.catalogue,
    staleTime: 5 * 60 * 1000,
  });

  const users = useQuery({
    queryKey: ["users", "summary"],
    queryFn: () =>
      api.get<Page<UserListItem>>("/users?limit=200&include_inactive=true"),
    select: (data) => data.items,
    staleTime: 3 * 60 * 1000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: ({
      userId,
      overrides,
    }: {
      userId: string;
      overrides: OverrideRow[];
    }) =>
      api.patch<{ ok: boolean }>(`/users/${userId}/permissions`, { overrides }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      overrideQuery.refetch();
    },
  });

  // Derived values (plain computations — safe before early returns)
  const perms = catalogue.data ?? [];
  const teamMembers = users.data ?? [];
  const modules = useMemo(() => groupByModule(perms), [perms]);

  const orderedModules = MODULE_ORDER.filter((m) => modules[m]);
  // Append any modules not in our explicit order
  Object.keys(modules).forEach((m) => {
    if (!orderedModules.includes(m)) orderedModules.push(m);
  });

  const selectedUser =
    teamMembers.find((u) => u.id === selectedUserId) ?? teamMembers[0] ?? null;

  // Override query + local state. These hooks MUST run before any early
  // return so the hook count stays stable across renders (Rules of Hooks).
  // The query is simply disabled while no user is selected.
  const overrideQuery = useQuery({
    queryKey: ["user-permissions", selectedUser?.id ?? "null"],
    queryFn: () =>
      selectedUser
        ? api.get<UserPermissionInfo>(`/users/${selectedUser.id}/permissions`)
        : null,
    enabled: !!selectedUser,
    staleTime: 2 * 60 * 1000,
  });

  // Sync overrides into local state when the query returns
  const [localOverrides, setLocalOverrides] = useState<OverrideRow[]>(
    overrideQuery.data?.overrides ?? [],
  );
  useEffect(() => {
    setLocalOverrides(overrideQuery.data?.overrides ?? []);
  }, [overrideQuery.data?.overrides]);
  const currentOverrides = localOverrides;

  // ── Early returns (all hooks are now called unconditionally above) ──
  if (!isOwner) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          You do not have permission to manage team permissions. Only the firm owner
          can configure per-user access.
        </div>
      </div>
    );
  }

  if (catalogue.isError || users.isError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load permissions data.
        </div>
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────
  /** Toggle a single permission-code override. */
  const handleGrant = (permissionCode: string, action: "grant" | "revoke") => {
    if (!selectedUser) return;
    const existing = currentOverrides.find(
      (o) => o.permission_code === permissionCode && !o.scope,
    );
    const newOverrides: OverrideRow[] = existing
      ? currentOverrides.filter(
          (o) => !(o.permission_code === permissionCode && !o.scope),
        )
      : [...currentOverrides];

    newOverrides.push({ permission_code: permissionCode, action });
    setLocalOverrides(newOverrides);
  };

  /** Grant or revoke **every** permission in a module via a single module-scope override. */
  const handleModuleOverride = (module: string, action: "grant" | "revoke") => {
    if (!selectedUser) return;
    // Remove existing per-code overrides and existing module-level overrides
    // for this module, then add a single module-scope override.
    const newOverrides: OverrideRow[] = currentOverrides.filter(
      (o) =>
        !o.permission_code.startsWith(`${module}.`) &&
        !(o.scope === "module" && o.module === module),
    );
    newOverrides.push({
      permission_code: module,
      action,
      scope: "module",
      module,
    });
    setLocalOverrides(newOverrides);
  };

  /** Check if a module-level override with the given action exists for this module. */
  function hasModuleOverride(module: string, action: "grant" | "revoke"): boolean {
    return currentOverrides.some(
      (o) => o.scope === "module" && o.module === module && o.action === action,
    );
  }

  const handleClearSection = (modulePrefix: string) => {
    const newOverrides = currentOverrides.filter(
      (o) =>
        !o.permission_code.startsWith(`${modulePrefix}.`) &&
        !(o.scope === "module" && o.module === modulePrefix),
    );
    setLocalOverrides(newOverrides);
  };

  const handleSave = () => {
    if (!selectedUser || !hasChanges()) return;
    saveMutation.mutate({ userId: selectedUser.id, overrides: currentOverrides });
  };

  const hasChanges = () => {
    if (!overrideQuery.data) return false;
    const original = overrideQuery.data.overrides;
    const current = currentOverrides;
    if (original.length !== current.length) return true;
    return original.some(
      (o, i) =>
        o.permission_code !== current[i]?.permission_code ||
        o.action !== current[i]?.action ||
        (o.scope ?? "code") !== (current[i]?.scope ?? "code") ||
        o.module !== current[i]?.module,
    );
  };

  if (!selectedUser) {
    return (
      <div className="p-6">
        <div className="text-sm text-slate-500">No team members found.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Team Permissions
          </h1>
          <p className="text-sm text-slate-500">
            Configure per-user permission overrides. Role-based permissions
            apply by default; use overrides to grant or revoke individual
            permissions per team member.
          </p>
        </div>
        {overrideQuery.isFetching && selectedUser && (
          <span className="text-xs text-slate-500">
            Loading permissions...
          </span>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar: team member selector */}
        <aside className="col-span-3">
          <div className="mb-3">
            <input
              type="search"
              placeholder="Find a member..."
              className="input py-1.5 w-full"
              onChange={(e) => {
                const term = e.target.value.toLowerCase();
                const match = teamMembers.find(
                  (u) =>
                    u.full_name.toLowerCase().includes(term) ||
                    u.email.toLowerCase().includes(term),
                );
                if (match) setSelectedUserId(match.id);
              }}
            />
          </div>
          <div className="space-y-1 overflow-y-auto max-h-[600px]">
            {teamMembers.map((user) => {
              const isSelected = selectedUserId === user.id;
              const isOnline =
                user.status === "active" && user.last_login_at;
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? "bg-sky-50 text-sky-900"
                      : "hover:bg-[#f7f6f3] text-slate-700"
                  }`}
                >
                  <div className="flex-1 truncate">
                    <span className="block text-sm font-medium">
                      {user.full_name}
                    </span>
                    <span className="text-xs text-slate-500 truncate block">
                      {user.email}
                    </span>
                    {user.roles && user.roles.length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {user.roles.join(", ")}
                      </span>
                    )}
                  </div>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOnline ? "bg-emerald-400" : "bg-slate-300"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main: permission matrix */}
        <main className="col-span-9">
          {selectedUser && (
            <>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-slate-900">
                  {selectedUser.full_name}
                </h2>
                <p className="text-sm text-slate-500">
                  {selectedUser.email} · Role:{" "}
                  {selectedUser.roles?.join(", ") ?? "—"}
                </p>
              </div>

              <div className="space-y-2">
                {orderedModules.map((mod) => {
                  const modPerms = modules[mod] ?? [];
                  const sectionKey = primaryPermissionForSection(modPerms);
                  const effectivePerms =
                    overrideQuery.data?.effective_permissions ?? [];
                  const visible =
                    sectionKey && effectivePerms.includes(sectionKey);

                   return (
                     <details
                       key={mod}
                       className="group border border-slate-200 rounded-lg bg-white"
                       {...(mod !== "settings" ? { open: true } : {})}
                     >
                      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none">
                        <div className="flex items-center gap-2">
                          <Icon
                            name={moduleIcon(mod)}
                            className="h-4 w-4 text-slate-600"
                          />
                          <span className="font-medium text-slate-900">
                            {sectionLabel(mod)}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            ({modPerms.length} permissions)
                          </span>
                        </div>
                        <Icon
                          name="chevron-down"
                          className="h-4 w-4 text-slate-400 group-open:rotate-180 transition-transform"
                        />
                      </summary>

                      <div className="px-4 pb-3 border-t border-slate-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="text-left py-2 text-xs font-medium text-slate-500">
                                Permission
                              </th>
                              <th className="text-left py-2 text-xs font-medium text-slate-500">
                                Action
                              </th>
                              <th className="text-center py-2 text-xs font-medium text-slate-500">
                                Override
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {modPerms.map((p) => {
                              const override = currentOverrides.find(
                                (o) => o.permission_code === p.code,
                              );
                              const isRevoked =
                                override?.action === "revoke";
                              const isGranted =
                                override?.action === "grant";
                              const effective = isGranted
                                ? true
                                : isRevoked
                                  ? false
                                  : (overrideQuery.data?.effective_permissions ?? []).includes(
                                      p.code,
                                    );

                              let statusLabel = "From role";
                              let statusTone = "neutral";
                              if (isGranted) {
                                statusLabel = "Granted";
                                statusTone = "success";
                              } else if (isRevoked) {
                                statusLabel = "Revoked";
                                statusTone = "danger";
                              }

                              return (
                                <tr
                                  key={p.code}
                                  className="border-t border-slate-50"
                                >
                                  <td className="py-2">
                                    <div className="font-mono text-xs text-slate-700">
                                      {p.code}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {p.description}
                                    </div>
                                  </td>
                                  <td className="py-2">
                                    <span className="text-xs text-slate-600">
                                      {p.action}
                                    </span>
                                  </td>
                                  <td className="py-2 text-center">
                                    {isGranted ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Granted
                                      </span>
                                    ) : isRevoked ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 bg-rose-50 rounded">
                                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                                        Revoked
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-500">
                                        {statusLabel}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        {/* Quick override controls for the section's primary permission */}
                        {sectionKey && (
                          <div className="mt-3 flex items-center gap-3">
                            <span className="text-xs text-slate-600">
                              Quick:
                            </span>

                             <button
                               type="button"
                               onClick={() => handleModuleOverride(mod, "grant")}
                               className={`text-xs px-2 py-1 rounded ${
                                 hasModuleOverride(mod, "grant")
                                   ? "bg-emerald-100 text-emerald-700"
                                   : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                               }`}
                             >
                               Grant all
                             </button>

                             <button
                               type="button"
                               onClick={() => handleModuleOverride(mod, "revoke")}
                               className={`text-xs px-2 py-1 rounded ${
                                 hasModuleOverride(mod, "revoke")
                                   ? "bg-rose-100 text-rose-700"
                                   : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                               }`}
                             >
                               Revoke all
                            </button>

                            <button
                              type="button"
                              onClick={() => handleClearSection(mod)}
                              className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              Clear overrides
                            </button>
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>

              {/* Save button */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-xs text-slate-500">
                  {hasChanges()
                    ? "You have unsaved changes."
                    : "All changes saved."}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !hasChanges()}
                  className="btn btn-primary text-xs gap-2 px-3 py-1.5 rounded-lg disabled:opacity-60"
                >
                  {saveMutation.isPending ? (
                    <>
                      <span className="text-xs">Saving...</span>
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
