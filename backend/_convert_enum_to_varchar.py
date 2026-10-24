"""Convert PostgreSQL enum columns to VARCHAR to match String type in models."""
from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # Columns that changed from Enum to String in models
    conversions = [
        ("tenants", "status", 50),
        ("clients", "status", 50),
        ("clients", "client_type", 50),
        ("clients", "kyc_status", 50),
        ("tasks", "status", 50),
        ("tasks", "approval_status", 50),
        ("tasks", "filing_status", 50),
        ("tasks", "priority", 20),
        ("tasks", "complexity", 20),
        ("tasks", "task_type", 50),
        ("tasks", "category", 100),
        ("tasks", "delay_reason", 100),
        ("invoices", "status", 50),
        ("invoices", "gst_tax_type", 50),
        ("payments", "method", 50),
        ("services", "category", 100),
        ("compliance_rules", "status", 50),
        ("documents", "status", 50),
        ("engagements", "status", 50),
        ("engagements", "fee_model", 50),
        ("contacts", "role", 50),
        ("registrations", "status", 50),
        ("registrations", "registration_type", 50),
        ("client_entity_links", "relationship_type", 50),
    ]

    for table, column, length in conversions:
        try:
            db.execute(text(f"""
                ALTER TABLE {table} 
                ALTER COLUMN {column} TYPE VARCHAR({length}) 
                USING {column}::text
            """))
            db.commit()
            print(f"  Converted {table}.{column} to VARCHAR({length})")
        except Exception as e:
            db.rollback()
            # Check if it's already VARCHAR or doesn't exist
            print(f"  SKIP {table}.{column}: {e}")

    print("\nDone! All enum columns converted to VARCHAR.")
finally:
    db.close()
