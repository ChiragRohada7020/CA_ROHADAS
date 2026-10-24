# Roadmap

## Built and tested

### Phase 1 — Foundation
- Authentication: onboarding, login, rotating refresh tokens, httpOnly cookies,
  realm-scoped JWT (`staff` vs `client`)
- Organisation: tenants, branches, users, roles, permissions, teams
- 72 granular permissions, 8 seeded roles, data scoping
- Client master: person / legal entity / relationship split, multi-GSTIN,
  contacts, KYC status, risk classification, reason-required status changes
- Service catalogue (12 seeded services), financial years, engagements
- Identifier validation for PAN, TAN, CIN, LLPIN, GSTIN, IFSC, PIN, mobile
- Append-only activity and access logs

### Phase 2 — Work management
- 14-state task workflow as a data-driven state machine
- Separation of duties at permission, role and database-constraint level
- Completion guards (mandatory steps, filing record, required approval)
- Task templates with checklists, dependencies, comments, work logs
- Assignments with full reassignment history
- Recurring generation: idempotent, applicability-aware, dry-run capable
- Compliance rules: effective-dated, versioned, never hardcoding a date
- Deadline overrides with mandatory reasons and preserved originals
- Filing records and acknowledgements
- Firm dashboard, effort-weighted workload, at-risk clients, service turnaround,
  weekly change
- 4 authenticated, idempotent Vercel Cron jobs
- 314 tests; two reversible Alembic migrations
- Next.js 16 frontend: 18 routes covering every internal screen
- `scripts/smoke_frontend.py`: 106 end-to-end checks through the frontend's proxy
- `scripts/dump_api.py`, `scripts/db_status.py`, `scripts/check_running.py`
- `start-dev.ps1` / `stop-dev.ps1` at the repository root

---

## Next, in order

### Phase 3 — Documents, notifications and the client portal

**Done:**

1. ✅ `app/integrations/blob.py` — local filesystem in development, Vercel Blob in
   production, behind one interface. The Vercel wrapper is tested against an injected
   fake SDK, since no live Blob token is available in tests.
2. ✅ Upload, with two paths because a Vercel Function body is capped at 4.5 MB and
   the Python SDK cannot sign a client upload: ≤ 4 MB through the API, larger files
   direct to storage then registered via `confirm-upload` (which verifies the blob
   exists before writing metadata).
3. ✅ Append-only versions with SHA-256 dedup, audited proxied downloads, links, and
   the document request manager with the missing-documents report.
4. ✅ Notification API (`/notifications`, unread count, mark read, read-all) and the
   bell that consumes it. Previously the crons queued in-app notifications, the
   outbox stamped them `sent`, and **nothing could display them** — a delivery no
   human could observe.
5. ✅ Every internal screen: dashboard, clients, client work centre, task list with
   the personal queue, task detail with workflow transitions driven by the API's own
   `available_transitions`, compliance calendar, documents, reports.
6. ✅ **Client intake** — add a client, add registrations / contacts / services,
   change status, and generate the year's work with a dry run that reports *why* each
   template was skipped.
7. ✅ **Staff directory** (`/users`, `/branches`) — read-only, and the thing every
   "assign this to…" picker needs.
8. ✅ **Responsibility** — assign and reassign with retained history, names instead of
   anonymous ids on assignments, comments and status history, an assignee column and
   a filter-by-person on the task list, partner and manager on the client, and a
   `/team` page showing each person's effort-weighted load.
9. ✅ Fixed two assignment bugs found while building it (see `tests/test_assignment.py`):
   an omitted role silently cleared the holder, and a user from another firm could be
   assigned.
10. ✅ **Service management** — define service lines, set fees and billing methods,
    build each service's checklist, and see which clients have bought it. The
    `service.manage` permission and the `default_fee_model` / `standard_fee` columns
    had existed since the first migration with nothing able to use them; `ServiceCreate`
    was dead code. All four are now live (see `tests/test_services.py`).
11. ✅ Made the end-to-end smoke test **refuse to run** unless the server it reached
    reports `environment=test` and a database name ending in `_test`. Twice, a launch
    failed to bind a port and an older server kept answering — the second time that
    would have written a test firm into the development database. `stop-dev.ps1` now
    also kills the orphaned uvicorn children that hold the socket, and waits to confirm
    the ports are actually free instead of assuming.

**Remaining:**

12. The >4 MB upload path needs its browser half: a Next.js route calling
    `handleUpload()` from `@vercel/blob/client`. Until then only the ≤ 4 MB path is
    usable end to end — the documents screen says so rather than failing obscurely.
13. ✅ **Notification delivery.** `EMAIL` over SMTP (standard library) and `WHATSAPP`
    via a generic HTTP gateway, driven from the existing outbox. A channel with no
    provider configured reports a failure and stays queued with a reason instead of
    being marked sent. `GET /cron/delivery-status` exposes what is configured and what
    is stuck. **Still needs provider credentials to actually leave the building** —
    setting `SMTP_*` or `WHATSAPP_*` is the whole remaining step.
14. ✅ **Reminders chase the client.** The `document-reminders` job used to notify only
    the staff member who raised the request — it reminded the accountant to chase
    rather than chasing. It now addresses the client's primary contact on email and
    WhatsApp (kept for the staff owner), and reports `skipped_no_contact` rather than
    doing nothing silently. This needed a migration: the `notifications` single-recipient
    check allowed only `user_id` or `client_portal_user_id`, so a contact-addressed
    notification was impossible. It is now exactly-one-of-three.
15. Client portal: login, requested documents, permitted task statuses, invoices.
    *The invoice half is partly served already: a client can open an invoice from the
    share link with no login. What the portal adds is the list, the history and the
    other permitted statuses.*
16. ✅ **Winman and Tally integration.** Both are desktop products with no API this
    application can call, so the integration is **file-based and says so** — the
    provider catalogue states the mechanism and the limitations rather than implying a
    live link. Client master data imports from a CSV or TSV export (vendor headers
    matched by alias, or mapped explicitly), exports back in the same shape, and every
    rejected row is stored with its row number, field and reason. `integration.view` /
    `integration.manage` / `integration.import` and the `integration_connections` and
    `import_jobs` tables had all existed since the first migration with nothing behind
    them. Tally XML masters are not parsed yet.
17. ✅ **Filing acknowledgements are readable.** `FilingRecord` and `Acknowledgement`
    existed, and could be *created*, but there was no way to read one back — an ARN
    could be recorded and never seen again. `GET /compliance/filings` and a filing panel
    on the task now close that, and recording a filing advances the task's filing axis
    to `filed` or `acknowledged`.

18. ✅ **Reports and MIS.** Three gaps closed: **productivity** (complexity-weighted
    throughput beside logged effort — `TaskWorkLog` had been dead schema, so there was
    no honest basis for it), **bottlenecks** (`TaskAgingRow` and `RecurrenceDelayRow`
    had been dead schemas; aging now shows where work is sitting and dwell shows which
    stage is slow), and **client-wise service status** (a row per client *and* service,
    because "24 open tasks" is not actionable). Work-log entry is on the task.
19. ✅ **Three workflow bugs found while building the above.** They had been present
    since the first migration and all three were user-visible:
    - `available_transitions` returned the canonical graph, ignoring the caller's roles
      and permissions. On a fresh task, **all three** advertised moves were refused
      with a 409 — the task screen rendered buttons that could not work.
    - `MANAGER` and `PARTNER` could never be held as task roles: `Task` has no manager
      or partner column, and `_actor_roles` derived only the four task-level roles. So
      every rule guarded by `_ASSIGNER` was unsatisfiable — including *every*
      transition into `cancelled`, meaning **no user could cancel any task**.
    - The completion guard applied to `cancelled`, so a task could not be cancelled
      until all its mandatory steps were complete — exactly backwards.

**Remaining:**

20. ✅ **Billing and receivables.** Invoices, GST, receipts and the outstanding balance.
    `fee.view` / `fee.manage` / `invoice.create` / `invoice.approve` / `payment.record` /
    `receivable.view` had existed since the first migration with nothing behind them —
    there was no invoice, payment or fee table at all — so this needed new schema, not
    just endpoints. The scoping decisions it settles:
    - **What the firm bills:** a service's `standard_fee` or an engagement's
      `fee_amount`, with hourly engagements billed from logged `TaskWorkLog` hours. A
      task with neither is *not* billed at a guessed price — it is returned under
      `unbillable` with the reason. Retainer engagements are excluded from per-task
      billing, because a retainer is billed on its own cycle and charging per task as
      well would bill the same month twice.
    - **GST on fees:** yes, at the firm's configured rate (18% default), split by place
      of supply. Intra-state computes the tax **once and then splits it** (CGST = tax÷2,
      SGST = tax−CGST) rather than computing each head independently — the obvious
      version is a paisa short on roughly one invoice in twenty, and
      `test_intra_state_heads_sum_exactly_to_tax` is that exact case.
    - **Tally still owns the ledger:** there is no journal, no double entry and no trial
      balance. This is a receivables view, deliberately.
    - **SAC codes** default to 9982 and are settable per service, on the invoice line.
21. ✅ **Invoice numbering, and four bugs found while building it.** Numbers are
    allocated on **issue**, under a row lock on the firm, so an abandoned draft leaves no
    gap in a GST-consecutive series and two simultaneous issues cannot collide. Found and
    fixed:
    - Replacing an invoice's lines violated `uq_invoice_lines_invoice_id_sequence`:
      SQLAlchemy emitted the inserts before the deletes, so a new line 1 collided with
      the old line 1. The delete is now flushed first.
    - `compute_invoice` built its total from `taxable_total`, which silently dropped
      non-taxable lines (a reimbursement) out of what the client owed.
    - The "place of supply was assumed" warning was computed at creation but lost on
      read, because only the resulting tax type is stored. Callers that have just
      computed the tax now pass their reason through, so the warning is visible while the
      invoice is still a draft and the client's state can still be filled in.
    - `ServiceRead`/`ServiceCreate`/`ServiceUpdate` did not expose `sac_code`, so the
      column was settable only by direct database access.

22. ✅ **The dashboard, and the aggregates behind it.** The home screen was rebuilt as a
    partner's working overview: trended headline figures, a compliance ring per service
    category, the work pipeline, the client portfolio, a financial overview, workload and
    an activity feed. None of it is decoration — each panel needed a figure the API did
    not previously compute, so `GET /reports/dashboard` gained five aggregates:
    - **Trends.** Computed as *point-in-time* counts rather than stored snapshots: a task
      was overdue a week ago if its due date had passed by then and it had not been closed
      by then. That makes the comparison honest without a history table, and it stays
      consistent with the tasks as they are now rather than depending on whether a nightly
      job ran. **Two of the five cards deliberately have no trend** — nothing recorded
      their value last week, and an invented arrow is worse than no arrow because it looks
      like information. They are absent from the schema, not sent as zero.
    - **Compliance by service category.** Joined through `Service.category`, so work
      follows a service that gets re-categorised. `in_progress` is derived as the
      *remainder* rather than counted in a second pass, which is what guarantees the four
      buckets always sum to the total — a ring chart whose segments do not add up to the
      figure in its centre is a broken chart. Work with no service falls into "Other"
      rather than being dropped.
    - **The pipeline.** The 14 workflow statuses grouped into the six stages a partner
      thinks in. The grouping lives in the API, not the frontend, so a screen cannot
      invent a seventh stage no task can ever occupy. `cancelled` is excluded: cancelled
      work is not in the pipeline, and including it would make the stages add up to more
      than the open work.
    - **Portfolio and financials.** The financial panel answers two different questions
      from two different windows: *invoiced and collected* for a period, but *outstanding
      and overdue* as at today across every period — because last quarter's unpaid invoice
      is exactly the one that needs chasing, and a "this month" window would hide it.
    - **Unbilled work reuses `billing_work`**, the module `POST /invoices/generate` uses to
      decide what to propose. The rules were extracted from the billing router into
      `app/services/billing_work.py` precisely so the dashboard's number and the generate
      screen's proposal cannot disagree — and `test_unbilled_matches_what_generate_would_propose`
      asserts they are equal.
    Also added: a `/receivables` screen (moving the ageing report off `/reports`, so the
    same report does not exist in two places), a chart/`IconChip`/`Avatar` component built
    on hand-written SVG rather than a charting dependency, and a sidebar + top bar shell
    that reads the firm's own record for its name and the firm's own `financial_years` for
    the year label.

**Remaining:**

23. **Global search.** The top bar shows it, disabled and labelled `next`, matching the
    sidebar's convention — there is no cross-entity search endpoint behind it.
24. Credit notes. An overpayment is currently refused rather than absorbed, and a paid
    invoice cannot be cancelled — the correction for both is a credit note, which does
    not exist yet.
23. Payment allocation across invoices. A receipt is recorded against exactly one
    invoice; a firm that receives one payment covering several has to enter it more than
    once.
24. Invoice PDFs as attachments. The invoice is a print-optimised page and the send
    carries a no-login link, but a server-rendered PDF would let the email carry the
    document itself.
25. External share links (`document_shares`). The table, the hashed-token scheme and
    the schemas exist; the endpoints do not.
26. The remaining write endpoints with no screen: document accept/reject, deadline
    override, compliance rules, user invitation (`user.manage`), change password.
23. Editing a client (`PATCH /clients/{id}`) — the schema exists but no endpoint, so a
    record can be created and never corrected. A client's services can be attached but
    not detached.
24. **Browser verification is still the missing layer — but a real browser has now run
    this.** Pages return 200 and the build proves every component executes during SSR,
    but a post-hydration runtime error would survive all of it; every bug across these
    sessions came from reading code or from the smoke test, never from a rendered page.
    The first console output from an actual browser (during the billing work) produced
    exactly two findings, and both are now fixed:
    - A hydration mismatch on `<body>`, caused by a **browser extension** (the ClickUp
      extension injects `class="clickup-chrome-ext_installed"` before React hydrates).
      Nothing in this application touches the DOM root — verified by grepping for
      `document.body` / `classList` / `createPortal`, and by `layout.tsx` having a bare
      `<body>`. `suppressHydrationWarning` is now set on `<html>` and `<body>` only.
      React scopes that to the element's own attributes, one level deep, so a genuine
      mismatch anywhere in this application's tree still fails loudly.
    - `/favicon.ico` returned 404, because there was no icon and no `public/` directory,
      so the browser fell back to it. `src/app/icon.svg` now exists and Next emits the
      `<link rel="icon">`; the browser no longer requests `/favicon.ico` at all.
    Playwright remains the real gap: it is the only way to catch a post-hydration error
    in this application's own components rather than in an extension's.

Portal rules to preserve: clients never see internal comments (enforced by
`task_comments.visibility`), never see other clients' records (enforced by the
portal principal carrying exactly one `client_id`), and never see internal staff
discussion.

### Phase 4 — Practice operations
- **Fees and billing:** fee agreements, invoices, receipts, allocations,
  receivables ageing, collection reminders. The blueprint is explicit that Tally
  owns the ledger, so this must be scoped to *what the firm bills* and must define
  which system owns each financial record.
  *Partially done (see 20–21): invoices, GST, receipts, ageing and collection links
  exist. Still missing: fee agreements as documents, payment allocation across
  invoices, and credit notes.*
- **Staff management:** leave and availability, capacity planning for filing
  peaks, escalations.
- **Reports:** profitability per engagement, collection performance, trend views.

### Phase 5 — CA workflows and integrations
- **Audit engagements:** acceptance and continuance, planning, risk assessment,
  programmes, workpaper index, materiality, findings and management responses,
  partner sign-off, archival.
- **Notices, appeals and litigation.**
- **ROC and corporate compliance:** registers, board meetings, resolutions,
  director KYC, MCA form status.
- **Tally integration:** begin with controlled file imports (ledger, trial
  balance) and reconciliation status, because no public API is assumed. Record the
  import date, source and reconciliation result, and detect stale imports.
- **Winman integration:** link clients and periods to Winman work, track
  preparation/review/filing status, store permitted outputs and acknowledgements.

> **Research required before Phase 5.** Which APIs, exports, automation mechanisms
> and licensing permissions Tally and Winman actually support has **not** been
> verified. The blueprint's own instruction applies: verify first, and if direct
> integration is unavailable, use controlled file imports plus manual status
> confirmation.

### Phase 6 — AI and advanced automation
Only after the records and workflows are reliable. The blueprint's constraint is
the design constraint: **human confirmation for consequential actions**. AI must
not file returns, change finalized accounting data, or send legally significant
communication without authorisation.

Candidates, in increasing order of risk: summarise a client's status; draft
reminders; classify uploaded documents; flag incomplete checklists; identify
potential duplicates and reconciliation exceptions; summarise notices and draft
responses *for CA review*; recommend assignments from workload and skills.

---

## Deliberately deferred

These are not oversights:

| Deferred | Why |
|---|---|
| Aadhaar storage | Legally restricted; no lawful need for it here |
| Claiming an identifier is "verified" | No authorised verification service integrated |
| Hardcoded statutory due dates | They change; every seeded rule ships `deadline_verified = false` |
| In-process schedulers | Vercel has no always-on worker |
| Local OCR | Does not fit the 500 MB bundle limit |
| Storing files in PostgreSQL | Object storage is the correct home |
| Automatic client-record merging | Two people can share a name; a human decides |

## Known gaps in what is built

Stated so nobody is surprised:

1. **Turnover is not captured**, so a compliance rule with a turnover threshold
   correctly reports "turnover not recorded" rather than guessing. Adding a
   turnover field per client per financial year would close this.
2. **Working-day calendars are per-request, not per-branch.** `WorkingCalendar`
   supports firm holidays and working Saturdays, but there is no
   `branch_holidays` table yet.
3. **Escalation is modelled but not automated.** `tasks.escalation_level` exists;
   nothing increments it yet.
4. **No virus scanning** on uploads.
5. **`access_logs` is written for documents only** so far; it should also cover
   client profile and financial reads.

## Known risks

1. **`TaskDetailDrawer.tsx` latent corruption risk:** dev-time Turbopack hot-reloading
   can append duplicate function definitions to this file if a `next build`/`tsc` process
   is still running when files are modified. The duplication does not block `next build`
   but will surface as a "duplicate declaration" error during dev HMR. **Mitigation:**
   always kill all `node`/`npm`/`tsc` processes before doing `git checkout` or file
   modifications.
