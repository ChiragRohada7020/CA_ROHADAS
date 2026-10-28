# CA Rohadas — Backend / MCP Audit Report

## Scope & environment
- Backend (FastAPI + SQLAlchemy + asyncpg/psycopg) under `backend/`. MCP server mounted at `/mcp` with bearer-token → contextvar tenant wiring.
- PostgreSQL 16, DB `ca_software` (postgres, trust). Schema built via `init_db()` (no Alembic migrations).
- Dev server: `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Auth: signed JWT bearer (`ca_staff_token` cookie also accepted).
- Out of scope: WhatsApp integration, frontend redesign. Existing frontend and database preserved.

## Verification
- Live e2e harness `backend/_e2e_check.py` (21 checks across REST + MCP): **21 pass / 0 fail** (was 9 failures at audit start).
- `pytest`: **67 passed** (59 pre-existing + 8 new regression tests in `tests/test_regression_fixes.py`).
- `/api/health/db` → `200 {"status":"ok","database":true}`; backend imports OK.

## Root cause themes
1. **Phantom enum `CAST(... AS <type>)`** on columns whose DB type is plain `String` — the DB has no such enum types (`task_status`, `user_status`, `approval_status`, `filing_status`, `task_step_status`, `comment_visibility`; only `frequency` truly exists). Raw SQL bypassed SQLAlchemy enum handling.
2. **Raw-SQL `INSERT` omitting NOT NULL columns** whose defaults are Python-side only (`default=uuid.uuid4`, `default=datetime.utcnow`) — not fired by `text()` inserts. Affected `id`, `created_at`, `updated_at`.
3. **Stale column references** to columns that don't exist in the schema (`user_roles.tenant_id`/`granted_by_id`, `task_status_history.tenant_id`, `deleted_at` on `users`/`branches`/`task_steps`/`task_comments`).
4. **Unserializable SQLAlchemy `Row` returned directly** from a FastAPI endpoint.
5. **Backend↔MCP billing drift** + hardcoded/incomplete invoice totals and lines.

## Defects found & fixed (17)

| # | File | Defect (failure / cause) | Fix |
|---|------|--------------------------|-----|
| 1 | `app/core/clock.py` | `now_utc()` `NameError: timezone` not in scope | Import `timezone` at top |
| 2 | `app/routers/communications.py` | `NameError: select` on `/messaging/conversations` | Add `from sqlalchemy import select` |
| 3 | `app/routers/roles.py` | `PATCH /roles/{id}` wrote nonexistent `role_permissions.tenant_id` | Drop the column/kwarg |
| 4 | `app/routers/compliance.py` | `get_compliance_rules` returned hardcoded values + dead return | Select real `ComplianceRule` cols; map `status=="active"`→`is_active` |
| 5 | `app/routers/reports.py` | `get_upcoming_deadlines`: `dl.rule_name` (no attr) + `datetime-date` TypeError | Use `dl.notes`; `.date()` |
| 6 | `app/routers/users.py` (`/users/summary`) | `deleted_at IS NULL` on `users` (no such column) + role-map wrong-tenant logic | Join `users`; drop deleted_at |
| 7 | `app/routers/users.py` (`/users/{id}/overview`) | Activity query `h.tenant_id` on `task_status_history` | Join `tasks`, filter `t.tenant_id` |
| 8 | `app/routers/users.py` (`POST /users`) | `ImportError: get_password_hash` | Use `hash_password` |
| 9 | `app/routers/users.py` (`POST /users`) | `leave_records` table absent → 500 | `_leave_calendar` graceful helper |
| 10 | `app/routers/users.py` (`POST /users`) | Phantom `CAST(:status AS user_status)` | Drop cast |
| 11 | `app/routers/users.py` (`POST /users`) | `INSERT` omitted NOT NULL `id`/`created_at`/`updated_at`; raw `Row` unserializable | `gen_random_uuid()`+`NOW()`; return `dict(row._mapping)` |
| 12 | `app/routers/users.py` (`POST /users`) | `user_roles` INSERT used `tenant_id`+`granted_by_id` (cols absent) | Use `assigned_by_id`+`created_at=NOW()` |
| 13 | `app/routers/users.py` (`/branches`) | `deleted_at IS NULL` on `branches` (no such col) | Drop predicate |
| 14 | `app/services/task_workflow.py` | `transition_task` INSERT `task_status_history.tenant_id` (absent) + phantom `CAST AS task_status|approval_status|filing_status`; `datetime.utcnow()` | Remove col/casts; `gen_random_uuid()`+`NOW()`; `now_local()` |
| 15 | `app/routers/tasks.py` (`create_task_step`) | INSERT `tenant_id` (absent) + omitted NOT NULL `id` | Drop `tenant_id`; `gen_random_uuid()` for `id` |
| 16 | `app/routers/tasks.py` (`add_task_comment`) | INSERT `tenant_id` (absent) + omitted NOT NULL `id`/`created_at`; phantom `CAST AS comment_visibility` | Drop `tenant_id`; `gen_random_uuid()`+`NOW()`; drop cast |
| 17 | `app/routers/tasks.py` (`update_task_step`) | Phantom `CAST(:status AS task_step_status)` | Drop cast |
| 18 | `app/services/billing.py` + `app/routers/billing.py` + `app/mcp_server/server.py` | REST `create_invoice`/`generate_invoices` hardcoded zero totals, `lines` passed as dicts to a relationship (`'dict' object has no attribute '_sa_instance_state'`), nonexistent `updated_by_id`; MCP used different logic (drift) | Extract shared `create_invoice_record()` (resolve_tax+compute_invoice, InvoiceLine rows, computed totals) used by both REST and MCP |
| 19 | `app/mcp_server/server.py` (`_tool_list_users`) | `WHERE u.deleted_at IS NULL` on `users` (no such col); no tenant scoping | `WHERE 1=1` + tenant filter |

## Tests added
`backend/tests/test_regression_fixes.py` — 8 tests covering: `POST /users` with role grant, `/users/summary` tenant scoping, `PATCH /roles/{id}`, `POST /tasks/{id}/status`, REST billing create+generate, compliance rule real-value mapping, task-step status update, and task-comment creation.

## Known / out of scope
- WhatsApp integration untouched, per scope.
- Frontend not modified.
- `backend/_e2e_check.py` (live REST+MCP harness) kept on disk for re-runs; not part of the committed pytest suite.
- Residual deprecation warnings (`datetime.utcnow()`, passlib `crypt`) are pre-existing and unrelated to these fixes.
