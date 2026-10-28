"""Migration: add scope + module columns to user_permission_overrides.

A scoped override row covers every permission in a practice-area module
(``scope = 'module'``) or every permission a role grants (``scope = 'role'``);
``scope = 'code'`` is the historical single-code shape. ``module`` is the
practice-area module the row applies to when the scope is module-scoped.
"""
from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # --- scope ------------------------------------------------------------
    try:
        db.execute(text("""
            ALTER TABLE user_permission_overrides
            ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'code'
        """))
        db.commit()
        print("  Added user_permission_overrides.scope")
    except Exception as e:
        db.rollback()
        print(f"  SKIP user_permission_overrides.scope: {e}")

    # --- module ----------------------------------------------------------
    try:
        db.execute(text("""
            ALTER TABLE user_permission_overrides
            ADD COLUMN module VARCHAR(50)
        """))
        db.commit()
        print("  Added user_permission_overrides.module")
    except Exception as e:
        db.rollback()
        print(f"  SKIP user_permission_overrides.module: {e}")

    print("\nDone! Permission-override scope/module columns added.")
finally:
    db.close()