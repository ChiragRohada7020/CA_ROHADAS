# Services tab — Surface design brief & spec

**Surface:** `/services` (catalogue list) and its slide-over detail `/services/[serviceId]`
**Mode:** Operate (an inventory task: browse, find, assign, edit the firm’s service catalogue)
**Status:** Refinement of the incumbent, within the established visual world
**Build path:** Code-led (Operate surface; no image comps)
**Last reviewed:** 2026-10-27

---

## 1. Direction contract

### THESIS
The service catalogue is the *source of truth* a partner audits when they ask “what are we charging for, and what did we forget to bill?” The tab must therefore surface breadth (category spread), depth (fees + assignment reach), and the one thing that matters per row (its name, category, fee, who takes it, active state). Everything else — tabs, filters, bulk edits — is scaffolding for that audit. This surface keeps the incumbent’s structure and copy (which are already correct) and **only** realigns it onto the shared primitives and the half-finished states the codebase otherwise builds twice.

The arrangement this surface refuses: a per-row “three-dot” button that only *opens* a row, and a global “Add” affordance that is also the only way to *edit*. Editing belongs inline in the drawer once a row is open; the catalogue button is only “add”.

### OWN-WORLD (inherit, fixed)
- Palette: slate neutrals (`slate-900/700/500/300`, `slate-50/100/200` surfaces), sky-600 accent (`--color-sky-600`), sky→indigo gradient (`btn-primary` / `bg-gradient-to-r from-sky-600 to-indigo-600`), emerald/rose/amber semantic via `lib/status.ts` `Tone`.
- Per-category tinted chips: `gst→sky`, `income_tax→violet`, `tds→amber`, `audit→indigo`, `roc→rose`, `accounting→cyan`, `payroll→emerald`, `advisory→orange` (existing `CATEGORY_TONE`). **Preserve** — these hues are a meaningful, readable mapping, not decoration.
- Typography: system stack; `.tabular` for every figure; `page-title` (2xl/bold/tracking-tight) + `page-subtitle`; `.th` (11px/500/uppercase/tracking-wide/`text-slate-500`) + `.td` (sm/`text-slate-700`).
- Surfaces: `.card` (rounded-xl/border/shadow-sm/white), `.card-header` (border-b). Main chrome: `px-5 py-8 lg:px-8 lg:py-10` on `bg-slate-50`.
- Components to adopt: `Button`, `Table*`, `Skeleton`, `Pagination`, `StatCard`, `Badge`, `PageHeader`, `EmptyState`, `LoadingState`, `ErrorState`, `Toast` (via `useToast`).

### STORY
A practitioner lands on Services from the sidebar. They read four headline figures (total / assigned / annual fees / recurring), then scan the tabbed catalogue filtered to one category group. They locate a service by eye, open it to read its fee + checklist + who takes it, and either edit it there or close the drawer and keep scanning. At no point do they lose their tab or page position.

### FIRST VIEWPORT (composition at 1440px)
```
┌──────────────────────────────────────────────────────────────────┐  ← TopBar (shell) "Services"
│  Services                  [ + Add Service ]                     │  ← PageHeader
│  Manage your service…                                             │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌─────────────┐ ┌──────────────┐ ┌────────────┐        │  ← SummaryTiles (StatCard, 4-up)
│ │ Total│ │ Assigned    │ │ Annual Fees  │ │ Recurring  │        │
│ └──────┘ └─────────────┘ └──────────────┘ └────────────┘        │
├──────────────────────────────────────────────────────────────────┤  ← Card
│  [All] [Taxation] [GST] [Audit] [ROC] [Other]   ← 6 tabs w/ counts│
│  ┌──────────────────────────────────────────────────────────────┐ │
│  | Search services…   [Category▼] [Frequency▼] [Status▼]       | │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                  │  ← table body (see §4)
├──────────────────────────────────────────────────────────────────┤
│  Showing 1–10 of 34 services             [Prev] Page 1 [Next]   │  ← Pagination in Card footer
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────┐ ┌────────────────────────────────┐
│ Service Categories      (…+) │ │ Assignment Summary     ViewAll▼│  ← two cards, 2-col grid
│ category chips + counts      │ │ top-6 assignment rows           │
└──────────────────────────────┘ └────────────────────────────────┘
```
Skeleton variant: tiles + table rows + cards render `Skeleton` until `/services/summary`, `/services/categories`, and `/services` resolve.

### FORM (chosen shape)
- Tabs: a horizontal button group with `role="tablist"`, count badges, `-mb-px` underline indicator (preserve), but adopt `role="tab"`/`aria-selected`/arrow-key navigation (new).
- Filters: a `grid-cols-2 md:grid-cols-4` bar; left slot is the leading-icon search (`SearchInput` primitive), the rest are `Select` primitives. Keep server as truth; client only styles.
- Table: shared `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` primitives (replace raw `<table>` so the two service pages stop diverging from the audit’s stated goal).
- Row primary action = name cell (button→drawer). Row overflow = a real menu (`Icon more-vertical`) with Open/Edit; retire/delete gated behind `ConfirmDialog`.

### FINISH
A visual regression pass against the shared primitives and the craft floor, then `impeccable detect --json` on the changed targets once the build is done. This brief is the contract; nothing ships that contradicts it.

---

## 2. Audit of the incumbent

### Strengths (keep verbatim)
- **Tabs double as navigation *and* a count rail** — the badge per tab makes “where am I” + “how many” one glance. Good.
- **The `#` index column + range footer** (“Showing 1–10 of 34”) prevents the silent-truncation mistake (operate.md: “a list that silently truncates is how work gets missed”). Keep.
- **Slide-over detail, not a modal** — the catalogue is the context, so a drawer lets you read and flip to the next. The crafts-floor ban on “modal as first thought” is respected.
- **Inline “Add service” form under the header** when `adding` — progressive; no modal required for a 1-field-start task.
- **Indian rupee grouping** (`₹1,25,000`), IST dates, `tabular` figures — correct for the market.
- **The two summary cards** (categories, assignments) give breadth a partner actually audits (category spread, annualized value).

### Gaps (the actual design work)
| # | Gap | Evidence | Impact |
|---|-----|----------|--------|
| 1 | No skeleton while loading; only `LoadingState` text | `services/page.tsx:364-365` | Jarring jump; tiles/cards never show a loading state |
| 2 | Raw `<button className="btn-…">` instead of `<Button>` | p.239, 500, 540 | Diverges from dashboard, which uses `<Button>`; two button languages |
| 3 | Raw `<table>` markup instead of `Table*` primitives | p.384 … 551 | Duplicated table styling; the audit called this out |
| 4 | `⋮` is a literal ellipsis character, not `Icon more-vertical`; no menu | p.459–466 | No keyboard path to actions; icon inconsistency |
| 5 | “X selected” banner has **no bulk actions**, only “Clear selection” | p.351–362 | Half-built selection affordance |
| 6 | `+ Add Category` (p.497–505) calls `setAdding(true)` → opens the **add-service** form | p.501 | Wired to the wrong action; misleading copy |
| 7 | Status select hard-codes `active` / `inactive` instead of deriving from API | p.327–330 | Fine now, but brittle vs. a status the backend adds |
| 8 | Empty states have no primary action | p.374–381, 507 | “Add your first one” with no Add |
| 9 | Tabs have no `role="tablist"`/`role="tab"` or arrow-key nav | p.255–281 | Screen-reader list of buttons; not a true tab list |
| 10 | “Saved.” inline (p.441) but **Add** gives no feedback at all | `ServiceForms.tsx:139-144` | Silent success on catalogue mutation; relies on closing |
| 11 | `CategoryBadge` duplicates the `Badge` tone system | p.82–99 | Two badge subsystems in one page |
| 12 | Disabled “View All” has no disabled look | p.540–547 | Looks clickable when it isn’t |

---

## 3. Component spec

### 3.1 Summary tiles (top)
- Use `StatCard` (already) **with** `Skeleton` fallbacks while `summary` is pending.
- Each `StatCard` icon + chip stays; tone mapping: Total→info, Assigned→progress, Annual Fees→success, Recurring→warning (as today).
- Loading: render 4 `Skeleton` stat placeholders (`h-20 rounded-xl`) in the same `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`.

### 3.2 Add-service inline form
- Keep the `<Card title="Add a service" subtitle="It joins the catalogue and every picker">` + `<AddServiceForm onDone>` arrangement.
- On success, fire a **toast** (`useToast` → “Service added”) and collapse the form; do **not** also silently close with no feedback (gap #10).
- Add a “Cancel” `Button variant="ghost"` (gap: currently only the primary exists).
- Wire `AddServiceForm` error banner to `FormError` (already does).

### 3.3 Tab bar (card header)
- Adopt `role="tablist"` on the flex bar; each button `role="tab"`, `aria-selected={isActive}`, `tabIndex={isActive ? 0 : -1}`.
- Left/right arrows move focus + activate; Home/End jump ends. (Match a true tab list.)
- Keep the count pill per tab (ink cluster attached to the label, OK).
- Adopt the shared `Tabs` primitive **only if** it gains a `count`/icon slot; today it doesn’t, so keep the custom group but harden accessibility. (Do not regress the count UI.)

### 3.4 Filter bar
- Replace the left search `<input>` with the shared `SearchInput` (leading icon already, so a 1:1 swap). Keep `aria-label="Search services"`.
- Replace the three `<select className="input">` with the shared `Select` primitive — **but** the `Select` primitive forces a label; the filter bar intentionally hides labels (the column width is tight). Use `hideLabel` so the placeholder names the field, preserving the current compact look.
- Status options: keep hard-coded `active`/`inactive` (the API does not enumerate service statuses — gap #7 is a *future* risk, not current tech debt to fix now). Leave as-is.

### 3.5 Active-filters + selection banners
- **Filters banner** (“Showing x of y … Clear”): keep; swap raw buttons for `Button variant="ghost"` size `sm`.
- **Selection banner** (“n selected … Clear selection”): keep the banner, **add** a bulk-actions dropdown (gap #5). Menu items: *Retire* (requires ≥1 active), *Change category…* (opens a `Select` in the banner), *Export codes* (disabled/until built). Each bulk action must open a `ConfirmDialog` before applying.
- On clear, reset `selected` (already does).

### 3.6 Data table
- Replace raw `<table className="w-full min-w-[64rem]">` with `<Table className="min-w-[64rem]">` + `<TableHeader>`/`<TableBody>`/`<TableRow clickable>`.
- Keep columns and widths: `#` (w-8), Service Name, Category, Frequency, Default Fee (text-right, `.tabular`), Assigned Clients (text-right), Status, actions (w-12).
- **Row primary action**: the name cell is a `<button>` → `setOpenServiceId(row.id)`. The overflow cell is the **only** other click target.
- **Row overflow**: replace the `⋮` `<button>` with `Icon name="more-vertical"` inside a `RowActionsMenu` (mirror the tasks page pattern at `tasks/page.tsx:366`): dropdown → *Open service*, *Edit…* (opens drawer to the Overview→Edit flow), *Duplicate…* (future, disabled), *Retire…* (opens `ConfirmDialog`). Escape/close-outside + keyboard.
- **Row highlight on hover**: keep `hover:bg-slate-50`; add `selected → bg-sky-50/40` like tasks (`selected.has(task.id) && "bg-[#F0F9FF]"`) so selection is visible when scrolling.
- **Loading**: `Skeleton` rows (e.g. 6 `Skeleton` `h-5` lines in `px-4 py-3`-sized stubs) until `services` resolves.
- **Empty (no rows)**: `EmptyState` with an `action={<Button icon={<Icon name="plus"/>}>Add service</Button>}` when `!hasFilters && tab==="all"`; a filter-aware message otherwise.
- **Error**: `ErrorState` (already), with a *Retry* action via `Button`.

### 3.7 Footer / pagination
- Use shared `Pagination` in a `Card`-footer-style bar: range + Prev/Next. (Currently hand-rolled at p.476–490; the shared `Pagination` already renders this exact pattern — swap to reduce code.)

### 3.8 Bottom cards (Service Categories / Assignment Summary)
- Keep both; both are `Card` with `action`.
- **Service Categories**: empty state → `EmptyState` with “No categories in use yet.” + `action={<Button size="sm">Add category</Button>}`.
- **“Add Category” in that card (gap #6)**: either implement (open a tiny category form) or remove the link. Do not let it open Add-service. Decision: **remove the link** (no category-create endpoint exists yet); keep the card read-only until a backend exists.
- **Assignment Summary “View All” disabled (gap #12)**: pass `disabled` to `Button`; when disabled, `aria-label` should say “No assignments to view” and the cursor must be `not-allowed`.
- **“Nothing in the catalogue yet” row (p.589–595)**: swap to a proper `EmptyState` with `colSpan={5}`.
- Tables inside these cards: also adopt the `Table*` primitives for consistency.

### 3.9 Drawer (`ServiceDetailDrawer`)
- Keep the slide-over (do not convert to modal — see craft floor).
- The 5 internal tabs (Overview/Assignments/Tasks/Checklist/Templates) already carry counts; keep the custom nav but harden to `role="tablist"` like §3.3.
- Tasks/Assignments tables inside the drawer: adopt `Table*` primitives too.
- Loading inside drawer: `LoadingState` is acceptable for a fast drawer; escalate to `Skeleton` only if the drawer is opened frequently (low priority).

---

## 4. States coverage

| State | Services list | Service detail / drawer |
|-------|---------------|--------------------------|
| First paint (summary+list pending) | StatCard `Skeleton` ×4 + table `Skeleton` rows | PageHeader → drawer skeleton (`Skeleton` strips) |
| List pending only (summary done) | Table `Skeleton` rows; summary stays | — |
| Empty, no filters, “all” tab | `EmptyState` + **Add service** action | `EmptyState` (text) |
| Empty, filters active / non-all tab | `EmptyState`: “No services match… try another tab or clear them” + **Clear** action | — |
| Error (list) | `ErrorState` + **Retry** `Button` | `ErrorState` |
| Error (summary) | Tiles show `—`; table still loads | — |
| Permission denied (403) | `ErrorState`: “You don’t have access to the service catalogue. Ask a partner to grant the `services.read` permission.” | — |
| Selected (≥1 row) | Banner with count + Clear + **bulk actions menu** | — |
| Row hovered | highlight + cursor on name | — |
| Drawer open | body under frozen (`overflow:hidden` via Modal-style guard) | scroll contained |

Note: 401→refresh is already handled in `api.ts`; the shell already redirects to `/login`. Do not re-handle 401 inside the page.

---

## 5. Copy refinement (plain-language, actionable)

- Add → toast: **“Service added.”** / “Service updated.”
- Add → error (keep `FormError`): unchanged.
- Retry button label: **“Retry”**.
- Bulk retire confirm: title **“Retire selected services?”**, description **“Retired services hide from pickers but keep their history. {n} selected.”**, confirm **“Retire”**, cancel **“Cancel”**.
- Empty, no filters: title omitted, message **“No services in the catalogue yet.”**, action **“Add service”**.
- Empty, filters active: message **“No services match those filters. Try another tab, or clear them.”**, action **“Clear filters”**.
- Category card empty: message **“No categories in use yet.”**.
- Assignment “View All” disabled: `aria-label="No assignments to view"`.

All labels stay title-case nouns/phrases consistent with Tasks (`“Search tasks by title, code…”`, `“Clear”`, `“New task”`).

---

## 6. Accessibility checklist

- [ ] Tab bar: `role="tablist"`, each tab `role="tab"` + `aria-selected` + roving tabindex + arrow-key navigation.
- [ ] Name cell button: `aria-label` is just the service name (the code is shown visually; the button text is the name). Avoid duplicating code into the label.
- [ ] Overflow `⋮` → `more-vertical` button: `aria-label="More actions for {row.name}"`.
- [ ] Dropdown menu: `role="menu"`, items `role="menuitem"`, focus trap, CloseOnOutside + Escape (reuse tasks `RowActionsMenu`).
- [ ] Selection checkboxes: `aria-label="Select {row.name}"` on each (keep); “Select all” → `aria-label="Select all services on this page"`.
- [ ] Numbers: `.tabular` everywhere (keep); numeric cells `text-right` and `text-slate-700`.
- [ ] Color contrast: per-category chips use saturated text on tinted backgrounds — verify 4.5:1 (the audit flagged contrast gaps); at minimum `slate-700`/`rose-700`/`amber-700` foregrounds on those tints must pass.
- [ ] Focus ring: relies on the global `:focus-visible` (sky-600 ring) — keep; ensure no `overflow:hidden` ancestor clips it.
- [ ] No keyboard trap in the drawer; the slide-over already has an Escape→`onClose`.

---

## 7. Implementation handoff (prioritized)

1. **Skeletons** — table rows + stat tiles while loading (gap #1). *Blocks polish pass.*
2. **Primitive adoption** — `Table*` for the main table and the two bottom cards; swap raw `btn-*` buttons for `<Button>` (gaps #2,#3). Low risk, high consistency.
3. **Row action menu** — `Icon more-vertical` + dropdown mirroring `tasks/RowActionsMenu` (gap #4). Edit→drawer Overview tab; Open→full page.
4. **Bulk actions** — wire the selection banner to a dropdown + `ConfirmDialog` (gap #5).
5. **Fix `Add Category`** — remove the link (no endpoint); keep card read-only (gap #6).
6. **Empty states + disabled looks** — add action buttons to `EmptyState`s; `disabled` on “View All” and Retry-on-error (gaps #8,#12).
7. **Accessibility** — tablist roles + arrow keys (gap #9); menu focus trap.
8. **Toast feedback** on Add/Edit (gap #10). *Small win, big feel.*
9. **Optional** — fold `CategoryBadge` into the shared `Badge` system only if a future status axis needs it; today it is correct and readable, so leave it (gap #11 is a *consistency* note, not a fix).

> Scope boundary: do **not** redesign the slide-over’s internal tabs into a card layout, do **not** invent new status colors, and do **not** replace the per-category chip hues — those are product truth, not decoration.
