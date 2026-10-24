# Invoice System — Technical Roadmap & Implementation Guide

## 1. Overview

This document is a blueprint for building a **Create Invoice** screen that replicates the
attached UI design: a split-pane form (left) with a live invoice preview (right), organised
into tabs, with full GST compliance, line-item editing, terms management, and bank details.

The project already has a mature invoice **backend** (`backend/app/routers/billing.py`,
`backend/app/services/billing.py`, `backend/app/schemas/billing.py`) and an invoice **list**
and **detail** page. What's missing is the **Create / Edit** form UI with a live preview.
This roadmap builds on the existing stack rather than introducing new pieces.

---

## 2. Recommended Tech Stack

### Frontend (already in place — extend it)
| Layer        | Choice          | Purpose                                  |
|-------------|-----------------|-----------------------------------------|
| Runtime     | **Next.js 14**  | App Router, SSR, file-based routing     |
| Language    | **TypeScript**  | Type safety (mirrors backend Pydantic)  |
| Framework   | **React 18**    | Component model                         |
| Styling     | **Tailwind CSS v4** | Design-system classes in `globals.css`|
| Data Fetch  | **TanStack Query** | Caching, invalidation, optimistic    |
| Forms       | **React Hook Form** + `zod` | Validation, field arrays          |
| Tables      | Native `<table>` + Tailwind | The codebase uses plain tables |
| Icons       | Custom `Icon` component (`components/Icon.tsx`) | Consistent icon set |

### Backend (already in place — extend it)
| Layer        | Choice          | Purpose                                  |
|-------------|-----------------|-----------------------------------------|
| Framework   | **FastAPI**     | Type-driven API, OpenAPI generation     |
| ORM         | **SQLAlchemy 2.0** | Database mapping                       |
| Validation  | **Pydantic v2** | Schema validation                        |
| DB          | **PostgreSQL**  | Relational data                         |
| Money/Tax   | Custom `billing.py` service | GST arithmetic, `Decimal` precision |

### Key existing conventions to follow
- `/api` proxy (Vite dev proxy → FastAPI in production)
- Cookie-based auth (`api.ts` sets `credentials: "include"`)
- `PageHeader` component for title + actions
- `Field`/`TextField`/`SelectField`/`CheckboxField` in `components/form.tsx`
- `Card` layout with `.card-header` / `.card-title` classes
- `api.get<T>()` / `api.post<T>()` typed wrappers in `lib/api.ts`
- Types in `lib/types.ts` — never invent a parallel shape

---

## 3. Frontend Component Architecture

### 3.1 Routing
Create a new route for the Create Invoice page:
```
frontend/src/app/(app)/invoices/new/page.tsx
```
This reuses the existing `(app)` layout (sidebar + top bar). The invoice list page
already has a "Create Invoice" button that toggles `NewInvoiceForm` inline — the
new route gives a dedicated full-page workflow with the live preview.

### 3.2 Component Tree

```
(invoices/new/page.tsx)                   ← page orchestrator: state + API
  |
  ├── <CreateInvoiceForm>                  ← the left-side form container
  │     │
  │     ├── <TabNavigation tabs={[
  │     │     "Invoice Details",
  │     │     "Items & Services",
  │     │     "GST & Totals",
  │     │     "Payment & Notes",
  │     │     "Additional Options"
  │     │   ]} />
  │     │
  │     ├── <InvoiceDetailsTab>
  │     │     ├── <ClientSelectFormField>   ← select + client card (avatar, name, GSTIN)
  │     │     ├── <AddressEditor>           ← modal / inline editor for billing address
  │     │     ├── <TaxInfoRow>              ← GSTIN, State, Place of Supply
  │     │     ├── <InvoiceMetaFields>       ← Invoice # (auto), Date, Due Date, FY, Type
  │     │     └── <FinancialYearSelect>
  │     │
  │     ├── <ItemsTab>
  │     │     ├── <LineItemTable>            ← editable table (columns from the screenshot)
  │     │     │     ├── <LineItemRow> × N   ← each row: desc, SAC, qty, rate, discount,
  │     │     │     │                          tax rate, amount, delete button
  │     │     │     └── <LineItemRow input>   ← "add new line" sticky row
  │     │     ├── <AddItemButton>
  │     │     └── <LoadTemplateButton>       ← open ServiceTemplatePicker modal
  │     │
  │     ├── <GstTotalsTab>
  │     │     ├── <TaxTypeSelector>         ← radio: intra-state (CGST+SGST) / inter-state (IGST)
  │     │     ├── <TaxRateField>            ← % rate, defaults to 18
  │     │     ├── <TaxBreakdownSummary>     ← readonly: taxable value, CGST, SGST, IGST, total
  │     │     └── <TaxNoteBanner>           ← explains why tax was computed this way
  │     │
  │     ├── <PaymentNotesTab>
  │     │     ├── <PaymentTermsField>       ← days or date-based
  │     │     ├── <TermsEditor>             ← textarea or simple RTE
  │     │     └── <NotesField>
  │     │
  │     ├── <AdditionalOptionsTab>
  │     │     ├── <BankDetailsFields>       ← Bank name, Account name, Account #, IFSC, UPI, Ref
  │     │     └── <EngagementSelectField>   ← link to a specific engagement
  │     │
  │     └── <FormActionBar>
  │           ├── <SaveDraftButton>
  │           ├── <PreviewButton>
  │           └── <SaveAndSendButton>
  │
  ├── <LiveInvoicePreview>             ← the right-side preview pane
  │     ├── <InvoicePreviewHeader>      ← firm letterhead (logo, name, address, GSTIN)
  │     ├── <InvoiceMetaBlock>          ← Invoice No, Date, Due Date, FY, Type
  │     ├── <BillToBlock>               ← client + place of supply
  │     ├── <InvoiceLineTable>          ← same columns as detail view but readonly
  │     ├── <TaxSummaryTable>           ← subtotal, discount, taxable, CGST, SGST/IGST, total
  │     ├── <AmountInWords>             ← "Rupees … only"
  │     ├── <TermsBlock>                ← terms & conditions text
  │     ├── <BankDetailsBlock>          ← rendered bank details
  │     ├── <SignatoryBlock>            ← "Authorised Signatory" + name/designation
  │     └── <PreviewActions>            ← Download PDF, Send to Client, More Actions (⋯)
  │
  └── <ServiceTemplatePicker>  ← modal: list saved line-item templates
  └── <AddressEditorModal>     ← modal: edit client billing address
  └── <GstComplianceBanner>    ← inline helper explaining tax rules

### 3.3 Component responsibilities

| Component              | File (proposed)                         | Responsibility                                      |
|-----------------------|------------------------------------------|---------------------------------------------------|
| `CreateInvoiceForm`   | `components/BillingForms.tsx` (extend)  | Form state, validation, tab switching, submit     |
| `LiveInvoicePreview`  | `components/InvoicePreview.tsx` (new)   | Renders a read-only copy of the invoice from state|
| `LineItemTable`       | `components/InvoiceLineTable.tsx` (new) | Editable table for `InvoiceLineInput[]`           |
| `ClientSelectFormField`|`components/ClientSelectField.tsx`(new)  | Client lookup with autocomplete + detail card     |
| `GstTotalsTab`        | inside `CreateInvoiceForm`               | Tax type + rate + breakdown                       |
| `BankDetailsBlock`    | inside preview                           | Bank/payment reference rendering                  |

---

## 4. Data Model & State

### 4.1 Backend contract (already exists)
```ts
// From frontend/src/lib/types.ts — InvoiceLine, PartyDetails, etc.
POST /invoices        // InvoiceCreate → InvoiceDetail  (draft)
PATCH /invoices/{id}  // InvoiceUpdate → InvoiceDetail  (drafts only)
POST /invoices/{id}/issue
POST /invoices/{id}/cancel
GET  /invoices/{id}   // InvoiceDetail
```

`InvoiceCreate` payload (from `schemas/billing.py`):
```ts
{
  client_id: uuid,
  engagement_id?: uuid,
  invoice_date?: date,        // defaults to today
  due_date?: date,            // defaults to +30 days
  lines: InvoiceLineInput[],  // REQUIRED (min 1)
  tax_rate?: float,           // defaults to firm default (18)
  notes?: string,
  terms?: string,
  issue: bool = false
}
```

`InvoiceLineInput`:
```ts
{
  description: string,      // min 1, max 300
  quantity: number = 1,     // > 0
  unit_price: number,       // >= 0
  discount: number = 0,     // >= 0
  sac_code?: string,        // if omitted, resolved from service catalogue or default
  is_taxable: boolean = true,
  service_id?: uuid,
  task_id?: uuid
}
```

### 4.2 Frontend local state
A single `useForm` (React Hook Form) with a `zod` schema mirroring `InvoiceCreate`.
Key design decisions:

- **Client selection** loads `PartyDetails` (address, GSTIN, state code). The
  GSTIN/state feed the **tax resolution** live.
- **Line items** use `useFieldArray` so Add/Remove is instant.
- **Computed totals** (subtotal, CGST, SGST, IGST, total, amount-in-words) are
  derived in a `useMemo` watching `lines`, `tax_rate`, and `gst_tax_type`.
- **Auto-numbering**: the invoice number (`INV/2026-27/0001`) is assigned at
  `issue` time server-side (row-locked on the tenant), **not** on the client.
  A draft shows "(draft)" in the preview until issued.
- **Tax type auto-detect**: `resolve_tax(firm_state, client_state)` →
  intra-state → CGST+SGST split; inter-state → IGST. This logic already lives in
  `backend/app/services/billing.py` and is applied by the API. The client shows
  the resolved type + reason string but the **authoritative computation is server-side**.

---

## 5. Feature Breakdown & Logic Plan

### F1. Client Selection & Address Management
- **Field**: searchable `<select>` (autocomplete) populated from `GET /clients`.
- **On select**: fetch `GET /clients/{id}` → `ClientDetail`, populate billing
  address fields (read-only, with an "Edit" link that opens `AddressEditorModal`).
- **Validation**: `client_id` is required.
- **Live effect**: selecting a client with a state code updates the GST tax
  resolution shown in the preview (intra vs inter-state).

### F2. Invoice Metadata
- **Invoice Number**: auto-generated, shown as "(draft)" until issued. Read-only in form.
- **Invoice Date**: defaults to `today()`. Changing this can shift the financial year label.
- **Due Date**: defaults to `invoice_date + 30 days`. A `model_validator` enforces
  `due_date >= invoice_date` (already in `InvoiceCreate` schema and `InvoiceUpdate`).
- **Financial Year**: derived from `invoice_date` and the firm's
  `fiscal_year_start_month`. Shown as a label (e.g. "2026-27"). A dropdown for
  FY could be shown but in this design FY is *derived*, not chosen — it is a
  property of the invoice date.
- **Invoice Type**: radio/select — `regular` (default), `bill_of_supply`,
  `invoice_for_sez`, `deemed_export`. (May need extending `InvoiceCreate`
  schema with an `invoice_type` field; currently not present.)

### F3. Line Items
- **Columns** (matching the screenshot):
  `#`, `Service/Description`, `SAC/HSN`, `Qty`, `Rate`, `Discount`, `Tax Rate`,
  `Amount`, `Actions`.
- **"Tax Rate" per line**: the screenshot shows a per-line tax rate column.
  Currently the schema applies a single `tax_rate` to the whole invoice
  (`Invoice.tax_rate`). **Decision point**: either (a) honor the screenshot and
  add per-line `tax_rate` to `InvoiceLineInput`/`InvoiceLine`, or (b) keep a
  single invoice-level rate and label the column "Taxable" (checkbox).
  Recommendation: start with **invoice-level rate** (matches existing schema and
  GST arithmetic) and treat the per-line column as a *display* of the
  invoice-level rate. Revisit if the user needs mixed rates.
- **Discount**: can be `%` or `₹`. The schema stores an absolute `discount` per
  line (already in `InvoiceLineInput`). For a percentage input, convert to
  absolute on change before sending.
- **SAC auto-fill**: if `service_id` is set on a line, the backend resolves the
  SAC code from the service catalogue (see `_to_line_inputs` in `billing.py`).
- **Add Item**: appends a blank `InvoiceLineInput` row. **Load from service
  template**: opens a modal/picker that pre-fills lines from saved templates.
- **Amount = Quantity × Rate − Discount** (pre-tax). Subtotal = Σ amounts.

### F4. GST & Tax Resolution
Already implemented server-side in `billing.py`:

```python
def resolve_tax(firm_gstin, firm_state_code, client_state_code, rate) -> TaxResolution:
    # If firm and client in same state → intra_state → CGST + SGST (rate/2 each)
    # If different states or no firm GSTIN → igst / none
    # Returns (tax_type, rate, place_of_supply_state_code, reason_string)
```

**Client shows**:
- Tax type (intra/inter) — read from `Invoice.gst_tax_type`.
- Rate (%) — from `Invoice.tax_rate`.
- Breakdown — CGST/SGST or IGST amounts (computed by `compute_invoice`).
- Reason banner — `InvoiceDetail.tax_note` (e.g. "Same-state supply → CGST 9% + SGST 9%").

### F5. Tax Arithmetic (reference — already in backend)
```
subtotal        = Σ (qty × rate − discount) over taxable lines
discount_total  = Σ discounts
taxable_total   = subtotal − discount_total  (minus non-taxable lines' amounts)
total_tax       = taxable_total × rate
cgst            = total_tax / 2
sgst            = total_tax − cgst          // SGST takes the remainder
igst            = (inter-state) total_tax
total           = taxable_total + cgst + sgst  (or + igst)
```

The frontend preview mirrors this via `useMemo` but the **backend recomputes**
and is the source of truth. Never trust the client's number.

### F6. Terms & Conditions
- Rich-text-like editor (the screenshot shows a formatting toolbar).
  **Pragmatic MVP**: a `<textarea>` with `terms` / `notes` fields (already in
  schema, 2000 char limit). A full RTE (TipTap) is a Phase-2 enhancement.
- Rendered verbatim (pre-wrap) on the printed invoice.

### F7. Bank / Payment Details
- Fields: Bank Name, Account Holder, Account Number, IFSC Code, UPI ID,
  Payment Reference.
- These are **firm-level** settings that may also be **invoice-level overrides**.
  The schema does not currently store these on the invoice. **Decision point**:
  either (a) add a `bank_details` JSON column / `BankDetails` model linked to
  the invoice, or (b) render the firm's global payment details from
  `FirmBillingSettings` (which has `name`, `address`, `gstin`, etc. but not
  bank details yet). Recommendation: add a small `PaymentDetails` schema to
  `InvoiceUpdate`/`InvoiceCreate` as optional fields (`bank_name`, `account_no`,
  `ifsc_code`, `upi_id`, `payment_ref`) stored on the invoice row.

### F8. Live Preview
- A `LiveInvoicePreview` component that re-renders on every keystroke from the
  form state (React Hook Form `watch()`).
- Uses the shared `PartyDetails` + `Invoice`/`InvoiceLine` types.
- Mirrors the print page (`/app/print/invoices/[invoiceId]/page.tsx`) layout
  so the on-screen preview matches the PDF exactly.
- **Print stylesheet** already exists in `globals.css` (`@media print`) — the
  preview should use the `print-sheet` class when the browser's print dialog fires.

### F9. Action Buttons
| Button         | Behaviour                                                                 |
|----------------||---------------------------------------------------------------------------|
| Save Draft     | `POST /invoices` with `issue: false`. No number allocated. Shows success toast. |
| Preview        | Opens the print route `/print/invoices/{id}` in a new tab, or toggles a
  full-width preview pane.                                                |
| Save & Send    | `POST /invoices` with `issue: true` (allocates number), then
  `POST /invoices/{id}/send`. Redirects to the invoice detail page.        |

### F10. Create vs Edit
- **Create** (`POST /invoices`): all fields editable, no number until `issue`.
- **Edit** (`PATCH /invoices/{id}`): only drafts are editable (enforced by the
  backend — `update_invoice` raises `ConflictError` if not a draft). The form
  loads the existing draft via `GET /invoices/{id}` and pre-fills RHF default
  values.

---

## 6. Implementation Phases

### Phase 1 — Draft creation (MVP)
- [ ] Create `invoices/new/page.tsx` route
- [ ] Build `CreateInvoiceForm` with React Hook Form + Zod
- [ ] Client select field (autocomplete from `/clients`)
- [ ] Invoice metadata fields (date, due date, type)
- [ ] `LineItemTable` with Add/Remove row support
- [ ] Basic `LiveInvoicePreview` (read-only invoice card)
- [ ] Save Draft button → `POST /invoices`
- [ ] Form action buttons (Save Draft, Save & Send)

### Phase 2 — GST & Validation
- [ ] Tax type detection display (intra/inter-state banner)
- [ ] Tax rate field (defaults to firm's 18%)
- [ ] Live tax breakdown in preview (subtotal, CGST, SGST/IGST, total)
- [ ] Amount-in-words ("Rupees ... only")
- [ ] Backend `resolve_tax` integration confirmed on client
- [ ] Due-date >= invoice-date validation

### Phase 3 — Terms, Bank Details, Issue & Send
- [ ] Terms & Conditions textarea
- [ ] Bank / payment details fields (add to schema if needed)
- [ ] Save & Send button → `POST /invoices {issue: true}` + send
- [ ] Edit flow (`PATCH /invoices/{id}`) reusing the same form component
- [ ] Address editor modal (client billing address override)

### Phase 4 — Polish & Extras
- [ ] Rich text editor for terms (TipTap)
- [ ] Service template picker (load saved line sets)
- [ ] Per-line tax rate (if the design requires mixed rates later)
- [ ] PDF download via the existing print route
- [ ] Keyboard shortcuts (e.g. `Ctrl+S` = Save Draft)
- [ ] "Copy from previous invoice" quick action

---

## 7. Key Backend Endpoints to Reuse

| Endpoint                          | Method | Used For                                    |
|-----------------------------------|--------|---------------------------------------------|
| `/invoices`                       | POST   | Create draft invoice                        |
| `/invoices/{id}`                  | GET    | Load draft for editing                      |
| `/invoices/{id}`                  | PATCH  | Update a draft                              |
| `/invoices/{id}/issue`            | POST   | Issue (allocate number)                     |
| `/invoices/{id}/cancel`           | POST   | Cancel an invoice                           |
| `/invoices/{id}/send`             | POST   | Send to client (email/WhatsApp/share link)  |
| `/clients`                        | GET    | Populate client autocomplete                |
| `/clients/{id}`                   | GET    | Fetch full client detail for address/GSTIN |
| `/billing/settings`               | GET    | Firm defaults (GST rate, prefix, name)      |
| `/financial-years`                | GET    | Financial year options                      |
| `/services`                       | GET    | Service catalogue (SAC codes, names)        |

All endpoints already exist in the backend. No new API routes are strictly required
for the MVP; the main additions are optional schema fields (invoice_type,
bank details) which are flagged as decision points in section 5.

---

## 8. Testing Strategy

### Backend (`tests/`)
- `tests/test_invoice_create.py` (new) — test `InvoiceCreate` validation:
  - missing `client_id` → 422
  - empty `lines` → 422 (min_length=1)
  - `due_date < invoice_date` → 422
  - intra-state → CGST+SGST split, inter-state → IGST
  - rounding to the paisa (Decimal)
- `tests/test_invoice_update.py` (new) — editing a draft, tax recompute.
- `tests/test_invoice_issue.py` (new) — issuing allocates a consecutive number,
  double-issue is blocked.

### Frontend (`frontend/src/components/__tests__/`)
- `CreateInvoiceForm.test.tsx` (new) — RHF validation: at least one line,
  required client, due-date check.
- `InvoiceLineTable.test.tsx` (new) — add/remove line, discount %→₹ conversion.
- `LiveInvoicePreview.test.tsx` (new) — totals recompute on line edit.
- Use the existing test runner (`package.json` scripts — check with
  `npm run test` or `npm run test:unit`).

---

## 9. Risks & Decision Points

1. **Per-line tax rate vs invoice-level**: The screenshot implies per-line tax
   rates. The current schema is invoice-level. **Recommendation**: keep invoice-
   level for MVP; the per-line column shows the invoice rate as read-only.
2. **Invoice Type field**: not in the current `InvoiceCreate` schema. Add an
   `invoice_type` enum field if the "regular / bill of supply / SEZ" dropdown
   is needed.
3. **Bank details storage**: not currently on the invoice or firm schema. Add a
   `BankDetails` sub-model or JSON column to support the "Bank / Payment
   Details" tab.
4. **Rich-text editor for Terms**: a full RTE is non-trivial (content security,
   serialization). Start with a `<textarea>` and upgrade in Phase 4.
5. **Live preview performance**: re-rendering the full preview on every keystroke
   is fine for ~50 lines; beyond that, debounce with `watch` in RHF.
