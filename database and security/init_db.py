import sys
from pathlib import Path

# Ensure backend directory is in sys.path so intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from sqlalchemy import inspect
from database import engine, Base
import models  # Ensures all models are registered on Base.metadata before create_all


def init_database():
    """
    Initializes the database schema, creates all multi-tenant tables,
    and inspects the database to log table structure and column details.
    """
    print("=" * 68)
    print("  BrandLens AI - Database Schema Initialization & Inspection")
    print("=" * 68)
    print(f"Engine connection dialect: {engine.dialect.name}")
    print(f"Database target: {engine.url}")

    # Create all tables registered with Base
    Base.metadata.create_all(bind=engine)

    # Inspect schema
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    print(f"\n[+] Verified {len(table_names)} tables registered in database schema:")
    print("-" * 68)

    for idx, table_name in enumerate(sorted(table_names), 1):
        columns = inspector.get_columns(table_name)
        print(f" {idx}. Table: '{table_name}' ({len(columns)} columns)")
        for col in columns:
            pk_flag = " [PK]" if col.get("primary_key") else ""
            null_flag = "NULL" if col.get("nullable") else "NOT NULL"
            print(f"      - {col['name']:<20} {str(col['type']):<18} {null_flag:<8}{pk_flag}")
        print("-" * 68)

    print("  All tables created and verified successfully.")
    print("=" * 68)


if __name__ == "__main__":
    init_database()
