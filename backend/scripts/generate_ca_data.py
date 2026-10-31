"""Generate comprehensive CA firm data using MCP tools.

Executes via direct Python imports (in-process MCP dispatch) to avoid
HTTP auth complexity. Creates team members, clients, services, tasks,
invoices, payments, roles, and validates the results.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("PYTHONPATH", "/home/ubuntu/CA_ROHADAS/backend")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("JWT_SECRET", "dev-secret-change-me")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("CRON_SECRET", "dev-cron-secret")
os.environ.setdefault("MCP_RATE_LIMIT_ENABLED", "false")
os.environ.setdefault("AI_API_KEY", "")

from app.mcp_server.server import _dispatch_tool, _current_tenant_id, _current_user_id, _current_permissions

TID = "0d914d37-433f-4845-83f6-7486c6af2709"
PARTNER_ID = "f6cfcbea-a41c-419b-979c-2c748b1f3370"

ALL_PERMS = [
    "client.read", "client.write", "client.status",
    "contact.read", "contact.write",
    "registration.read", "registration.write",
    "service.read", "service.write",
    "engagement.read", "engagement.write",
    "task.read", "task.write", "task.approve", "task.assign",
    "task.comment", "task.close", "task.delete",
    "compliance.read", "compliance.write", "compliance.verify",
    "document.read", "document.write", "document.upload", "document.share",
    "invoice.read", "invoice.write", "invoice.issue",
    "invoice.cancel", "invoice.send", "invoice.share", "invoice.delete",
    "payment.read", "payment.write",
    "billing.settings",
    "user.read", "user.write", "user.permission.manage",
    "role.read", "role.write",
    "import.read", "import.write",
    "integration.read", "integration.write",
    "communication.read", "communication.send",
    "notification.read", "notification.write",
    "report.read",
    "credit_note.write", "recurring.write",
    "assistant.use", "mcp.tool_use",
    "financial_year.read", "financial_year.write",
    "client.read.sensitive", "invoice.read.financial",
    "payment.read.detail", "client.read.notes",
]


async def mcp_call(tool_name: str, args: dict) -> dict:
    result = await _dispatch_tool(tool_name, args)
    return json.loads(result)


async def main():
    print("=" * 70)
    print("CA FIRM COMPREHENSIVE DATA GENERATION")
    print("Using MCP Tools (Model Context Protocol)")
    print("=" * 70)

    t = _current_tenant_id.set(TID)
    u = _current_user_id.set(PARTNER_ID)
    p = _current_permissions.set(ALL_PERMS)

    stats = {"roles": 0, "users": 0, "clients": 0, "services": 0,
             "client_services": 0, "tasks": 0, "task_assignments": 0,
             "invoices": 0, "payments": 0}

    try:
        # ================================================================
        # 1. ACCESS CONTROL: Create custom roles with permissions
        # ================================================================
        print("\n" + "=" * 70)
        print("1. ACCESS CONTROL: Creating roles and permissions")
        print("=" * 70)

        roles_data = [
            {"code": "tax_specialist", "name": "Tax Specialist",
             "description": "Handles GST returns, ITR filing, TDS compliance, and tax advisory",
             "permission_codes": ["client.read", "compliance.read", "compliance.write",
                                  "document.read", "document.upload", "task.read", "task.write",
                                  "invoice.read", "tax_compliance"]},
            {"code": "audit_senior", "name": "Audit Senior",
             "description": "Leads statutory audit engagements and supervises junior staff",
             "permission_codes": ["client.read", "client.write", "task.read", "task.write",
                                  "task.approve", "task.assign", "document.read", "document.write",
                                  "compliance.read", "invoice.read"]},
            {"code": "accounts_staff_role", "name": "Accounts Staff",
             "description": "Bookkeeping, receipt processing, payment recording, and basic data entry",
             "permission_codes": ["payment.read", "payment.write", "invoice.read", "invoice.write",
                                  "document.read", "client.read", "task.read", "task.write",
                                  "invoice.read.financial"]},
            {"code": "itr_specialist", "name": "ITR Specialist",
             "description": "Specializes in income tax return preparation and TDS compliance for all entity types",
             "permission_codes": ["compliance.read", "compliance.write", "client.read",
                                  "document.read", "task.read", "task.write", "invoice.read"]},
            {"code": "billing_executive", "name": "Billing Executive",
             "description": "Manages invoice generation, payment follow-up, and receivables tracking",
             "permission_codes": ["invoice.read", "invoice.write", "invoice.issue", "invoice.send",
                                  "payment.read", "payment.write", "client.read", "report.read",
                                  "invoice.read.financial", "payment.read.detail"]},
        ]

        created_roles = []
        for rd in roles_data:
            result = await mcp_call("create_role", rd)
            if "error" in result:
                print(f"  ⚠ Role '{rd['code']}': {result['error']}")
            else:
                print(f"  ✓ Role '{rd['code']}' ({rd['name']}) created")
                print(f"    Permissions: {len(result['permissions_granted'])}, "
                      f"Skipped: {len(result['permissions_skipped'])}")
                created_roles.append(result)
                stats["roles"] += 1

        roles_list = await mcp_call("list_roles", {})
        print(f"\n  System roles now active: {len(roles_list)}")
        for r in roles_list:
            print(f"    • {r['code']}: {r['name']} "
                  f"({r['permission_count']} perms, {r['user_count']} users)")

        # ================================================================
        # 2. TEAM MANAGEMENT: Create team members with roles
        # ================================================================
        print("\n" + "=" * 70)
        print("2. TEAM MANAGEMENT: Creating team members")
        print("=" * 70)

        team_members = [
            {"email": "aarti.patel@rohadas.com", "full_name": "Aarti Patel, CA",
             "designation": "Senior Tax Specialist", "employee_code": "EMP001",
             "department": "Tax Compliance", "phone": "+91-7890-111222",
             "is_partner": False, "status": "active",
             "date_of_joining": "2020-06-15", "weekly_capacity_hours": "40",
             "role_codes": ["tax_specialist"]},
            {"email": "rajesh.kumar@rohadas.com", "full_name": "Rajesh Kumar, CA",
             "designation": "Audit Senior", "employee_code": "EMP002",
             "department": "Audit", "phone": "+91-8899-334455",
             "is_partner": False, "status": "active",
             "date_of_joining": "2019-03-10", "weekly_capacity_hours": "40",
             "role_codes": ["audit_senior"]},
            {"email": "priya.shah@rohadas.com", "full_name": "Priya Shah",
             "designation": "Accounts Executive", "employee_code": "EMP003",
             "department": "Accounts", "phone": "+91-9900-112233",
             "is_partner": False, "status": "active",
             "date_of_joining": "2021-09-20", "weekly_capacity_hours": "40",
             "role_codes": ["accounts_staff_role"]},
            {"email": "mohit.verma@rohadas.com", "full_name": "Mohit Verma, CA",
             "designation": "ITR & TDS Specialist", "employee_code": "EMP004",
             "department": "Tax Compliance", "phone": "+91-7788-990011",
             "is_partner": False, "status": "active",
             "date_of_joining": "2022-01-05", "weekly_capacity_hours": "35",
             "role_codes": ["itr_specialist"]},
            {"email": "sneha.gupta@rohadas.com", "full_name": "Sneha Gupta, CA",
             "designation": "Assistant Manager", "employee_code": "EMP005",
             "department": "Compliance", "phone": "+91-6677-889900",
             "is_partner": False, "status": "active",
             "date_of_joining": "2018-11-12", "weekly_capacity_hours": "40",
             "role_codes": ["manager"]},
            {"email": "aman.joshi@rohadas.com", "full_name": "Aman Joshi",
             "designation": "Article Assistant", "employee_code": "EMP006",
             "department": "Compliance", "phone": "+91-5544-332299",
             "is_partner": False, "status": "active",
             "date_of_joining": "2023-07-01", "weekly_capacity_hours": "30",
             "role_codes": ["article_assistant"]},
            {"email": "neha.mehta@rohadas.com", "full_name": "Neha Mehta, CA",
             "designation": "CA Senior", "employee_code": "EMP007",
             "department": "Audit", "phone": "+91-4433-221100",
             "is_partner": False, "status": "active",
             "date_of_joining": "2017-04-18", "weekly_capacity_hours": "40",
             "role_codes": ["ca_senior"]},
            {"email": "vijay.chauhan@rohadas.com", "full_name": "Vijay Chauhan",
             "designation": "Billing Executive", "employee_code": "EMP008",
             "department": "Billing", "phone": "+91-3322-110099",
             "is_partner": False, "status": "active",
             "date_of_joining": "2024-01-10", "weekly_capacity_hours": "40",
             "role_codes": ["billing_executive"]},
        ]

        bulk_result = await mcp_call("bulk_create_users", {"users": team_members})
        print(f"\n  Created {bulk_result['created']} team members out of {len(team_members)} requested")
        user_map = {}
        for u_data in bulk_result["results"]:
            user_map[u_data["email"]] = u_data["id"]
            print(f"    ✓ {u_data['full_name']} ({u_data['employee_code']})")
            print(f"      Email: {u_data['email']}, Roles: {u_data['roles']}")
            if u_data.get("temp_password"):
                print(f"      Temp password: {u_data['temp_password']}")
        if bulk_result.get("errors"):
            print(f"  Errors: {len(bulk_result['errors'])}")
            for e in bulk_result["errors"]:
                print(f"    ✗ {e}")
        stats["users"] = bulk_result["created"]

        # ================================================================
        # 3. Create Financial Years
        # ================================================================
        print("\n" + "=" * 70)
        print("3. FINANCIAL YEARS: Creating financial year")
        print("=" * 70)

        fy_result = await mcp_call("create_financial_year", {
            "code": "FY2025-26",
            "label": "FY 2025-26",
            "start_date": "2025-04-01",
            "end_date": "2026-03-31",
            "assessment_year": "2026",
            "is_active": True,
            "is_closed": False,
        })
        if "error" in fy_result:
            print(f"  ⚠ {fy_result['error']}")
            # Try listing existing
            fy_list = await mcp_call("list_financial_years", {"include_closed": True})
            print(f"  Existing financial years: {fy_list}")
        else:
            print(f"  ✓ Created {fy_result.get('name', 'FY 2025-26')} (id={fy_result.get('id')})")
            fy_id = fy_result["id"]

        # ================================================================
        # 4. CLIENT & BILLING: Create services, clients, and assignments
        # ================================================================
        print("\n" + "=" * 70)
        print("4. SERVICES: Creating service catalogue")
        print("=" * 70)

        services_data = [
            {"code": "ITR-01", "name": "ITR-1 & ITR-2 Filing",
             "category": "income_tax", "description": "Income tax return filing for individuals and HUF",
             "sac_code": "998311", "standard_fee": 5000,
             "default_frequency": "yearly", "default_priority": "high",
             "is_recurring": True},
            {"code": "GST-01", "name": "GST Return Filing",
             "category": "gst", "description": "Monthly/quarterly GST return filing and reconciliation",
             "sac_code": "998312", "standard_fee": 1500,
             "default_frequency": "monthly", "default_priority": "high",
             "is_recurring": True},
            {"code": "BS-01", "name": "Balance Sheet & P&L",
             "category": "accounts", "description": "Annual accounts, balance sheet and profit & loss statement",
             "sac_code": "998314", "standard_fee": 25000,
             "default_frequency": "yearly", "default_priority": "normal",
             "is_recurring": True},
            {"code": "AUD-01", "name": "Audit under Section 44AB",
             "category": "audit", "description": "Statutory audit for businesses exceeding turnover thresholds",
             "sac_code": "998313", "standard_fee": 40000,
             "default_frequency": "yearly", "default_priority": "high",
             "is_recurring": True},
            {"code": "TDS-01", "name": "TDS Return Filing",
             "category": "tds", "description": "Quarterly TDS return filing and certificate issuance",
             "sac_code": "998315", "standard_fee": 2000,
             "default_frequency": "quarterly", "default_priority": "normal",
             "is_recurring": True},
            {"code": "ROC-01", "name": "ROC Annual Compliance",
             "category": "roc", "description": "Annual ROC filing: AOC-4, MGT-7, Director KYC",
             "sac_code": "998316", "standard_fee": 8000,
             "default_frequency": "yearly", "default_priority": "high",
             "is_recurring": True},
        ]

        service_map = {}
        for sd in services_data:
            result = await mcp_call("create_service", {
                "code": sd["code"],
                "name": sd["name"],
                "category": sd["category"],
                "sac_code": sd["sac_code"],
                "description": sd["description"],
                "standard_fee": sd["standard_fee"],
                "default_frequency": sd["default_frequency"],
                "default_priority": sd["default_priority"],
                "is_recurring": sd["is_recurring"],
            })
            if "error" in result:
                print(f"  ⚠ Service '{sd['name']}': {result['error']}")
            else:
                print(f"  ✓ {sd['name']} (code: {sd['code']}, sac: {sd['sac_code']}, fee: {sd['standard_fee']})")
                service_map[sd["name"]] = result
                stats["services"] += 1

        print(f"\n  Services created: {len(service_map)}")

        # ── Create Clients ──
        print("\n" + "=" * 70)
        print("4. CLIENT MANAGEMENT: Creating client profiles")
        print("=" * 70)

        clients_data = [
            {"legal_name": "Sharma & Co. Consultants LLP", "pan": "AABCS1234D",
             "city": "Mumbai", "state": "Maharashtra", "state_code": "MH",
             "status": "active", "kyc_status": "completed", "service_ids": ["GST-01", "ITR-01"]},
            {"legal_name": "Patel Family Holdings", "pan": "AACCP4567E",
             "city": "Pune", "state": "Maharashtra", "state_code": "MH",
             "status": "active", "kyc_status": "completed", "service_ids": ["ITR-01"]},
            {"legal_name": "Global Tech Solutions Ltd.", "pan": "AAACG7890F",
             "city": "Bangalore", "state": "Karnataka", "state_code": "KA",
             "status": "active", "kyc_status": "completed", "service_ids": ["GST-01", "BS-01", "ROC-01"]},
            {"legal_name": "Royal Constructions", "pan": "AAACR1234G",
             "city": "Hyderabad", "state": "Telangana", "state_code": "TG",
             "status": "active", "kyc_status": "completed", "service_ids": ["GST-01", "ITR-01"]},
            {"legal_name": "Mehta & Associates", "pan": "AAACM5678H",
             "city": "Ahmedabad", "state": "Gujarat", "state_code": "GJ",
             "status": "active", "kyc_status": "completed", "service_ids": ["ITR-01", "TDS-01"]},
            {"legal_name": "Sunrise Industries", "pan": "AAACI9012J",
             "city": "Chennai", "state": "Tamil Nadu", "state_code": "TN",
             "status": "prospect", "kyc_status": "not_started", "service_ids": []},
            {"legal_name": "Green Valley Farms", "pan": "AAACG3456K",
             "city": "Jaipur", "state": "Rajasthan", "state_code": "RJ",
             "status": "active", "kyc_status": "in_progress", "service_ids": ["GST-01"]},
            {"legal_name": "Metro Retail Chain Pvt. Ltd.", "pan": "AAACM7890L",
             "city": "Delhi", "state": "Delhi", "state_code": "DL",
             "status": "active", "kyc_status": "completed", "service_ids": ["GST-01", "ITR-01", "TDS-01"]},
        ]

        client_map = {}
        for cd in clients_data:
            result = await mcp_call("create_client", {
                "legal_name": cd["legal_name"],
                "client_type": "legal_entity",
                "pan": cd["pan"],
                "city": cd["city"],
                "state": cd["state"],
                "state_code": cd["state_code"],
                "status": cd["status"],
                "kyc_status": cd["kyc_status"],
            })
            if "error" in result:
                print(f"  ⚠ Client '{cd['legal_name']}': {result['error']}")
            else:
                result["service_ids"] = cd.get("service_ids", [])
                result["status"] = cd["status"]
                client_map[cd["legal_name"]] = result
                print(f"  ✓ {result['legal_name']} ({result['client_code']}) - {cd['city']}")
                stats["clients"] += 1

        # ── Associate clients with services ──
        print("\n  Associating clients with services...")
        for client_name, client_info in client_map.items():
            if client_info.get("status") != "active":
                continue
            for svc_code in client_info.get("service_ids", []):
                svc = next((s for s in service_map.values() if s.get("code") == svc_code), None)
                if not svc:
                    svc = next((s for s in service_map.values() if svc_code in s.get("name", "")), None)
                if svc:
                    cs_result = await mcp_call("create_client_service", {
                        "client_id": client_info["id"],
                        "service_id": svc.get("id", svc.get("service_id")),
                        "billing_method": "fixed",
                        "fee_amount": svc.get("standard_fee", 15000),
                    })
                    if "error" in cs_result:
                        print(f"    ⚠ {client_name} <-> {svc.get('name')}: {cs_result['error']}")
                    else:
                        print(f"    ✓ {client_name} <-> {svc.get('name', svc_code)}")
                        stats["client_services"] += 1

        print(f"\n  Total clients: {len(client_map)}")

        # ================================================================
        # 5. TASK MANAGEMENT: Create tasks and assign to team members
        # ================================================================
        print("\n" + "=" * 70)
        print("5. TASK MANAGEMENT: Creating tasks and assignments")
        print("=" * 70)

        # Get financial year
        fy_list = await mcp_call("list_financial_years", {"include_closed": True})
        fy_id = None
        if fy_list and isinstance(fy_list, list) and len(fy_list) > 0:
            fy_id = fy_list[0].get("id")
            print(f"  Using financial year: {fy_list[0].get('name')} (id={fy_id})")

        today = date.today()
        tasks_data = []
        task_assignments = []

        active_clients = [(name, info) for name, info in client_map.items() if info.get("status") == "active"]
        team_list = list(user_map.values())
        svc_by_code = {s.get("code"): s for s in service_map.values()}

        # Create tasks per client
        for idx, (client_name, client_info) in enumerate(active_clients):
            services = client_info.get("service_ids", [])
            for svc_code in services:
                svc = svc_by_code.get(svc_code) or next((s for s in service_map.values() if svc_code in s.get("name", "")), None)
                due_date = today + timedelta(days=10 + idx * 3)
                title = f"{svc.get('name', svc_code)} - {client_name} - Due {due_date.strftime('%b %Y')}" if svc else f"Compliance Task - {client_name}"
                task_obj = {
                    "client_id": client_info["id"],
                    "title": title,
                    "description": f"{svc.get('description', 'Compliance task')} for {client_name}",
                    "category": svc.get("category", "compliance") if svc else "compliance",
                    "priority": "high",
                    "statutory_due_date": due_date.isoformat(),
                    "service_id": svc.get("id") if svc else None,
                    "tags": [svc.get("category", "compliance"), client_name[:10]],
                }
                tasks_data.append(task_obj)

        if tasks_data:
            bulk_tasks = await mcp_call("bulk_create_tasks", {"tasks": tasks_data})
            print(f"\n  Created {bulk_tasks['created']} tasks")
            task_results = bulk_tasks["results"]
            stats["tasks"] = bulk_tasks["created"]
            if bulk_tasks.get("errors"):
                print(f"  Task errors: {len(bulk_tasks['errors'])}")

            # Assign tasks: preparer and reviewer from different team members
            print("\n  Assigning tasks to team members...")
            for i, t_data in enumerate(task_results):
                preparer = team_list[i % len(team_list)] if team_list else None
                reviewer = team_list[(i + 1) % len(team_list)] if len(team_list) > 1 else None

                if preparer:
                    result = await mcp_call("assign_task", {
                        "task_id": t_data["id"],
                        "role": "preparer",
                        "user_id": preparer,
                    })
                    if "error" not in result:
                        stats["task_assignments"] += 1

                if reviewer and reviewer != preparer:
                    result2 = await mcp_call("assign_task", {
                        "task_id": t_data["id"],
                        "role": "reviewer",
                        "user_id": reviewer,
                    })
                    if "error" not in result2:
                        stats["task_assignments"] += 1

            print(f"  Total task assignments: {stats['task_assignments']}")

        # ── Set varied task statuses for dashboard visibility ──
        print("\n  Setting task statuses...")
        status_schedule = [
            "in_progress",
            "ready_for_review",
            "in_progress",
            "ready_for_approval",
            "approved",
            "in_progress",
            "ready_for_review",
            "changes_requested",
            "in_progress",
            "ready_for_approval",
            "approved",
            "ready_to_file",
            "filed",
            "completed",
        ]
        for i, t_data in enumerate(task_results):
            status = status_schedule[i % len(status_schedule)]
            await mcp_call("update_task_status", {
                "task_id": t_data["id"],
                "status": status,
            })
        print(f"  Updated {len(task_results)} task statuses")

        # ================================================================
        # 6. BILLING: Create invoices and payments
        print("\n" + "=" * 70)
        print("6. BILLING: Creating invoices and payments")
        print("=" * 70)

        invoice_count = 0
        for client_name, client_info in active_clients[:6]:
            # Determine applicable services for invoice
            client_svcs = client_info.get("service_ids", [])
            svc_objs = [svc_by_code[s] for s in client_svcs if s in svc_by_code]

            for svc_obj in svc_objs[:2]:
                fee = svc_obj.get("standard_fee", 15000)
                result = await mcp_call("create_invoice", {
                    "client_id": client_info["id"],
                    "items": [{
                        "description": f"{svc_obj.get('name', 'Service')} - Monthly retainer",
                        "quantity": 1,
                        "unit_price": fee,
                        "sac_code": svc_obj.get("sac_code", "998311"),
                        "gst_tax_type": "taxable",
                    }],
                    "due_days": 15,
                    "invoice_date": today.isoformat(),
                    "notes": f"Retainer for {svc_obj.get('name', 'service')}, {client_name}",
                })
                if "error" in result:
                    print(f"  ⚠ Invoice for {client_name}: {result['error']}")
                else:
                    invoice_count += 1
                    print(f"  ✓ Invoice {result['invoice_number']} for {result['client_name']}")
                    print(f"    Amount: {result['total']}, Due: {result['due_date']}")

                    # Create a payment for this invoice (partial or full)
                    pay_result = await mcp_call("create_payment", {
                        "invoice_id": result["id"],
                        "amount": round(result["outstanding"] * 0.6, 2) if result["outstanding"] else round(result["total"] * 0.6, 2),
                        "method": "bank_transfer",
                        "reference": f"PAY-{invoice_count:04d}",
                        "paid_on": today.isoformat(),
                        "notes": "Advance payment received",
                    })
                    if "error" in pay_result:
                        print(f"    ⚠ Payment: {pay_result['error']}")
                    else:
                        stats["payments"] += 1
                        print(f"    ✓ Payment: {pay_result.get('amount', '?')} via {pay_result.get('method', '?')}")

            stats["invoices"] += 1

        print(f"\n  Invoices created: {invoice_count}")
        print(f"  Payments created: {stats['payments']}")

        # ================================================================
        # 7. VALIDATION & REPORTING
        # ================================================================
        print("\n" + "=" * 70)
        print("7. VALIDATION & REPORTING")
        print("=" * 70)

        report = await mcp_call("generate_report", {"report_type": "full"})

        print("\n" + json.dumps(report, indent=2, default=str))

        print("\n" + "=" * 70)
        print("COMPREHENSIVE DATA GENERATION COMPLETE")
        print("=" * 70)
        print(f"\n{'Metric':<25} {'Count':>10}")
        print(f"{'-'*35}")
        print(f"{'Roles created':<25} {stats['roles']:>10}")
        print(f"{'Team members created':<25} {stats['users']:>10}")
        print(f"{'Clients created':<25} {stats['clients']:>10}")
        print(f"{'Services created':<25} {stats['services']:>10}")
        print(f"{'Client-service links':<25} {stats['client_services']:>10}")
        print(f"{'Tasks created':<25} {stats['tasks']:>10}")
        print(f"{'Task assignments':<25} {stats['task_assignments']:>10}")
        print(f"{'Invoices created':<25} {invoice_count:>10}")
        print(f"{'Payments recorded':<25} {stats['payments']:>10}")
        print(f"{'-'*35}")
        print(f"{'Validation errors':<25} {len(report.get('validation_errors', [])):>10}")
        print(f"{'Findings (warnings)':<25} {len(report.get('findings', [])):>10}")
        print(f"{'All checks passed':<25} {str(report.get('all_checks_passed', False)):>10}")

    finally:
        _current_tenant_id.reset(t)
        _current_user_id.reset(u)
        _current_permissions.reset(p)


if __name__ == "__main__":
    asyncio.run(main())
