# Deployment

Target: **Vercel Services** (Next.js frontend + FastAPI backend in one project),
**Neon** Postgres, **Vercel Blob** for documents, **Vercel Cron** for scheduling.

Every constraint below was verified against Vercel's live documentation. They are
not preferences — they are the platform, and the design bends around them.

---

## 1. The constraints that shape everything

| Constraint | Consequence for this codebase |
|---|---|
| **Cron always fires in UTC.** IST is UTC+5:30, so 09:00 IST is `30 3 * * *`. | All schedules in `vercel.json` are written in UTC. Every "today" calculation goes through `today_local()`, never `date.today()`. |
| **Hobby cron runs once per day only**, and expressions like `*/30 * * * *` *fail the deployment*. Pro allows once per minute. | Every cron job is **idempotent and catch-up capable**: it processes everything currently due, regardless of when it last ran. A daily run is therefore *correct*, just less prompt. Timely deadline alerts need Pro. |
| **No persistent filesystem, no always-on worker.** | No in-process scheduler (the `setInterval` pattern used in the sibling TypeScript project cannot work here). Scheduling is HTTP endpoints triggered by Cron. Uploads go straight to object storage. |
| **Function duration is 300 s by default** (Pro up to 800 s, 30 min in beta). | Bulk imports and OCR must be chunked or queued rather than run in one request. |
| **Python bundle limit is 500 MB.** | Local OCR (Tesseract/poppler) will not fit. Use a managed OCR API, and lazy-import heavy libraries. |
| **Graceful shutdown is capped at 500 ms after SIGTERM.** | Never rely on pool teardown or in-flight cleanup at shutdown. |
| **Neon scales to zero.** | `pool_pre_ping=True` and `pool_recycle` are set, because a pooled connection handed to a cold function may already be dead. |
| **FastAPI compiles to a single Vercel Function.** | Configured via `functions: { "main.py": { ... } }` in `vercel.json`. |
| **Fluid compute shares one instance across concurrent invocations.** | A small connection pool is genuinely reused rather than created per request. |
| **Cron jobs must be authenticated.** | Every `/api/cron/*` endpoint requires `Authorization: Bearer $CRON_SECRET`. |

### Region

Functions are pinned to **`bom1` (Mumbai, India)** — confirmed present in Vercel's
19-region list. Put the Neon database in the closest available region; Vercel's
own guidance is to run functions in the same region as the database.

---

## 2. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Use the **pooled** Neon connection string. |
| `JWT_SECRET` | yes | ≥32 random characters. The app **refuses to start** in production with the default. |
| `CRON_SECRET` | yes | ≥16 random characters. Same refusal. |
| `ENVIRONMENT` | yes | `production` on Vercel. |
| `CORS_ORIGINS` | yes | The frontend origin. |
| `BLOB_READ_WRITE_TOKEN` | if `STORAGE_BACKEND=vercel_blob` | Injected by the Blob integration. |
| `STORAGE_BACKEND` | yes | `vercel_blob` in production, `local` in development. |

Generate secrets with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`backend/main.py` calls `settings.assert_production_ready()` at import time, so a
misconfigured production deployment fails loudly on the first request instead of
quietly signing tokens with a development key.

---

## 3. First deployment

```bash
# 1. Create the database (Neon, via the Vercel Marketplace integration).
#    Choose the region closest to bom1.

# 2. Apply migrations. NEVER from the application — see below.
cd backend
DATABASE_URL="<neon pooled url>" python -m alembic upgrade head

# 3. Deploy.
vercel deploy --prod
```

### Why migrations never run at startup

A Vercel function can be cold-started many times concurrently. Running DDL from a
startup hook would race with itself and could leave the schema half-applied.
Migrations are a deployment step, run from CI or a developer machine:

```yaml
# .github/workflows/deploy.yml (sketch)
- run: pip install -r backend/requirements.txt
- run: cd backend && alembic upgrade head
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
- run: vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}
```

### Verifying a deployment

```bash
curl https://<your-app>/api/health          # liveness
curl https://<your-app>/api/health/db       # database connectivity
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/health
```

`/api/health` deliberately does **not** touch the database: a health check that
fails during a brief database blip tells you nothing new and makes the probe
itself a source of noise.

---

## 4. Cron schedule

| Path | Schedule (UTC) | IST | What it does |
|---|---|---|---|
| `/api/cron/compliance-autolist` | `30 3 * * *` | 09:00 | Generate the year's recurring work for every active firm |
| `/api/cron/deadline-alerts` | `0 4 * * *` | 09:30 | Queue alerts for tasks due within 7 days |
| `/api/cron/document-reminders` | `30 4 * * *` | 10:00 | Queue reminders for overdue document requests |
| `/api/cron/notification-outbox` | `0 5 * * *` | 10:30 | Deliver queued in-app notifications |

All four are safe to run repeatedly. `compliance-autolist` is deduplicated on
`(template, client, period)` by a partial unique index, so a second run the same
day creates nothing — which is exactly what makes a once-a-day Hobby schedule
acceptable rather than lossy.

**Do not** add a sub-daily cron expression on a Hobby plan: the deployment will
fail with *"Hobby accounts are limited to daily cron jobs."*

---

## 5. Document storage

Files go to **Vercel Blob**; only metadata lives in PostgreSQL. Two platform limits
shape the upload flow, and both were verified against Vercel's documentation rather
than assumed:

* **A Vercel Function request body is capped at 4.5 MB.** Beyond that the platform
  returns `413 FUNCTION_PAYLOAD_TOO_LARGE`, so a scanned audit file cannot be POSTed
  through the API.
* **The Python Blob SDK cannot mint a client-upload token.** Direct browser uploads
  use `handleUpload()` from the JavaScript `@vercel/blob/client` package in a Next.js
  route handler. The Python SDK also does not support Vercel Signed URLs.

So there are two paths, and the API offers both:

**Small files (≤ 4 MB) — one step**

```
POST /api/documents/upload          (multipart; streams straight to Blob)
```

**Large files — three steps**

```
POST /api/documents/upload-target   -> { blob_pathname, upload_via: "client_sdk" }
                                        (writes nothing; mints a path only)
       <browser uploads to that pathname via the JS SDK>
POST /api/documents/confirm-upload  -> creates documents + document_versions rows
```

`upload-target` deliberately writes **no** database row. `documents.version_count` is
checked at `>= 1`, so a document cannot exist before its first version — pre-creating
one would leave a dangling document every time an upload was abandoned.

`confirm-upload` **verifies the blob exists** with `head_blob` and cross-checks its
size before creating any metadata. Without that check a caller could assert the
existence of a file that was never uploaded, and the firm would later discover an
empty document.

**Downloads are always proxied through the API**, never handed out as direct storage
URLs. Private blobs cannot be signed from Python, and routing the read through the
API is what produces the audit trail: every download is written to
`document_access_logs` (granted or denied), with the actor, IP and user agent.

`document_versions` is append-only: a replacement creates version *N+1*. That is what
makes version history real rather than decorative, and it means a corrected bank
statement does not break the task or audit finding that referenced it. Re-uploading
byte-identical content is detected by SHA-256 and returns the existing version instead
of adding a duplicate, so a double-clicked submit does not inflate the history.

---

## 6. Known limitations on this platform

Stated plainly, because they are real:

1. **Hobby cannot do timely deadline alerts.** The single most valuable CA feature
   needs a sub-daily schedule. Use Pro.
2. **OCR cannot run in the function** (bundle size and duration). Use a managed
   OCR API; the schema already has `ocr_status`, `extracted_text` and `ocr_error`.
3. **Virus scanning is not implemented.** Add it as an async step before a
   document is marked `accepted`.
4. **Vercel Services is in beta.** If it misbehaves, the fallback is two separate
   Vercel projects (frontend and backend) with a rewrite between them.
5. **Email and WhatsApp are not wired.** Notifications are queued in the
   `notifications` table; `notification-outbox` marks in-app ones delivered and
   deliberately leaves the rest queued rather than reporting a delivery that did
   not happen.
6. **Data residency** depends on the Neon and Blob regions you choose. If the firm
   requires India-only storage, confirm both before going to production.

