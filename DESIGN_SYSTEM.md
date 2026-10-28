# CA Rohadas - Unified Design System Proposal
*Read-only audit performed on 2026-10-26. No source files modified.*

## 1) Complete Route Inventory

### Root / Public
| Path | Page/Layout | Data fetching (endpoints) | Notes |
|---|---|---|---|
| `/` (`src/app/page.tsx`) | page.tsx | Session check via `useSession()`? (not visible in head; redirects to /dashboard or /login based on session) | Entry point |
| `/login` (`src/app/login/page.tsx`) | page.tsx | Auth/login flows | Public |
| `/documents/shared/[token]/page.tsx` | page.tsx | Shared document access | Public share |
| `/invoices/shared/[token]/page.tsx` | page.tsx | Shared invoice access | Public share |
| `/print/invoices/[invoiceId]/page.tsx` | page.tsx | Invoice print view (no app shell) | Print route |
| `/api/assistant/chat/route.ts` | route.ts (API route) | Assistant chat streaming | API route |

### App Shell (grouped)
| Path | Page/Layout | Data fetching (endpoints) | Notes |
|---|---|---|---|
| `/(app)/layout.tsx` | layout.tsx (client) | `useSession()`, `api.get<FirmBillingSettings>("/billing/settings")`, `api.get<FinancialYearRow[]>("/financial-years")` | Sidebar + TopBar, auth guard, FY selector |
| `/(app)/dashboard/page.tsx` | page.tsx | Various (dashboard aggregates) | Main dashboard |
| `/(app)/clients/page.tsx` | page.tsx | Clients list | |
| `/(app)/clients/new/page.tsx` | page.tsx | Create client | |
| `/(app)/clients/[clientId]/page.tsx` | page.tsx | Client detail | |
| `/(app)/clients/[clientId]/edit/page.tsx` | page.tsx | Edit client | |
| `/(app)/tasks/page.tsx` | page.tsx | Tasks list | |
| `/(app)/tasks/new/page.tsx` | page.tsx | New task | |
| `/(app)/tasks/generate/page.tsx` | page.tsx | Task generation | |
| `/(app)/tasks/[taskId]/page.tsx` | page.tsx | Task detail | |
| `/(app)/calendar/page.tsx` | page.tsx | Compliance/calendar | "Compliance" in nav |
| `/(app)/documents/page.tsx` | page.tsx | Documents | |
| `/(app)/invoices/page.tsx` | page.tsx | Invoices list | |
| `/(app)/invoices/new/page.tsx` | page.tsx | New invoice | |
| `/(app)/invoices/[invoiceId]/page.tsx` | page.tsx | Invoice detail | |
| `/(app)/invoices/settings/page.tsx` | page.tsx | Invoice settings | |
| `/(app)/receivables/page.tsx` | page.tsx | Receivables | |
| `/(app)/team/page.tsx` | page.tsx | Team | |
| `/(app)/team/roles/page.tsx` | page.tsx | Team roles | |
| `/(app)/roles/page.tsx` | page.tsx | Roles (separate route) | |
| `/(app)/reports/page.tsx` | page.tsx | Reports | |
| `/(app)/services/page.tsx` | page.tsx | Services | |
| `/(app)/services/[serviceId]/page.tsx` | page.tsx | Service detail | |
| `/(app)/integrations/page.tsx` | page.tsx | Integrations | |
| `/(app)/communications/page.tsx` | page.tsx | Communications | |
| `/(app)/settings/page.tsx` | page.tsx | Settings | |
| `/(app)/assistant/page.tsx` | page.tsx | Assistant | |
| `/(app)/audit` | **Missing** (nav has "Audit" with `ready: false`) | N/A | Shown as inert in sidebar |

*Note:* Route list is exhaustive based on filesystem scan. Endpoint details per route require deeper inspection of each page, but patterns are visible via `api.ts` usage.

## 2) Component Inventory & Reuse Assessment

**Total components found:** 35 files in `src/components/` (+ `charts.tsx`, `ui.tsx`, `form.tsx`).

| Component | Purpose | Reuse Assessment |
|---|---|---|
| `ui.tsx` | Core shared: Card, Badge, StatCard, LoadingState, ErrorState, EmptyState, ProgressBar, Select, SearchInput, Pagination, PageHeader, Modal | **Keep/extend** - foundation. Needs enhancement (Button variants, Input, Table primitives, Dialog, Tabs, Skeleton). |
| `form.tsx` | Field/Form primitives (exported via ui.tsx) | **Keep** - consolidate with new form system |
| `charts.tsx` | DonutChart, MiniBar, TrendPill, IconChip, Avatar | **Keep** - extend with consistent theming |
| `Icon.tsx` | Icon system | **Keep** |
| `ClientActions.tsx` | Client actions | Page-specific but patterns reusable |
| `CreateClient*` forms/modals | Client creation flows | Page-specific |
| `CreateInvoice*`, `Invoice*` (InvoiceDetailDrawer, InvoiceSheet, InvoiceLineTable, LiveInvoicePreview) | Invoice/Billing flows | Complex, needs alignment to design system |
| `CreateTaskModal`, `Task*` (TaskDetailDrawer, TaskEditPanel, TaskDetailsPopup, TaskDescription, TaskAttachments) | Task flows | Complex |
| `MemberDetailDrawer`, `CreateTeamMemberModal` | Team | Reusable patterns |
| `Service*` (ServiceDetailDrawer, ServiceForms, ServiceCombobox) | Services | Reusable patterns |
| `Document*`, `ImportClientsForm`, `WorkLogPanel`, `AssignPanel`, `FilingPanel`, `ChecklistEditor` | Various | Mix of reusable/shared |
| `MessagingComponents.tsx`, `NotificationBell.tsx`, `Assistant*` | Comms/Assistant | Feature-specific |
| `BillingForms.tsx` | Billing forms | Reusable patterns |

**Key existing primitives:** Card, Badge (via `badgeClasses` from `lib/status.ts`), StatCard, LoadingState, ErrorState, EmptyState, ProgressBar, Select, SearchInput, Pagination, PageHeader, Modal. Good base, but missing: Button component API, Input/Textarea/Select unification, Table, Dialog (Modal exists), Tabs, Skeleton loading states, Toast/notification system, Confirm dialog.

## 3) Dependencies & Tooling

**package.json:**
- Dependencies: `@tanstack/react-query ^5.104.3`, `next ^16.4.2`, `react ^19.3.1`, `react-dom ^19.3.1`
- DevDependencies: `@tailwindcss/postcss ^4.3.3`, `@types/node ^26.6.5`, `@types/react ^19.3.0`, `@types/react-dom ^19.3.0`, `tailwindcss ^4.3.3`, `typescript ^5.9.3`
- Scripts: `dev`, `build`, `start`, `typecheck`
- **No UI library** (no shadcn, radix, lucide-react in deps - but `Icon.tsx` exists custom; charts custom)
- **No test framework**
- **No form validation lib** (no zod/react-hook-form)
- **No toast/notification lib**
- **No date lib** visible in deps

**Styling:** Tailwind CSS v4 with custom utilities in `globals.css`. Design tokens are mostly implicit (slate/sky/indigo palette) with some custom CSS classes. Status colors come from `lib/status.ts`.

**Config:** `next.config.ts` proxies `/api` and `/mcp` to backend in dev (not on Vercel). `allowedDevOrigins` set.

## 4) Visual/Usability Problems Identified

1. **Inconsistent cards/surfaces** - Mix of `card`, `dashboard-card`, custom section cards (`client-section`, `invoice-section`, `team-section`). Need unified Card API.
2. **Missing empty/loading states** - Some pages may lack proper EmptyState/LoadingState/Skeleton usage.
3. **Silent undefined rendering** - `api.get` casts as `T` with no validation; dashboard cards can render blank when fields undefined (as noted in context).
4. **No confirmation dialogs** - Destructive actions likely lack consistent confirmation.
5. **Inconsistent status badges** - `Badge` exists but usage patterns may vary; `lib/status.ts` provides mapping.
6. **No loading skeletons** - Only `LoadingState` text; better skeletons for cards/tables needed.
7. **Form inconsistency** - Multiple form patterns across create/edit flows.
8. **No toast/notification system** - User feedback relies on inline errors/messages.
9. **Color/token drift risk** - Custom CSS classes proliferating; need design tokens.
10. **Accessibility gaps** - Need to ensure focus states, contrast, semantic HTML consistently applied.

## 5) Design System Proposal

### Color Palette (Professional Financial SaaS)
**Primary/Brand:** Indigo/Sky gradient for CTAs - conveys trust/professionalism
- Primary: `sky-600` to `indigo-600` (gradients used in buttons)
- Primary hover: `sky-700` to `indigo-700`

**Neutrals (Slate-based):**
- Background: `slate-50` (#F8FAFC) / gradient `from-slate-50 to-white`
- Surface: `white` with `border-slate-200` / `border-[#E4E7EC]`
- Text primary: `slate-900` / `#172B4D`
- Text secondary: `slate-600` / `#667085`
- Text tertiary: `slate-500` / `slate-400`

**Semantic Status Colors (via `lib/status.ts`):**
- Success: `emerald-*` (completed/paid/active)
- Warning: `amber-*` (pending/due soon/overdue warning)
- Danger: `rose-*` (overdue/error/critical)
- Info: `sky-*` (info/neutral active)
- Progress: `indigo-*` (in progress)
- Neutral: `slate-*` (inactive/draft)

**Accent colors for sections:** Sky, Indigo, Teal, Violet, Amber, Emerald, Rose, Purple, Cyan, Fuchsia as used in dashboard cards.

### Typography
- **Font family:** System stack (current) - `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`. Consider adding Inter if desired, but system fonts are fine and perform well.
- **Scale:** text-xs (11-12px), text-sm (14px), text-base, text-lg, text-xl, text-2xl
- **Weights:** 400/500/600/700
- **Tracking:** `tracking-tight` for headings
- **Tabular nums:** Use `.tabular` class for numbers in tables/stats

### Spacing/Sizing/Border Radius/Shadows
- **Border radius:** `rounded-md` (6px) for inputs/buttons, `rounded-lg` (8px), `rounded-[10px]` for cards, `rounded-xl` (12px) for sections
- **Borders:** `border-slate-200` / `border-[#E4E7EC]` / `border-[#E2E8F0]`
- **Shadows:** `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-2xl` (modals)
- **Spacing:** Consistent scale (gap-2, gap-3, gap-4, p-3, p-4, p-5, px-4 py-3 etc.)

### Iconography
- Custom `Icon.tsx` system exists. Consider standardizing on Lucide-style icons if adding new ones. Current icons cover dashboard/nav needs.

### Reusable Components (Proposed)
| Component | Priority | Notes |
|---|---|---|
| **Button** | P0 | Unified API with variants (primary, secondary/ghost, outline, danger, subtle), sizes (sm/md/lg), loading state, icon support |
| **Input** | P0 | Text, textarea, with label/hint/error, consistent focus states |
| **Select** | P0 | Native select styled (already has `.select`), improve API |
| **Table** | P0 | Table, TableHeader, TableBody, TableRow, TableHead, TableCell with consistent styling |
| **Dialog/ConfirmDialog** | P0 | Enhance Modal or create ConfirmDialog for destructive actions |
| **Badge** | P0 | Extend existing Badge API, ensure consistent usage |
| **Tabs** | P0 | Tab navigation component |
| **StatCard** | P0 | Enhance existing StatCard with skeleton support |
| **Skeleton** | P0 | Loading skeletons for cards/tables/lists |
| **EmptyState** | P0 | Enhance existing EmptyState with icons/actions |
| **ErrorState** | P0 | Enhance existing ErrorState with retry actions |
| **Toast/Notification** | P1 | Global toast system for user feedback |
| **Tooltip** | P1 | Helpful for icons/actions |
| **Dropdown/Menu** | P1 | For action menus |
| **Card** | P0 | Unify Card API across all variants |

### Layout/Responsive
- **Desktop:** Sidebar (w-64) + main content, sticky sidebar
- **Tablet:** Responsive breakpoints (lg for sidebar)
- **Mobile:** Sidebar hidden on mobile (needs mobile nav consideration)
- **Spacing:** Consistent padding (p-4 lg:p-6)

### Accessibility
- Focus states: `:focus-visible` with sky-600 ring (already implemented)
- Semantic HTML: Use proper headings, landmarks
- Color contrast: Ensure status colors meet WCAG AA
- Keyboard navigation: Modal trap, focus management
- ARIA: Labels for icon buttons, dialogs have aria-modal

## 6) Reuse vs Replace & New Components Needed

**Reuse as-is:** Icon, LoadingState/ErrorState/EmptyState patterns (enhance), Pagination, PageHeader, charts components, form Field (via form.tsx), api utilities.

**Enhance:** Card, StatCard, Badge, Modal, Select/SearchInput, globals.css utilities.

**Replace/Consolidate:** Button patterns scattered across codebase - need unified Button component. Table styling is ad-hoc - need Table primitives.

**New needed before parallel page modernization:**
1. **Button** component (variants/sizes/loading)
2. **Input/Textarea** components
3. **Table** primitives
4. **Skeleton** component
5. **ConfirmDialog** (built on Modal)
6. **Toast system** (context + component)
7. **Tabs** component
8. **Design tokens/constants** (optional but helpful)

## 7) Recommended Shared Component Interfaces

```typescript
// Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'subtle';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

// Select (enhanced)
interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  error?: string;
  hideLabel?: boolean;
}

// Table
interface TableProps { children: React.ReactNode; className?: string; }
interface TableHeaderProps { children: React.ReactNode; }
interface TableBodyProps { children: React.ReactNode; }
interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> { clickable?: boolean; }
interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {}
interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}

// Card (unified)
interface CardProps {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'section' | 'dashboard';
}

// Skeleton
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

// EmptyState (enhanced)
interface EmptyStateProps {
  title?: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

// ConfirmDialog
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
}

// Toast
type ToastType = 'success' | 'error' | 'warning' | 'info';
interface Toast { id: string; type: ToastType; message: string; duration?: number; }
```

## 8) Phase B Foundation Work - Files to Create First

**Order of creation (dependencies):**

1. **Design tokens/constants** - `src/lib/design-tokens.ts` or extend existing
   - Colors, spacing, shadows, border radius constants
   - Type definitions for design system

2. **Enhanced Button component** - `src/components/Button.tsx` or add to `ui.tsx`
   - All variants, sizes, loading states
   - Icon support

3. **Input/Textarea components** - `src/components/Input.tsx`, `src/components/Textarea.tsx`
   - Consistent form controls with labels/errors

4. **Table primitives** - `src/components/Table.tsx`
   - Table, TableHeader, TableBody, TableRow, TableHead, TableCell

5. **Skeleton component** - `src/components/Skeleton.tsx`
   - For loading states

6. **ConfirmDialog** - `src/components/ConfirmDialog.tsx`
   - Built on existing Modal

7. **Toast system** - `src/components/Toast.tsx`, `src/contexts/ToastContext.tsx`
   - Provider + hook for global notifications

8. **Tabs component** - `src/components/Tabs.tsx`

9. **Update globals.css** - Add any missing utilities, ensure consistency
10. **Update ui.tsx** - Export new components, enhance existing ones

**Files to potentially refactor:** `components/ui.tsx` (expand), `app/globals.css` (minor additions), maybe create `components/index.ts` for cleaner imports.

## 9) Blockers

- **No test framework** - Can't add tests; need to be careful about manual testing
- **No form validation library** (zod/react-hook-form) - Forms are manual; consider adding if complex forms need validation
- **No toast library** - Need to build custom or add dependency (but no deps to add without approval)
- **No date library** - Date handling may be custom
- **Chart library missing** - Using custom charts (`charts.tsx`) which is fine but limited
- **Icon library** - Using custom Icon system; Lucide would be nice but not present
- **No component library** - Building from scratch is more work but gives full control

**Recommendation:** Start with Phase B foundation (Button, Input, Table, Skeleton, ConfirmDialog) as these are blocking for consistent page modernization. Toast system can follow. All components should be added to `src/components/` and exported from `ui.tsx` or a barrel export for easy adoption.

---

*This is a read-only audit. Implementation of the design system should follow in subsequent phases with proper testing and gradual migration of existing pages.*
