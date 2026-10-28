"""Generate realistic, interconnected synthetic CA-practice data via the registered
MCP tools only (no direct SQL writes for business data).

Idempotent: a manifest file (data_manifest.json) maps business keys -> server IDs,
so re-running the script reuses existing records instead of duplicating them.

Targets (per the audit brief):
  Clients 100 | Client-service assignments 200 | Tasks 300 | Compliance records 300
  Invoices 150 | Payments 200 | Documents 100 | Activity logs 100

Verification results are written to data_report.json.
"""
from __future__ import annotations

import json
import os
import random
import time
import urllib.error
import urllib.request as ur
from datetime import date, datetime, timedelta

random.seed(42)

BASE = "http://127.0.0.1:8000/mcp/"
TID = "9eb9d951-975e-4f6f-9689-b49d363075e9"   # Rohada & Associates (dev tenant)

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "data_manifest.json")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "data_report.json")

_TOK = None


def token() -> str:
    global _TOK
    if _TOK is None:
        from app.core.security import create_access_token
        _TOK = create_access_token(
            subject="86c77a10-5bd4-48dd-8765-909cd2a2dabc",  # partner user
            tenant_id=TID, roles=["partner"], permissions=["*"],
        )
    return _TOK


def call(name: str, args: dict | None = None) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": name, "arguments": args or {}}}).encode()
    h = {"Accept": "application/json, text/event-stream",
         "Content-Type": "application/json",
         "Authorization": f"Bearer {token()}"}
    # The MCP endpoint is rate-limited (default 60 req/min per tenant+user).
    # Retry on HTTP 429 with exponential backoff so bulk steps don't abort.
    max_retries = 5
    backoff = 1.0
    for attempt in range(1, max_retries + 1):
        try:
            data = ur.urlopen(ur.Request(BASE, data=payload, headers=h, method="POST"), timeout=30).read().decode()
            line = [l for l in data.split("\n") if l.startswith("data:")][0]
            res = json.loads(line[6:])["result"]
            if res.get("isError"):
                return {"_error": res["content"][0]["text"]}
            return json.loads(res["content"][0]["text"])
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                ra = e.headers.get("retry-after")
                wait = float(ra) if ra else backoff
                time.sleep(wait)
                backoff = min(backoff * 2, 30)
                continue
            raise


def is_list(res) -> list:
    return res if isinstance(res, list) else []


def load_manifest() -> dict:
    if os.path.exists(MANIFEST_PATH):
        try:
            with open(MANIFEST_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_manifest(m: dict) -> None:
    with open(MANIFEST_PATH, "w") as f:
        json.dump(m, f, indent=2)


# ── Reference data ───────────────────────────────────────────────────────
SERVICES = [
    ("GST3B", "GSTR-3B Return", "gst", "9983", "monthly"),
    ("GST1", "GSTR-1 Return", "gst", "9983", "monthly"),
    ("ITR1", "Income Tax Return ITR-1", "income_tax", "9991", "annual"),
    ("ITR3", "Income Tax Return ITR-3", "income_tax", "9991", "annual"),
    ("ITR4", "Income Tax Return ITR-4", "income_tax", "9991", "annual"),
    ("TDS26", "TDS Return 26Q", "tds", "9992", "quarterly"),
    ("TDS27", "TDS Return 27Q", "tds", "9992", "quarterly"),
    ("AUDIT", "Statutory Audit", "audit", "9993", "annual"),
    ("BOOK", "Bookkeeping", "accounting", "9983", "monthly"),
    ("ACCT", "Accounting Compilation", "accounting", "9983", "annual"),
    ("ROC", "ROC Annual Filing", "roc", "9994", "annual"),
    ("PAY", "Payroll", "payroll", "9995", "monthly"),
]

RULES = [
    ("ITR1-R", "ITR-1 Filing", "income_tax", "ITD", "return", "annual", 90),
    ("ITR3-R", "ITR-3 Filing", "income_tax", "ITD", "return", "annual", 90),
    ("GST3B-R", "GSTR-3B", "gst", "GSTN", "return", "monthly", 15),
    ("GST1-R", "GSTR-1", "gst", "GSTN", "return", "monthly", 15),
    ("TDS26-R", "TDS 26Q", "tds", "ITD", "return", "quarterly", 15),
    ("TDS27-R", "TDS 27Q", "tds", "ITD", "return", "quarterly", 15),
    ("AUDIT-R", "Statutory Audit", "audit", "ICAI", "audit_report", "annual", 60),
    ("ROC-R", "ROC Annual Return", "roc", "MCA", "return", "annual", 60),
    ("ADV-TAX", "Advance Tax", "income_tax", "ITD", "payment", "quarterly", 15),
    ("BOOK-R", "Monthly Bookkeeping", "accounting", "Internal", "service", "monthly", 5),
    ("ACCT-R", "Year-end Accounts", "accounting", "ICAI", "audit_report", "annual", 60),
]

FYS = [
    ("FY2324", "FY 2023-24", "2023-04-01", "2024-03-31", "AY 2024-25"),
    ("FY2425", "FY 2024-25", "2024-04-01", "2025-03-31", "AY 2025-26"),
    ("FY2526", "FY 2025-26", "2025-04-01", "2026-03-31", "AY 2026-27"),
    ("FY2627", "FY 2026-27", "2026-04-01", "2027-03-31", "AY 2027-28"),
]

STATES = [("Maharashtra", "MH"), ("Karnataka", "KA"), ("Tamil Nadu", "TN"),
          ("Delhi", "DL"), ("Gujarat", "GJ"), ("West Bengal", "WB"),
          ("Uttar Pradesh", "UP"), ("Telangana", "TS")]
CITIES = {"MH": ["Mumbai", "Pune"], "KA": ["Bengaluru", "Mysuru"], "TN": ["Chennai", "Coimbatore"],
          "DL": ["Delhi"], "GJ": ["Ahmedabad", "Surat"], "WB": ["Kolkata"], "UP": ["Lucknow"],
          "TS": ["Hyderabad"]}
FIRST = ["Rohit", "Sneha", "Arjun", "Priya", "Karan", "Meera", "Vikram", "Ananya", "Rohan", "Tina"]
LAST = ["& Co", "Associates", "Partners", "LLP", "Holdings", "Group", "Enterprises", "& Sons", "Consultants", "Trading"]
BUSINESS = ["Pharma", "Textiles", "IT Services", "Cotton Ginners", "Restaurant", "Construction",
            "Jewellery", "Auto Parts", "Media", "Logistics"]
TYPES = ["legal_entity", "proprietorship", "partnership", "llp", "company", "individual"]
RULE_FREQ = {r[0]: r[5] for r in RULES}


def client_name(i):
    return f"{FIRST[i % len(FIRST)]} {LAST[i % len(LAST)]} ({BUSINESS[i % len(BUSINESS)]}) - {i+1:03d}"


def pan(i):
    return f"AAAPL{i+1:04d}C"


def fy_of(code):
    return next(f for f in FYS if f[0] == code)


# ── Reference data setup ─────────────────────────────────────────────────
def setup_reference(m):
    print("[1/12] Billing settings + services + compliance rules + financial years ...", flush=True)
    call("create_billing_settings", {"state_code": "MH", "legal_name": "Rohada & Associates",
                                     "gstin": "27AAAC1234C1Z1", "tax_rate": 18.0,
                                     "payment_terms_days": 15, "sac_code": "9983"})

    # Services
    svc_res = is_list(call("list_services"))
    for code, name, cat, sac, freq in SERVICES:
        if code in m.setdefault("services", {}):
            continue
        existing = next((s for s in svc_res if s.get("code") == code), None)
        if existing:
            m["services"][code] = existing["id"]; continue
        r = call("create_service", {"code": code, "name": name, "category": cat, "sac_code": sac,
                                    "standard_fee": 0.0, "default_frequency": freq,
                                    "default_priority": "normal", "is_recurring": True})
        if r.get("id"):
            m["services"][code] = r["id"]
        else:
            print("  service error:", code, r)

    # Compliance rules
    rules_res = is_list(call("list_compliance_rules"))
    for code, name, cat, auth, ftype, freq, lead in RULES:
        if code in m.setdefault("rules", {}):
            continue
        existing = next((r for r in rules_res if r.get("code") == code), None)
        if existing:
            m["rules"][code] = existing["id"]; continue
        r = call("create_compliance_rule", {"code": code, "name": name, "category": cat,
                                            "authority": auth, "filing_type": ftype,
                                            "applicability_rule": "All applicable clients",
                                            "default_frequency": freq, "lead_days": lead,
                                            "internal_due_days": max(lead, 5), "status": "active"})
        if r.get("id"):
            m["rules"][code] = r["id"]
        else:
            print("  rule error:", code, r)

    # Financial years
    fys_res = is_list(call("list_financial_years"))
    for code, label, start, end, ay in FYS:
        if m["fys"].get(code):
            continue
        r = call("create_financial_year", {"code": code, "label": label,
                                            "start_date": start,
                                            "end_date": end,
                                            "assessment_year": ay, "is_active": False, "is_closed": True})
        m["fys"][code] = r.get("id") or (next((f.get("id") for f in
                      is_list(call("list_financial_years", {"include_closed": True}))
                      if f.get("code") == code), None))
        if not m["fys"][code]:
            print("  fy error:", code, r)
    # mark current FY active
    m["fys_active"] = m["fys"].get("FY2526")
    save_manifest(m)


def gen_clients(m, n=100):
    print("[2/12] Clients (100) ...", flush=True)
    existing = {c["legal_name"]: c["id"] for c in is_list(call("list_clients", {"limit": 500}))}
    for i in range(1, n + 1):
        cname = client_name(i)
        if cname in m.setdefault("clients", {}):
            continue
        if cname in existing:
            m["clients"][cname] = existing[cname]; continue
        st = STATES[i % len(STATES)]
        ct = CITIES[st[1]]
        r = call("create_client", {"legal_name": cname, "client_type": TYPES[i % len(TYPES)],
                                    "city": ct[i % len(ct)], "state": st[0], "state_code": st[1],
                                    "pan": pan(i), "country": "India"})
        if r.get("id"):
            m["clients"][cname] = r["id"]
            # issue to active for a realistic dashboard
            call("update_client", {"client_id": r["id"], "status": "active", "kyc_status": "completed"})
        else:
            print("  client error:", i, r)
    save_manifest(m)


def setup_client_services(m, target=200):
    print("[3/12] Client-service assignments (200) ...", flush=True)
    names = list(m.setdefault("clients", {}).keys())
    svc_codes = [s[0] for s in SERVICES]
    created = len(m.setdefault("client_services", {}))
    k = created
    while created < target and k < target * 4:
        k += 1
        cname = names[(k - 1) % len(names)]
        scode = svc_codes[(k - 1) % len(svc_codes)]
        key = f"{cname}|{scode}"
        if key in m["client_services"]:
            continue
        cid, sid = m["clients"].get(cname), m["services"].get(scode)
        if not cid or not sid:
            continue
        r = call("create_client_service", {"client_id": cid, "service_id": sid, "is_active": True,
                                            "start_date": "2024-04-01"})
        if r.get("id"):
            m["client_services"][key] = r["id"]; created += 1
        else:
            print("  client_service error:", key, r)
    save_manifest(m)


def gen_tasks(m, n=300):
    print("[4/12] Tasks (300) ...", flush=True)
    names = list(m["clients"].keys())
    svc_codes = [s[0] for s in SERVICES]
    rule_codes = [r[0] for r in RULES]
    users = is_list(call("list_users", {"limit": 50}))
    staff = [u["id"] for u in users if u.get("id")]
    fy_codes = [f[0] for f in FYS]
    created = len(m.setdefault("tasks", {}))
    today = date.today()
    while created < n:
        idx = created + 1
        cname = names[idx % len(names)]
        cid = m["clients"].get(cname)
        scode = svc_codes[idx % len(svc_codes)]
        sid = m["services"].get(scode)
        rule_code = rule_codes[idx % len(rule_codes)]
        fy_code = fy_codes[idx % len(fy_codes)]
        fy_id = m["fys"].get(fy_code)
        # Mix of overdue and upcoming due dates so the dashboard shows variety
        spread = 20 + idx
        if idx % 3 == 0:
            spread = -spread  # past due → overdue tasks
        due = (today + timedelta(days=spread)).isoformat()
        r = call("create_task", {"title": f"SYN Task {idx:04d} - {rule_code}", "name": f"{rule_code} task",
                                 "client_id": cid, "service_id": sid, "financial_year": fy_id,
                                 "category": "compliance", "priority": ["normal", "high", "medium"][idx % 3],
                                 "statutory_due_date": due + "T23:59:59", "tags": [scode, rule_code]})
        if r.get("id"):
            key = f"{cname}|{idx:04d}"
            m["tasks"][key] = {"id": r["id"], "service_code": scode, "rule_code": rule_code, "client_name": cname}
            if staff:
                call("assign_task", {"task_id": r["id"], "role": "preparer", "user_id": staff[idx % len(staff)]})
            created += 1
        else:
            print("  task error:", idx, r)
        if created % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_deadlines(m, n=300):
    print("[5/12] Compliance records / deadlines (300) ...", flush=True)
    names = list(m["clients"].keys())
    rule_codes = [r[0] for r in RULES]
    fy_codes = [f[0] for f in FYS]
    today = date.today()
    created = len(m.setdefault("deadlines", {}))
    start = created + 1
    # Bounded attempts so a unique-constraint collision can't spin forever.
    for idx in range(start, start + n * 3):
        if created >= n:
            break
        cname = names[idx % len(names)]
        cid = m["clients"].get(cname)
        rule_code = rule_codes[idx % len(rule_codes)]
        rule_id = m["rules"].get(rule_code)
        fy_code = fy_codes[(idx // 3) % len(fy_codes)]
        fy_id = m["fys"].get(fy_code)
        if not cid or not rule_id or not fy_id:
            continue
        # Mix of overdue and upcoming due dates
        spread = 5 + idx
        if idx % 3 == 0:
            spread = -spread  # past due → overdue deadlines
        due = (today + timedelta(days=spread)).isoformat()
        r = call("create_compliance_record", {"client_id": cid, "rule_id": rule_id,
                                               "financial_year_id": fy_id,
                                               "period_key": f"{fy_code}-Q{(idx % 4)+1}-{idx:04d}",
                                                "statutory_due_date": due + "T23:59:00",
                                                "internal_due_date": (due - timedelta(days=7)).isoformat() + "T23:59:00"})
        if r.get("id"):
            m["deadlines"][f"{cname}|{rule_code}|{fy_code}|{idx:04d}"] = r["id"]; created += 1
        else:
            print("  deadline error:", idx, r)
        if created % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_invoices(m, n=150):
    print("[6/12] Invoices (150) ...", flush=True)
    names = list(m["clients"].keys())
    svc_ids = m["services"]
    today = date.today()
    created = len(m.setdefault("invoices", {}))
    while created < n:
        idx = created + 1
        cname = names[idx % len(names)]
        cid = m["clients"].get(cname)
        if not cid:
            created += 1; continue
        s = SERVICES[idx % len(SERVICES)]
        sid = svc_ids.get(s[0])
        rate = 5000.0 + (idx % 7) * 2500
        units = 1 + (idx % 3)
        items = [{"description": f"{s[1]} — labour", "quantity": units, "unit_price": rate,
                  "service_id": sid, "sac_code": s[3], "is_taxable": True}]
        if idx % 2 == 0:
            s2 = SERVICES[(idx + 3) % len(SERVICES)]
            items.append({"description": f"{s2[1]} — disbursement", "quantity": 1, "unit_price": 2500.0,
                          "service_id": svc_ids.get(s2[0]), "sac_code": s2[3], "is_taxable": True})
        r = call("create_invoice", {"client_id": cid, "items": items,
                                    "invoice_date": (today - timedelta(days=5 + idx)).isoformat(),
                                    "due_days": 15, "notes": f"Generated invoice {idx}", "terms": "Net 15"})
        if r.get("id"):
            m["invoices"][f"{cname}|{idx:04d}"] = {"id": r["id"],
                                                   "invoice_number": r.get("invoice_number"),
                                                   "total": r["total"], "client_name": cname,
                                                   "amount_paid": float(r.get("amount_paid", 0.0)),
                                                   "outstanding": r["outstanding"]}
            created += 1
        else:
            print("  invoice error:", idx, r)
        if created % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_payments(m, n=200):
    print("[7/12] Payments (200) ...", flush=True)
    invs = list(m.setdefault("invoices", {}).values())
    if len(m.setdefault("payments", {})) >= n:
        save_manifest(m)
        return
    # deterministic distribution over the 150 invoices:
    #  idx%4==0 -> fully paid (1 payment = total)
    #  idx%4 in (1,2) -> partial (2 x 45%)
    #  idx%4==3 -> partial (3 x 30%)
    #  => payments = 150*(1/4) + 150*(2/4)*2 + 150*(1/4)*3 = 37 + 150 + 112 = 299 .. too many.
    # Build a bounded plan instead.
    plan = []
    pay_no = 0
    for j in range(len(invs)):
        info = invs[j]
        total = float(info["total"])
        b = j % 4
        if b == 0 and pay_no + 1 <= n:
            plan.append((info["id"], round(total, 2))); pay_no += 1
        elif b in (1, 2) and pay_no + 2 <= n:
            plan += [(info["id"], round(total * 0.45, 2)), (info["id"], round(total * 0.45, 2))]; pay_no += 2
        elif b == 3 and pay_no + 3 <= n:
            plan += [(info["id"], round(total * 0.30, 2)) for _ in range(3)]; pay_no += 3
    # fill to exactly n with small partial payments on invoices that still have headroom
    j = 0
    while pay_no < n and j < len(invs) * 3:
        info = invs[j % len(invs)]
        inv = call("get_invoice", {"invoice_id": info["id"]})
        if isinstance(inv, dict) and "amount_paid" in inv:
            headroom = float(inv["outstanding"])
            amt = round(min(0.25 * float(info["total"]), headroom - 0.01), 2)
            if amt > 0:
                plan.append((info["id"], amt)); pay_no += 1
        j += 1
    created = len(m.setdefault("payments", {}))
    seq = created
    for inv_id, amt in plan:
        seq += 1
        key = f"{inv_id}|p{seq:04d}"
        if key in m["payments"]:
            continue
        r = call("create_payment", {"invoice_id": inv_id, "amount": amt,
                                     "method": ["bank_transfer", "upi", "cheque", "cash", "card"][seq % 5],
                                     "paid_on": (date.today() - timedelta(days=seq % 30)).isoformat() + "T10:00:00",
                                     "reference": f"SYNCP{seq:05d}"})
        if r.get("payment_id") or r.get("id"):
            m["payments"][key] = r.get("payment_id") or r.get("id")
            # issue invoice status (draft -> issued/partially_paid/paid handled by payment)
        else:
            print("  payment error:", seq, inv_id, r)
        if seq % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_documents(m, n=100):
    print("[8/12] Documents (100) ...", flush=True)
    names = list(m["clients"].keys())
    task_ids = [t["id"] for t in m.setdefault("tasks", {}).values()]
    created = len(m.setdefault("documents", {}))
    idx = created
    while created < n:
        idx += 1
        key = f"{names[idx % len(names)]}|{idx:04d}"
        if key in m["documents"]:
            continue
        cid = m["clients"].get(names[idx % len(names)])
        tid = task_ids[idx % len(task_ids)] if task_ids else None
        if not cid:
            created += 1; continue
        r = call("create_document", {"title": f"SYN Document {idx:04d}", "client_id": cid, "task_id": tid,
                                     "doc_type": ["form", "return", "receipt", "audit_report", "letter"][idx % 5],
                                     "category": ["compliance", "billing", "audit", "corporate"][idx % 4],
                                     "mime_type": "application/pdf", "size_bytes": 1024 * ((idx % 99) + 1),
                                     "is_confidential": idx % 3 == 0, "from_client": idx % 2 == 0})
        if r.get("id"):
            m["documents"][key] = r["id"]; created += 1
        else:
            print("  doc error:", idx, r)
        if created % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_activity_logs(m, n=100):
    print("[9/12] Activity logs (100) ...", flush=True)
    names = list(m["clients"].keys())
    task_ids = [t["id"] for t in m.get("tasks", {}).values()]
    invs = list(m.get("invoices", {}).values())
    created = len(m.setdefault("activity", {}))
    idx = created
    while created < n:
        idx += 1
        if str(idx) in m["activity"]:
            continue
        pick = idx % 3
        if pick == 0 and names:
            eid = m["clients"].get(names[idx % len(names)]); et = "client"
        elif pick == 1 and task_ids:
            eid = task_ids[idx % len(task_ids)]; et = "task"
        elif invs:
            eid = invs[idx % len(invs)]["id"]; et = "invoice"
        else:
            idx += 1; continue
        r = call("create_activity_log", {"entity_type": et, "entity_id": eid,
                                         "action": ["created", "updated", "status_changed", "assigned"][idx % 4],
                                         "summary": f"SYN activity event {idx} on {et}"})
        if r.get("id"):
            m["activity"][str(idx)] = r["id"]; created += 1
        else:
            print("  activity error:", idx, r)
        if created % 50 == 0:
            save_manifest(m)
    save_manifest(m)


def issue_invoices(m):
    """Mark created invoices issued/partially_paid/paid so receivables reconcile."""
    print("[10/12] Invoice status transitions ...", flush=True)
    for key, info in m["invoices"].items():
        inv = call("get_invoice", {"invoice_id": info["id"]})
        if not isinstance(inv, dict) or "status" not in inv:
            continue
        if "status" not in m["invoices"][key]:
            m["invoices"][key]["status"] = inv["status"]
    for key, info in m["invoices"].items():
        status = (info.get("status") or "draft").lower()
        new = status if status in ("paid", "partially_paid") else "issued"
        if new == "issued" and status != "issued":
            call("update_invoice", {"invoice_id": info["id"], "status": "issued"})
            m["invoices"][key]["status"] = "issued"
    save_manifest(m)


def task_history(m, n=180):
    print("[11/12] Task status transitions (180) ...", flush=True)
    tasks = list(m.setdefault("tasks", {}).values())
    cnt = 0
    for info in tasks:
        if cnt >= n:
            break
        phase = cnt % 5
        if phase in (0, 1):
            # 40% → completed
            call("update_task_status", {"task_id": info["id"], "status": "in_progress"})
            call("update_task_status", {"task_id": info["id"], "status": "completed"})
        elif phase == 2:
            # 20% → leave in_progress
            call("update_task_status", {"task_id": info["id"], "status": "in_progress"})
        elif phase == 3:
            # 20% → assigned (preparer was set during creation)
            call("update_task_status", {"task_id": info["id"], "status": "assigned"})
        else:
            # 20% → stay not_started (leave as-is)
            pass
        cnt += 1
    print(f"  transitioned {cnt} tasks", flush=True)


def verify(m):
    print("[12/12] Verifying counts & reconciliation ...", flush=True)
    report = {"tenant_id": TID, "counts": {}, "reconciliation": {}, "dashboard": None}

    list_map = {
        "clients": ("list_clients", 500),
        "services": ("list_services", None),
        "rules": ("list_compliance_rules", None),
        "financial_years": ("list_financial_years", None),
        "tasks": ("list_tasks", 500),
        "deadlines": ("list_compliance_records", 500),
        "invoices": ("list_invoices", 500),
        "users": ("list_users", None),
    }
    for k, (tool, lim) in list_map.items():
        args = {"limit": lim} if lim else {}
        if k == "financial_years":
            args = {"include_closed": True}
        res = is_list(call(tool, args))
        report["counts"][k] = len(res)
        exp_key = "fys" if k == "financial_years" else k
        report["counts"][k + "_expected"] = len(m.get(exp_key, {})) if exp_key != "users" else None
    # tools without a list_* MCP helper -> count from manifest
    for k in ("client_services", "payments", "documents"):
        report["counts"][k] = len(m.get(k, {}))
        report["counts"][k + "_expected"] = len(m.get(k, {}))

    rec = report["reconciliation"]
    invs = is_list(call("list_invoices", {"limit": 1000}))
    issued = [i for i in invs if i.get("status") in ("issued", "partially_paid")]
    rec["invoices_issued_or_partial"] = len(issued)
    rec["invoices_total"] = len(invs)

    try:
        recv = call("get_receivables", {})
        rec["receivables"] = recv
    except Exception as e:
        rec["receivables_error"] = str(e)

    try:
        dash = call("get_dashboard", {})
        report["dashboard"] = dash
    except Exception as e:
        report["dashboard_error"] = str(e)

    report["manifest_summary"] = {
        "clients": len(m.get("clients", {})),
        "client_services": len(m.get("client_services", {})),
        "tasks": len(m.get("tasks", {})),
        "deadlines": len(m.get("deadlines", {})),
        "invoices": len(m.get("invoices", {})),
        "payments": len(m.get("payments", {})),
        "documents": len(m.get("documents", {})),
        "activity": len(m.get("activity", {})),
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"  report written -> {REPORT_PATH}", flush=True)
    print(json.dumps(report["counts"], indent=0))
    print(json.dumps(report["reconciliation"], indent=0))


def main():
    m = load_manifest()
    setup_reference(m)
    if not m.get("services") or not m.get("rules") or not m.get("fys"):
        print("Reference data unavailable; aborting."); return
    gen_clients(m, 100)
    setup_client_services(m, 200)
    gen_tasks(m, 300)
    gen_deadlines(m, 300)
    gen_invoices(m, 150)
    gen_payments(m, 200)
    gen_documents(m, 100)
    gen_activity_logs(m, 100)
    issue_invoices(m)
    task_history(m, 180)
    save_manifest(m)
    verify(m)
    print("DONE.", flush=True)


if __name__ == "__main__":
    main()
