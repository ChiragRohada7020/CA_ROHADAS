# Rohadas CA

An operating system for an Indian CA firm: clients, engagements, recurring
compliance work, deadlines, documents, reviews, filings and firm-wide reporting —
in one place, with one source of truth.

**This application manages the firm's *work*.** Winman continues to do tax
computation and Tally continues to do accounting; this system records the work
around them and links to their outputs.

- **Backend:** FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL 18
- **Frontend:** Next.js + React (in progress — see [docs/ROADMAP.md](docs/ROADMAP.md))
- **Deployment:** Vercel Services (frontend + backend in one project), Neon
  Postgres, Vercel Blob, Vercel Cron — see [docs/DEPLOY.md](docs/DEPLOY.md)

---

## What is built today

Phase 1 and Phase 2 of the blueprint are implemented and tested.

| Area | State |
|---|---|
| PostgreSQL schema | **53 tables**, 43 native enums, 197 foreign keys, 6 partial unique indexes |
| Migrations | Alembic, reversible (verified `upgrade → downgrade → upgrade`) |
| Auth | Onboarding, login, rotating refresh tokens, httpOnly cookies, realm-scoped JWT |
| Permissions | 72 granular codes, 8 seeded roles, least privilege, data scoping |
| Client CRM | Person / legal entity / relationship split, multi-GSTIN, contacts, KYC, audit trail |
| Work management | 14-state workflow, templates, checklists, assignments, dependencies, comments |
| Recurring generation | Idempotent, applicability-aware, dry-run capable |
| Compliance | Effective-dated rules, derived due dates, deadline overrides with mandatory reasons |
| Filings | Filing records + acknowledgements, closing the loop on "filed" |
| Reports | Firm dashboard, workload (effort-weighted), at-risk clients, turnaround, weekly change |
| MIS | Productivity (complexity-weighted + logged effort), bottlenecks (aging, dwell, recurring lateness), client-wise service status |
| Work logs | Effort logged against a task, the honest basis for productivity |
| Documents | Storage-abstracted upload, append-only versions, SHA-256 dedup, requests, links, audited downloads |
| Notifications | Per-recipient inbox, unread badge, mark read / read-all |
| Delivery | In-app, SMTP email and a generic WhatsApp gateway, with honest failure reporting |
| Reminders | Clients chased for outstanding documents on email + WhatsApp, throttled, never silently skipped |
| Staff directory | Read-only roster with roles and branches — what every "assign to…" picker needs |
| Responsibility | Assign/reassign with history, assignee on the task list, filter by person, a team page |
| Service catalogue | Define services, set fees and billing methods, manage each service's checklist, see who buys it |
| Integrations | Winman / Tally client-master import and export, with per-row validation errors |
| Filing records | ARN, portal reference, late fee and filing status, recorded and readable back |
| Billing | Invoices raised by hand or generated from completed work, GST by place of supply, SAC per line |
| Receivables | Partial and full receipts, outstanding balances, ageing buckets, worst-client-first chase list |
| Dashboard | Trended headline figures, compliance ring by service category, work pipeline, portfolio, financial overview, workload and activity |
| Invoice delivery | Queued to the client's contact on email + WhatsApp, with a no-login link that can be revoked |
| Frontend | Next.js 16 App Router — dashboard, clients + work centre + intake, services, tasks + detail + generation, team, calendar, documents, invoices + print view, receivables, integrations, reports |
| Cron | 4 authenticated Vercel Cron jobs, all idempotent |
| Tests | **441 passing** (`pytest`), frontend typechecks clean, plus 144 end-to-end smoke checks |

Not yet built: the client portal, audit engagements, notices, ROC registers, credit
notes, global search, and the AI assistant. The database schema for several of these
already exists.

**Billing records what was billed and collected; it is not a set of books.** The
blueprint places the ledger in Tally, and that is respected: there is no journal, no
double entry and no trial balance, because a second set of books that disagrees with
the first is worse than none. What exists is a receivables view — invoice, payment and
the outstanding balance, with ageing.

Three decisions this makes, each of which a firm should confirm before relying on it:

* **GST is charged on professional fees** at the firm's configured rate (18% by
  default), split by place of supply: CGST + SGST when the firm's and the client's
  state codes match, IGST when they do not. With no GSTIN on the firm record, no tax
  is charged at all, and the settings screen says so.
* **A client's state code is a billing field.** It decides the tax, so an invoice raised
  for a client without one is flagged rather than silently guessed — the place of
  supply is assumed from the firm's own state and the invoice says so while it is still
  a draft.
* **Payments are recorded against a single invoice.** Receiving one payment and
  allocating it across several invoices is a refinement to add when a firm asks; a
  credit note is likewise not built, so an overpayment is refused rather than absorbed.


**Winman and Tally integration is file-based, and says so.** Both are desktop products
with no API this application can call, so `/integrations/providers` states the mechanism
and the limitations outright rather than implying a live link. What works: import a
client-master export (CSV or TSV, vendor headers matched automatically or mapped
explicitly), export one back, and see every rejected row with its number, field and
reason. Tally XML masters are not parsed yet.

**Notification delivery** is real but needs provider credentials to leave the building.
`EMAIL` goes over SMTP and `WHATSAPP` posts to a generic HTTP gateway; both are
optional settings. With neither configured, queued messages are reported as **failed**
and stay queued with a reason, rather than being marked sent — a delivery log that
claims sends that never happened cannot be trusted for anything. `GET
/cron/delivery-status` shows what is configured and what is stuck, because "reminders
are not arriving" and "reminders are arriving and being ignored" need opposite
responses and would otherwise look identical.

**Service management** covers all four of: defining service lines (ITR, GST returns,
TDS, tax audit, ROC filings and more), setting fees and billing methods, building the
checklist for each service, and tracking which clients have bought it.

A service's checklist is its **task template's steps**, not a separate table. Progress
on a task is computed from that task's steps, so a second, parallel checklist would be
a second source of truth for "what does a GST return involve" — and the two would
drift. Editing a template changes future generation only; tasks already created keep
their own copies.

## Design commitments

Three rules the code enforces rather than merely documents:

1. **It never invents a statutory due date.** A compliance rule stores a
   recurrence and a day token, never a literal date. Every rule carries
   `deadline_verified`; an unverified date stays visibly unverified and is
   reported as an alert until a person confirms it.
2. **It never calls an identifier "verified".** PAN, GSTIN, TAN and CIN are
   format-checked only, because no authorised government verification service is
   integrated. A GSTIN check-digit mismatch is a *warning*, not a rejection.
3. **Internal approval is not filing.** `task_status`, `approval_status` and
   `filing_status` are three independent axes.

## Quick start

```bash
cd backend

# 1. Point at a database (see backend/.env.example)
#    Local PostgreSQL 18 with `trust` auth needs no password.
export DATABASE_URL="postgresql+psycopg://postgres@127.0.0.1:5432/ca_software"

# 2. Apply the schema
python -m alembic upgrade head

# 3. Run the API
python -m uvicorn app.main:app --reload --port 8000

# 4. Open the interactive docs
#    http://localhost:8000/docs
```

Then create the firm:

```bash
curl -X POST http://localhost:8000/api/auth/onboarding \
  -H "Content-Type: application/json" \
  -d '{"firm_name":"Rohada & Associates","firm_slug":"rohada",
       "owner_full_name":"Rohit Rohada","owner_email":"partner@example.com",
       "owner_password":"change-this-immediately"}'
```

Onboarding is only permitted while the deployment has **no firms at all**;
afterwards it returns `409`. That is deliberate — otherwise it would be an open
door that mints tenants on a production system.

### Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

Leave the API running on `:8000`. The frontend proxies `/api/*` to it
(`next.config.ts`, override with `BACKEND_ORIGIN`).

**That proxy is not optional in development.** Auth cookies are `httpOnly` with
`SameSite=Lax`, so a browser will not send them on a cross-origin request. Without
the proxy, the frontend on `:3000` could sign in successfully and then find every
subsequent call unauthenticated. Proxying keeps the browser on a single origin —
which is also exactly what the production rewrite in `vercel.json` does, so
development and production exercise the same path.

The first visit shows **Set up your firm** on the sign-in screen, which calls the
same onboarding endpoint.

#### Helper scripts

From the repository root:

```powershell
./start-dev.ps1     # starts both, frees the ports first, waits until they answer
./stop-dev.ps1      # stops both, but only if the process is python or node
```

From `backend/`:

```bash
python scripts/db_status.py      # which database will the app use, and what is in it
python scripts/check_running.py  # is the stack up, does the proxy work, right database
python scripts/dump_api.py       # the whole API surface, from the live OpenAPI document
```

`db_status.py` earns its place because `DATABASE_URL` is easy to inherit by accident:
the test suite and `scripts/smoke_frontend.py` both set it, and starting the API
against the test database looks like data loss rather than a misconfiguration. That
is also why `start-dev.ps1` pins the URL explicitly rather than relying on the
ambient environment.

`stop-dev.ps1` checks the process name before killing, so it cannot take down an
unrelated service that happens to be on :3000.

**On `npm run dev`, the first request to each page is slow** — Turbopack compiles a
route on demand, so a fresh dev server takes a few seconds per screen and a script
that walks all seven pages can look like it has hung. `npm run build && npm run start`
avoids it.

## Tests

```bash
cd backend
python -m pytest tests -q
```

The suite needs the test database to exist:

```bash
createdb ca_software_test     # or set TEST_DATABASE_URL
```

It creates the schema once per session and runs every test inside a transaction
that is rolled back, so tests never see each other's data.

`scripts/reset_test_db.py` clears tenant data from the test database. It exists
because a **live** uvicorn process commits for real — unlike the suite — so manual
smoke runs leave a firm behind, and onboarding then refuses with `409`.

For the frontend:

```bash
cd frontend
npm run typecheck      # tsc --noEmit
npm run build          # production build, includes type checking
```

### End-to-end smoke test

The pytest suite drives the API directly. `scripts/smoke_frontend.py` drives it the
way the **browser** does — through the frontend's own `/api` proxy, with cookie auth
— and checks that every screen's data actually arrives.

```bash
# terminal 1
cd backend && python -m uvicorn app.main:app --port 8000

# terminal 2
cd frontend && npm run build && npm run start

# terminal 3 — point the backend at the TEST database, then:
cd backend
DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:5432/ca_software_test \
  python scripts/smoke_frontend.py
python scripts/reset_test_db.py     # clear it afterwards
```

It creates a firm, so it must run against a database with none — and onboarding
refuses a second firm by design. It walks a client from prospect to active, runs the
cron jobs, then asserts on all 144 checks: every API endpoint each screen uses, the
document download, invoice numbering and GST, the client-facing invoice link, the
dashboard's own aggregates, and that every page renders.

`scripts/dump_api.py` prints the whole API surface — paths, query parameters,
request bodies and every enum — from the live OpenAPI document. Useful when adding a
screen, since guessing a parameter name is the usual way to waste an afternoon:

```bash
python scripts/dump_api.py            # everything
python scripts/dump_api.py clients    # just the client surface
```


## Repository layout

```
Ca_software/
├── vercel.json              # Services, rewrites and Cron schedules
├── backend/
│   ├── main.py              # Vercel entrypoint (exports `app`)
│   ├── app/
│   │   ├── core/            # config, db, security, rbac, audit, validation, clock
│   │   ├── models/          # SQLAlchemy models — 53 tables
│   │   ├── schemas/         # Pydantic request/response contracts
│   │   ├── routers/         # auth, clients, tasks, compliance, documents, notifications, reports, cron
│   │   ├── services/        # compliance engine, workflow, generator, progress
│   │   ├── integrations/    # object storage (local filesystem / Vercel Blob)
│   │   └── main.py          # application factory
│   ├── alembic/versions/    # migrations
│   ├── scripts/             # check_schema.py, reset_test_db.py and other utilities
│   └── tests/               # 199 tests
├── frontend/                # Next.js 16 App Router
│   ├── next.config.ts       # /api proxy for development (see Quick start)
│   └── src/
│       ├── app/
│       │   ├── login/       # sign in, and first-run firm setup
│       │   └── (app)/       # authenticated shell: nav, notification bell
│       │       ├── dashboard/
│       │       ├── clients/          # list, /new intake form, [clientId] work centre
│       │       ├── services/         # catalogue, [serviceId] fees + checklist + who buys it
│       │       ├── tasks/            # list, /new, /generate, [taskId] detail + assignment
│       │       ├── team/             # the roster, roles, and each person's load
│       │       ├── calendar/         # compliance calendar
│       │       ├── documents/        # repository, upload, missing documents
│       │       ├── integrations/     # Winman/Tally import, export, errors, connections
│       │       └── reports/
│       ├── components/      # NotificationBell, ClientActions, AssignPanel, form fields, ui
│       └── lib/             # api client, session, users, types, hooks, formatting, status
└── docs/                    # ARCHITECTURE, DATABASE, PERMISSIONS, DEPLOY, ROADMAP
```

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, key decisions, and why |
| [docs/DATABASE.md](docs/DATABASE.md) | Tables, relationships, invariants |
| [docs/PERMISSIONS.md](docs/PERMISSIONS.md) | Roles, permission matrix, separation of duties |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel, Neon, Blob, Cron — including the constraints |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is built, what is next, what is deliberately deferred |

