"""Fix .value calls and other issues across router files."""
import re
import os

ROUTERS_DIR = r"D:\rohadas_organisagtion\Ca_software\backend/app/routers"

# Files to fix
files = [
    "tasks.py", "clients.py", "billing.py", "reports.py",
    "documents.py", "notifications.py", "compliance.py"
]

# Pattern to match .value calls on known enum/string fields
# These need .value removed since enums are now native_enum=False (return strings)
ENUM_FIELD_VALUE_REPLACEMENTS = [
    ('.status.value', '.status'),
    ('.filing_status.value', '.filing_status'),
    ('.approval_status.value', '.approval_status'),
    ('.priority.value', '.priority'),
    ('.task_type.value', '.task_type'),
    ('.category.value', '.category'),
    ('.complexity.value', '.complexity'),
    ('.client_type.value', '.client_type'),
    ('.gst_tax_type.value', '.gst_tax_type'),
    ('.method.value', '.method'),
    ('.fee_model.value', '.fee_model'),
    ('.risk_classification.value', '.risk_classification'),
    ('.relationship_type.value', '.relationship_type'),
    ('.registration_type.value', '.registration_type'),
    ('.kyc_status.value', '.kyc_status'),
]

for fname in files:
    fpath = os.path.join(ROUTERS_DIR, fname)
    if not os.path.exists(fpath):
        print(f"SKIP: {fname} not found")
        continue
    
    with open(fpath, 'r') as f:
        content = f.read()
    
    original = content
    
    for pattern, replacement in ENUM_FIELD_VALUE_REPLACEMENTS:
        content = content.replace(pattern, replacement)
    
    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        print(f"FIXED .value calls in {fname}")
    else:
        print(f"NO CHANGES to {fname}")

print("\nDone with .value fixes")
