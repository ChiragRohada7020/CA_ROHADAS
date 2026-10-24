"""Find all PostgreSQL enum columns in the database."""
from sqlalchemy import text
from app.core.db import SessionLocal

db = SessionLocal()
try:
    # Find all enum types
    enum_types = db.execute(text("""
        SELECT DISTINCT t.typname AS enum_type
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typtype = 'e'
        ORDER BY t.typname
    """)).fetchall()
    
    for et in enum_types:
        enum_name = et[0]
        # Find all columns using this enum type
        cols = db.execute(text(f"""
            SELECT table_schema, table_name, column_name, udt_name
            FROM information_schema.columns
            WHERE udt_name = '{enum_name}'
            AND table_schema = 'public'
            ORDER BY table_name, column_name
        """)).fetchall()
        print(f"\nEnum type: {enum_name}")
        for c in cols:
            print(f"  {c.table_name}.{c.column_name}")
finally:
    db.close()
