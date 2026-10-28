"""Migration: add cancellation and share-link columns to invoices."""
from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # --- cancelled_at -------------------------------------------------------
    try:
        db.execute(text("""
            ALTER TABLE invoices
            ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE
        """))
        db.commit()
        print("  Added invoices.cancelled_at")
    except Exception as e:
        db.rollback()
        print(f"  SKIP invoices.cancelled_at: {e}")

    # --- cancelled_reason ---------------------------------------------------
    try:
        db.execute(text("""
            ALTER TABLE invoices
            ADD COLUMN cancelled_reason TEXT
        """))
        db.commit()
        print("  Added invoices.cancelled_reason")
    except Exception as e:
        db.rollback()
        print(f"  SKIP invoices.cancelled_reason: {e}")

    # --- share_token --------------------------------------------------------
    try:
        db.execute(text("""
            ALTER TABLE invoices
            ADD COLUMN share_token VARCHAR(100)
        """))
        db.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_share_token
            ON invoices (share_token) WHERE share_token IS NOT NULL
        """))
        db.commit()
        print("  Added invoices.share_token")
    except Exception as e:
        db.rollback()
        print(f"  SKIP invoices.share_token: {e}")

    print("\nDone! Invoice cancellation and share-link columns added.")
finally:
    db.close()
