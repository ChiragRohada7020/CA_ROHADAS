"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/Icon";
import { Modal } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { PermissionDef, RoleRow, RolesResponse } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens (CSS variables with dark-mode support via globals.css)
// ─────────────────────────────────────────────────────────────────────────────

const BG = "var(--role-page-bg)";
const BORDER = "var(--role-page-border)";
const INK = "var(--role-page-ink)";
const MUTED = "var(--role-page-muted)";
const PRIMARY = "var(--role-page-primary)";
const PRIMARY_HOVER = "var(--role-page-primary-hover)";
const SELECTED_BG = "var(--role-page-selected-bg)";
const SELECTED_TEXT = "var(--role-page-selected-text)";
const MODULE_BG = "var(--role-page-module-bg)";
const ROW_HOVER = "var(--role-page-row-hover)";
const ROW_BORDER = "var(--role-page-row-border)";

type RoleKey =
  | "firm_owner"
  | "branch_partner"
  | "partner"
  | "admin"
  | "system_admin"
  | "manager"
  | "senior_associate"
  | "ca_senior"
  | "article_assistant"
  | "accounts_staff"
  | "accountant"
  | "client_portal";

type RoleConfig = {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  iconBg: string;
  iconColor: string;
  userCount: number; // example data — replace with live assigned-user counts
  protected: boolean; // system role: delete is unsafe
};

const ROLE_CONFIG: Record<RoleKey, RoleConfig> = {
  firm_owner: {
    label: "Firm Owner",
    description: "Full access to all features and data across the entire firm.",
    icon: "crown",
    iconBg: "var(--role-icon-bg-sky)",
    iconColor: "var(--role-icon-text-sky)",
    userCount: 1,
    protected: true,
  },
  branch_partner: {
    label: "Branch Partner",
    description: "Full access to data for their branch and below.",
    icon: "crown",
    iconBg: "var(--role-icon-bg-sky)",
    iconColor: "var(--role-icon-text-sky)",
    userCount: 0,
    protected: true,
  },
  partner: {
    label: "Partner",
    description: "Full access to all features and data at the branch level.",
    icon: "crown",
    iconBg: "var(--role-icon-bg-sky)",
    iconColor: "var(--role-icon-text-sky)",
    userCount: 2,
    protected: true,
  },
  admin: {
    label: "Administrator",
    description: "Platform-level administration (billing, integrations, audit log).",
    icon: "shield-check",
    iconBg: "var(--role-icon-bg-violet)",
    iconColor: "var(--role-icon-text-violet)",
    userCount: 0,
    protected: true,
  },
  manager: {
    label: "Manager",
    description: "Manage team, clients and compliance.",
    icon: "users-round",
    iconBg: "var(--role-icon-bg-violet)",
    iconColor: "var(--role-icon-text-violet)",
    userCount: 4,
    protected: true,
  },
  senior_associate: {
    label: "Senior Associate",
    description: "Handle assigned clients and tasks.",
    icon: "users-round",
    iconBg: "var(--role-icon-bg-emerald)",
    iconColor: "var(--role-icon-text-emerald)",
    userCount: 6,
    protected: false,
  },
  ca_senior: {
    label: "CA Senior",
    description: "Oversee workpapers and supervise juniors.",
    icon: "users-round",
    iconBg: "var(--role-icon-bg-emerald)",
    iconColor: "var(--role-icon-text-emerald)",
    userCount: 0,
    protected: false,
  },
  article_assistant: {
    label: "Article Assistant",
    description: "Learning role with limited access to assigned tasks.",
    icon: "graduation-cap",
    iconBg: "var(--role-icon-bg-rose)",
    iconColor: "var(--role-icon-text-rose)",
    userCount: 3,
    protected: false,
  },
  accounts_staff: {
    label: "Accounts Staff",
    description: "Manage invoices, payments and receivables.",
    icon: "user-round",
    iconBg: "var(--role-icon-bg-amber)",
    iconColor: "var(--role-icon-text-amber)",
    userCount: 0,
    protected: false,
  },
  accountant: {
    label: "Accountant",
    description: "Full billing, payment and financial reporting access.",
    icon: "user-round",
    iconBg: "var(--role-icon-bg-amber)",
    iconColor: "var(--role-icon-text-amber)",
    userCount: 0,
    protected: false,
  },
  system_admin: {
    label: "System Administrator",
    description: "Platform-level administration (billing, integrations, audit log).",
    icon: "shield-check",
    iconBg: "var(--role-icon-bg-violet)",
    iconColor: "var(--role-icon-text-violet)",
    userCount: 0,
    protected: true,
  },
  client_portal: {
    label: "Client (Portal)",
    description: "Access to own data only.",
    icon: "building-2",
    iconBg: "var(--role-icon-bg-sky)",
    iconColor: "var(--role-icon-text-sky)",
    userCount: 12,
    protected: true,
  },
};

const ROLE_ORDER: RoleKey[] = [
  "firm_owner",
  "branch_partner",
  "partner",
  "admin",
  "system_admin",
  "manager",
  "senior_associate",
  "ca_senior",
  "article_assistant",
  "accounts_staff",
  "accountant",
  "client_portal",
];

// Match a backend role code to one of the spec cards.
function configKeyFor(role: RoleRow): RoleKey | null {
  const name = role.name.toLowerCase().trim();
  const code = role.code.toLowerCase().trim();

  // Direct name match: "Partner" -> partner, "Manager" -> manager, etc.
  const direct = ROLE_ORDER.find(
    (k) => ROLE_CONFIG[k].label.toLowerCase() === name,
  );
  if (direct) return direct;

  // Match by code keyword:
  const byCode = ROLE_ORDER.find(
    (k) => code.includes(k) || code.includes(k.replace(/_/g, "")),
  );
  if (byCode) return byCode;

  // Explicit code → key mapping for roles whose code differs from the key name.
  const codeToKey: Record<string, RoleKey> = {
    firm_owner: "firm_owner",
    branch_partner: "branch_partner",
    partner: "partner",
    admin: "admin",
    manager: "manager",
    senior_associate: "senior_associate",
    ca_senior: "ca_senior",
    article_assistant: "article_assistant",
    accounts_staff: "accounts_staff",
    accountant: "accountant",
    client: "client_portal",
    system_admin: "system_admin",
  };
  return codeToKey[code] ?? null;
}

const MODULE_ICONS: Record<string, React.ComponentProps<typeof Icon>["name"]> = {
  dashboard: "dashboard",
  clients: "users-round",
  tasks: "tasks",
  compliance: "shield-check",
  documents: "file-text",
  billing: "receipt",
  receivables: "wallet",
  team: "team",
  calendar: "calendar-days",
  reports: "chart-no-axes",
  services: "briefcase-business",
  communications: "messages-square",
  integrations: "integrations",
  settings: "settings",
  audit_log: "history",
  user: "settings",
  firm: "settings",
};
function moduleIcon(moduleName: string) {
  return MODULE_ICONS[moduleName.toLowerCase()] ?? "settings";
}

// ─────────────────────────────────────────────────────────────────────────────
// RolesPage
// ─────────────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [catalogue, setCatalogue] = useState<PermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<RoleKey>("partner");
  const [viewMode, setViewMode] = useState<"Modules" | "Features" | "Actions">(
    "Modules",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(
    new Set(),
  );
  // Working copy of permission grants: role id → set of permission codes.
  const [grants, setGrants] = useState<Map<string, Set<string>>>(new Map());
  // Snapshot of original grants (for change detection).
  const originalGrantsRef = useRef<Map<string, Set<string>>>(new Map());
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    text: string;
    kind: "success" | "error";
  } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    description: "",
    data_scope: "team",
    is_system: false,
    permission_codes: [] as string[],
  });

  const session = useSession();

  // ─────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const data: RolesResponse = await api.get("/roles");
      setRoles(data.roles);
      setCatalogue(data.catalogue);

      const next = new Map<string, Set<string>>();
      for (const role of data.roles) {
        next.set(role.id, new Set(role.permissions));
      }
      setGrants(next);
      originalGrantsRef.current = new Map(next);

      // Default to the first available config role that has a backend match,
      // otherwise Partner.
      const firstMatch = ROLE_ORDER.find((k) =>
        data.roles.some((r) => configKeyFor(r) === k),
      );
      if (firstMatch) setSelectedKey(firstMatch);
    } catch (err) {
      setApiError(
        err instanceof Error ? err.message : "Could not load roles.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  // ─────────────────────────────────────────────────────────────────────
  // Derived data
  // ─────────────────────────────────────────────────────────────────────

  // Backend role matched to each spec card.
  const matchedRoles = useMemo(() => {
    const map = new Map<RoleKey, RoleRow | null>();
    for (const key of ROLE_ORDER) {
      map.set(
        key,
        roles.find((r) => configKeyFor(r) === key) ?? null,
      );
    }
    return map;
  }, [roles]);

  const selectedRole = matchedRoles.get(selectedKey) ?? null;
  const selectedRoleId = selectedRole?.id ?? selectedKey;
  // Only backend roles can be saved; spec roles without a backend match are view-only
  const canSaveSelectedRole = selectedRole !== null;
  // firm_owner grants every permission (ALL_PERMISSION_CODES); it must not be
  // partially edited from this UI, so hide the save/delete controls.
  const isRoleReadOnly = selectedKey === "firm_owner";

  // Current working grants for the selected role.
  const selectedGrants = useMemo(
    () => grants.get(selectedRoleId) ?? new Set<string>(),
    [grants, selectedRoleId],
  );

  // Does the selected role have unsaved changes?
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedRoleId || !canSaveSelectedRole) return false;
    const original = originalGrantsRef.current.get(selectedRoleId);
    const current = grants.get(selectedRoleId);
    if (!current) return false;
    if (!original) return current.size > 0;
    if (original.size !== current.size) return true;
    for (const code of current) {
      if (!original.has(code)) return true;
    }
    return false;
  }, [grants, selectedRoleId, canSaveSelectedRole]);

  // Permissions grouped by module, filtered by search + view mode.
  // Each entry: { module, perms: PermissionDef[] }
  const modules = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const grouped = new Map<string, PermissionDef[]>();

    for (const p of catalogue) {
      const match =
        !query ||
        p.action.toLowerCase().includes(query) ||
        p.module.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query);
      if (!match) continue;

      const arr = grouped.get(p.module) ?? [];
      arr.push(p);
      grouped.set(p.module, arr);
    }

    return Array.from(grouped.entries()).map(([module, perms]) => ({
      module,
      perms,
    }));
  }, [catalogue, searchQuery, viewMode]);

  // Module is collapsed?
  const isModuleCollapsed = (module: string) =>
    collapsedModules.has(module);

  // ─────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────

  const togglePermission = useCallback(
    (roleId: string, code: string) => {
      const next = new Map(grants);
      const current = new Set(next.get(roleId) ?? []);
      if (current.has(code)) current.delete(code);
      else current.add(code);
      next.set(roleId, current);
      setGrants(next);
      setToast(null);
    },
    [grants],
  );

  const isChecked = (roleId: string, code: string) =>
    (grants.get(roleId) ?? new Set()).has(code);

  const saveSelectedRole = useCallback(async () => {
    if (!selectedRoleId || !selectedRole) return;
    setSavingRole(selectedRoleId);
    setToast(null);
    try {
      const codes = Array.from(selectedGrants);
      await api.patch(`/roles/${selectedRoleId}`, {
        permission_codes: codes,
      });
      // Refresh to reflect server state.
      await loadRoles();
      setToast({ text: "Permissions saved.", kind: "success" });
    } catch (err) {
      setToast({
        text: err instanceof Error ? err.message : "Could not save permissions.",
        kind: "error",
      });
    } finally {
      setSavingRole(null);
    }
  }, [selectedRoleId, selectedGrants, loadRoles, canSaveSelectedRole]);

  const toggleModule = useCallback((module: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }, []);

  const clearSearch = () => setSearchQuery("");

  // ─────────────────────────────────────────────────────────────────────
  // Create role
  // ─────────────────────────────────────────────────────────────────────

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setToast(null);
    try {
      await api.post("/roles", {
        name: createForm.name,
        description: createForm.description || null,
        data_scope: createForm.data_scope,
        is_system: createForm.is_system,
        permission_codes: createForm.permission_codes,
      });
      setCreateOpen(false);
      setCreateForm({
        name: "",
        description: "",
        data_scope: "team",
        is_system: false,
        permission_codes: [],
      });
      await loadRoles();
      setToast({ text: "Role created.", kind: "success" });
    } catch (err) {
      setToast({
        text:
          err instanceof Error
            ? err.message
            : "Could not create role (create endpoint may not be enabled yet).",
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm text-slate-500">
          Loading roles…
        </div>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 text-sm">
          {apiError}
        </div>
      </div>
    );
  }

  const canManageRoles = session.data
    ? session.data.permissions.includes("role.write")
    : false;
  const canViewRoles = session.data
    ? session.data.permissions.includes("role.read")
    : false;

  return (
    <div style={{ backgroundColor: BG }} className="min-h-screen">
      <div className="mx-auto" style={{ paddingLeft: 26, paddingRight: 26 }}>
        <div style={{ paddingTop: 20 }}>

          {/* ── Breadcrumb ── */}
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2"
            style={{
              marginBottom: 14,
              minHeight: 20,
            }}
          >
            <span
              className="text-[13px] font-normal text-slate-500"
              style={{ fontWeight: "400" }}
            >
              Settings
            </span>
            <span
              className="text-[13px] text-slate-400 mx-1"
              style={{ fontWeight: "400" }}
            >
              &gt;
            </span>
            <span
              className="text-[13px] font-normal"
              style={{ color: INK, fontWeight: "400" }}
            >
              Roles &amp; Permissions
            </span>
          </nav>

          {/* ── Heading + Create Role ── */}
          <div
            className="flex flex-wrap items-end justify-between gap-3"
            style={{ marginBottom: 20 }}
          >
            <div className="min-w-0">
              <h1
                className="text-[28px] font-bold leading-[34px] tracking-tight"
                style={{
                  color: INK,
                  letterSpacing: "-0.01em",
                  margin: 0,
                }}
              >
                Roles &amp; Permissions
              </h1>
              <p
                className="text-[14px] leading-[20px] text-slate-500 mt-1"
                style={{ margin: 0 }}
              >
                Manage user roles and control access to features, clients, and data.
              </p>
            </div>
            <button
              type="button"
              className="relative inline-flex items-center justify-center gap-2"
              onClick={() => setCreateOpen(true)}
              disabled={!canManageRoles}
              style={{
                width: 138,
                height: 42,
                background: canManageRoles ? PRIMARY : "var(--role-page-disabled)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                border: "none",
                borderRadius: 7,
                cursor: canManageRoles ? "pointer" : "default",
                opacity: canManageRoles ? 1 : 0.6,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span style={{ fontWeight: 600 }}>+ Create Role</span>
            </button>
          </div>

          {/* ── Role selection cards ── */}
          <div
            role="tablist"
            aria-label="Select a role"
            className="flex gap-8"
            style={{ marginBottom: 24, display: "flex", gap: "8px" }}
          >
            {ROLE_ORDER.map((key) => {
              const config = ROLE_CONFIG[key];
              const isSelected = selectedKey === key;
              return (
                <div
                  key={key}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedKey(key);
                    setToast(null);
                  }}
                  className="relative flex flex-col cursor-pointer"
                  style={{
                    minHeight: 128,
                    padding: 16,
                    background: "var(--role-page-card-bg)",
                    borderColor: isSelected ? "var(--role-page-primary)" : "var(--role-page-border)",
                    borderRadius: 9,
                    boxShadow: isSelected
                      ? "0 0 0 3px rgba(22,119,255,0.12), 0 1px 2px rgba(15,23,42,0.04)"
                      : "0 1px 2px rgba(15,23,42,0.04)",
                    flex: 1,
                    minWidth: 0,
                    cursor: "pointer",
                    transition: "all 120ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected)
                      (e.currentTarget).style.borderColor = "var(--role-page-disabled)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected)
                      (e.currentTarget).style.borderColor = BORDER;
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 9,
                      background: config.iconBg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 12,
                      color: config.iconColor,
                    }}
                  >
                    <Icon name={config.icon} className="h-5 w-5" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{
                      color: INK,
                      fontWeight: "650",
                      fontSize: 14,
                      margin: "0 0 4px 0",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                    }}>
                      {config.label}
                    </h3>
                    <p style={{
                      color: MUTED,
                      fontWeight: "400",
                      fontSize: 12,
                      lineHeight: "17px",
                      margin: 0,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}>
                      {config.description}
                    </p>
                  </div>
                  <div style={{
                     marginTop: "auto",
                    fontSize: 12,
                    fontWeight: 500,
                    color: MUTED,
                  }}>
                    {config.userCount} users
                  </div>
                  <button
                    type="button"
                    aria-label={`Options for ${config.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const matched = matchedRoles.get(key);
                      if (!matched || matched.is_system) {
                        setToast({
                          text:
                            "System roles cannot be deleted.",
                          kind: "error",
                        });
                      } else {
                        setToast({
                          text:
                            "Delete role is not yet implemented in the card menu. Use the Delete Role button in the detail panel.",
                          kind: "error",
                        });
                      }
                    }}
                    className="btn-icon absolute bottom-6 right-8"
                    style={{ bottom: 16, right: 16 }}
                  >
                    <Icon name="more-vertical" className="h-4 w-4" />
                  </button>
                  {isSelected && (
                    <div
                      className="absolute inset-0 rounded-[9px] pointer-events-none"
                      style={{
                        border: `1px solid ${PRIMARY}`,
                        boxShadow: "0 0 0 3px rgba(22,119,255,0.16)",
                        borderRadius: 9,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {!canViewRoles && (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 mb-6">
              You do not have permission to view roles.
            </div>
          )}

          {/* ── Permissions workspace ── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 450px",
              gap: 14,
              alignItems: "start",
            }}
            className="min-w-0"
          >
            {/* Left: Permissions matrix panel */}
            <section
              className="relative flex flex-col min-w-0"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
              }}
              >
              <div
                className="flex items-center justify-between border-b px-4 py-3"
                style={{
                  padding: "18px 19px 14px 19px",
                  backgroundColor: "var(--role-page-table-header)",
                  borderBottomColor: BORDER,
                }}
              >
                <div className="min-w-0 flex items-center gap-3">
                  <h2
                    className="text-[20px] font-bold leading-none"
                    style={{ color: INK, fontWeight: 700, margin: 0 }}
                  >
                    Permissions
                  </h2>
                  <p
                    className="text-[13px] text-slate-500 leading-none"
                    style={{ margin: 0, marginTop: 2 }}
                  >
                    Manage what each role can access and do
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="View permissions by"
                    className="inline-flex"
                    style={{
                       background: "var(--role-page-toggle-bg)",
                      borderRadius: 7,
                      padding: 3,
                      display: "inline-flex",
                    }}
                  >
                    {(["Modules", "Features", "Actions"] as const).map((option) => {
                      const active = viewMode === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          role="button"
                          aria-pressed={active}
                          onClick={() => setViewMode(option)}
                          className="inline-flex items-center justify-center whitespace-nowrap"
                          style={{
                            fontSize: 12,
                            padding: "8px 12px",
                            borderRadius: 5,
                            cursor: "pointer",
                             color: active ? SELECTED_TEXT : MUTED,
                            fontWeight: active ? 600 : 400,
                            background: active ? SELECTED_BG : "transparent",
                            minWidth: 56,
                            textAlign: "center",
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  <div className="relative">
                    <Icon
                      name="search"
                      className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                    />
                    <input
                      type="search"
                      placeholder="Search permissions…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setSearchQuery("");
                      }}
                      className="w-[190px] h-[36px] rounded-md pl-9 pr-3 text-[12px] outline-none transition"
                       style={{
                         borderColor: "var(--role-page-search-border)",
                         borderRadius: 7,
                         fontSize: 12,
                         paddingLeft: 34,
                         paddingRight: 10,
                         backgroundColor: "var(--role-page-card-bg)",
                       }}
                       onFocus={(e) => {
                         (e.target).style.borderColor = PRIMARY;
                       }}
                       onBlur={(e) => {
                         (e.target).style.borderColor = "var(--role-page-search-border)";
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                        aria-label="Clear search"
                      >
                        <Icon name="x" className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="overflow-x-auto overflow-y-auto flex-1 min-h-0"
                style={{ padding: "0 19px 19px 19px", outline: "none" }}
                tabIndex={-1}
              >
                {modules.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-sm">
                    No permissions match your search.
                  </div>
                ) : (
                  <div className="min-w-full">
                    <table
                      className="min-w-full border-collapse text-sm"
                      style={{ borderSpacing: 0 }}
                    >
                      <thead>
                          <tr className="sticky top-0 z-10 bg-white dark:bg-slate-800">
                            <th
                              className="text-left"
                              style={{
                                padding: "15px 15px 15px 0",
                                fontSize: 12,
                                fontWeight: 600,
                                color: MUTED,
                                borderBottom: `1px solid ${BORDER}`,
                                position: "sticky",
                                left: 0,
                                background: "var(--role-page-table-header)",
                              zIndex: 11,
                              width: 315,
                            }}
                          >
                            Module / Permission
                          </th>
                          {ROLE_ORDER.map((key) => {
                            const config = ROLE_CONFIG[key];
                            const backendRole = matchedRoles.get(key) ?? null;
                            return (
                              <th
                                key={key}
                                className="px-2 py-2 text-center"
                                style={{
                                  width: 108,
                                  paddingTop: 16,
                                  paddingBottom: 16,
                                  borderBottom: `1px solid ${BORDER}`,
                                  position: "sticky",
                                  top: 0,
                background: "var(--role-page-card-bg)",
                                  zIndex: 11,
                                }}
                                title={`${config.label} · ${backendRole?.data_scope ?? "—"}`}
                              >
                                <div className="flex flex-col items-center gap-1.5">
                                  <div
                                    style={{
                                      width: 25,
                                      height: 25,
                                      borderRadius: 6,
                                      background: config.iconBg,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginBottom: 2,
                                      color: config.iconColor,
                                    }}
                                  >
                                    <Icon name={config.icon} className="h-3.5 w-3.5" />
                                  </div>
                                  <span
                                    className="text-[11px] leading-none"
                                    style={{
                                      fontWeight: 600,
                                      color: "#172554",
                                      display: "block",
                                      textAlign: "center",
                                    }}
                                  >
                                    {config.label}
                                  </span>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map((mod) => {
                          const collapsed = collapsedModules.has(mod.module);
                          const visiblePerms = collapsed ? [] : mod.perms;
                          return (
                                            <Fragment key={`module-${mod.module}`}>
                                              <tr
                                                key={`module-${mod.module}`}
                                                className="cursor-pointer"
                                                onClick={() => {
                                                  setCollapsedModules((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(mod.module)) next.delete(mod.module);
                                                    else next.add(mod.module);
                                                    return next;
                                                  });
                                                }}
                                              >
                                                <td
                                                  colSpan={7}
                                                  className="px-4 py-2"
                                                  style={{
                                                    height: 36,
                                                    background: MODULE_BG,
                                                    fontSize: 12,
                                                    fontWeight: 700,
                                      color: INK,
                                                    borderBottom: `1px solid ${BORDER}`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    paddingLeft: 15,
                                                  }}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <span style={{ color: PRIMARY }}>
                                                      <Icon
                                                        name={moduleIcon(mod.module)}
                                                        className="h-4 w-4"
                                                      />
                                                    </span>
                                                    <span>{mod.module}</span>
                                                    <span className="text-xs text-slate-500 ml-2">
                                                      ({mod.perms.length})
                                                    </span>
                                                  </div>
                                                  <Icon
                                                    name={collapsed ? "chevron-right" : "chevron-down"}
                                                    className="h-3.5 w-3.5 text-slate-400"
                                                  />
                                                </td>
                                              </tr>
                                              {visiblePerms.map((p) => (
                                                <tr key={p.code} className="table-row" style={{ height: 34 }}>
                                                  <td className="px-4" style={{
                                                    paddingLeft: 15,
                                                    paddingTop: 0,
                                                    paddingBottom: 0,
                                                    fontSize: 12,
                                                    color: "#334155",
                                                    verticalAlign: "middle",
                                                    borderBottom: `1px solid ${ROW_BORDER}`,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                  }}>
                                                    <span>{p.action}</span>
                                                  </td>
                                                  {ROLE_ORDER.map((key) => {
                                                    const backendRole = matchedRoles.get(key) ?? null;
                                                    const roleId = backendRole?.id ?? key;
                                                    const checked = isChecked(roleId, p.code);
                                                    const roleDisabled = false;
                                                    return (
                                                      <td key={key} className="px-2 py-2 text-center" style={{
                                                        width: 108,
                                                        borderBottom: `1px solid ${ROW_BORDER}`,
                                                        borderRight: `1px solid ${BORDER}`,
                                                        verticalAlign: "middle",
                                                        paddingTop: 0,
                                                        paddingBottom: 0,
                                                        paddingLeft: 4,
                                                        paddingRight: 4,
                                                      }}>
                                                        <label
                                                          className="relative inline-flex h-4.5 w-4.5 items-center justify-center rounded-sm cursor-pointer"
                                                          style={{
                                                            borderRadius: 4,
                                                            border: `1px solid ${checked ? PRIMARY : "#B9C8DB"}`,
                                                            background: checked ? PRIMARY : "#FFF",
                                                            display: "inline-flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            width: 17,
                                                            height: 17,
                                                            margin: 0,
                                                            cursor: roleDisabled ? 'default' : 'pointer',
                                                            opacity: roleDisabled ? 0.5 : 1,
                                                          }}
                                                        >
                                                          <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => { if (!roleDisabled) togglePermission(roleId, p.code); }}
                                                            className="sr-only"
                                                            aria-label={`${ROLE_CONFIG[key].label} — ${p.action}`}
                                                          />
                                                          {checked && (
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                                              <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                          )}
                                                        </label>
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              ))}
                                            </Fragment>
                                          );
                                                    })
                                                  }

                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Right: Role editor panel */}
            <section
              className="flex flex-col min-w-[450px]"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${BORDER}`,
                borderRadius: 10,
              }}
            >
              <div
                className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-[#F8FAFC] rounded-t-10"
                style={{ padding: "18px 19px 14px 19px" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 10,
                      background: "#DBEAFE",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      color: ROLE_CONFIG[selectedKey].iconColor,
                    }}
                  >
                    <Icon
                      name={ROLE_CONFIG[selectedKey].icon}
                      className="h-7 w-7"
                    />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="text-[20px] font-bold leading-none"
                      style={{
                        color: INK,
                        fontWeight: 700,
                        margin: "0 0 2px 0",
                      }}
                    >
                      {selectedRole?.name ??
                      ROLE_CONFIG[selectedKey].label}
                    </h3>
                    <p
                      className="text-[13px] text-slate-500 leading-none"
                      style={{ margin: 0 }}
                    >
                      {selectedRole?.description ??
                      ROLE_CONFIG[selectedKey].description}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="More options"
                    className="btn-icon ml-auto"
                    disabled={!canManageRoles}
                  >
                    <Icon name="more-vertical" className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div
                style={{
                  padding: "19px 19px 24px 19px",
                  overflowY: "auto",
                  flex: 1,
                }}
              >
                <div
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-4"
                >
                  <span>Details</span>
                  <span className="w-px h-3 bg-slate-300 mx-1 hidden sm:block" />
                  <span>
                    Permissions ({selectedRole?.permissions.length ?? 0})
                  </span>
                  <span className="w-px h-3 bg-slate-300 mx-1 hidden sm:block" />
                  <span>Access Scope</span>
                </div>

                <div className="space-y-5">
                  <div>
                    <label
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Role name <span className="text-rose-600 ml-1">*</span>
                    </label>
                    <input
                      type="text"
                      value={
                        selectedRole?.name ??
                        ROLE_CONFIG[selectedKey].label
                      }
                      readOnly
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                    />
                    <p className="mt-1 text-[11px] text-slate-400">
                      Role code cannot be changed after creation.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={
                        selectedRole?.description ??
                        ROLE_CONFIG[selectedKey].description
                      }
                      readOnly
                      rows={3}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium text-slate-700">
                        Default role
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        New users will be assigned this role by default.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-200 transition-colors"
                      disabled
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-full bg-white translate-x-6 transition-transform"
                        style={{
                          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                        }}
                      />
                    </button>
                  </div>
                  <div>
                    <h4
                      className="text-xs font-semibold text-slate-700 mb-2"
                    >
                      Key permissions
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedGrants)
                        .slice(0, 6)
                        .map((code) => {
                          const def = catalogue.find((p) => p.code === code);
                          return (
                            <span
                              key={code}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                            >
                              {def?.action ?? code}
                            </span>
                          );
                        })}
                      {selectedGrants.size > 6 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500"
                        >
                          +{selectedGrants.size - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Data scope
                    </label>
                    <p className="text-sm text-slate-600">
                      {(selectedRole?.data_scope ?? "team")
                        .replace(/\b\w/, (c) => c.toUpperCase())}
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    disabled={
                      !canManageRoles ||
                      isRoleReadOnly ||
                      selectedRole?.is_system ||
                      !hasUnsavedChanges
                    }
                    onClick={() => {
                      setToast({
                        text:
                          "Delete is disabled for protected system roles.",
                        kind: "error",
                      });
                    }}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                    Delete Role
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-60"
                    disabled={
                      !canManageRoles ||
                      isRoleReadOnly ||
                      !hasUnsavedChanges
                    }
                    onClick={saveSelectedRole}
                  >
                    {savingRole === selectedRoleId ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </section>
          </div>

        </div>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border bg-white px-4 py-3 shadow-lg text-sm"
          style={{
            borderColor:
              toast.kind === "success" ? "#22c55e" : "#f87171",
            color: toast.kind === "success" ? "#166534" : "#b91c1c",
          }}
        >
          <Icon
            name={
              toast.kind === "success" ? "check-circle" : "alert-triangle"
            }
            className={cn(
              "h-4 w-4",
              toast.kind === "success" ? "text-green-600" : "text-rose-600",
            )}
          />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Create Role Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Role"
        size="md"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 p-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Role name <span className="text-rose-600 ml-1">*</span>
            </label>
            <input
              name="name"
              value={createForm.name}
              onChange={(e) =>
                setCreateForm({ ...createForm, name: e.target.value })
              }
              placeholder="e.g. Junior Associate"
              className="input"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={createForm.description}
              onChange={(e) =>
                setCreateForm({ ...createForm, description: e.target.value })
              }
              rows={3}
              placeholder="What this role can do…"
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Data scope
            </label>
            <select
              name="data_scope"
              value={createForm.data_scope}
              onChange={(e) =>
                setCreateForm({ ...createForm, data_scope: e.target.value })
              }
              className="input select"
            >
              <option value="own">Own work only</option>
              <option value="team">Team</option>
              <option value="branch">Branch</option>
              <option value="firm">Entire firm</option>
            </select>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Initial permissions
            </label>
            <div className="space-y-3 max-h-60 overflow-y-auto border border-slate-200 rounded-md p-3">
              {(() => {
                // Group permissions by module for the create form
                const byModule = new Map<string, typeof catalogue>();
                for (const p of catalogue) {
                  const arr = byModule.get(p.module) ?? [];
                  arr.push(p);
                  byModule.set(p.module, arr);
                }
                return Array.from(byModule.entries()).map(([moduleName, perms]) => (
                  <div key={moduleName}>
                    <div className="text-xs font-semibold text-slate-500 uppercase mb-1.5">
                      {moduleName}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {perms.map((p) => {
                        const active = createForm.permission_codes.includes(p.code);
                        return (
                          <button
                            key={p.code}
                            type="button"
                            onClick={() => {
                              const codes = new Set(createForm.permission_codes);
                              if (codes.has(p.code)) codes.delete(p.code);
                              else codes.add(p.code);
                              setCreateForm({
                                ...createForm,
                                permission_codes: Array.from(codes),
                              });
                            }}
                            className={cn(
                              "inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-left",
                              active
                                ? `border-${PRIMARY} bg-[#E2EEFF] text-[#0759C7]`
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={active}
                              readOnly
                              className="sr-only"
                            />
                            {p.action}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              You can adjust these permissions on the matrix after the role is created.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateForm({
                  name: "",
                  description: "",
                  data_scope: "team",
                  is_system: false,
                  permission_codes: [],
                });
              }}
              className="btn-ghost px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-60"
              disabled={creating || !createForm.name.trim()}
            >
              {creating ? "Creating…" : "Create Role"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


