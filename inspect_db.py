import psycopg
import sys

try:
    conn = psycopg.connect('postgresql://postgres@127.0.0.1:5432/ca_software')
    cur = conn.cursor()
    
    # Get all tables
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
    tables = cur.fetchall()
    print("=== TABLES ===")
    for t in tables:
        print(f"  {t[0]}")
    
    # Get columns for each table
    print("\n=== COLUMNS ===")
    for (table_name,) in tables:
        cur.execute("""
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema='public' AND table_name=%s
            ORDER BY ordinal_position
        """, (table_name,))
        columns = cur.fetchall()
        print(f"\n{table_name}:")
        for col in columns:
            print(f"  {col[0]}: {col[1]} nullable={col[2]} default={col[3]}")
    
    # Get foreign keys
    print("\n=== FOREIGN KEYS ===")
    cur.execute("""
        SELECT
            tc.table_name, kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
        ORDER BY tc.table_name, kcu.column_name
    """)
    fks = cur.fetchall()
    for fk in fks:
        print(f"  {fk[0]}.{fk[1]} -> {fk[2]}.{fk[3]}")
    
    # Count rows in each table
    print("\n=== ROW COUNTS ===")
    for (table_name,) in tables:
        try:
            cur.execute(f'SELECT COUNT(*) FROM "{table_name}"')
            count = cur.fetchone()[0]
            print(f"  {table_name}: {count} rows")
        except Exception as e:
            print(f"  {table_name}: error counting - {e}")
    
    conn.close()
    print("\n=== DONE ===")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
