# Architecture

## Layers

```
HTTP        app/routers/*        thin: validate, authorise, delegate, audit
Contracts   app/schemas/*        Pydantic in/out
Logic       app/services/*       pure, testable, no HTTP
Data        app/models/*         SQLAlchemy; the database enforces invariants
Cross-cut   app/core/*           config, db, security, rbac, audit, validation, clock
```

The rule that keeps this honest: **business logic never lives in a router**. The
compliance engine, the workflow state machine and the recurring generator are pure
functions or take an explicit session, so they can be tested without HTTP, and the
same logic cannot drift between two endpoints.

## Why the pure engines matter

Date arithmetic is where statutory software silently goes wrong. A wrong due date
is not a bug report — it is a penalty notice. So `compliance_engine.py` has no
database, no clock and no I/O: given a rule and a period, it returns a date, and
that is testable in isolation and reproducible from its inputs.

Same for `task_workflow.py`: the transition map, the guards and the progress maths
are data and pure functions. The database stores *which* transitions a firm allows
(`workflow_transitions`), the engine decides whether a proposed move is legal.

## Three status axes, never one

```
tasks.status           where the work is          14 states
tasks.approval_status  internal sign-off          not_required/pending/approved/...
tasks.filing_status    the external action        not_required/pending/filed/acknowledged/...
```

Collapsing these makes "approved" indistinguishable from "filed", which is exactly
the distinction a partner dashboard has to make. A GST return can be internally
approved while still unfiled; a return can be filed while its acknowledgement is
still outstanding.

## Separation of duties

Enforced at **three** levels, deliberately:

1. **Permission** — an article assistant's role does not grant `task.approve`.
2. **Role on the task** — `_actor_roles()` derives what the acting user is *on this
   task*. A partner who is not the approver on a specific task has no approver
   rights on it.
3. **Database constraint** — `reviewer_id <> preparer_id` and
   `approver_id <> preparer_id` are CHECK constraints, so no code path can bypass
   them even if a service-layer guard is missed.

## Tenant isolation

Every business table carries `tenant_id NOT NULL`, indexed, cascading on tenant
deletion. Isolation is structural rather than a convention someone can forget in a
new query. Every service-layer read is scoped by `tenant_id`, and routers apply the
principal's data scope (`own`/`team`/`branch`/`firm`) in SQL so restricted rows
never leave the database.

## Append-only history

| Table | Purpose |
|---|---|
| `activity_logs` | Every business action, with before/after JSONB snapshots |
| `access_logs` | Reads of confidential records, including *denied* attempts |
| `task_status_history` | Every status change, with all three axes and progress at that moment |
| `document_access_logs` | Who read or downloaded which document |
| `client_activities` | Per-client timeline for the work centre |
| `compliance_rule_versions` | Immutable snapshot of each rule revision |

Nothing issues an UPDATE against these. `audit.snapshot()` redacts
`password_hash`, `token_hash` and similar columns, so a credential cannot leak into
an audit row.

## Idempotency

The recurring generator's contract: a `(template, client, period)` triple can only
ever produce one task. Enforced twice — a pre-check in the service, and a partial
unique index (`uq_tasks_template_dedup`) in the database.

This is what makes a once-a-day Vercel Cron schedule *correct* rather than lossy,
and it makes re-running the generator the intended recovery path after a failure.

## Time

- **Store UTC.** Every `timestamptz` column holds an aware UTC datetime.
- **Reason in IST.** `today_local()` — never `date.today()`, which returns the
  server's date and is therefore already "tomorrow" for IST users between 18:30 and
  24:00 UTC.
- **Cron fires in UTC.** Schedules are written in UTC; the jobs convert.

`tzdata` is a declared dependency because Windows ships no IANA timezone database.

## Authentication

Two realms that never mix:

| | Staff | Client portal |
|---|---|---|
| Table | `users` | `client_portal_users` |
| JWT audience | `staff` | `client` |
| Permissions | full model | none |

The audience claim is verified during decode, so a staff token replayed against a
portal endpoint fails at the token layer, before any handler runs.

Tokens are set as **httpOnly cookies** for the browser, so an XSS bug cannot read
them. Refresh tokens are stored only as SHA-256 digests and are rotated on use, so
a stolen refresh token is usable at most once and its reuse is detectable.

## Validation, and its limits

`core/validation.py` checks the *structure* of PAN, TAN, CIN, LLPIN, GSTIN, IFSC,
PIN code and Indian mobile numbers, and cross-checks a GSTIN's embedded PAN and
state code.

Two things it deliberately does not do:

- **It never claims an identifier is verified.** No authorised government
  verification service is integrated.
- **It never hard-fails on a GSTIN check digit.** The documented algorithm
  validates the examples cited in GST documentation, but several widely published
  "example" GSTINs fail it. Hard-rejecting a real client's GSTIN on that basis
  would block real work, so a mismatch is returned as a *warning* the user may
  acknowledge.

Aadhaar is deliberately unsupported: storing it is restricted under the Aadhaar
Act and the DPDP Act, and a practice management system has no lawful need for it.

## Configuration

`Settings` is a pydantic-settings model. `assert_production_ready()` raises at
import time if production is running with the development JWT secret, cron secret,
or a missing blob token — failing loudly at startup rather than quietly signing
tokens with a key that is in the repository.
