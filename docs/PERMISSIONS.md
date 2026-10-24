# Permissions and roles

## Model

Roles are a convenience bundle; **permissions are checked individually**. An
employee may be allowed to *prepare* a return but not *approve* or *file* it, and
that distinction is enforced by a permission code, not by a role name.

Permissions are `<module>.<action>` — 72 of them. The catalogue lives in
`app/core/rbac.py` and is seeded into the `permissions` table. Effective
permissions are read from the database (`user_roles` → `role_permissions`), so a
firm can tighten or extend a role without a code change.

## Seeded roles

| Role | Scope | Summary |
|---|---|---|
| `firm_owner` | firm | Everything. The partner's role. |
| `branch_partner` | branch | Assigned branch: approvals, fees, reports, notices, ROC |
| `manager` | branch | Assign, review, escalate; no partner-level approval |
| `ca_senior` | team | Prepare and review; no approval, no filing |
| `article_assistant` | own | Prepare only. Cannot review, approve, file or delete |
| `accountant` | team | Prepare plus Tally/Winman imports |
| `client` | own | **No staff permissions at all** — portal realm only |
| `system_admin` | firm | Technical configuration. **Cannot approve client work.** |

`system_admin` is deliberately *not* "all permissions": it is a technical role, and
being able to reconfigure the system should not imply authority to sign off a
client's return. Least privilege applies to every role.

## Data scope

Independent of what a user may *do*:

| Scope | Sees |
|---|---|
| `firm` | Everything in the firm |
| `branch` | Their branch (plus unassigned records) |
| `team` | Work owned by their team |
| `own` | Only work they are named on |

A user holding several roles gets the **widest** scope implied by them. Scope is
applied in SQL, so restricted rows never leave the database.

## Separation of duties

The blueprint's rule — *"an employee might be allowed to prepare a return but not
approve or file it"* — is enforced three ways:

1. **Permission.** `article_assistant` has `task.prepare` and `review.submit`, and
   neither `task.approve` nor `task.file`.
2. **Role on the task.** The acting user's role is derived from their position *on
   that task* (`_actor_roles`). Being a partner does not grant approver rights on a
   task where someone else is the approver.
3. **Database constraint.**
   ```
   CHECK (reviewer_id IS NULL OR preparer_id IS NULL OR reviewer_id <> preparer_id)
   CHECK (approver_id IS NULL OR preparer_id IS NULL OR approver_id <> preparer_id)
   ```
   No code path can bypass these.

Reassignment keeps history: the previous holder's `task_assignments` row is
*closed* (`is_active = false`, with who and why), never deleted.

## Workflow transitions by role

Every edge names the roles allowed and the permission required.

| Transition | Roles | Permission | Reason? |
|---|---|---|---|
| `not_started → assigned` | manager, partner | `task.assign` | |
| `assigned → in_progress` | preparer, manager | `task.prepare` | |
| `in_progress → waiting_for_client` | preparer | `task.update_status` | **yes** |
| `in_progress → waiting_for_internal` | preparer | `task.update_status` | **yes** |
| `in_progress → ready_for_review` | preparer | `review.submit` | |
| `in_progress → ready_to_file` | preparer | `task.update_status` | |
| `ready_for_review → changes_requested` | reviewer | `task.review` | **yes** |
| `ready_for_review → ready_for_approval` | reviewer | `task.review` | |
| `ready_for_review → approved` | reviewer | `task.review` | |
| `ready_for_approval → approved` | approver, partner | `task.approve` | |
| `ready_for_approval → changes_requested` | approver | `task.approve` | **yes** |
| `approved → ready_to_file` | approver | `task.update_status` | |
| `* → filed` | filer, manager | `task.file` | |
| `filed → delivered` | preparer | `task.update_status` | |
| `* → completed` | approver | `task.update_status` | |
| `* → cancelled` | manager, partner | `task.update_status` | **yes** |

A firm can override these per workflow template via `workflow_transitions`. An
override **replaces** the canonical edges for any source status it mentions, so
"we removed this step" is expressible.

## Completion guards

A task cannot reach a terminal state while:

- a mandatory step is outstanding,
- a step requires filing and no filing record exists, or
- a required approval is not `approved`.

The refusal returns the specific blockers, not a generic error. `force` exists but
is not free: it requires the permission **and** a reason, and both are recorded in
`activity_logs` with the before/after snapshots.

## Endpoint permission map (excerpt)

| Endpoint | Permission |
|---|---|
| `GET /clients` | `client.view` |
| `POST /clients` | `client.create` |
| `PATCH /clients/{id}` | `client.update` |
| `POST /clients/{id}/status` | `client.update` |
| `GET /tasks` | `task.view` |
| `POST /tasks` | `task.create` |
| `POST /tasks/generate` | `task.create` |
| `POST /tasks/{id}/assign` | `task.assign` |
| `POST /tasks/{id}/status` | `task.update_status` |
| `POST /tasks/{id}/steps/{step}` | `task.prepare` |
| `POST /compliance/rules/{id}/verify` | `compliance.rule.verify_deadline` |
| `POST /compliance/deadlines/{id}/override` | `task.override_deadline` |
| `POST /compliance/filings` | `task.file` |
| `GET /reports/*` | `report.view` |
| `/cron/*` | `CRON_SECRET` bearer token, not a user permission |

## Verification

`GET /api/auth/permissions` returns the catalogue flagged with what the caller
holds. The frontend uses it to hide actions it cannot perform — a convenience
only. Every endpoint re-checks server-side; the UI is never the security boundary.
