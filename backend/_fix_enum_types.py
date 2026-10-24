"""Change all Enum(Column with native_enum=False) to String columns."""
import re
import os

MODELS_DIR = r"D:\rohadas_organisagtion\Ca_software\backend/app/models"

# Map of Enum class names to their string lengths
ENUM_LENGTHS = {
    "TenantStatus": 50,
    "ClientType": 50,
    "ClientStatus": 50,
    "TaskStatus": 50,
    "ApprovalStatus": 50,
    "FilingStatus": 50,
    "Priority": 20,
    "Complexity": 20,
    "TaskType": 50,
    "InvoiceStatus": 50,
    "GstTaxType": 50,
    "PaymentMethod": 50,
    "ServiceCategory": 100,
    "RuleStatus": 50,
    "DocumentStatus": 50,
}

files = ["tenant.py", "client.py", "task.py", "invoice.py", "service.py", "compliance.py", "document.py"]

for fname in files:
    fpath = os.path.join(MODELS_DIR, fname)
    if not os.path.exists(fpath):
        print(f"SKIP: {fname}")
        continue

    with open(fpath, 'r') as f:
        content = f.read()

    original = content
    for enum_name, length in ENUM_LENGTHS.items():
        # Pattern: Enum(SomeEnum, native_enum=False, length=50)
        pattern = rf"Enum\({enum_name}, native_enum=False, length=\d+\)"
        replacement = f"String({length})"
        content = re.sub(pattern, replacement, content)

        # Also handle Enum(SomeEnum, native_enum=False, length=20)
        pattern2 = rf"Enum\({enum_name}, native_enum=False, length=20\)"
        replacement2 = f"String({length})"
        content = re.sub(pattern2, replacement2, content)

    if content != original:
        with open(fpath, 'w') as f:
            f.write(content)
        print(f"FIXED {fname}")
    else:
        print(f"NO CHANGES to {fname}")

# Verify
for fname in files:
    fpath = os.path.join(MODELS_DIR, fname)
    with open(fpath, 'r') as f:
        content = f.read()
    matches = re.findall(r"Enum\([^)]+\)", content)
    if matches:
        print(f"WARNING: {fname} still has Enum() calls: {matches}")
