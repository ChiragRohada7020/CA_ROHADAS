"""Generate realistic, interconnected synthetic CA-practice data via the registered
MCP tools only (no direct SQL writes for business data).

Simpler, cleaner dataset: realistic Indian client names, every task gets a
preparer AND a reviewer (separation of duty) plus a checklist of task steps.

Idempotent: a manifest file (data_manifest.json) maps business keys -> server IDs,
so re-running reuses existing records instead of duplicating.

Targets (simpler scale):
  Clients 40 | Client-service assignments 80 | Tasks 100 | Deadlines 100
  Invoices 60 | Payments 80 | Documents 40 | Activity logs 60
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
TID = "9eb9d951-975e-4f6f-9689-b49d363075e9"   # Rohadas CA (dev tenant)
PARTNER_USER = "86c77a10-5bd4-48dd-8765-909cd2a2dabc"

MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "data_manifest.json")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "data_report.json")

_TOK = None


def token() -> str:
    global _TOK
    if _TOK is None:
        from app.core.security import create_access_token
        _TOK = create_access_token(
            subject=PARTNER_USER, tenant_id=TID, roles=["partner"], permissions=["*"],
        )
    return _TOK


def call(name: str, args: dict | None = None) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": name, "arguments": args or {}}}).encode()
    h = {"Accept": "application/json, text/event-stream",
         "Content-Type": "application/json",
         "Authorization": f"Bearer {token()}"}
    max_retries = 6
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
    ("TDS26", "TDS Return 26Q", "tds", "9992", "quarterly"),
    ("AUDIT", "Statutory Audit", "audit", "9993", "annual"),
    ("BOOK", "Bookkeeping", "accounting", "9983", "monthly"),
    ("ROC", "ROC Annual Filing", "roc", "9994", "annual"),
]

RULES = [
    ("ITR1-R", "ITR-1 Filing", "income_tax", "ITD", "return", "annual", 90),
    ("ITR3-R", "ITR-3 Filing", "income_tax", "ITD", "return", "annual", 90),
    ("GST3B-R", "GSTR-3B", "gst", "GSTN", "return", "monthly", 15),
    ("GST1-R", "GSTR-1", "gst", "GSTN", "return", "monthly", 15),
    ("TDS26-R", "TDS 26Q", "tds", "ITD", "return", "quarterly", 15),
    ("AUDIT-R", "Statutory Audit", "audit", "ICAI", "audit_report", "annual", 60),
    ("ROC-R", "ROC Annual Return", "roc", "MCA", "return", "annual", 60),
    ("BOOK-R", "Monthly Bookkeeping", "accounting", "Internal", "service", "monthly", 5),
]

FYS = [
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
TYPES = ["proprietorship", "partnership", "llp", "company", "individual"]

# Realistic Indian client names (city, state, state_code)
CLIENTS = [
    ("Sharma & Sons", "Mumbai", "Maharashtra", "MH", "proprietorship"),
    ("Gupta Enterprises", "Delhi", "Delhi", "DL", "partnership"),
    ("Singh Traders", "Bengaluru", "Karnataka", "KA", "company"),
    ("Agarwal & Co", "Ahmedabad", "Gujarat", "GJ", "llp"),
    ("Jain Textiles", "Surat", "Gujarat", "GJ", "proprietorship"),
    ("Verma IT Solutions", "Hyderabad", "Telangana", "TS", "company"),
    ("Reddy Constructions", "Hyderabad", "Telangana", "TS", "company"),
    ("Iyer Pharma", "Chennai", "Tamil Nadu", "TN", "company"),
    ("Patel Auto Parts", "Ahmedabad", "Gujarat", "GJ", "proprietorship"),
    ("Malik Logistics", "Mumbai", "Maharashtra", "MH", "proprietorship"),
    ("Joshi Restaurants", "Pune", "Maharashtra", "MH", "partnership"),
    ("Naidu Cotton", "Chennai", "Tamil Nadu", "TN", "partnership"),
    ("Desai Jewellery", "Mumbai", "Maharashtra", "MH", "company"),
    ("Chopra Media", "Delhi", "Delhi", "DL", "llp"),
    ("Prasad Auto Parts", "Bengaluru", "Karnataka", "KA", "proprietorship"),
    ("Yadav Textiles", "Coimbatore", "Tamil Nadu", "TN", "proprietorship"),
    ("Rao IT Services", "Bengaluru", "Karnataka", "KA", "llp"),
    ("Kumari Consultants", "Lucknow", "Uttar Pradesh", "UP", "proprietorship"),
    ("Bose Group", "Kolkata", "West Bengal", "WB", "company"),
    ("Mukherjee Trading", "Kolkata", "West Bengal", "WB", "partnership"),
    ("Nair Services", "Kochi", "Kerala", "KL", "proprietorship"),
    ("Menon & Co", "Kochi", "Kerala", "KL", "llp"),
    ("Khan Enterprises", "Lucknow", "Uttar Pradesh", "UP", "company"),
    ("Saxena Traders", "Lucknow", "Uttar Pradesh", "UP", "proprietorship"),
    ("Rastogi & Sons", "Kanpur", "Uttar Pradesh", "UP", "partnership"),
    ("Mehrotra Jewellery", "Kanpur", "Uttar Pradesh", "UP", "company"),
    ("Tandon Media", "Noida", "Uttar Pradesh", "UP", "llp"),
    ("Arora Logistics", "Gurugram", "Haryana", "HR", "proprietorship"),
    ("Dhingra IT", "Gurugram", "Haryana", "HR", "company"),
    ("Khanna Pharma", "Chandigarh", "Punjab", "PB", "company"),
    ("Sondhi Textiles", "Ludhiana", "Punjab", "PB", "partnership"),
    ("Bajaj Auto Parts", "Pune", "Maharashtra", "MH", "company"),
    ("Kirloskar Group", "Pune", "Maharashtra", "MH", "company"),
    ("Wadia & Sons", "Mumbai", "Maharashtra", "MH", "proprietorship"),
    ("Godrej Trading", "Mumbai", "Maharashtra", "MH", "partnership"),
    ("Tata Consultants", "Mumbai", "Maharashtra", "MH", "company"),
    ("Birla Enterprises", "Kolkata", "West Bengal", "WB", "company"),
    ("Mahajan & Co", "Amritsar", "Punjab", "PB", "llp"),
    ("Sethi Jewellery", "Jaipur", "Rajasthan", "RJ", "proprietorship"),
]
RULE_FREQ = {r[0]: r[5] for r in RULES}


def pan(i):
    return f"AAAPL{i+1:04d}C"


def fy_of(code):
    return next(f for f in FYS if f[0] == code)


# ── Reference data setup ─────────────────────────────────────────────────
def setup_reference(m):
    print("[1/9] Billing settings + services + compliance rules + financial years ...", flush=True)
    call("create_billing_settings", {"state_code": "MH", "legal_name": "Rohadas CA",
                                     "gstin": "27AAAC1234C1Z1", "tax_rate": 18.0,
                                     "payment_terms_days": 15, "sac_code": "9983"})

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
    m["fys_active"] = m["fys"].get("FY2526")
    save_manifest(m)


def gen_clients(m, n=40):
    print(f"[2/9] Clients ({n}) ...", flush=True)
    existing = {c["legal_name"]: c["id"] for c in is_list(call("list_clients", {"limit": 500}))}
    for i in range(n):
        name, city, state, state_code, ctype = CLIENTS[i % len(CLIENTS)]
        cname = name
        if cname in m.setdefault("clients", {}):
            continue
        if cname in existing:
            m["clients"][cname] = existing[cname]; continue
        r = call("create_client", {"legal_name": cname, "client_type": ctype,
                                    "city": city, "state": state, "state_code": state_code,
                                    "pan": pan(i), "country": "India"})
        if r.get("id"):
            m["clients"][cname] = r["id"]
            call("update_client", {"client_id": r["id"], "status": "active", "kyc_status": "completed"})
        else:
            print("  client error:", i, r)
    save_manifest(m)


def setup_client_services(m, target=80):
    print(f"[3/9] Client-service assignments ({target}) ...", flush=True)
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


def gen_tasks(m, n=100):
    print(f"[4/9] Tasks ({n}) with preparer + reviewer + checklist ...", flush=True)
    names = list(m["clients"].keys())
    svc_codes = [s[0] for s in SERVICES]
    rule_codes = [r[0] for r in RULES]
    users = is_list(call("list_users", {"limit": 50}))
    staff = [u["id"] for u in users if u.get("id")]
    if len(staff) < 2:
        print("  need at least 2 staff users for preparer/reviewer; aborting tasks"); return
    fy_codes = [f[0] for f in FYS]
    created = len(m.setdefault("tasks", {}))
    today = date.today()
    step_templates = [
        ("Gather documents", "Collect source documents and records from client"),
        ("Verify data", "Cross-check figures against bank statements and ledgers"),
        ("Prepare return/draft", "Prepare the return, audit report or filing draft"),
        ("Internal review", "Senior review for accuracy and compliance"),
        ("Client approval", "Share draft with client for sign-off"),
        ("File with authority", "Submit the filing to the statutory authority"),
        ("Acknowledgement", "Download and archive the acknowledgement receipt"),
    ]
    while created < n:
        idx = created + 1
        cname = names[idx % len(names)]
        cid = m["clients"].get(cname)
        scode = svc_codes[idx % len(svc_codes)]
        sid = m["services"].get(scode)
        rule_code = rule_codes[idx % len(rule_codes)]
        rule_name = next(r[1] for r in RULES if r[0] == rule_code)
        fy_code = fy_codes[idx % len(fy_codes)]
        fy_id = m["fys"].get(fy_code)
        spread = 15 + idx
        if idx % 3 == 0:
            spread = -spread
        due = (today + timedelta(days=spread)).isoformat()
        r = call("create_task", {"title": f"{rule_name} - {cname}", "name": rule_code,
                                 "client_id": cid, "service_id": sid, "financial_year": fy_id,
                                 "category": "compliance", "priority": ["normal", "high", "medium"][idx % 3],
                                 "statutory_due_date": due + "T23:59:59", "tags": [scode, rule_code]})
        if not r.get("id"):
            print("  task error:", idx, r); created += 1; continue
        tid = r["id"]
        key = f"{cname}|{idx:04d}"
        m["tasks"][key] = {"id": tid, "service_code": scode, "rule_code": rule_code, "client_name": cname}
        # Assign preparer AND reviewer (separation of duty enforced by MCP)
        p = staff[idx % len(staff)]
        rv = staff[(idx + 1) % len(staff)]
        if rv == p:
            rv = staff[(idx + 2) % len(staff)]
        call("assign_task", {"task_id": tid, "role": "preparer", "user_id": p})
        call("assign_task", {"task_id": tid, "role": "reviewer", "user_id": rv})
        # Add checklist steps (3-5 per task)
        nsteps = 3 + (idx % 3)
        for s in range(nsteps):
            step_name, step_desc = step_templates[s]
            call("add_task_step", {"task_id": tid, "sequence": s + 1,
                                   "name": step_name, "description": step_desc,
                                   "is_mandatory": s < 2})
        created += 1
        if created % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_deadlines(m, n=100):
    print(f"[5/9] Compliance records / deadlines ({n}) ...", flush=True)
    names = list(m["clients"].keys())
    rule_codes = [r[0] for r in RULES]
    fy_codes = [f[0] for f in FYS]
    today = date.today()
    created = len(m.setdefault("deadlines", {}))
    start = created + 1
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
        spread = 5 + idx
        if idx % 3 == 0:
            spread = -spread
        due_dt = today + timedelta(days=spread)
        due = due_dt.isoformat() + "T23:59:00"
        r = call("create_compliance_record", {"client_id": cid, "rule_id": rule_id,
                                               "financial_year_id": fy_id,
                                               "period_key": f"{fy_code}-Q{(idx % 4)+1}-{idx:04d}",
                                                "statutory_due_date": due,
                                                "internal_due_date": (due_dt - timedelta(days=7)).isoformat() + "T23:59:00"})
        if r.get("id"):
            m["deadlines"][f"{cname}|{rule_code}|{fy_code}|{idx:04d}"] = r["id"]; created += 1
        else:
            print("  deadline error:", idx, r)
        if created % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_invoices(m, n=60):
    print(f"[6/9] Invoices ({n}) ...", flush=True)
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
        items = [{"description": f"{s[1]}", "quantity": units, "unit_price": rate,
                  "service_id": sid, "sac_code": s[3], "is_taxable": True}]
        r = call("create_invoice", {"client_id": cid, "items": items,
                                    "invoice_date": (today - timedelta(days=5 + idx)).isoformat(),
                                    "due_days": 15, "notes": f"Invoice {idx}", "terms": "Net 15"})
        if r.get("id"):
            m["invoices"][f"{cname}|{idx:04d}"] = {"id": r["id"],
                                                   "invoice_number": r.get("invoice_number"),
                                                   "total": r["total"], "client_name": cname,
                                                   "amount_paid": float(r.get("amount_paid", 0.0)),
                                                   "outstanding": r["outstanding"]}
            created += 1
        else:
            print("  invoice error:", idx, r)
        if created % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_payments(m, n=80):
    print(f"[7/9] Payments ({n}) ...", flush=True)
    invs = list(m.setdefault("invoices", {}).values())
    if len(m.setdefault("payments", {})) >= n:
        save_manifest(m); return
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
        else:
            print("  payment error:", seq, inv_id, r)
        if seq % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_documents(m, n=40):
    print(f"[8/9] Documents ({n}) ...", flush=True)
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
        r = call("create_document", {"title": f"Document {idx:04d} - {names[idx % len(names)]}", "client_id": cid, "task_id": tid,
                                     "doc_type": ["form", "return", "receipt", "audit_report", "letter"][idx % 5],
                                     "category": ["compliance", "billing", "audit", "corporate"][idx % 4],
                                     "mime_type": "application/pdf", "size_bytes": 1024 * ((idx % 99) + 1),
                                     "is_confidential": idx % 3 == 0, "from_client": idx % 2 == 0})
        if r.get("id"):
            m["documents"][key] = r["id"]; created += 1
        else:
            print("  doc error:", idx, r)
        if created % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def gen_activity_logs(m, n=60):
    print(f"[9/9] Activity logs ({n}) ...", flush=True)
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
                                         "summary": f"Activity event {idx} on {et}"})
        if r.get("id"):
            m["activity"][str(idx)] = r["id"]; created += 1
        else:
            print("  activity error:", idx, r)
        if created % 25 == 0:
            save_manifest(m)
    save_manifest(m)


def issue_invoices(m):
    print("[10/10] Invoice status transitions ...", flush=True)
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


def task_history(m, n=60):
    print("[11/11] Task status transitions ...", flush=True)
    tasks = list(m.setdefault("tasks", {}).values())
    cnt = 0
    for info in tasks:
        if cnt >= n:
            break
        phase = cnt % 5
        if phase in (0, 1):
            call("update_task_status", {"task_id": info["id"], "status": "in_progress"})
            call("update_task_status", {"task_id": info["id"], "status": "completed"})
        elif phase == 2:
            call("update_task_status", {"task_id": info["id"], "status": "in_progress"})
        elif phase == 3:
            call("update_task_status", {"task_id": info["id"], "status": "assigned"})
        cnt += 1
    print(f"  transitioned {cnt} tasks", flush=True)


def verify(m):
    print("[verify] Counts & reconciliation ...", flush=True)
    report = {"tenant_id": TID, "counts": {}, "reconciliation": {}}
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
    for k in ("client_services", "payments", "documents"):
        report["counts"][k] = len(m.get(k, {}))
        report["counts"][k + "_expected"] = len(m.get(k, {}))
    rec = report["reconciliation"]
    invs = is_list(call("list_invoices", {"limit": 1000}))
    rec["invoices_total"] = len(invs)
    rec["invoices_issued_or_partial"] = len([i for i in invs if i.get("status") in ("issued", "partially_paid")])
    try:
        rec["receivables"] = call("get_receivables", {})
    except Exception as e:
        rec["receivables_error"] = str(e)
    try:
        report["dashboard"] = call("get_dashboard", {})
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
    print(json.dumps(report["counts"], indent=0))
    print(json.dumps(report["reconciliation"], indent=0))


def main():
    m = load_manifest()
    setup_reference(m)
    if not m.get("services") or not m.get("rules") or not m.get("fys"):
        print("Reference data unavailable; aborting."); return
    gen_clients(m, 40)
    setup_client_services(m, 80)
    gen_tasks(m, 100)
    gen_deadlines(m, 100)
    gen_invoices(m, 60)
    gen_payments(m, 80)
    gen_documents(m, 40)
    gen_activity_logs(m, 60)
    issue_invoices(m)
    task_history(m, 60)
    save_manifest(m)
    verify(m)
    print("DONE.", flush=True)


if __name__ == "__main__":
    main()
