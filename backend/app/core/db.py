"""Database setup.

The SQLAlchemy ``engine`` / ``SessionLocal`` are module-level singletons so
that every request and every MCP tool call shares one pooled connection set.
The metadata carries a naming convention so Alembic autogenerate produces stable,
reviewable migration files.
"""
from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600,
    pool_size=10,
    max_overflow=20,
    echo=settings.DEBUG,
)


class Base(DeclarativeBase):
    """Declarative base with a standard metadata naming convention."""

    def __repr__(self) -> str:  # pragma: no cover
        return f"<{self.__class__.__name__}>"


NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

Base.metadata.naming_convention = NAMING_CONVENTION


SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)


def init_db() -> None:
    """Create all tables that do not yet exist.

    In production migrations are applied via Alembic before the app starts, so
    this is only reached in development or when explicitly invoked. It also
    backfills columns added to existing models after a table was created —
    ``create_all`` alone does not add columns to a table that already exists.
    """
    Base.metadata.create_all(bind=engine)
    _backfill_client_mis_columns(engine)


def _backfill_client_mis_columns(engine) -> None:
    """Add the Winman CA-ERP MIS columns to an existing ``clients`` table.

    Idempotent: skips columns that are already present, so it is safe to run
    on every startup.
    """
    from sqlalchemy import inspect, text

    additions = [
        ("district", "VARCHAR(100)"),
        ("locality", "VARCHAR(255)"),
        ("mobile", "VARCHAR(20)"),
        ("phone", "VARCHAR(20)"),
        ("email", "VARCHAR(255)"),
        ("father_name", "VARCHAR(200)"),
        ("aadhaar_no", "VARCHAR(20)"),
        ("residential_status", "VARCHAR(50)"),
        ("passport_no", "VARCHAR(20)"),
        ("file_no", "VARCHAR(100)"),
    ]
    try:
        existing = {c["name"] for c in inspect(engine).get_columns("clients")}
    except Exception:
        return
    with engine.begin() as conn:
        for name, coltype in additions:
            if name in existing:
                continue
            conn.execute(text(f"ALTER TABLE clients ADD COLUMN {name} {coltype}"))


def get_db() -> Session:
    """FastAPI dependency: yield a session and close it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
