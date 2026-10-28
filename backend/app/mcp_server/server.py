"""MCP server mount — exposes tool definitions for the MCP client.

Provides:
  MCPMount              — Starlette Route + Mount constants
  get_session_manager() — lazily build and cache an MCP session manager
  build_streamable_http_app() — return the cached Starlette ASGI app
"""
from __future__ import annotations

import contextvars
import json as json_module
import os
import threading
from typing import Any

from starlette.routing import Mount
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware

MCP_MOUNT_PATH = "/mcp"
MCP_APP_NAME = "ca-software-mcp"
_backend_url = os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")

_current_tenant_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_current_tenant_id", default=None
)
_current_user_id: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "_current_user_id", default=None
)
_current_permissions: contextvars.ContextVar[list[str]] = contextvars.ContextVar(
    "_current_permissions", default=[]
)


class MCPMount:
    PATH = MCP_MOUNT_PATH
    NAME = "mcp"


_lock = threading.Lock()
_session_manager: Any | None = None
_starlette_app: Any | None = None
_raw_asgi_app: Any | None = None


def _build_tool_definitions():
    """Return the 7 MCP tool definitions."""
    from mcp.types import Tool

    tools: list[Tool] = []

    tools.append(Tool(
        name="list_clients",
        description="List clients in the firm. Supports search by name, PAN, or code.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search term for client name, code, or PAN"},
                "status": {"type": "string", "enum": ["prospect", "onboarding", "active", "inactive", "on_hold", "closed"]},
                "limit": {"type": "integer", "default": 25},
            },
        },
    ))

    tools.append(Tool(
        name="get_client",
        description="Get detailed information about a specific client including contacts, registrations, and services.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The client UUID"},
            },
            "required": ["client_id"],
        },
    ))

    tools.append(Tool(
        name="create_client",
        description="Create a new client (legal entity or individual). Returns the new client ID and code.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_type": {"type": "string", "enum": ["individual", "legal_entity"], "description": "Type of client"},
                "legal_name": {"type": "string", "description": "Legal name of the client"},
                "pan": {"type": "string", "description": "PAN number"},
                "city": {"type": "string", "description": "City"},
                "state": {"type": "string", "description": "State name"},
                "state_code": {"type": "string", "description": "State code (e.g. MH)"},
            },
            "required": ["client_type", "legal_name"],
        },
    ))

    tools.append(Tool(
        name="list_tasks",
        description="List tasks, optionally filtered by client, status, category, or financial year.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string"},
                "status": {"type": "string"},
                "category": {"type": "string"},
                "financial_year": {"type": "string"},
                "assigned_to": {"type": "string"},
                "overdue_only": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 50},
            },
        },
    ))

    tools.append(Tool(
        name="get_task",
        description="Get detailed task information including deadlines, assignment, and status.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID"},
            },
            "required": ["task_id"],
        },
    ))

    tools.append(Tool(
        name="create_task",
        description="Create a new compliance task for a client.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "name": {"type": "string", "description": "Task name (alias: title)"},
                "title": {"type": "string", "description": "Task name (alias: name)"},
                "description": {"type": "string"},
                "category": {"type": "string"},
                "priority": {"type": "string"},
                "statutory_due_date": {"type": "string", "format": "date-time"},
                "service_id": {"type": "string"},
                "checklist_item": {"type": "string"},
                "financial_year": {"type": "string", "description": "Financial year UUID (alias: financial_year_id)"},
                "financial_year_id": {"type": "string", "description": "Financial year UUID (alias: financial_year)"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["client_id", "name"],
        },
    ))

    tools.append(Tool(
        name="list_financial_years",
        description="List all financial years available in the system, including current status.",
        inputSchema={
            "type": "object",
            "properties": {
                "include_closed": {"type": "boolean", "default": False},
            },
        },
    ))

    tools.append(Tool(
        name="read_clients_csv",
        description="Read and parse a clients CSV file, returning client records.",
        inputSchema={
            "type": "object",
            "properties": {
                "file_path": {"type": "string", "description": "Absolute path to the CSV file"},
            },
            "required": ["file_path"],
        },
    ))

    tools.append(Tool(
        name="list_users",
        description="List team members with their names, roles, departments, and workload summary.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by name or email"},
                "department": {"type": "string", "description": "Filter by department"},
                "group": {"type": "string", "description": "Filter by role group: partners, managers, seniors, articles, assistants"},
                "include_inactive": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 50},
            },
        },
    ))

    tools.append(Tool(
        name="get_user_overview",
        description="Get detailed workload and activity for a specific team member, including open tasks, overdue tasks, utilization, and clients.",
        inputSchema={
            "type": "object",
            "properties": {
                "user_id": {"type": "string", "description": "The user UUID"},
            },
            "required": ["user_id"],
        },
    ))

    tools.append(Tool(
        name="list_invoices",
        description="List invoices with client, status, dates, and amounts. Supports search by invoice number.",
        inputSchema={
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by invoice number"},
                "client_id": {"type": "string", "description": "Filter by client UUID"},
                "status": {"type": "string", "description": "Filter by status: draft, issued, paid, partially_paid, cancelled"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    ))

    tools.append(Tool(
        name="get_receivables",
        description="Get the firm's receivables summary: total outstanding, overdue amounts, and breakdown by client.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ))

    tools.append(Tool(
        name="update_task_status",
        description="Update a task's status (e.g., not_started, in_progress, ready_for_review, completed, etc.).",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID", "format": "uuid"},
                "status": {"type": "string", "description": "New status value (e.g., in_progress, ready_for_review, completed, filed, delivered)"},
            },
            "required": ["task_id", "status"],
        },
    ))

    tools.append(Tool(
        name="get_dashboard",
        description="Get the firm's dashboard summary: counts of clients, tasks by status, overdue items, receivables.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ))

    tools.append(Tool(
        name="list_services",
        description="List CA services in the firm catalogue.",
        inputSchema={"type": "object", "properties": {}},
    ))

    tools.append(Tool(
        name="list_compliance_rules",
        description="List compliance rules in the firm (GST, ITR, TDS, etc.).",
        inputSchema={"type": "object", "properties": {}},
    ))

    tools.append(Tool(
        name="list_deadlines",
        description="List compliance deadlines, optionally filtered by client.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Filter by client UUID"},
            },
        },
    ))

    # ── update_client ──────────────────────────────────────────────────────
    tools.append(Tool(
        name="update_client",
        description="Update an existing client's details. All fields are optional; only provided fields are changed.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "The client UUID to update"},
                "legal_name": {"type": "string", "description": "Legal name"},
                "trade_name": {"type": "string", "description": "Trade name / DBA"},
                "pan": {"type": "string", "description": "PAN number"},
                "gstin": {"type": "string", "description": "GSTIN number"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "state_code": {"type": "string"},
                "status": {"type": "string", "enum": ["prospect", "onboarding", "active", "inactive", "on_hold", "closed"]},
                "kyc_status": {"type": "string"},
                "partner_id": {"type": "string", "description": "User UUID of the responsible partner"},
                "manager_id": {"type": "string", "description": "User UUID of the responsible manager"},
            },
            "required": ["client_id"],
        },
    ))

    # ── assign_task ────────────────────────────────────────────────────────
    tools.append(Tool(
        name="assign_task",
        description="Assign a task to a staff member in a workflow role (preparer, reviewer, or approver). Records assignment history.",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID"},
                "role": {"type": "string", "enum": ["preparer", "reviewer", "approver", "filer"], "description": "Workflow role to assign"},
                "user_id": {"type": "string", "description": "The staff member's UUID"},
            },
            "required": ["task_id", "role", "user_id"],
        },
    ))

    # ── update_task ────────────────────────────────────────────────────────
    tools.append(Tool(
        name="update_task",
        description="Update a task's fields (title, description, priority, due dates, client, service, etc.).",
        inputSchema={
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "The task UUID"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "string", "enum": ["low", "normal", "high", "urgent"]},
                "category": {"type": "string"},
                "complexity": {"type": "string", "enum": ["simple", "moderate", "complex", "highly_complex"]},
                "statutory_due_date": {"type": "string", "format": "date-time"},
                "internal_due_date": {"type": "string", "format": "date-time"},
                "service_id": {"type": "string"},
                "estimated_hours": {"type": "number"},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["task_id"],
        },
    ))

    # ── create_service ─────────────────────────────────────────────────────
    tools.append(Tool(
        name="create_service",
        description="Create a new service in the firm catalogue.",
        inputSchema={
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Service code (unique within tenant)"},
                "name": {"type": "string", "description": "Service name"},
                "category": {"type": "string", "enum": ["gst", "income_tax", "tds", "audit", "roc", "accounting", "payroll", "advisory", "other"]},
                "description": {"type": "string"},
                "standard_fee": {"type": "number"},
                "sac_code": {"type": "string", "description": "SAC code for invoicing"},
                "is_recurring": {"type": "boolean", "default": True},
                "default_frequency": {"type": "string", "description": "e.g. monthly, quarterly, yearly"},
                "default_priority": {"type": "string", "default": "normal"},
            },
            "required": ["code", "name", "category", "sac_code"],
        },
    ))

    # ── get_service ────────────────────────────────────────────────────────
    tools.append(Tool(
        name="get_service",
        description="Get detailed information about a service in the catalogue.",
        inputSchema={
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "The service UUID"},
            },
            "required": ["service_id"],
        },
    ))

    # ── update_service ─────────────────────────────────────────────────────
    tools.append(Tool(
        name="update_service",
        description="Update a service's details in the catalogue.",
        inputSchema={
            "type": "object",
            "properties": {
                "service_id": {"type": "string", "description": "The service UUID"},
                "name": {"type": "string"},
                "description": {"type": "string"},
                "category": {"type": "string"},
                "standard_fee": {"type": "number"},
                "sac_code": {"type": "string"},
                "is_active": {"type": "boolean"},
                "is_recurring": {"type": "boolean"},
                "default_frequency": {"type": "string"},
                "default_priority": {"type": "string"},
            },
            "required": ["service_id"],
        },
    ))

    # ── create_compliance_record ──────────────────────────────────────────
    tools.append(Tool(
        name="create_compliance_record",
        description="Create a client-specific compliance deadline record from a compliance rule.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "rule_id": {"type": "string", "description": "Compliance rule UUID"},
                "statutory_due_date": {"type": "string", "format": "date-time"},
                "internal_due_date": {"type": "string", "format": "date-time"},
                "financial_year_id": {"type": "string"},
                "period_key": {"type": "string"},
            },
            "required": ["client_id", "rule_id", "statutory_due_date"],
        },
    ))

    # ── list_compliance_records ───────────────────────────────────────────
    tools.append(Tool(
        name="list_compliance_records",
        description="List compliance records (deadlines) for the firm or a specific client, optionally filtered by status or overdue.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Filter by client UUID"},
                "verified": {"type": "boolean", "description": "Filter by verification status"},
                "overdue_only": {"type": "boolean", "default": False},
                "limit": {"type": "integer", "default": 50},
            },
        },
    ))

    # ── get_compliance_record ────────────────────────────────────────────
    tools.append(Tool(
        name="get_compliance_record",
        description="Get detailed information about a compliance record (deadline).",
        inputSchema={
            "type": "object",
            "properties": {
                "record_id": {"type": "string", "description": "The deadline UUID"},
            },
            "required": ["record_id"],
        },
    ))

    # ── update_compliance_record ─────────────────────────────────────────
    tools.append(Tool(
        name="update_compliance_record",
        description="Update a compliance record: mark as verified, add notes, or change due dates.",
        inputSchema={
            "type": "object",
            "properties": {
                "record_id": {"type": "string", "description": "The deadline UUID"},
                "statutory_due_date": {"type": "string", "format": "date-time"},
                "internal_due_date": {"type": "string", "format": "date-time"},
                "verified": {"type": "boolean"},
                "notes": {"type": "string"},
            },
            "required": ["record_id"],
        },
    ))

    # ── create_invoice ────────────────────────────────────────────────────
    tools.append(Tool(
        name="create_invoice",
        description="Create a new invoice for a client with line items. Computes subtotal, tax, and total automatically.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "invoice_date": {"type": "string", "format": "date-time", "description": "Defaults to today"},
                "due_days": {"type": "integer", "default": 15, "description": "Payment terms in days"},
                "items": {"type": "array", "description": "Line items", "items": {"type": "object", "properties": {"description": {"type": "string"}, "service_id": {"type": "string"}, "task_id": {"type": "string"}, "quantity": {"type": "number", "default": 1}, "unit_price": {"type": "number"}, "sac_code": {"type": "string"}, "is_taxable": {"type": "boolean", "default": True}}, "required": ["description", "unit_price"]}},
                "notes": {"type": "string"},
                "terms": {"type": "string"},
            },
            "required": ["client_id", "items"],
        },
    ))

    # ── get_invoice ───────────────────────────────────────────────────────
    tools.append(Tool(
        name="get_invoice",
        description="Get detailed invoice information including line items and payment history.",
        inputSchema={
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "The invoice UUID"},
            },
            "required": ["invoice_id"],
        },
    ))

    # ── create_payment ────────────────────────────────────────────────────
    tools.append(Tool(
        name="create_payment",
        description="Record a payment against an invoice. Updates the invoice's paid and outstanding amounts.",
        inputSchema={
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "The invoice UUID"},
                "amount": {"type": "number", "description": "Payment amount"},
                "method": {"type": "string", "enum": ["cash", "bank_transfer", "upi", "cheque", "card", "other"]},
                "reference": {"type": "string", "description": "Bank ref / cheque number etc."},
                "paid_on": {"type": "string", "format": "date-time", "description": "Defaults to today"},
                "notes": {"type": "string"},
            },
            "required": ["invoice_id", "amount", "method"],
        },
    ))

    # ── create_document ────────────────────────────────────────────────────
    tools.append(Tool(
        name="create_document",
        description="Register a new document record linked to a client, task, or compliance record.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "title": {"type": "string", "required": True, "description": "Document title"},
                "doc_type": {"type": "string", "description": "e.g. invoice, receipt, form, return"},
                "category": {"type": "string"},
                "description": {"type": "string"},
                "task_id": {"type": "string"},
                "compliance_rule_id": {"type": "string"},
                "is_confidential": {"type": "boolean", "default": False},
                "from_client": {"type": "boolean", "default": False},
                "tags": {"type": "array", "items": {"type": "string"}},
                "file_name": {"type": "string"},
                "mime_type": {"type": "string", "default": "application/octet-stream"},
                "size_bytes": {"type": "integer", "default": 0},
                "checksum_sha256": {"type": "string"},
            },
            "required": ["title"],
        },
    ))

    # ── create_financial_year ────────────────────────────────────────────
    tools.append(Tool(
        name="create_financial_year",
        description="Create a financial year for the firm (e.g. FY 2025-26).",
        inputSchema={
            "type": "object",
            "properties": {
                "code": {"type": "string", "description": "Compact code, e.g. FY2566"},
                "label": {"type": "string", "description": "Human label, e.g. FY 2025-26"},
                "start_date": {"type": "string", "format": "date"},
                "end_date": {"type": "string", "format": "date"},
                "assessment_year": {"type": "string"},
                "is_active": {"type": "boolean", "default": True},
                "is_closed": {"type": "boolean", "default": False},
            },
            "required": ["code", "label", "start_date", "end_date"],
        },
    ))

    # ── create_period ────────────────────────────────────────────────────
    tools.append(Tool(
        name="create_period",
        description="Create a compliance period (quarter/month) linked to a compliance rule.",
        inputSchema={
            "type": "object",
            "properties": {
                "rule_id": {"type": "string", "description": "Compliance rule UUID"},
                "label": {"type": "string", "description": "e.g. Q1 2025"},
                "period_key": {"type": "string", "description": "e.g. 2025-Q1"},
                "start_date": {"type": "string", "format": "date"},
                "end_date": {"type": "string", "format": "date"},
                "is_active": {"type": "boolean", "default": True},
            },
            "required": ["rule_id", "label", "period_key", "start_date", "end_date"],
        },
    ))

    # ── create_compliance_rule ───────────────────────────────────────────
    tools.append(Tool(
        name="create_compliance_rule",
        description="Create a compliance rule (ITR-3, GST-3B, TDS-26Q, audit, ...) in the firm catalogue.",
        inputSchema={
            "type": "object",
            "properties": {
                "code": {"type": "string"},
                "name": {"type": "string"},
                "category": {"type": "string", "description": "income_tax, gst, tds, audit, roc, ..."},
                "authority": {"type": "string"},
                "filing_type": {"type": "string"},
                "applicability_rule": {"type": "string"},
                "default_frequency": {"type": "string"},
                "lead_days": {"type": "integer", "description": "Days before statutory due the internal due is set"},
                "internal_due_days": {"type": "integer"},
                "status": {"type": "string", "default": "active"},
            },
            "required": ["code", "name", "category", "lead_days"],
        },
    ))

    # ── create_client_service ────────────────────────────────────────────
    tools.append(Tool(
        name="create_client_service",
        description="Assign a service (from the firm catalogue) to a client.",
        inputSchema={
            "type": "object",
            "properties": {
                "client_id": {"type": "string"},
                "service_id": {"type": "string"},
                "engagement_id": {"type": "string"},
                "is_active": {"type": "boolean", "default": True},
                "start_date": {"type": "string", "format": "date"},
                "end_date": {"type": "string", "format": "date"},
                "notes": {"type": "string"},
            },
            "required": ["client_id", "service_id"],
        },
    ))

    # ── create_activity_log ──────────────────────────────────────────────
    tools.append(Tool(
        name="create_activity_log",
        description="Write a structured activity/audit entry for a business action.",
        inputSchema={
            "type": "object",
            "properties": {
                "entity_type": {"type": "string"},
                "entity_id": {"type": "string"},
                "action": {"type": "string"},
                "summary": {"type": "string"},
                "request_ref": {"type": "string"},
            },
            "required": ["entity_type", "action"],
        },
    ))

    # ── create_billing_settings ───────────────────────────────────────────
    tools.append(Tool(
        name="create_billing_settings",
        description="Create or update the firm's billing/settings (firm state, GSTIN, tax rate) used for invoice GST calculation.",
        inputSchema={
            "type": "object",
            "properties": {
                "legal_name": {"type": "string"},
                "trade_name": {"type": "string"},
                "pan": {"type": "string"},
                "gstin": {"type": "string"},
                "address_line1": {"type": "string"},
                "address_line2": {"type": "string"},
                "city": {"type": "string"},
                "state": {"type": "string"},
                "state_code": {"type": "string", "description": "Firm state code, e.g. MH"},
                "pincode": {"type": "string"},
                "country": {"type": "string", "default": "India"},
                "phone": {"type": "string"},
                "email": {"type": "string"},
                "gst_tax_type": {"type": "string", "default": "regular"},
                "tax_rate": {"type": "number", "default": 18.0},
                "sac_code": {"type": "string"},
                "payment_terms_days": {"type": "integer", "default": 15},
                "round_off": {"type": "boolean", "default": False},
            },
            "required": ["state_code"],
        },
    ))

    # ── get_billing_settings ───────────────────────────────────────────────
    tools.append(Tool(
        name="get_billing_settings",
        description="Get the firm's billing/settings (tax rate, GSTIN, firm state/address) used for invoice GST calculation.",
        inputSchema={
            "type": "object",
            "properties": {},
        },
    ))

    # ── update_invoice ─────────────────────────────────────────────────────
    tools.append(Tool(
        name="update_invoice",
        description="Update an invoice's status, due date, terms or notes (e.g. issue a draft invoice).",
        inputSchema={
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "Invoice UUID"},
                "status": {"type": "string", "enum": ["draft", "issued", "partially_paid", "paid", "cancelled"],
                           "description": "New invoice status"},
                "due_date": {"type": "string", "format": "date-time"},
                "terms": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["invoice_id"],
        },
    ))

    return tools


# ── WhatsApp MCP tools ──────────────────────────────────────────────────
# (appended after the return statement; the dispatcher and handler
# functions reference them by name.)
def _build_whatsapp_tool_definitions():
    from mcp.types import Tool

    tools: list[Tool] = []

    tools.append(Tool(
        name="whatsapp_status",
        description="Check the WhatsApp gateway connection status (provider, connected, QR availability).",
        inputSchema={"type": "object", "properties": {}},
    ))

    tools.append(Tool(
        name="whatsapp_qr",
        description="Get the WhatsApp pairing QR code as a data URL, to be scanned with the phone's WhatsApp app.",
        inputSchema={"type": "object", "properties": {}},
    ))

    tools.append(Tool(
        name="whatsapp_send_message",
        description="Send a plain-text WhatsApp message to a phone number.",
        inputSchema={
            "type": "object",
            "properties": {
                "phone_number": {"type": "string", "description": "Recipient phone number (e.g. +919876543210)"},
                "message": {"type": "string", "description": "Message text to send"},
            },
            "required": ["phone_number", "message"],
        },
    ))

    tools.append(Tool(
        name="whatsapp_send_invoice",
        description="Generate an invoice PDF and send it as a WhatsApp document to the client's primary contact phone number.",
        inputSchema={
            "type": "object",
            "properties": {
                "invoice_id": {"type": "string", "description": "The invoice UUID"},
                "message": {"type": "string", "description": "Optional message to include with the invoice"},
            },
            "required": ["invoice_id"],
        },
    ))

    return tools


def _handle_list_tools():
    """Async callback returning the list of available tools."""

    async def _on_list_tools(context, params) -> Any:
        from mcp.types import ListToolsResult
        tools = _build_tool_definitions()
        tools.extend(_build_whatsapp_tool_definitions())
        return ListToolsResult(tools=tools)

    return _on_list_tools


def _handle_call_tool():
    """Async callback handling tool execution."""

    async def _on_call_tool(context, params) -> Any:
        from mcp.types import CallToolResult, TextContent

        name = params.name
        arguments = params.arguments or {}

        try:
            result_text = await _dispatch_tool(name, arguments)
            return CallToolResult(
                content=[TextContent(type="text", text=result_text)],
                structured_content=None,
                is_error=False,
            )
        except Exception as exc:
            return CallToolResult(
                content=[TextContent(type="text", text=f"Error: {exc}")],
                structured_content=None,
                is_error=True,
            )

    return _on_call_tool


REQUIRED_PERMISSIONS: dict[str, str] = {
    "list_clients": "client.read",
    "get_client": "client.read",
    "create_client": "client.write",
    "update_client": "client.write",
    "list_tasks": "task.read",
    "get_task": "task.read",
    "create_task": "task.write",
    "update_task": "task.write",
    "update_task_status": "task.write",
    "assign_task": "task.assign",
    "list_financial_years": "financial_year.read",
    "create_financial_year": "financial_year.write",
    "read_clients_csv": "import.read",
    "list_users": "user.read",
    "get_user_overview": "user.read",
    "list_invoices": "invoice.read",
    "get_invoice": "invoice.read",
    "create_invoice": "invoice.write",
    "update_invoice": "invoice.write",
    "create_payment": "payment.write",
    "get_receivables": "invoice.read",
    "get_dashboard": "report.read",
    "list_services": "service.read",
    "get_service": "service.read",
    "create_service": "service.write",
    "update_service": "service.write",
    "list_compliance_rules": "compliance.read",
    "create_compliance_rule": "compliance.write",
    "list_deadlines": "compliance.read",
    "create_compliance_record": "compliance.write",
    "list_compliance_records": "compliance.read",
    "get_compliance_record": "compliance.read",
    "update_compliance_record": "compliance.write",
    "create_document": "document.write",
    "create_period": "compliance.write",
    "create_client_service": "service.write",
    "create_activity_log": "assistant.use",
    "create_billing_settings": "billing.settings",
    "get_billing_settings": "billing.settings",
    "whatsapp_status": "integration.read",
    "whatsapp_qr": "integration.read",
    "whatsapp_send_message": "communication.send",
    "whatsapp_send_invoice": "invoice.send",
}


def _require_permission(name: str, permissions: list[str] | None) -> bool:
    required = REQUIRED_PERMISSIONS.get(name)
    if required is None:
        return True
    perms = permissions or []
    return required in perms or "*" in perms or "*:*" in perms


async def _dispatch_tool(name: str, arguments: dict[str, Any]) -> str:
    """Dispatch a tool call and return a plain-text result.

    Every tool call must carry a valid tenant context established by the
    ``_TenantMiddleware``. If the context is missing (which should not happen
    after the middleware fix, but is enforced here as defense-in-depth), the
    call is rejected rather than returning unfiltered data.
    """
    import json as json_module_local
    from app.core.db import SessionLocal

    tenant_id = _current_tenant_id.get()
    if tenant_id is None:
        return json_module_local.dumps({"error": "Authentication required: a valid bearer token must be provided"})

    user_id = _current_user_id.get()
    permissions = _current_permissions.get()
    if not _require_permission(name, permissions):
        required = REQUIRED_PERMISSIONS.get(name)
        return json_module_local.dumps({"error": f"permission-denied: missing permission {required}"})
    if isinstance(arguments, dict):
        arguments.setdefault("_tenant_id", tenant_id)
        arguments.setdefault("_user_id", user_id)
        arguments.setdefault("_permissions", permissions or [])

    db = SessionLocal()
    try:
        if name == "list_clients":
            return await _tool_list_clients(db, arguments)
        elif name == "get_client":
            return await _tool_get_client(db, arguments)
        elif name == "create_client":
            return await _tool_create_client(db, arguments)
        elif name == "list_tasks":
            return await _tool_list_tasks(db, arguments)
        elif name == "get_task":
            return await _tool_get_task(db, arguments)
        elif name == "create_task":
            return await _tool_create_task(db, arguments)
        elif name == "list_financial_years":
            return await _tool_list_fy(db, arguments)
        elif name == "read_clients_csv":
            return await _tool_read_csv(db, arguments)
        elif name == "list_users":
            return await _tool_list_users(db, arguments)
        elif name == "get_user_overview":
            return await _tool_get_user_overview(db, arguments)
        elif name == "list_invoices":
            return await _tool_list_invoices(db, arguments)
        elif name == "get_receivables":
            return await _tool_get_receivables(db, arguments)
        elif name == "update_task_status":
            return await _tool_update_task_status(db, arguments)
        elif name == "get_dashboard":
            return await _tool_get_dashboard(db, arguments)
        elif name == "list_compliance_rules":
            return await _tool_list_compliance_rules(db, arguments)
        elif name == "list_deadlines":
            return await _tool_list_deadlines(db, arguments)
        elif name == "list_services":
            return await _tool_list_services(db, arguments)
        elif name == "update_client":
            return await _tool_update_client(db, arguments)
        elif name == "assign_task":
            return await _tool_assign_task(db, arguments)
        elif name == "update_task":
            return await _tool_update_task(db, arguments)
        elif name == "create_service":
            return await _tool_create_service(db, arguments)
        elif name == "get_service":
            return await _tool_get_service(db, arguments)
        elif name == "update_service":
            return await _tool_update_service(db, arguments)
        elif name == "create_compliance_record":
            return await _tool_create_compliance_record(db, arguments)
        elif name == "list_compliance_records":
            return await _tool_list_compliance_records(db, arguments)
        elif name == "get_compliance_record":
            return await _tool_get_compliance_record(db, arguments)
        elif name == "update_compliance_record":
            return await _tool_update_compliance_record(db, arguments)
        elif name == "create_invoice":
            return await _tool_create_invoice(db, arguments)
        elif name == "get_invoice":
            return await _tool_get_invoice(db, arguments)
        elif name == "create_payment":
            return await _tool_create_payment(db, arguments)
        elif name == "create_document":
            return await _tool_create_document(db, arguments)
        elif name == "create_financial_year":
            return await _tool_create_financial_year(db, arguments)
        elif name == "create_period":
            return await _tool_create_period(db, arguments)
        elif name == "create_compliance_rule":
            return await _tool_create_compliance_rule(db, arguments)
        elif name == "create_client_service":
            return await _tool_create_client_service(db, arguments)
        elif name == "create_activity_log":
            return await _tool_create_activity_log(db, arguments)
        elif name == "create_billing_settings":
            return await _tool_create_billing_settings(db, arguments)
        elif name == "get_billing_settings":
            return await _tool_get_billing_settings(db, arguments)
        elif name == "update_invoice":
            return await _tool_update_invoice(db, arguments)
        elif name == "whatsapp_status":
            return await _tool_whatsapp_status(db, arguments)
        elif name == "whatsapp_qr":
            return await _tool_whatsapp_qr(db, arguments)
        elif name == "whatsapp_send_message":
            return await _tool_whatsapp_send_message(db, arguments)
        elif name == "whatsapp_send_invoice":
            return await _tool_whatsapp_send_invoice(db, arguments)
        else:
            return f"Unknown tool: {name}"
    finally:
        db.close()


async def _tool_list_clients(db, arguments: dict[str, Any]) -> str:
    from app.models import Client
    from sqlalchemy import select, or_, func

    stmt = select(Client)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Client.tenant_id == tenant_id)
    search = arguments.get("search")
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(
            Client.legal_name.ilike(pattern),
            Client.trade_name.ilike(pattern),
            Client.pan.ilike(pattern),
            Client.client_code.ilike(pattern),
        ))
    status = arguments.get("status")
    if status:
        stmt = stmt.where(Client.status == status)
    limit = arguments.get("limit", 25)
    stmt = stmt.limit(limit)

    rows = db.execute(stmt).scalars().all()
    return __import__("json").dumps([
        {"id": str(r.id), "client_code": r.client_code, "legal_name": r.legal_name, "status": r.status}
        for r in rows
    ])


async def _tool_get_client(db, arguments: dict[str, Any]) -> str:
    from app.models import Client
    import json

    client_id = arguments.get("client_id")
    if not client_id:
        return json.dumps({"error": "client_id is required"})

    client = db.get(Client, client_id)
    if client is None:
        return json.dumps({"error": f"Client {client_id} not found"})

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(client.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Client {client_id} not found"})

    return json.dumps({
        "id": str(client.id),
        "client_code": client.client_code,
        "legal_name": client.legal_name,
        "pan": client.pan,
        "status": client.status,
        "kyc_status": client.kyc_status,
    })


async def _tool_create_client(db, arguments: dict[str, Any]) -> str:
    import json
    from app.models import Client
    from app.core.clock import today_local
    from sqlalchemy import select, func

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return json.dumps({"error": "tenant context required"})

    client_type = arguments.get("client_type", "legal_entity")
    legal_name = arguments.get("legal_name")
    if not legal_name:
        return json.dumps({"error": "legal_name is required"})

    # generate client code
    today = today_local()
    prefix = f"C{today.strftime('%y%m')}:"
    max_code = db.execute(
        select(func.max(Client.client_code)).where(Client.client_code.like(f"{prefix}%"))
    ).scalar()
    if max_code:
        try:
            num = int(max_code.split(":")[1]) + 1
            code = f"{prefix}{num:04d}"
        except (IndexError, ValueError):
            code = f"{prefix}0001"
    else:
        code = f"{prefix}0001"

    client = Client(
        tenant_id=tenant_id,
        client_code=code,
        client_type=client_type,
        legal_name=legal_name,
        pan=arguments.get("pan"),
        city=arguments.get("city"),
        state=arguments.get("state"),
        state_code=arguments.get("state_code"),
        status="prospect",
        kyc_status="not_started",
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return json.dumps({"id": str(client.id), "client_code": client.client_code, "legal_name": client.legal_name, "status": client.status})


async def _tool_list_tasks(db, arguments: dict[str, Any]) -> str:
    from app.models import Task, User
    from sqlalchemy import select
    import json as j

    stmt = select(Task)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Task.tenant_id == tenant_id)
    if arguments.get("client_id"):
        stmt = stmt.where(Task.client_id == arguments["client_id"])
    if arguments.get("status"):
        stmt = stmt.where(Task.status == arguments["status"])
    if arguments.get("category"):
        stmt = stmt.where(Task.category == arguments["category"])
    if arguments.get("financial_year"):
        stmt = stmt.where(Task.financial_year_id == arguments["financial_year"])
    if arguments.get("assigned_to"):
        stmt = stmt.where(Task.preparer_id == arguments["assigned_to"])
    if arguments.get("overdue_only"):
        from app.core.clock import today_local
        stmt = stmt.where(
            Task.statutory_due_date < today_local(),
            Task.filing_status != "filed",
        )
    stmt = stmt.order_by(Task.created_at.desc())
    stmt = stmt.limit(arguments.get("limit", 50))

    rows = db.execute(stmt).scalars().all()

    # Collect all user IDs from tasks so we can resolve names in one query.
    user_ids: set = set()
    for r in rows:
        for uid in (r.preparer_id, r.reviewer_id, r.approver_id, r.filer_id):
            if uid:
                user_ids.add(uid)
    user_names: dict = {}
    if user_ids:
        name_rows = db.execute(
            select(User.id, User.full_name).where(User.id.in_(list(user_ids)))
        ).all()
        user_names = {uid: name for uid, name in name_rows}

    return j.dumps([
        {
            "id": str(r.id),
            "task_code": r.task_code,
            "title": r.title,
            "status": r.status,
            "category": r.category,
            "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None,
            "progress_percent": r.progress_percent,
            "preparer_id": str(r.preparer_id) if r.preparer_id else None,
            "preparer_name": user_names.get(r.preparer_id, "Unassigned") if r.preparer_id else "Unassigned",
            "reviewer_name": user_names.get(r.reviewer_id) if r.reviewer_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ])


async def _tool_get_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json

    task_id = arguments.get("task_id")
    if not task_id:
        return json.dumps({"error": "task_id is required"})

    task = db.get(Task, task_id)
    if task is None:
        return json.dumps({"error": f"Task {task_id} not found"})

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(task.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Task {task_id} not found"})

    from app.core.clock import today_local

    is_overdue = False
    days_overdue = 0
    if task.statutory_due_date:
        now = today_local()
        if task.statutory_due_date < now and task.filing_status != "filed":
            is_overdue = True
            days_overdue = max((now - task.statutory_due_date).days, 0)

    return json.dumps({
        "id": str(task.id),
        "task_code": task.task_code,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "filing_status": task.filing_status,
        "client_id": str(task.client_id) if task.client_id else None,
        "statutory_due_date": task.statutory_due_date.isoformat() if task.statutory_due_date else None,
        "days_overdue": days_overdue,
        "is_overdue": is_overdue,
        "preparer_id": str(task.preparer_id) if task.preparer_id else None,
        "reviewer_id": str(task.reviewer_id) if task.reviewer_id else None,
        "progress_percent": task.progress_percent,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    })


async def _tool_create_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json
    from app.core.clock import today_local
    from sqlalchemy import select, func

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return json.dumps({"error": "tenant context required"})

    now = today_local()
    prefix = f"TSK{now.strftime('%y%m')}:"

    # Generate unique task code by querying MAX, same pattern as create_client.
    # The unique constraint is (tenant_id, task_code), so we scope the query
    # to the current tenant. Retry up to 3 times to handle concurrent inserts.
    new_code = None
    for _ in range(3):
        max_code = db.execute(
            select(func.max(Task.task_code)).where(Task.task_code.like(f"{prefix}%"), Task.tenant_id == tenant_id)
        ).scalar()
        if max_code:
            try:
                num = int(max_code.split(":")[1]) + 1
                new_code = f"{prefix}{num:04d}"
            except (IndexError, ValueError):
                new_code = f"{prefix}0001"
        else:
            new_code = f"{prefix}0001"

        task = Task(
            tenant_id=tenant_id,
            task_code=new_code,
            title=arguments.get("name", arguments.get("title", "")),
            client_id=arguments.get("client_id"),
            description=arguments.get("description", ""),
            category=arguments.get("category", "compliance"),
            priority=arguments.get("priority", "normal"),
            statutory_due_date=arguments.get("statutory_due_date"),
            service_id=arguments.get("service_id"),
            financial_year_id=arguments.get("financial_year", arguments.get("financial_year_id")),
            tags=",".join(arguments.get("tags") or []),
            status="not_started",
            filing_status="not_required",
        )
        db.add(task)
        try:
            db.flush()
            break
        except Exception:
            db.rollback()
            continue
    else:
        return json.dumps({"error": f"Failed to generate a unique task code after retries (last code: {new_code})"})

    db.commit()
    db.refresh(task)

    return json.dumps({
        "id": str(task.id),
        "task_code": task.task_code,
        "title": task.title,
        "status": task.status,
    })


async def _tool_list_fy(db, arguments: dict[str, Any]) -> str:
    from app.models import FinancialYear
    from sqlalchemy import select, desc
    import json as j

    stmt = select(FinancialYear).order_by(desc(FinancialYear.start_date))
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(FinancialYear.tenant_id == tenant_id)
    if not arguments.get("include_closed"):
        stmt = stmt.where(FinancialYear.is_closed.is_(False))
    stmt = stmt.limit(10)

    rows = db.execute(stmt).scalars().all()
    return j.dumps([
        {
            "id": str(r.id),
            "code": r.code,
            "name": r.label,
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "is_current": r.is_active,
            "is_closed": r.is_closed,
        }
        for r in rows
    ])


async def _tool_read_csv(db, arguments: dict[str, Any]) -> str:
    import csv as csv_module
    import json as j
    import os
    from app.core.config import settings

    file_path = arguments.get("file_path")
    if not file_path:
        return j.dumps({"error": "file_path is required"})

    import_dir = os.path.realpath(settings.IMPORT_DIR)
    if ".." in file_path.split(os.sep):
        return j.dumps({"error": f"path traversal not allowed — file must be within the approved import directory: {import_dir}"})

    # reject symlinks
    if os.path.islink(file_path):
        return j.dumps({"error": "symlinks are not allowed"})
    resolved = os.path.realpath(file_path)
    if os.path.islink(resolved):
        return j.dumps({"error": "symlinks are not allowed"})
    if not resolved.startswith(import_dir + os.sep):
        return j.dumps({"error": f"File must be within the approved import directory: {import_dir}"})
    # max file size cap 10MB
    try:
        if os.path.getsize(resolved) > 10 * 1024 * 1024:
            return j.dumps({"error": "file too large"})
    except OSError:
        return j.dumps({"error": f"File not found: {resolved}"})

    records: list[dict] = []
    try:
        with open(resolved, "r", encoding="utf-8") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                records.append(dict(row))
    except FileNotFoundError:
        return j.dumps({"error": f"File not found: {resolved}"})
    except UnicodeDecodeError:
        return j.dumps({"error": f"File is not valid UTF-8: {resolved}"})

    return j.dumps({"records": records, "count": len(records)})


# ── New tools: users, billing, dashboard, task status ──────────────────

_GROUP_CODES: dict[str, set[str]] = {
    "partners": {"firm_owner", "partner", "branch_partner"},
    "managers": {"manager"},
    "seniors": {"senior_associate", "ca_senior"},
    "articles": {"article_assistant"},
    "assistants": {"accounts_staff", "accountant", "assistant"},
}


async def _tool_list_users(db, arguments: dict[str, Any]) -> str:
    from app.models import User
    from sqlalchemy import text
    import json as j

    stmt = text(
        "SELECT u.id, u.email, u.full_name, u.employee_code, u.designation, "
        "u.department, u.status, u.date_of_joining, u.weekly_capacity_hours, "
        "u.last_login_at, b.name AS branch_name "
        "FROM users u LEFT JOIN branches b ON b.id = u.branch_id "
        "WHERE 1=1"
    )
    params = {}

    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = text(str(stmt) + " AND u.tenant_id = :tenant_id")
        params["tenant_id"] = tenant_id

    search = arguments.get("search")
    if search:
        pat = f"%{search}%"
        stmt = text(str(stmt) + " AND (u.full_name ILIKE :s OR u.email ILIKE :s)")
        params["s"] = pat

    dept = arguments.get("department")
    if dept:
        stmt = text(str(stmt) + " AND u.department = :dept")
        params["dept"] = dept

    if not arguments.get("include_inactive"):
        stmt = text(str(stmt) + " AND u.status = 'active'")

    role_map: dict = {}
    group = arguments.get("group")

    rows = db.execute(stmt, params).fetchall()
    role_sql = "SELECT ur.user_id, r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id"
    if tenant_id:
        role_sql += " WHERE r.tenant_id = :tenant_id"
    role_rows = db.execute(text(role_sql), params).fetchall()
    for uid, code in role_rows:
        role_map.setdefault(str(uid), set()).add(code)

    open_per_user: dict = {}
    overdue_per_user: dict = {}
    task_sql = (
        "SELECT preparer_id, statutory_due_date, status FROM tasks "
        "WHERE status NOT IN ('completed','filed','delivered','cancelled')"
    )
    if tenant_id:
        task_sql += " AND tenant_id = :tenant_id"
    for t in db.execute(text(task_sql), params).fetchall():
        if t.preparer_id:
            uid = str(t.preparer_id)
            open_per_user[uid] = open_per_user.get(uid, 0) + 1

    limit = arguments.get("limit", 50)
    items = []
    for i, r in enumerate(rows[:limit]):
        roles = sorted(role_map.get(r.id, set()))
        codes = set(roles)
        group_name = None
        for gk, gv in _GROUP_CODES.items():
            if codes & gv:
                group_name = gk
                break
        items.append({
            "id": str(r.id),
            "email": r.email,
            "full_name": r.full_name,
            "employee_code": r.employee_code,
            "designation": r.designation,
            "department": r.department,
            "branch_name": r.branch_name,
            "status": r.status,
            "date_of_joining": r.date_of_joining.isoformat() if r.date_of_joining else None,
            "weekly_capacity_hours": int(r.weekly_capacity_hours) if r.weekly_capacity_hours else 40,
            "last_login_at": r.last_login_at.isoformat() if r.last_login_at else None,
            "group": group_name,
            "roles": roles,
            "open_tasks": open_per_user.get(r.id, 0),
        })

    return j.dumps(items)


async def _tool_get_user_overview(db, arguments: dict[str, Any]) -> str:
    from app.models import User
    from app.core.clock import today_local
    from datetime import date
    import json

    user_id = arguments.get("user_id")
    if not user_id:
        return json.dumps({"error": "user_id is required"})

    user = db.get(User, user_id)
    if user is None:
        return json.dumps({"error": f"User {user_id} not found"})

    cap = int(user.weekly_capacity_hours) if user.weekly_capacity_hours else 40
    uid = str(user.id)
    tenant_id = arguments.get("_tenant_id")
    today = today_local()

    load_rows = db.execute(text(
        "SELECT id, task_code, title, statutory_due_date, internal_due_date, "
        "estimated_hours, status FROM tasks "
        "WHERE (preparer_id = :uid OR reviewer_id = :uid OR approver_id = :uid) "
        "AND status NOT IN ('completed','filed','delivered','cancelled')"
        + (" AND tenant_id = :tenant_id" if tenant_id else "")
    ), {"uid": uid, **({"tenant_id": tenant_id} if tenant_id else {})}).fetchall()

    open_tasks = len(load_rows)
    overdue_tasks = 0
    weighted = 0.0
    for t in load_rows:
        due = t.statutory_due_date or t.internal_due_date
        due_date = due.date() if due is not None and hasattr(due, "date") else due
        if due_date and due_date < today:
            overdue_tasks += 1
        weighted += float(t.estimated_hours or 0)
    util = round((weighted / cap * 100), 1) if cap else 0.0

    client_sql = (
        "SELECT c.id, c.client_code, c.legal_name FROM clients c "
        "WHERE (c.partner_id = :uid OR c.manager_id = :uid)"
    )
    client_params = {"uid": uid}
    if tenant_id:
        client_sql += " AND c.tenant_id = :tenant_id"
        client_params["tenant_id"] = tenant_id
    clients = db.execute(text(client_sql), client_params).fetchall()

    activity_sql = (
        "SELECT h.id, h.created_at, h.to_status AS action, t.task_code "
        "FROM task_status_history h JOIN tasks t ON t.id = h.task_id "
        "WHERE h.changed_by_id = :uid"
    )
    activity_params = {"uid": uid}
    if tenant_id:
        activity_sql += " AND t.tenant_id = :tenant_id"
        activity_params["tenant_id"] = tenant_id
    activity_sql += " ORDER BY h.created_at DESC LIMIT 12"
    activity = db.execute(text(activity_sql), activity_params).fetchall()

    return json.dumps({
        "user_id": uid,
        "full_name": user.full_name,
        "email": user.email,
        "designation": user.designation,
        "department": user.department,
        "is_partner": user.is_partner,
        "workload": {
            "open_tasks": open_tasks,
            "overdue_tasks": overdue_tasks,
            "weighted_load_hours": round(weighted, 2),
            "capacity_hours": cap,
            "utilisation_percent": util,
        },
        "clients": [{"id": str(c.id), "code": c.client_code, "name": c.legal_name} for c in clients],
        "recent_activity": [{"task_code": a.task_code, "action": a.to_status, "created_at": a.created_at.isoformat() if a.created_at else None} for a in activity],
    })


async def _tool_list_invoices(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice
    from sqlalchemy import select
    import json as j

    stmt = select(Invoice)
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    search = arguments.get("search")
    if search:
        stmt = stmt.where(Invoice.invoice_number.like(f"%{search}%"))
    if arguments.get("client_id"):
        stmt = stmt.where(Invoice.client_id == arguments["client_id"])
    status = arguments.get("status")
    if status:
        stmt = stmt.where(Invoice.status == status)

    limit = arguments.get("limit", 10)
    stmt = stmt.order_by(Invoice.invoice_date.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()

    return j.dumps([
        {
            "id": str(r.id),
            "invoice_number": r.invoice_number,
            "status": r.status,
            "invoice_date": r.invoice_date.isoformat() if r.invoice_date else None,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "total": float(r.total) if r.total else 0,
            "amount_paid": float(r.amount_paid) if r.amount_paid else 0,
            "outstanding": float(r.outstanding) if r.outstanding else 0,
            "is_overdue": bool(r.is_overdue) if r.is_overdue else False,
            "client_id": str(r.client_id) if r.client_id else None,
        }
        for r in rows
    ])


async def _tool_get_receivables(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice
    from sqlalchemy import select, func
    from app.core.clock import today_local
    import json

    today = today_local()
    stmt = select(Invoice).where(
        Invoice.status.in_(["issued", "partially_paid"]),
        Invoice.amount_paid < Invoice.total,
    )
    tenant_id = arguments.get("_tenant_id")
    if tenant_id:
        stmt = stmt.where(Invoice.tenant_id == tenant_id)
    rows = db.execute(stmt).scalars().all()

    invoiced_total = 0.0
    outstanding_total = 0.0
    overdue_total = 0.0
    by_bucket: dict[str, float] = {}
    by_client: dict = {}

    for row in rows:
        outstanding = float(row.total) - float(row.amount_paid)
        invoiced_total += float(row.total)
        outstanding_total += outstanding
        due = row.due_date.date() if row.due_date else None
        days_overdue = (today - due).days if due else 0
        if days_overdue > 0:
            overdue_total += outstanding

        if days_overdue <= 0:
            bucket = "current"
        elif days_overdue <= 30:
            bucket = "1-30"
        elif days_overdue <= 60:
            bucket = "31-60"
        elif days_overdue <= 90:
            bucket = "61-90"
        else:
            bucket = "90+"
        by_bucket[bucket] = by_bucket.get(bucket, 0.0) + outstanding

        cid = str(row.client_id) if row.client_id else None
        c = by_client.setdefault(cid, {
            "client_id": cid,
            "client_name": row.client_name or row.client_code or None,
            "client_code": row.client_code,
            "invoice_count": 0, "billed": 0.0,
            "collected": 0.0, "outstanding": 0.0, "overdue_outstanding": 0.0,
            "worst_days_overdue": 0,
        })
        c["invoice_count"] += 1
        c["billed"] += float(row.total)
        c["collected"] += float(row.amount_paid)
        c["outstanding"] += outstanding
        if days_overdue > 0:
            c["overdue_outstanding"] += outstanding
        if days_overdue > c["worst_days_overdue"]:
            c["worst_days_overdue"] = days_overdue

    return json.dumps({
        "as_of": today.isoformat(),
        "invoiced_total": round(invoiced_total, 2),
        "outstanding_total": round(outstanding_total, 2),
        "overdue_total": round(overdue_total, 2),
        "ageing": {k: round(v, 2) for k, v in by_bucket.items()},
        "by_client": list(by_client.values()),
    })


async def _tool_update_task_status(db, arguments: dict[str, Any]) -> str:
    from app.models import Task
    import json

    task_id = arguments.get("task_id")
    status = arguments.get("status")
    if not task_id or not status:
        return json.dumps({"error": "task_id and status are required"})

    task = db.get(Task, task_id)
    if task is None:
        return json.dumps({"error": f"Task {task_id} not found"})

    tenant_id = arguments.get("_tenant_id")
    if tenant_id and str(task.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Task {task_id} not found"})

    valid_statuses = {
        "not_started", "assigned", "in_progress", "waiting_for_client",
        "waiting_for_internal", "ready_for_review", "changes_requested",
        "ready_for_approval", "approved", "ready_to_file", "filed",
        "delivered", "completed", "cancelled",
    }
    if status not in valid_statuses:
        return json.dumps({"error": f"Invalid status: {status}. Valid: {sorted(valid_statuses)}"})

    task.status = status
    db.commit()
    db.refresh(task)

    return json.dumps({
        "success": True, "task_id": task_id,
        "task_code": task.task_code, "title": task.title,
        "old_status": arguments.get("old_status", "unknown"),
        "new_status": status,
    })


async def _tool_list_services(db, arguments: dict[str, Any]) -> str:
    from app.models import Service
    from sqlalchemy import select
    import json

    tenant_id = arguments.get("_tenant_id")
    stmt = select(Service)
    if tenant_id:
        stmt = stmt.where(Service.tenant_id == tenant_id)
    rows = db.execute(stmt).scalars().all()
    return json.dumps([{"id": str(r.id), "name": r.name, "code": getattr(r, "code", None)} for r in rows])


async def _tool_list_compliance_rules(db, arguments: dict[str, Any]) -> str:
    from app.models.compliance import ComplianceRule
    from sqlalchemy import select
    import json

    tenant_id = arguments.get("_tenant_id")
    stmt = select(ComplianceRule)
    if tenant_id:
        stmt = stmt.where(ComplianceRule.tenant_id == tenant_id)
    rows = db.execute(stmt).scalars().all()
    return json.dumps([{"id": str(r.id), "code": r.code, "name": r.name, "category": r.category, "status": r.status} for r in rows])


async def _tool_list_deadlines(db, arguments: dict[str, Any]) -> str:
    from app.models.compliance import Deadline
    from sqlalchemy import select
    import json

    tenant_id = arguments.get("_tenant_id")
    stmt = select(Deadline)
    if tenant_id:
        stmt = stmt.where(Deadline.tenant_id == tenant_id)
    client_id = arguments.get("client_id")
    if client_id:
        stmt = stmt.where(Deadline.client_id == client_id)
    rows = db.execute(stmt).scalars().all()
    return json.dumps([{"id": str(r.id), "client_id": str(r.client_id), "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None, "verified": r.verified} for r in rows])


async def _tool_get_dashboard(db, arguments: dict[str, Any]) -> str:
    from app.models import Client, Task, Invoice
    from sqlalchemy import func, select
    from app.core.clock import today_local
    import json
    from datetime import timedelta

    today = today_local()
    week_end = today + timedelta(days=14)

    tenant_id = arguments.get("_tenant_id")
    client_filter = [Client.tenant_id == tenant_id] if tenant_id else []
    task_filter = [Task.tenant_id == tenant_id] if tenant_id else []
    inv_filter = [Invoice.tenant_id == tenant_id] if tenant_id else []

    clients_total = db.execute(select(func.count()).select_from(Client).where(*client_filter)).scalar() or 0
    clients_active = db.execute(
        select(func.count()).select_from(Client).where(*client_filter, Client.status == "active")
    ).scalar() or 0

    open_statuses = ["completed", "filed", "delivered", "cancelled"]

    tasks_open = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status.not_in(open_statuses))
    ).scalar() or 0
    tasks_completed = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status == "completed")
    ).scalar() or 0
    tasks_overdue = db.execute(
        select(func.count()).select_from(Task).where(
            *task_filter,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date < today,
            Task.status.not_in(open_statuses),
        )
    ).scalar() or 0
    tasks_due_this_week = db.execute(
        select(func.count()).select_from(Task).where(
            *task_filter,
            Task.statutory_due_date.is_not(None),
            Task.statutory_due_date >= today,
            Task.statutory_due_date < week_end,
            Task.status.not_in(open_statuses),
        )
    ).scalar() or 0
    awaiting_review = db.execute(
        select(func.count()).select_from(Task).where(*task_filter, Task.status == "ready_for_review")
    ).scalar() or 0

    inv_rows = db.execute(select(Invoice).where(*inv_filter, Invoice.status.in_(["issued", "partially_paid"]))).scalars().all()
    outstanding_total = sum(float(r.total) - float(r.amount_paid) for r in inv_rows)
    overdue_invoices = sum(1 for r in inv_rows if r.due_date and r.due_date.date() < today and float(r.total) - float(r.amount_paid) > 0)

    status_rows = db.execute(
        select(Task.status, func.count().label("cnt")).where(*task_filter).group_by(Task.status)
    ).all()
    tasks_by_status = [{"status": s, "count": int(c)} for s, c in status_rows]

    return json.dumps({
        "clients_total": clients_total,
        "clients_active": clients_active,
        "tasks_open": tasks_open,
        "tasks_completed": tasks_completed,
        "tasks_overdue": tasks_overdue,
        "tasks_due_this_week": tasks_due_this_week,
        "awaiting_review": awaiting_review,
        "receivables_outstanding": round(outstanding_total, 2),
        "overdue_invoices": overdue_invoices,
        "tasks_by_status": tasks_by_status,
    })


# ── New tools: update_client, assign_task, update_task ───────────────────


async def _tool_update_client(db, arguments: dict[str, Any]) -> str:
    from app.models import Client, User
    import json as j

    tenant_id = arguments.get("_tenant_id")
    client_id = arguments.get("client_id")
    if not client_id:
        return j.dumps({"error": "client_id is required"})

    client = db.get(Client, client_id)
    if client is None or str(client.tenant_id) != str(tenant_id):
        return j.dumps({"error": f"Client {client_id} not found"})

    updateable_fields = [
        "legal_name", "trade_name", "pan", "gstin", "tan", "cin", "llpin",
        "city", "state", "state_code", "pincode", "country",
        "address_line1", "address_line2", "district",
        "status", "kyc_status", "status_reason",
    ]
    for field in updateable_fields:
        if field in arguments and arguments[field] is not None:
            setattr(client, field, arguments[field])

    # Handle partner_id / manager_id — validate the user belongs to the tenant
    for ref_field in ("partner_id", "manager_id"):
        if ref_field in arguments and arguments[ref_field] is not None:
            user = db.get(User, arguments[ref_field])
            if user is None or str(user.tenant_id) != str(tenant_id):
                return j.dumps({"error": f"User {arguments[ref_field]} not found in this tenant"})
            setattr(client, ref_field, arguments[ref_field])

    db.commit()
    db.refresh(client)
    return j.dumps({
        "id": str(client.id),
        "client_code": client.client_code,
        "legal_name": client.legal_name,
        "status": client.status,
        "kyc_status": client.kyc_status,
    })


async def _tool_assign_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task, User, TaskAssignment
    import json
    from datetime import datetime

    tenant_id = arguments.get("_tenant_id")
    task_id = arguments.get("task_id")
    role = arguments.get("role")
    user_id = arguments.get("user_id")

    for label, val in (("task_id", task_id), ("role", role), ("user_id", user_id)):
        if not val:
            return json.dumps({"error": f"{label} is required"})

    valid_roles = {"preparer", "reviewer", "approver", "filer"}
    if role not in valid_roles:
        return json.dumps({"error": f"Invalid role: {role}. Valid: {sorted(valid_roles)}"})

    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Task {task_id} not found"})

    user = db.get(User, user_id)
    if user is None or str(user.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"User {user_id} not found in this tenant"})

    # Enforce separation of duty
    field_name = f"{role}_id"
    setattr(task, field_name, user_id)

    # Check the separation-of-duty constraint
    if role == "reviewer" and task.preparer_id and str(task.reviewer_id) == str(task.preparer_id):
        return json.dumps({"error": "Reviewer cannot be the same as preparer"})
    if role == "approver" and task.preparer_id and str(task.approver_id) == str(task.preparer_id):
        return json.dumps({"error": "Approver cannot be the same as preparer"})

    assignment = TaskAssignment(
        task_id=task_id,
        user_id=user_id,
        role_in_task=role,
        assigned_at=datetime.utcnow(),
        assigned_by_id=arguments.get("_user_id"),
        is_active=True,
    )
    db.add(assignment)
    db.commit()
    db.refresh(task)

    return json.dumps({
        "success": True,
        "task_id": str(task.id),
        "task_code": task.task_code,
        "role": role,
        "user_id": str(user_id),
        "user_name": user.full_name,
    })


async def _tool_update_task(db, arguments: dict[str, Any]) -> str:
    from app.models import Task, User
    import json

    tenant_id = arguments.get("_tenant_id")
    task_id = arguments.get("task_id")
    if not task_id:
        return json.dumps({"error": "task_id is required"})

    task = db.get(Task, task_id)
    if task is None or str(task.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Task {task_id} not found"})

    updateable_fields = [
        "title", "description", "priority", "category", "sub_category",
        "statutory_due_date", "internal_due_date", "start_date",
        "estimated_hours", "service_id", "tags", "blocked_reason",
    ]
    for field in updateable_fields:
        if field in arguments and arguments[field] is not None:
            setattr(task, field, arguments[field])

    db.commit()
    db.refresh(task)
    return json.dumps({
        "id": str(task.id),
        "task_code": task.task_code,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
    })


# ── New tools: service catalogue ───────────────────────────────────────────


async def _tool_create_service(db, arguments: dict[str, Any]) -> str:
    from app.models import Service
    import json as j

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    code = arguments.get("code")
    name = arguments.get("name")
    category = arguments.get("category")
    sac_code = arguments.get("sac_code")
    if not all([code, name, category, sac_code]):
        missing = [f for f, v in [("code", code), ("name", name), ("category", category), ("sac_code", sac_code)] if not v]
        return j.dumps({"error": f"Missing required fields: {missing}"})

    service = Service(
        tenant_id=tenant_id,
        code=code,
        name=name,
        category=category,
        description=arguments.get("description"),
        is_recurring=arguments.get("is_recurring", True),
        default_frequency=arguments.get("default_frequency"),
        default_priority=arguments.get("default_priority", "normal"),
        standard_fee=arguments.get("standard_fee"),
        sac_code=sac_code,
    )
    db.add(service)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create service (code may already exist): {exc}"})
    db.refresh(service)
    return j.dumps({
        "id": str(service.id),
        "code": service.code,
        "name": service.name,
        "category": service.category,
        "is_active": service.is_active,
    })


async def _tool_get_service(db, arguments: dict[str, Any]) -> str:
    from app.models import Service
    import json

    tenant_id = arguments.get("_tenant_id")
    service_id = arguments.get("service_id")
    if not service_id:
        return json.dumps({"error": "service_id is required"})

    service = db.get(Service, service_id)
    if service is None or str(service.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Service {service_id} not found"})

    return json.dumps({
        "id": str(service.id),
        "code": service.code,
        "name": service.name,
        "category": service.category,
        "description": service.description,
        "standard_fee": float(service.standard_fee) if service.standard_fee else None,
        "sac_code": service.sac_code,
        "is_recurring": service.is_recurring,
        "default_frequency": service.default_frequency,
        "default_priority": service.default_priority,
        "is_active": service.is_active,
    })


async def _tool_update_service(db, arguments: dict[str, Any]) -> str:
    from app.models import Service
    import json

    tenant_id = arguments.get("_tenant_id")
    service_id = arguments.get("service_id")
    if not service_id:
        return json.dumps({"error": "service_id is required"})

    service = db.get(Service, service_id)
    if service is None or str(service.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Service {service_id} not found"})

    updateable_fields = [
        "name", "description", "category", "standard_fee", "sac_code",
        "is_active", "is_recurring", "default_frequency", "default_priority",
    ]
    for field in updateable_fields:
        if field in arguments and arguments[field] is not None:
            setattr(service, field, arguments[field])

    db.commit()
    db.refresh(service)
    return json.dumps({
        "id": str(service.id),
        "code": service.code,
        "name": service.name,
        "category": service.category,
        "is_active": service.is_active,
    })


# ── New tools: compliance records ──────────────────────────────────────────


def _validate_tenant_record(db, model, record_id, tenant_id, label="record"):
    """Fetch a record and verify it belongs to the given tenant."""
    record = db.get(model, record_id)
    if record is None or str(record.tenant_id) != str(tenant_id):
        return None
    return record


async def _tool_create_compliance_record(db, arguments: dict[str, Any]) -> str:
    from app.models import Client, ComplianceRule, Deadline, FinancialYear
    from datetime import datetime, timedelta
    import json
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    client_id = arguments.get("client_id")
    rule_id = arguments.get("rule_id")
    statutory_due_date = arguments.get("statutory_due_date")

    if not client_id:
        return json.dumps({"error": "client_id is required"})
    if not rule_id:
        return json.dumps({"error": "rule_id is required"})
    if not statutory_due_date:
        return json.dumps({"error": "statutory_due_date is required"})

    client = _validate_tenant_record(db, Client, client_id, tenant_id, "client")
    if client is None:
        return json.dumps({"error": f"Client {client_id} not found"})

    rule = _validate_tenant_record(db, ComplianceRule, rule_id, tenant_id, "rule")
    if rule is None:
        return json.dumps({"error": f"Compliance rule {rule_id} not found"})

    internal_due = arguments.get("internal_due_date")
    if not internal_due:
        # Default: statutory_due_date - lead_days
        sd = statutory_due_date
        if isinstance(sd, str):
            sd = datetime.fromisoformat(sd.replace("Z", "+00:00"))
        internal_due = sd - timedelta(days=rule.lead_days)

    if isinstance(internal_due, str):
        internal_due = datetime.fromisoformat(internal_due.replace("Z", "+00:00"))

    # Ensure statutory_due_date is a datetime for the DB
    if isinstance(statutory_due_date, str):
        statutory_due_date = datetime.fromisoformat(statutory_due_date.replace("Z", "+00:00"))

    fy_id = arguments.get("financial_year_id")
    if fy_id:
        fy = db.get(FinancialYear, fy_id)
        if fy and str(fy.tenant_id) != str(tenant_id):
            return json.dumps({"error": f"Financial year {fy_id} not found"})

    now = now_local()
    deadline = Deadline(
        tenant_id=tenant_id,
        client_id=client_id,
        compliance_rule_id=rule_id,
        financial_year_id=fy_id,
        period_key=arguments.get("period_key"),
        statutory_due_date=statutory_due_date,
        internal_due_date=internal_due,
        source="manual",
        created_at=now,
    )
    db.add(deadline)
    try:
        db.flush()
    except Exception as exc:
        db.rollback()
        return json.dumps({"error": f"Could not create deadline (possible duplicate): {exc}"})
    db.commit()
    db.refresh(deadline)

    return json.dumps({
        "id": str(deadline.id),
        "client_id": str(deadline.client_id),
        "compliance_rule_id": str(deadline.compliance_rule_id),
        "statutory_due_date": deadline.statutory_due_date.isoformat() if deadline.statutory_due_date else None,
        "internal_due_date": deadline.internal_due_date.isoformat() if deadline.internal_due_date else None,
        "period_key": deadline.period_key,
        "verified": deadline.verified,
        "created_at": deadline.created_at.isoformat() if deadline.created_at else None,
    })


async def _tool_list_compliance_records(db, arguments: dict[str, Any]) -> str:
    from app.models import Deadline, Client, ComplianceRule
    import json as j
    from sqlalchemy import select, func
    from app.core.clock import today_local

    tenant_id = arguments.get("_tenant_id")
    stmt = select(Deadline).where(Deadline.tenant_id == tenant_id)

    client_id = arguments.get("client_id")
    if client_id:
        stmt = stmt.where(Deadline.client_id == client_id)

    if "verified" in arguments and arguments["verified"] is not None:
        stmt = stmt.where(Deadline.verified.is_(arguments["verified"]))

    if arguments.get("overdue_only"):
        today = today_local()
        stmt = stmt.where(Deadline.statutory_due_date < today)

    stmt = stmt.order_by(Deadline.statutory_due_date.desc()).limit(arguments.get("limit", 50))
    rows = db.execute(stmt).scalars().all()

    result = []
    for r in rows:
        result.append({
            "id": str(r.id),
            "client_id": str(r.client_id) if r.client_id else None,
            "compliance_rule_id": str(r.compliance_rule_id) if r.compliance_rule_id else None,
            "statutory_due_date": r.statutory_due_date.isoformat() if r.statutory_due_date else None,
            "internal_due_date": r.internal_due_date.isoformat() if r.internal_due_date else None,
            "period_key": r.period_key,
            "verified": r.verified,
            "source": r.source,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })
    return j.dumps(result)


async def _tool_get_compliance_record(db, arguments: dict[str, Any]) -> str:
    from app.models import Deadline, ComplianceRule
    import json

    tenant_id = arguments.get("_tenant_id")
    record_id = arguments.get("record_id")
    if not record_id:
        return json.dumps({"error": "record_id is required"})

    dl = db.get(Deadline, record_id)
    if dl is None or str(dl.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Compliance record {record_id} not found"})

    rule_name = None
    if dl.rule:
        rule_name = dl.rule.name
    elif dl.compliance_rule_id:
        rule = db.get(ComplianceRule, dl.compliance_rule_id)
        if rule:
            rule_name = rule.name

    return json.dumps({
        "id": str(dl.id),
        "client_id": str(dl.client_id) if dl.client_id else None,
        "compliance_rule_id": str(dl.compliance_rule_id) if dl.compliance_rule_id else None,
        "rule_name": rule_name,
        "statutory_due_date": dl.statutory_due_date.isoformat() if dl.statutory_due_date else None,
        "internal_due_date": dl.internal_due_date.isoformat() if dl.internal_due_date else None,
        "period_key": dl.period_key,
        "verified": dl.verified,
        "verified_by_id": str(dl.verified_by_id) if dl.verified_by_id else None,
        "verified_at": dl.verified_at.isoformat() if dl.verified_at else None,
        "source": dl.source,
        "notes": dl.notes,
        "created_at": dl.created_at.isoformat() if dl.created_at else None,
    })


async def _tool_update_compliance_record(db, arguments: dict[str, Any]) -> str:
    from app.models import Deadline
    import json
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    record_id = arguments.get("record_id")
    if not record_id:
        return json.dumps({"error": "record_id is required"})

    dl = db.get(Deadline, record_id)
    if dl is None or str(dl.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Compliance record {record_id} not found"})

    if "statutory_due_date" in arguments and arguments["statutory_due_date"] is not None:
        dl.statutory_due_date = arguments["statutory_due_date"]
    if "internal_due_date" in arguments and arguments["internal_due_date"] is not None:
        dl.internal_due_date = arguments["internal_due_date"]
    if "verified" in arguments and arguments["verified"] is not None:
        if arguments["verified"]:
            user_id = arguments.get("_user_id")
            dl.verified_by_id = user_id
            dl.verified_at = now_local()
        dl.verified = arguments["verified"]
    if "notes" in arguments:
        dl.notes = arguments["notes"]

    db.commit()
    db.refresh(dl)
    return json.dumps({
        "id": str(dl.id),
        "verified": dl.verified,
        "statutory_due_date": dl.statutory_due_date.isoformat() if dl.statutory_due_date else None,
        "internal_due_date": dl.internal_due_date.isoformat() if dl.internal_due_date else None,
        "created_at": dl.created_at.isoformat() if dl.created_at else None,
    })


# ── New tools: billing ────────────────────────────────────────────────────


async def _tool_create_invoice(db, arguments: dict[str, Any]) -> str:
    import json as j
    from app.services.billing import create_invoice_record

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    client_id = arguments.get("client_id")
    items = arguments.get("items") or []
    if not client_id:
        return j.dumps({"error": "client_id is required"})
    if not items:
        return j.dumps({"error": "items (line items) is required"})

    try:
        invoice = create_invoice_record(
            db,
            tenant_id=tenant_id,
            client_id=client_id,
            items=items,
            due_days=arguments.get("due_days", 15),
            invoice_date=arguments.get("invoice_date"),
            notes=arguments.get("notes"),
            terms=arguments.get("terms"),
            created_by_id=arguments.get("_user_id"),
        )
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create invoice: {exc}"})

    db.add(invoice)
    db.flush()
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create invoice: {exc}"})
    db.refresh(invoice)

    return j.dumps({
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "client_id": str(invoice.client_id),
        "client_name": invoice.client_name,
        "status": invoice.status,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "subtotal": round(float(invoice.subtotal), 2),
        "taxable_total": round(float(invoice.taxable_total), 2),
        "cgst_amount": round(float(invoice.cgst_amount), 2),
        "sgst_amount": round(float(invoice.sgst_amount), 2),
        "igst_amount": round(float(invoice.igst_amount), 2),
        "total": round(float(invoice.total), 2),
        "amount_paid": round(float(invoice.amount_paid), 2),
        "outstanding": round(float(invoice.outstanding), 2),
        "line_count": len(invoice.lines),
    })


async def _tool_get_invoice(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice, InvoiceLine, Payment
    import json
    from sqlalchemy import select

    tenant_id = arguments.get("_tenant_id")
    invoice_id = arguments.get("invoice_id")
    if not invoice_id:
        return json.dumps({"error": "invoice_id is required"})

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or str(invoice.tenant_id) != str(tenant_id):
        return json.dumps({"error": f"Invoice {invoice_id} not found"})

    lines = db.execute(
        select(InvoiceLine).where(InvoiceLine.invoice_id == invoice_id)
        .order_by(InvoiceLine.sequence)
    ).scalars().all()

    payments = db.execute(
        select(Payment).where(Payment.invoice_id == invoice_id)
        .order_by(Payment.created_at)
    ).scalars().all()

    return json.dumps({
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "client_id": str(invoice.client_id) if invoice.client_id else None,
        "client_name": invoice.client_name,
        "client_code": invoice.client_code,
        "status": invoice.status,
        "invoice_date": invoice.invoice_date.isoformat() if invoice.invoice_date else None,
        "due_date": invoice.due_date.isoformat() if invoice.due_date else None,
        "place_of_supply_state_code": invoice.place_of_supply_state_code,
        "gst_tax_type": invoice.gst_tax_type,
        "tax_rate": float(invoice.tax_rate) if invoice.tax_rate else 0,
        "subtotal": round(float(invoice.subtotal), 2),
        "taxable_total": round(float(invoice.taxable_total), 2),
        "cgst_amount": round(float(invoice.cgst_amount), 2),
        "sgst_amount": round(float(invoice.sgst_amount), 2),
        "igst_amount": round(float(invoice.igst_amount), 2),
        "total": round(float(invoice.total), 2),
        "amount_paid": round(float(invoice.amount_paid), 2),
        "outstanding": round(float(invoice.outstanding), 2),
        "is_overdue": bool(invoice.is_overdue) if invoice.is_overdue else False,
        "days_overdue": invoice.days_overdue or 0,
        "lines": [
            {
                "description": l.description,
                "quantity": float(l.quantity) if l.quantity else 1,
                "unit_price": round(float(l.unit_price), 2),
                "discount": round(float(l.discount), 2),
                "amount": round(float(l.amount), 2),
                "sac_code": l.sac_code,
                "is_taxable": l.is_taxable,
            }
            for l in lines
        ],
        "payments": [
            {
                "amount": round(float(p.amount), 2),
                "paid_on": p.paid_on.isoformat() if p.paid_on else None,
                "method": p.method,
                "reference": p.reference,
            }
            for p in payments
        ],
    })


async def _tool_create_payment(db, arguments: dict[str, Any]) -> str:
    import json

    from app.services.billing import record_payment

    tenant_id = arguments.get("_tenant_id")
    user_id = arguments.get("_user_id")
    invoice_id = arguments.get("invoice_id")
    amount = arguments.get("amount")
    method = arguments.get("method")
    reference = arguments.get("reference")
    paid_on = arguments.get("paid_on")
    notes = arguments.get("notes")

    if not invoice_id:
        return json.dumps({"error": "invoice_id is required"})
    if amount is None:
        return json.dumps({"error": "amount is required"})
    if not method:
        return json.dumps({"error": "method is required"})

    try:
        payment = record_payment(
            db,
            tenant_id,
            invoice_id,
            amount,
            method,
            reference=reference,
            paid_on=paid_on,
            notes=notes,
            user_id=user_id,
        )
        from app.models import Invoice

        invoice = db.get(Invoice, invoice_id)
        return json.dumps({
            "payment_id": str(payment.id),
            "invoice_id": str(invoice_id),
            "amount": round(float(payment.amount), 2),
            "method": payment.method,
            "paid_on": payment.paid_on.isoformat() if payment.paid_on else None,
            "reference": payment.reference,
            "new_outstanding": round(float(invoice.outstanding), 2) if invoice else None,
            "new_status": invoice.status if invoice else None,
        })
    except Exception as exc:
        # Preserve error message format compatible with tests if needed
        return json.dumps({"error": str(exc)})


# ── New tools: documents ──────────────────────────────────────────────────


async def _tool_create_document(db, arguments: dict[str, Any]) -> str:
    from app.models import Document, DocumentVersion, Client, Task
    import json as j
    import uuid as uuid_module
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    title = arguments.get("title")
    if not title:
        return j.dumps({"error": "title is required"})

    now = now_local()

    document = Document(
        tenant_id=tenant_id,
        client_id=arguments.get("client_id"),
        task_id=arguments.get("task_id"),
        category=arguments.get("category"),
        doc_type=arguments.get("doc_type"),
        title=title,
        description=arguments.get("description"),
        period_key=arguments.get("period_key"),
        is_confidential=arguments.get("is_confidential", False),
        from_client=arguments.get("from_client", False),
        tags=",".join(arguments.get("tags") or []),
    )
    db.add(document)
    try:
        db.flush()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create document: {exc}"})

    # Create initial version
    file_name = arguments.get("file_name", f"{title}.pdf")
    mime_type = arguments.get("mime_type", "application/octet-stream")
    size_bytes = arguments.get("size_bytes", 0)
    checksum = arguments.get("checksum_sha256") or uuid_module.uuid4().hex

    version = DocumentVersion(
        document_id=document.id,
        version_no=1,
        file_name=file_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        checksum_sha256=checksum,
        uploaded_by_id=arguments.get("_user_id"),
        uploaded_by_type="user",
    )
    db.add(version)
    document.current_version_id = version.id
    document.version_count = 1

    db.commit()
    db.refresh(document)

    return j.dumps({
        "id": str(document.id),
        "title": document.title,
        "doc_type": document.doc_type,
        "category": document.category,
        "status": document.status,
        "version_count": document.version_count,
        "is_confidential": document.is_confidential,
        "client_id": str(document.client_id) if document.client_id else None,
        "task_id": str(document.task_id) if document.task_id else None,
        "file_name": version.file_name,
        "size_bytes": version.size_bytes,
    })


def _parse_dt(value):
    """Parse an ISO date/datetime string for a TIMESTAMP column; pass through None."""
    if value is None or value == "":
        return None
    from datetime import datetime
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


async def _tool_create_financial_year(db, arguments: dict[str, Any]) -> str:
    from app.models import FinancialYear
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    code = arguments.get("code")
    label = arguments.get("label")
    if not code or not label:
        return j.dumps({"error": "code and label are required"})

    fy = FinancialYear(
        tenant_id=tenant_id, code=code, label=label,
        start_date=_parse_dt(arguments.get("start_date")),
        end_date=_parse_dt(arguments.get("end_date")),
        assessment_year=arguments.get("assessment_year"),
        is_active=bool(arguments.get("is_active", True)),
        is_closed=bool(arguments.get("is_closed", False)),
        created_at=now_local(),
    )
    db.add(fy)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create financial year (code may already exist): {exc}"})
    db.refresh(fy)
    return j.dumps({"id": str(fy.id), "code": fy.code, "label": fy.label,
                    "is_active": fy.is_active, "is_closed": fy.is_closed})


async def _tool_create_period(db, arguments: dict[str, Any]) -> str:
    from app.models import Period, ComplianceRule
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    rule_id = arguments.get("rule_id")
    rule = _validate_tenant_record(db, ComplianceRule, rule_id, tenant_id, "rule")
    if rule is None:
        return j.dumps({"error": f"Compliance rule {rule_id} not found"})

    label = arguments.get("label")
    period_key = arguments.get("period_key")
    if not label or not period_key:
        return j.dumps({"error": "label and period_key are required"})

    period = Period(
        tenant_id=tenant_id, compliance_rule_id=rule_id,
        label=label, period_key=period_key,
        start_date=_parse_dt(arguments.get("start_date")),
        end_date=_parse_dt(arguments.get("end_date")),
        is_active=bool(arguments.get("is_active", True)),
        created_at=now_local(),
    )
    db.add(period)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create period: {exc}"})
    db.refresh(period)
    return j.dumps({"id": str(period.id), "label": period.label, "period_key": period.period_key})


async def _tool_create_compliance_rule(db, arguments: dict[str, Any]) -> str:
    from app.models import ComplianceRule
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    code = arguments.get("code")
    name = arguments.get("name")
    category = arguments.get("category")
    if not code or not name or not category:
        return j.dumps({"error": "code, name and category are required"})

    lead = int(arguments.get("lead_days", 15))
    rule = ComplianceRule(
        tenant_id=tenant_id, code=code, name=name,
        description=arguments.get("description"),
        category=category,
        authority=arguments.get("authority"),
        filing_type=arguments.get("filing_type"),
        applicability_rule=arguments.get("applicability_rule"),
        default_frequency=arguments.get("default_frequency"),
        lead_days=lead,
        internal_due_days=int(arguments.get("internal_due_days", lead)),
        status=arguments.get("status", "active"),
        created_at=now_local(), updated_at=now_local(),
    )
    db.add(rule)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create compliance rule (code may already exist): {exc}"})
    db.refresh(rule)
    return j.dumps({"id": str(rule.id), "code": rule.code, "name": rule.name,
                    "category": rule.category, "authority": rule.authority,
                    "default_frequency": rule.default_frequency, "lead_days": rule.lead_days,
                    "status": rule.status})


async def _tool_create_client_service(db, arguments: dict[str, Any]) -> str:
    from app.models import ClientService, Client, Service
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    client = _validate_tenant_record(db, Client, arguments.get("client_id"), tenant_id, "client")
    if client is None:
        return j.dumps({"error": f"Client {arguments.get('client_id')} not found"})
    service = _validate_tenant_record(db, Service, arguments.get("service_id"), tenant_id, "service")
    if service is None:
        return j.dumps({"error": f"Service {arguments.get('service_id')} not found"})

    cs = ClientService(
        tenant_id=tenant_id, client_id=client.id, service_id=service.id,
        engagement_id=arguments.get("engagement_id"),
        is_active=bool(arguments.get("is_active", True)),
        start_date=_parse_dt(arguments.get("start_date")),
        end_date=_parse_dt(arguments.get("end_date")),
        notes=arguments.get("notes"),
        created_at=now_local(), updated_at=now_local(),
    )
    db.add(cs)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create client service: {exc}"})
    db.refresh(cs)
    return j.dumps({"id": str(cs.id), "client_id": str(cs.client_id),
                    "service_id": str(cs.service_id), "is_active": cs.is_active})


async def _tool_create_activity_log(db, arguments: dict[str, Any]) -> str:
    from app.core.audit import log_action
    import json as j
    import uuid as uuid_module

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    entity_type = arguments.get("entity_type")
    action = arguments.get("action")
    if not entity_type or not action:
        return j.dumps({"error": "entity_type and action are required"})

    eid = arguments.get("entity_id")
    entry = log_action(
        db,
        tenant_id=uuid_module.UUID(tenant_id),
        actor_user_id=uuid_module.UUID(arguments["_user_id"]) if arguments.get("_user_id") else None,
        entity_type=entity_type,
        entity_id=uuid_module.UUID(eid) if eid else None,
        action=action,
        summary=arguments.get("summary"),
        request_ref=arguments.get("request_ref"),
    )
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to write activity log: {exc}"})
    db.refresh(entry)
    return j.dumps({"id": str(entry.id), "entity_type": entry.entity_type,
                    "action": entry.action})


async def _tool_get_billing_settings(db, arguments: dict[str, Any]) -> str:
    from app.models import BillingSettings
    import json as j
    from sqlalchemy import select

    tenant_id = arguments.get("_tenant_id")

    settings = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()

    if settings is None:
        return j.dumps({
            "name": "",
            "legal_name": None,
            "gstin": None,
            "pan": None,
            "registration_no": None,
            "address_line1": None,
            "address_line2": None,
            "city": None,
            "state": None,
            "state_code": None,
            "pincode": None,
            "email": None,
            "phone": None,
            "currency": "INR",
            "invoice_prefix": "INV",
            "next_invoice_number": 1,
            "default_gst_rate": 18.0,
            "gst_registered": False,
        })

    return j.dumps({
        "name": settings.legal_name or "",
        "legal_name": settings.legal_name,
        "gstin": settings.gstin,
        "pan": settings.pan,
        "registration_no": None,
        "address_line1": settings.address_line1,
        "address_line2": settings.address_line2,
        "city": settings.city,
        "state": settings.state,
        "state_code": settings.state_code,
        "pincode": settings.pincode,
        "email": settings.email,
        "phone": settings.phone,
        "currency": "INR",
        "invoice_prefix": "INV",
        "next_invoice_number": 1,
        "default_gst_rate": float(settings.tax_rate) if settings.tax_rate is not None else 18.0,
        "gst_registered": bool(settings.gstin),
    })


async def _tool_create_billing_settings(db, arguments: dict[str, Any]) -> str:
    from app.models import BillingSettings
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    if not tenant_id:
        return j.dumps({"error": "tenant context required"})

    state_code = arguments.get("state_code")
    if not state_code:
        return j.dumps({"error": "state_code (firm state) is required"})

    from sqlalchemy import select

    # Idempotent: at most one BillingSettings row per tenant.
    existing = db.execute(
        select(BillingSettings).where(BillingSettings.tenant_id == tenant_id)
    ).scalars().first()
    if existing:
        for attr in ("legal_name","trade_name","pan","gstin","address_line1","address_line2",
                     "city","state","state_code","pincode","country","phone","email",
                     "gst_tax_type","tax_rate","sac_code","payment_terms_days","round_off"):
            if attr in arguments:
                setattr(existing, attr, arguments[attr])
        db.add(existing); db.commit(); db.refresh(existing)
        return j.dumps({"id": str(existing.id), "state_code": existing.state_code,
                        "tax_rate": float(existing.tax_rate) if existing.tax_rate else 0.0,
                        "updated": True})

    bs = BillingSettings(
        tenant_id=tenant_id,
        legal_name=arguments.get("legal_name"),
        trade_name=arguments.get("trade_name"),
        pan=arguments.get("pan"),
        gstin=arguments.get("gstin"),
        address_line1=arguments.get("address_line1"),
        address_line2=arguments.get("address_line2"),
        city=arguments.get("city"),
        state=arguments.get("state"),
        state_code=state_code,
        pincode=arguments.get("pincode"),
        country=arguments.get("country", "India"),
        phone=arguments.get("phone"),
        email=arguments.get("email"),
        gst_tax_type=arguments.get("gst_tax_type", "regular"),
        tax_rate=float(arguments.get("tax_rate", 18.0)),
        sac_code=arguments.get("sac_code"),
        payment_terms_days=int(arguments.get("payment_terms_days", 15)),
        round_off=bool(arguments.get("round_off", False)),
        created_at=now_local(), updated_at=now_local(),
    )
    db.add(bs)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to create billing settings: {exc}"})
    db.refresh(bs)
    return j.dumps({"id": str(bs.id), "state_code": bs.state_code,
                    "tax_rate": float(bs.tax_rate) if bs.tax_rate else 0.0,
                    "updated": False})


async def _tool_update_invoice(db, arguments: dict[str, Any]) -> str:
    from app.models import Invoice
    import json as j
    from app.core.clock import now_local

    tenant_id = arguments.get("_tenant_id")
    invoice_id = arguments.get("invoice_id")
    if not invoice_id:
        return j.dumps({"error": "invoice_id is required"})

    invoice = db.get(Invoice, invoice_id)
    if invoice is None or (tenant_id and str(invoice.tenant_id) != str(tenant_id)):
        return j.dumps({"error": f"Invoice {invoice_id} not found"})

    old_status = invoice.status
    if "status" in arguments:
        invoice.status = arguments["status"]
        if invoice.status == "issued" and invoice.issued_at is None:
            invoice.issued_at = now_local()
        if invoice.status == "paid":
            invoice.outstanding = 0.0
    if arguments.get("due_date") is not None:
        from datetime import datetime
        invoice.due_date = datetime.fromisoformat(str(arguments["due_date"]).replace("Z", "+00:00"))
    if arguments.get("terms") is not None:
        invoice.terms = arguments["terms"]
    if arguments.get("notes") is not None:
        invoice.notes = arguments["notes"]
    invoice.updated_at = now_local()

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        return j.dumps({"error": f"Failed to update invoice: {exc}"})
    db.refresh(invoice)
    return j.dumps({"success": True, "invoice_id": invoice_id,
                    "invoice_number": invoice.invoice_number,
                    "old_status": old_status, "new_status": invoice.status,
                    "outstanding": round(float(invoice.outstanding), 2)})


async def _tool_whatsapp_status(db, arguments: dict[str, Any]) -> str:
    import json as j
    from app.services.whatsapp_service import get_whatsapp_status
    return j.dumps(await get_whatsapp_status())


async def _tool_whatsapp_qr(db, arguments: dict[str, Any]) -> str:
    import json as j
    from app.services.whatsapp_service import get_whatsapp_qr
    return j.dumps(await get_whatsapp_qr())


async def _tool_whatsapp_send_message(db, arguments: dict[str, Any]) -> str:
    import json as j
    from app.services.whatsapp_service import send_whatsapp_message

    phone_number = arguments.get("phone_number")
    message = arguments.get("message")
    if not phone_number:
        return j.dumps({"error": "phone_number is required"})
    if not message:
        return j.dumps({"error": "message is required"})
    return j.dumps(await send_whatsapp_message(phone_number, message))


async def _tool_whatsapp_send_invoice(db, arguments: dict[str, Any]) -> str:
    import json as j
    from app.core.errors import NotFoundError, ValidationError
    from app.services.whatsapp_service import send_invoice_via_whatsapp

    tenant_id = arguments.get("_tenant_id")
    invoice_id = arguments.get("invoice_id")
    message = arguments.get("message")
    if not invoice_id:
        return j.dumps({"error": "invoice_id is required"})

    try:
        result = await send_invoice_via_whatsapp(
            db,
            tenant_id=tenant_id,
            invoice_id=invoice_id,
            message=message,
            user_id=arguments.get("_user_id"),
        )
    except (NotFoundError, ValidationError) as exc:
        return j.dumps({"error": exc.message})
    return j.dumps(result)


def get_session_manager() -> Any:
    """Build and cache the MCP Server instance (has session_manager property)."""
    global _session_manager, _starlette_app, _raw_asgi_app

    if _session_manager is not None:
        return _session_manager

    with _lock:
        if _session_manager is not None:
            return _session_manager

        from mcp.server import Server as MCPServer

        server = MCPServer(
            name=MCP_APP_NAME,
            version="1.0.0",
            on_list_tools=_handle_list_tools(),
            on_call_tool=_handle_call_tool(),
        )

        _session_manager = server

        asgi_app = server.streamable_http_app(
            streamable_http_path="/",
            stateless_http=True,
        )
        _raw_asgi_app = asgi_app

        return _session_manager


def get_mcp_asgi_app():
    """Return the cached Starlette ASGI app for MCP."""
    if _starlette_app is None:
        build_streamable_http_app()
    return _starlette_app


def get_mcp_session_manager():
    """Return the MCP StreamableHTTPSessionManager after streamable_http_app() is called."""
    if _session_manager is None:
        get_session_manager()
    return _session_manager._session_manager


def _extract_tenant_from_request(scope: dict) -> str | None:
    """Extract tenant_id and user_id from the bearer token in the ASGI request scope.

    Returns a tuple of (tenant_id, user_id, permissions) or None if the token
    is missing, malformed, expired, or invalid.
    """
    if scope.get("type") != "http":
        return None
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    auth = headers.get("authorization", "")
    token = None
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    if not token:
        # Also check cookies for ca_staff_token
        cookie_header = headers.get("cookie", "")
        if cookie_header:
            for pair in cookie_header.split(";"):
                if "=" in pair:
                    name, _, value = pair.partition("=")
                    if name.strip() == "ca_staff_token":
                        token = value.strip()
                        break
    if not token:
        return None
    try:
        from app.core.security import decode_token
        payload = decode_token(token, expected_type="access")
        return payload.tenant_id, payload.sub, payload.permissions
    except Exception:
        return None


_RATE_BUCKETS: dict[str, list[float]] = {}


async def _send_rate_limited(send, retry_after):
    body = json_module.dumps({"error": "rate limit exceeded"}).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": 429,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"retry-after", str(retry_after).encode("ascii")),
        ],
    })
    await send({"type": "http.response.body", "body": body})


def _get_rate_limit_config() -> tuple[bool, int, int]:
    """Get rate limit configuration from environment variables.
    
    Environment variables:
    - MCP_RATE_LIMIT_ENABLED (default: true) - Enable/disable rate limiting
    - MCP_RATE_LIMIT_REQUESTS (default: 60) - Number of requests allowed per window
    - MCP_RATE_LIMIT_WINDOW_SECONDS (default: 60) - Time window in seconds
    
    In test/dev environments, can be disabled via env.
    Production default remains secure (enabled).
    Also auto-disables in test environments (when PYTEST_CURRENT_TEST is set).
    """
    import os
    
    # Auto-disable during tests for convenience (doesn't weaken production default)
    if os.getenv("PYTEST_CURRENT_TEST"):
        enabled_str = os.getenv("MCP_RATE_LIMIT_ENABLED")
        if enabled_str is None:
            return False, 60, 60
    
    # Check if rate limiting is enabled (default: true for production security)
    enabled_str = os.getenv("MCP_RATE_LIMIT_ENABLED", "true").lower()
    enabled = enabled_str not in ("false", "0", "no", "off")
    
    # Configurable limits
    try:
        requests = int(os.getenv("MCP_RATE_LIMIT_REQUESTS", "60"))
    except (ValueError, TypeError):
        requests = 60
    
    try:
        window_seconds = int(os.getenv("MCP_RATE_LIMIT_WINDOW_SECONDS", "60"))
    except (ValueError, TypeError):
        window_seconds = 60
    
    # Ensure sane values
    if requests < 1:
        requests = 60
    if window_seconds < 1:
        window_seconds = 60
    
    return enabled, requests, window_seconds


class _TenantMiddleware:
    """ASGI middleware that resolves the caller's identity from the bearer token.

    Every protected domain MCP request must carry a valid JWT bearer token.
    Missing, malformed, expired, or invalid tokens result in a 401 response —
    the request is never forwarded to the MCP application layer.

    On success, the tenant_id, user_id, and permissions are stored in request-
    scoped context variables so MCP tools can enforce authorization. The context
    variables are reset in the ``finally`` block so concurrent requests never
    share stale authentication state.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        result = _extract_tenant_from_request(scope)
        if result is None:
            await _send_unauthorized(send)
            return

        tenant_id, user_id, permissions = result

        # Rate limiting: keyed by tenant_id+user_id, fallback IP.
        # Configurable via environment variables for test/dev flexibility
        import time
        enabled, limit, window = _get_rate_limit_config()
        
        # Exempt loopback connections (dev / local test traffic) so that
        # automated test suites hitting the dev server are not throttled.
        is_loopback = False
        if enabled:
            client_ip = None
            for k, v in scope.get("headers", []):
                if k.lower() == b"x-forwarded-for":
                    client_ip = v.decode().split(",")[0].strip()
            if client_ip is None:
                client = scope.get("client")
                client_ip = client[0] if client else "unknown"
            is_loopback = client_ip in ("127.0.0.1", "::1", "localhost")
        
        if enabled and not is_loopback:
            key = f"{tenant_id}:{user_id}" if user_id else f"ip:{client_ip}"
            now = time.time()
            bucket = _RATE_BUCKETS.setdefault(key, [])
            # prune
            bucket[:] = [t for t in bucket if now - t < window]
            if len(bucket) >= limit:
                retry_after = int(window - (now - bucket[0])) + 1
                await _send_rate_limited(send, retry_after)
                return
            bucket.append(now)

        token_tenant = _current_tenant_id.set(tenant_id)
        token_user = _current_user_id.set(user_id)
        token_perms = _current_permissions.set(permissions)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_tenant_id.reset(token_tenant)
            _current_user_id.reset(token_user)
            _current_permissions.reset(token_perms)


async def _send_unauthorized(send: Any) -> None:
    """Send a 401 response for unauthenticated MCP requests."""
    body = json_module.dumps({"error": "Not authenticated"}).encode("utf-8")
    await send({
        "type": "http.response.start",
        "status": 401,
        "headers": [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(body)).encode("ascii")),
            (b"www-authenticate", b"Bearer"),
        ],
    })
    await send({
        "type": "http.response.body",
        "body": body,
    })


def build_streamable_http_app(session_manager: Any | None = None) -> Any:
    """Return the cached Starlette ASGI app for MCP streaming HTTP transport."""
    global _starlette_app, _raw_asgi_app

    if _starlette_app is not None:
        return _starlette_app

    with _lock:
        if _starlette_app is not None:
            return _starlette_app

        get_session_manager()

        # Wrap with tenant middleware so MCP tools receive tenant_id
        _starlette_app = _TenantMiddleware(_raw_asgi_app)
        return _starlette_app
