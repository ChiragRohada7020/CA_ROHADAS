from sqlalchemy import text
from app.core.db import engine as eng

with eng.connect() as c:
    tbls = ["users", "branches", "roles", "user_roles", "clients", "tasks", "attendances", "leave_records", "departments"]
    for t in tbls:
        cols = [(r[0], r[1]) for r in c.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns WHERE table_name=:t ORDER BY ordinal_position"
        ), {"t": t}).fetchall()]
        exists = bool(cols)
        print(f"\n== {t} EXISTS={exists}")
        for cn, dt in cols:
            print(f"  {cn}: {dt}")
    # role codes
    codes = [r[0] for r in c.execute(text("SELECT DISTINCT code FROM roles")).fetchall()]
    print("\nROLE CODES:", codes)
    # distinct departments on users
    deps = [r[0] for r in c.execute(text("SELECT DISTINCT department FROM users WHERE department IS NOT NULL")).fetchall()]
    print("DEPARTMENTS:", deps)
    # users sample row count + columns like work_location/skills/system_access?
    for col in ["work_location", "skills", "system_access"]:
        r = c.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='users' AND column_name=:c"), {"c": col}).scalar()
        print(col, "in users:", r)
    # any attendance-like table?
    tables = [r[0] for r in c.execute(text(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename ILIKE '%attend%' OR tablename ILIKE '%leave%' OR tablename ILIKE '%absence%'"
    )).fetchall()]
    print("attendance/leave tables:", tables)
