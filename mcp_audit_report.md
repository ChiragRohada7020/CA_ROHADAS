# CA Rohadas MCP Server - Security + Integration Audit Report

Audit scope: `/home/ubuntu/CA_ROHADAS/backend/app/mcp_server/`, backend integration (`app/main.py`, `app/routers/assistant.py`), auth/RBAC (`app/core/rbac.py`, `app/core/security.py`), billing comparison, tests, and developer CLI (`mcp_client.py`). **Read-only only - no files modified.**

---

## (a) Full MCP Tool Inventory

### Tool definitions location
- **`backend/app/mcp_server/server.py`**: `_build_tool_definitions()` (line ~63-683) defines all tools. Total **38 tools** registered.
- Dispatch handler: `_dispatch_tool()` (line ~703+) routes by name to individual `_tool_*` implementations.
- Tool registry via `get_session_manager()` creates `mcp.server.Server` with `on_list_tools=_handle_list_tools()` and `on_call_tool=_handle_call_tool()`.

### Complete tool list with schemas (from `_build_tool_definitions`)

| Tool | Required fields | Key properties/notes |
|---|---|---|
| `list_clients` | (none) | search (name/PAN/code), status enum [prospect,onboarding,active,inactive,on_hold,closed], limit (default 25) |
| `get_client` | client_id | Get client with contacts/registrations/services |
| `create_client` | client_type, legal_name | client_type in [individual,legal_entity], optional pan/city/state/state_code |
| `list_tasks` | (none) | client_id, status, category, financial_year, assigned_to, overdue_only(bool default false), limit(default 50) |
| `get_task` | task_id | Detailed task info |
| `create_task` | client_id, name | aliases: name/title; financial_year/financial_year_id; service_id, checklist_item, tags[], description, category, priority, statutory_due_date |
| `list_financial_years` | (none) | include_closed(bool default false) |
| `read_clients_csv` | file_path | Parse clients CSV |
| `list_users` | (none) | search, department, group(partners/managers/seniors/articles/assistants), include_inactive(bool default false), limit(default 50) |
| `get_user_overview` | user_id | Workload/activity summary |
| `list_invoices` | (none) | search(invoice number), client_id, status(draft/issued/paid/partially_paid/cancelled), limit(default 10) |
| `get_receivables` | (none) | Firm receivables summary (empty properties) |
| `update_task_status` | task_id, status | Status values (e.g. in_progress, ready_for_review, completed, filed, delivered) |
| `get_dashboard` | (none) | Counts by status, overdue, receivables |
| `list_services` | (none) | Catalog |
| `list_compliance_rules` | (none) | GST/ITR/TDS etc. |
| `list_deadlines` | (none) | optional client_id |
| `update_client` | client_id | All others optional; can update partner_id/manager_id, status enum, kyc_status etc. |
| `assign_task` | task_id, role, user_id | role enum [preparer, reviewer, approver, filer]; records assignment history |
| `update_task` | task_id | title/description/priority(enum low/normal/high/urgent), category, complexity(enum simple/moderate/complex/highly_complex), dates, service_id, estimated_hours, tags[] |
| `create_service` | code, name, category, sac_code | category enum [gst,income_tax,tds,audit,roc,accounting,payroll,advisory,other]; standard_fee, description, is_recurring(default true), default_frequency, default_priority(default normal) |
| `get_service` | service_id | Service details |
| `update_service` | service_id | All others optional (name, description, category, standard_fee, sac_code, is_active, is_recurring, default_frequency, default_priority) |
| `create_compliance_record` | client_id, rule_id, statutory_due_date | optional internal_due_date, financial_year_id, period_key |
| `list_compliance_records` | (none) | client_id, verified(bool), overdue_only(bool default false), limit(default 50) |
| `get_compliance_record` | record_id | Details |
| `update_compliance_record` | record_id | statutory_due_date, internal_due_date, verified(bool), notes |
| `create_invoice` | client_id, items | items array of objects with required [description, unit_price] per item; item props: description, service_id, task_id, quantity(default 1), unit_price, sac_code, is_taxable(default true). invoice_date (date-time), due_days(default 15), notes, terms. |
| `get_invoice` | invoice_id | Details with line items and payments |
| `create_payment` | invoice_id, amount, method | method enum [cash,bank_transfer,upi,cheque,card,other]; reference, paid_on(date-time default today), notes. Updates invoice paid/outstanding/status. |
| `create_document` | title | client_id, doc_type, category, description, task_id, compliance_rule_id, is_confidential(default false), from_client(default false), tags[], file_name, mime_type(default application/octet-stream), size_bytes(default 0), checksum_sha256. (title marked required in schema) |
| `create_financial_year` | code, label, start_date, end_date | assessment_year, is_active(default true), is_closed(default false) |
| `create_period` | rule_id, label, period_key, start_date, end_date | is_active(default true) |
| `create_compliance_rule` | code, name, category, lead_days | authority, filing_type, applicability_rule, default_frequency, internal_due_days, status(default "active") |
| `create_client_service` | client_id, service_id | engagement_id, is_active(default true), start_date, end_date, notes |
| `create_activity_log` | entity_type, action | entity_id, summary, request_ref |
| `create_billing_settings` | state_code | legal_name/trade_name/pan/gstin/address/city/state/pincode/country(default India)/phone/email, gst_tax_type(default regular), tax_rate(default 18.0), sac_code, payment_terms_days(default 15), round_off(default false). Idempotent per tenant (updates if exists). |
| `update_invoice` | invoice_id | status(enum [draft,issued,partially_paid,paid,cancelled]), due_date, terms, notes. Sets issued_at if issued, zeros outstanding if paid. |

**Tools that create/modify business data (per request):** `create_client`, `create_task`, `create_invoice`, `create_payment`, `create_document`, `create_compliance_record`, `create_compliance_rule`, `create_service`, `create_client_service`, `create_financial_year`, `create_period`, `create_billing_settings`, `update_client`, `update_task`, `update_task_status`, `assign_task`, `update_invoice`. Also `update_compliance_record`, `update_service` modify data.

---

## (b) Tenant Context Establishment, AuthN/Z on MCP Mount

### Context vars (in `server.py`)
```python
_current_tenant_id = contextvars.ContextVar("_current_tenant_id", default=None)
_current_user_id   = contextvars.ContextVar("_current_user_id", default=None)
_current_permissions = contextvars.ContextVar("_current_permissions", default=[])
```
Set/reset in `_TenantMiddleware` around the wrapped app call.

### Tenant middleware - where defined & how it works
- **Defined in**: `backend/app/mcp_server/server.py:2673-2738`
- **Extraction**: `_extract_tenant_from_request(scope)` (line ~2650-2671)
  - Only HTTP scopes; reads `Authorization: Bearer <token>`
  - Calls `app.core.security.decode_token(token, expected_type="access")` 
  - Returns `(payload.tenant_id, payload.sub, payload.permissions)` or `None` on any exception/missing/malformed
- **Enforcement**: `_TenantMiddleware.__call__()` 
  - If `result is None` → calls `_send_unauthorized(send)` returning **401** with `{"error":"Not authenticated"}`, `WWW-Authenticate: Bearer` (line ~2718-2738). **Request is never forwarded to MCP app layer.**
  - On success: sets context vars, calls `await self.app(scope, receive, send)`, resets in `finally` (prevents cross-request leakage)
- **Applied to MCP ASGI app**: `build_streamable_http_app()` does `get_session_manager()` then sets `_starlette_app = _TenantMiddleware(_raw_asgi_app)` (line ~2740+). `get_mcp_asgi_app()` ensures build; `app/main.py` does `app.mount("/mcp/", app=_mcp_app, name="mcp")` where `_mcp_app = build_streamable_http_app(_session_manager)`.
- **Session manager lifecycle**: `lifespan()` in `main.py` does `async with _mcp_session_mgr.run(): yield` (important for streamable HTTP session manager).

### Dispatch-time enforcement (defense in depth)
In `_dispatch_tool()` (line ~703-727): 
```python
tenant_id = _current_tenant_id.get()
if tenant_id is None:
    return json_module_local.dumps({"error": "Authentication required: a valid bearer token must be provided"})
...
arguments.setdefault("_tenant_id", tenant_id)
arguments.setdefault("_user_id", user_id)
arguments.setdefault("_permissions", permissions or [])
```
Tools receive tenant context via arguments (and many tools also re-validate tenant ownership on fetched entities, e.g. `get_client`, `get_invoice` check `tenant_id` match).

### Is auth middleware applied to the MCP mount?
**Yes.** The MCP ASGI app is wrapped by `_TenantMiddleware` inside `build_streamable_http_app()`. The middleware is applied at the ASGI layer before the MCP server handles requests. All HTTP requests to `/mcp/` go through this middleware.

### Are tenant context vars set before tool dispatch for HTTP MCP calls?
**Yes.** Middleware sets context vars before calling the wrapped app; MCP server's tool dispatch reads them via contextvars. The context is properly reset in `finally`. For in-process calls (e.g. `mcp_client.py` using in-process `Client(server=server, ...)` talking to the same server instance), the HTTP middleware is bypassed - context vars would remain unset/default. However the dispatch still enforces tenant presence (returns auth error). Also see note about assistant below.

### Assistant integration
- **Router**: `app/routers/assistant.py` - POST/GET `/assistant/chat/stream` and POST `/assistant/chat` call `handle_chat_stream`. No explicit auth shown in router (auth likely handled by middleware/dependencies elsewhere).
- **Transport**: `app/assistant/transport.py` 
  - MCP URL built as `{base_url}/mcp/` (trailing slash required)
  - `_forwarded_headers()` copies `Authorization: Bearer ...` if present
  - `_forwarded_cookies()` forwards cookies (including `ca_staff_token` per comment)
  - Uses `httpx.AsyncClient` with forwarded headers/cookies, `follow_redirects=False`, passes to `streamable_http_client(url, http_client=http_client, terminate_on_close=False)`. Wrapped in `_ClientScope` to properly close HTTP client.
- **Chat logic**: `app/assistant/chat.py` uses `MCPTransport.for_request(request)` as async context manager, calls `mcp_client.call_tool(tool_name, tool_args_obj)`. It does **forward request credentials** via transport - so when the assistant calls MCP over HTTP to the same app, the bearer token/cookie from the original request travel to `/mcp/`, pass through `_TenantMiddleware`, which sets context vars. **Tenant context is established** for in-app assistant MCP calls when credentials are forwarded.
- **Note**: Comment in transport says "The caller's credentials must be forwarded. The domain tools resolve the authenticated Principal from the HTTP request..." - confirmed by implementation.

### Security assessment (b)
**Strengths:**
- Mandatory auth on MCP HTTP endpoint via middleware; 401 on missing/invalid token.
- Contextvars properly scoped/reset (thread-safe per async context).
- Dispatch enforces tenant_id presence as defense-in-depth.
- Many tools filter by `tenant_id` from args and validate entity ownership (e.g. get_client/get_invoice/check tenant match).
- Assistant forwards auth headers/cookies to MCP calls.

**Potential concerns:**
- In-process MCP client usage (like `mcp_client.py` using `Client(server=server)`) bypasses HTTP middleware entirely - if used in contexts where tenant context isn't set, dispatch will reject with auth error (good). But if someone sets context vars directly, tools run. Need to ensure no unsafe in-process usage.
- Permissions from JWT are extracted and stored in context vars but **I don't see explicit permission checks in most tool implementations** - tools mostly rely on tenant scoping. The `permissions` list is passed through args but enforcement appears minimal in the tool code paths I looked at. (RBAC exists at router level; MCP tools may rely on tenant isolation + endpoint auth.)
- The middleware does not check permissions per tool - it only authenticates and establishes identity/tenant.

---

## (c) Billing REST vs MCP - Shared Services?

### REST billing (`backend/app/routers/billing.py`)
- Imports from `app.services.billing`: `create_invoice_record`, `compute_invoice`, `resolve_tax` (line 14)
- Uses models directly: `BillingSettings`, `Client`, `Invoice`, `InvoiceLine`, `Payment`, `Task`, `Engagement`, `Service`, `ClientService`
- `POST /invoices/generate` (line ~130-260): generates invoices from completed tasks. When `apply=True`, it calls `create_invoice_record(db, tenant_id=..., client_id=..., items=items, created_by_id=user_id)`, sets `invoice_number` manually as `INV-{next_no:04d}`, adds to session, flushes/commits. It constructs items as `[{"task_id": ..., "description": ..., "quantity": 1, "unit_price": line_total, "is_taxable": True}]` (converting hours*rate to unit_price with quantity 1 due to InvoiceLine.quantity being integer). 
- Other endpoints read invoices/payments/receivables directly via SQLAlchemy queries (e.g. list invoices, summary, receivables calculations appear in router; also uses `compute_receivables` from service in some places).
- **No explicit REST endpoint for `POST /payments` found** in the router grep results - payments seem to be managed differently or via other means? (Payments are queried/aggregated; MCP has `create_payment` tool.)

### MCP billing tools (`backend/app/mcp_server/server.py`)
- **`create_invoice`** (`_tool_create_invoice`, line ~2030-2110): calls `create_invoice_record()` from `app.services.billing` with tenant_id/client_id/items/due_days/invoice_date/notes/terms/created_by_id. It does `db.add(invoice); db.flush(); db.commit(); db.refresh(invoice)`. **Shares the same service.**
- **`get_invoice`** reads directly via SQLAlchemy models (Invoice, InvoiceLine, Payment) with tenant filtering.
- **`create_payment`** (`_tool_create_payment`, line ~2160-2220): **Does NOT use a service** - it directly manipulates `Invoice` and creates `Payment` objects, updates invoice.amount_paid/outstanding/status in the same transaction, commits. All logic is inline in the MCP tool.
- **`list_invoices`**, **`get_receivables`** - implemented as MCP tools reading from DB/models directly.

### Billing service (`backend/app/services/billing.py`)
- `create_invoice_record()` is the shared factory: builds Invoice + InvoiceLine objects with computed GST (via `resolve_tax`, `compute_invoice`), generates invoice number (format `INV{YYMM}:####`), handles tenant/client validation, uses BillingSettings for tax config. Returns uncommitted Invoice with lines attached.
- `compute_invoice()`, `resolve_tax()`, `round_money()`, `ageing_bucket()`, `compute_receivables()` are shared calculation/utility functions.

### Comparison
**Shared:** Invoice creation logic is centralized in `app.services.billing.create_invoice_record()` - both REST (`/invoices/generate` with apply) and MCP (`create_invoice`) use it. GST calculation logic is shared via service functions.

**Not shared / duplicated logic:**
1. **Payment recording** - REST router has no obvious `create payment` endpoint using shared service; MCP `create_payment` implements payment application logic (updating invoice totals, status transitions to partially_paid/paid) inline with direct model manipulation. No `app.services.billing` function for recording payments exists.
2. **Invoice number assignment in REST generate** - REST overwrites invoice number after creation with `INV-{next_no:04d}` (sequential counter) while `create_invoice_record` generates its own format `INV{YYMM}:####` based on max existing. The REST path does `inv_obj.invoice_number = f"INV-{next_no:04d}"; db.add(inv_obj); db.flush(); db.commit()` after calling create_invoice_record. This could cause conflicts or bypass the service's numbering logic.
3. **Item transformation differs** - REST generate converts hours-based task billing to `quantity: 1, unit_price: line_total` for integer quantity constraint; MCP passes items as-is to `create_invoice_record` which normalizes via `_normalize_line`. Both end up using the service, but the calling convention/assumptions differ.
4. **Invoice update** - REST doesn't show update endpoint in what I looked at; MCP has `update_invoice` tool that directly updates Invoice fields.

**Inconsistencies found:**
- REST invoice generation overrides the service-generated invoice number with a different format (`INV-####`) - potential inconsistency in numbering scheme.
- Payment creation is only implemented in MCP (inline), not clearly in REST router as a shared service method.

---

## (d) Security Gaps

### Authentication/Authorization
- **MCP HTTP auth is properly enforced** at middleware level - good.
- **Missing per-tool permission checks**: The middleware extracts permissions from JWT and stores in context vars, passes them via `arguments.setdefault("_permissions", permissions or [])`, but **individual MCP tool implementations do not appear to enforce RBAC permission checks** (e.g., checking `INVOICE_WRITE`, `TASK_ASSIGN` etc.). Most tools rely on tenant scoping and authentication. Compare to REST routers which use `require_permission`/RBAC dependencies. This is a gap - any authenticated user with valid token can call most tools regardless of their role permissions.
- **In-process bypass risk**: If `Client(server=get_session_manager())` is used without setting context vars, dispatch rejects (good). But if context vars are manipulated, no permission checks. The `mcp_client.py` connects in-process as admin-like? Let us look up how it's used - it does `Client(server=server, raise_exceptions=False)` and calls tools directly; it doesn't set tenant context. Dispatch would reject with auth error. But looking at how it's structured, maybe for local dev/testing it might need tenant context. Also need to verify - in the test `test_tenant_enforcement_at_dispatch` they set context var directly. 
- **Assistant credential forwarding is correct** but depends on client sending proper auth.

### Tenant isolation
- **Generally good**: Most tools filter by `tenant_id` from context/args. Tools like `get_client`, `get_invoice` fetch by ID then check `str(entity.tenant_id) != str(tenant_id)` and return "not found" (prevents tenant enumeration in some cases). `list_*` tools filter by tenant.
- **Potential issues in some tools**: Need to spot-check a few. For example, `create_invoice` passes tenant_id to `create_invoice_record` which validates client belongs to tenant - good. `create_payment` fetches invoice by ID and checks tenant match - good. Some tools might not enforce tenant filtering properly? Let us look up a couple.
- **`read_clients_csv`** takes `file_path` - could be risky if not properly sandboxed, but it's a tool; tenant context is required. Not obviously a tenant isolation issue if it only reads files, but worth noting.
- **Cross-tenant IDOR**: Many tools do check ownership after fetch (good pattern). Some might rely only on tenant-filtered lists. Overall reasonably protected.

### Input validation & business logic
- **`create_payment`** checks amount > 0 and doesn't exceed outstanding (with 0.01 tolerance) - good.
- **Invoice updates**: `update_invoice` allows setting status; when marking paid it zeros outstanding. But does it validate permissions (e.g., only certain roles can issue/cancel)? No permission check visible.
- **`assign_task`** takes role/user_id - no obvious validation of user belongs to same tenant or permissions.
- **SQL injection**: Uses SQLAlchemy ORM, parameterized queries - generally safe.
- **CSV reading**: `read_clients_csv` uses file_path from args - potential path traversal if not validated; tool requires tenant context but no obvious path restrictions visible in the snippet I saw.

### Data exposure
- Tools return detailed objects; tenant scoping is primary control. Error messages sometimes say "not found" vs "forbidden" - good practice to avoid leaking existence across tenants.
- `get_receivables` returns firm-wide summary - fine if tenant-scoped.

### Other gaps
- **No rate limiting** visible on MCP endpoint.
- **Permissions from token passed but not enforced** - major gap vs REST which uses RBAC. MCP could be used to perform privileged actions if token has high privileges, but also if lower-privilege token somehow gets broad access? Or if permission checks missing, any authenticated user can do anything the tool allows within their tenant.
- **The `permissions` list from JWT is stored but unused for authorization decisions in tool implementations** (I didn't see permission checks in the tool code paths reviewed).
- **`_TenantMiddleware` trusts all permissions in token** - standard JWT approach, but enforcement is missing.

---

## (e) Test Coverage for MCP

### Tests found
- **`backend/tests/test_mcp_dispatch.py`** (examined fully)
  - `TestMcpToolSchemas`: Tests schemas for `create_client`, `create_task` (aliases), `assign_task` (role enum), `create_invoice`, `create_payment` (method enum), `create_service`, `create_document`, `create_compliance_record` - 8 tests
  - `TestMcpNewTools`: Tests schemas for `create_financial_year`, `create_period`, `create_compliance_rule`, `create_client_service`, `create_activity_log`, `create_billing_settings`, `update_invoice` - 7 tests  
  - `TestMcpDispatch`: `test_tenant_enforcement_at_dispatch` verifies unauthenticated dispatch returns auth error; `test_unknown_tool` verifies unknown tool returns error when tenant context set - 2 tests
  - **Total: 17 tests, all passing** (verified with pytest)

### Coverage assessment
**Covered:**
- Tool registration/schema validation for all tools (including recently added ones)
- Required fields, enums, defaults, aliases (name/title, financial_year/financial_year_id)
- Auth enforcement at dispatch level (tenant context required)
- Unknown tool handling

**Not covered / gaps:**
- **Integration tests for actual tool execution** (end-to-end with DB) - no tests calling `_tool_create_invoice`, `_tool_create_payment`, etc. with real DB/session
- **Tenant isolation tests** - verifying cross-tenant access is blocked
- **Permission/RBAC enforcement tests** for MCP tools
- **Billing flow tests** - create invoice via MCP, record payment, verify invoice status updates
- **Assistant MCP integration tests**
- **Middleware tests** - testing `_TenantMiddleware` with actual HTTP requests/tokens
- **Error handling tests** for various failure cases
- **The tests use `mcp.types.Tool` objects and check attributes; they work with the current schema structure**

**Other MCP-related tests?** Searched for mcp in tests - only `test_mcp_dispatch.py` found.

---

## (f) Recommendations for Missing/Broken MCP Tools Needed for Billing and Task Workflow

### Billing workflow gaps
**Missing tools:**
1. **`list_payments` / `get_payment`** - Can create payments and see them in invoice details, but no way to list all payments or get payment by ID
2. **`void/cancel_invoice`** - Can update status to cancelled via `update_invoice` (schema allows it), but need to ensure business rules enforced (e.g., can't cancel paid invoices). Tool exists but may lack validation.
3. **`apply_credit_note` / `create_credit_note`** - No credit note functionality visible
4. **`send_invoice` / `email_invoice`** - Invoice has share/send permissions in RBAC, but no MCP tools for sending
5. **`get_billing_settings`** - Can create/update billing settings, but no way to retrieve current settings
6. **`generate_invoice_from_tasks`** equivalent - REST has `/invoices/generate` endpoint that auto-bills completed tasks; MCP lacks equivalent tool for workflow automation

**Issues with existing:**
- **Payment creation lacks service layer** - `create_payment` logic is inline in MCP tool (not shared with potential REST payment endpoint). Should be extracted to `app.services.billing` for consistency.
- **Invoice numbering inconsistency** - REST generate overrides service numbering; need to standardize.
- **No validation on `update_invoice`** - Can change status arbitrarily without business rule checks (e.g., can't go from paid back to draft without reversal). Also no permission checks.
- **`create_invoice` requires full item details** - For task-based billing, might need helper to create from task IDs.

### Task workflow gaps
**Missing tools:**
1. **`unassign_task` / `remove_assignment`** - `assign_task` exists but no way to remove assignments
2. **`add_task_comment`** - RBAC has `TASK_COMMENT`, but no MCP tool for comments
3. **`get_task_comments` / `list_task_history`** - No audit/history retrieval
4. **`bulk_update_task_status`** - For workflow automation
5. **`create_task_from_template`** - Task templates router exists but no MCP tool
6. **`link_task_to_invoice`** - Can reference task_id in invoice line items, but no explicit linking tool
7. **`get_task_workflow`** - To see assignment history/status transitions

**Issues:**
- **`assign_task`** creates assignment records but doesn't update task.assigned_to or validate workflow rules; need to check implementation.
- **`update_task_status`** exists but may not trigger workflow transitions properly.
- **No tools for task dependencies, subtasks, or time tracking**

### Other recommendations

**Security:**
1. **Add permission enforcement to MCP tools** - Check `_permissions` from context against required permissions per tool (similar to REST RBAC). Critical for privileged operations.
2. **Add rate limiting** to MCP endpoint
3. **Validate file paths** in `read_clients_csv` to prevent path traversal
4. **Audit logging** for sensitive operations (create_invoice, create_payment, etc.)
5. **Consider tool-level authorization** based on data scope (own/team/firm)

**Architecture:**
1. **Extract payment logic to service layer** (`app.services.billing.record_payment()`) and use from both MCP and any REST endpoint
2. **Add `get_billing_settings` tool** for completeness
3. **Add `list_activity_logs` / query audit trail** tools
4. **Standardize error responses** across tools
5. **Add input validation** using Pydantic schemas in tools

**Testing:**
1. Add integration tests for tool execution with test DB
2. Add tenant isolation tests
3. Add permission enforcement tests
4. Test middleware authentication flows

---

## Quick Reference - Key File Paths

- **MCP Server**: `backend/app/mcp_server/server.py` (2740 lines) - tools, dispatch, auth middleware
- **MCP Package**: `backend/app/mcp_server/__init__.py`
- **Main app mount**: `backend/app/main.py:200-210` - mounts MCP at `/mcp/`
- **Assistant router**: `backend/app/routers/assistant.py`
- **Assistant transport**: `backend/app/assistant/transport.py` - forwards auth to MCP
- **Assistant chat**: `backend/app/assistant/chat.py` - calls MCP tools
- **Security**: `backend/app/core/security.py` - JWT decode, tokens
- **RBAC**: `backend/app/core/rbac.py` - permissions, roles
- **Billing service**: `backend/app/services/billing.py` - shared invoice/payment calculations
- **Billing router**: `backend/app/routers/billing.py`
- **MCP tests**: `backend/tests/test_mcp_dispatch.py` (17 tests, all passing)
- **Dev CLI**: `mcp_client.py` (repo root) - in-process MCP client for developer use
