# CA Software Backend Fix - Task Checklist

## Phase 1: Backend Startup (BLOCKER - must fix first)
- [ ] Create missing router: auth.py (login, logout, me, refresh, onboarding)
- [ ] Create missing router: tasks.py (CRUD, status transitions)
- [ ] Create missing router: reports.py (dashboard, workload, at-risk, etc.)
- [ ] Create missing router: billing.py (invoices, receivables)
- [ ] Create missing router: communications.py (messaging)
- [ ] Create missing router: documents.py (document management)
- [ ] Create missing router: users.py (user management)
- [ ] Create missing router: roles.py (role management)
- [ ] Create missing router: compliance.py (calendar, rules)
- [ ] Create missing router: financial_years.py
- [ ] Create missing router: notifications.py
- [ ] Verify backend starts without import errors

## Phase 2: Database Schema Alignment
- [ ] Compare SQLAlchemy models vs actual PostgreSQL schema
- [ ] Fix any model mismatches
- [ ] Verify data relationships work

## Phase 3: Browser Testing - All Routes
- [ ] Test /login
- [ ] Test /dashboard
- [ ] Test /clients
- [ ] Test /clients/new
- [ ] Test /clients/[id]
- [ ] Test /tasks
- [ ] Test /tasks/new
- [ ] Test /tasks/[id]
- [ ] Test /services
- [ ] Test /services/[id]
- [ ] Test /reports
- [ ] Test /roles
- [ ] Test /team
- [ ] Test /team/roles
- [ ] Test /settings
- [ ] Test /calendar
- [ ] Test /documents
- [ ] Test /communications
- [ ] Test /integrations
- [ ] Test /receivables
- [ ] Test /assistant
- [ ] Test /invoices

## Phase 4: End-to-End Workflows
- [ ] Create client → view → edit → verify persistence
- [ ] Create task → assign → change status → verify history
- [ ] Calendar → verify deadline data
- [ ] Dashboard → verify all figures
- [ ] Invoices → create → view → print