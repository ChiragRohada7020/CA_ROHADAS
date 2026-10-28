"""Pydantic-settings configuration for the backend.

Loaded once at import time. ``assert_production_ready`` fails loudly on startup
when the JWT secret or cron secret are still the development defaults — silent
signing with a repository-baked key is exactly the failure mode this code exists
to prevent.
"""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings sourced from environment variables."""

    # ── Core ──
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # ── Database ──
    DATABASE_URL: str = "postgresql+psycopg://postgres@127.0.0.1:5432/ca_software"

    # ── Auth / tokens ──
    JWT_SECRET: str = "dev-only-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Cron / scheduling ──
    CRON_SECRET: str = "dev-cron-secret-change-me"

    # ── AI ──
    AI_API_KEY: str | None = None
    AI_PROVIDER: str = "kilo"
    AI_MODEL: str = "kilo-auto/free"

    # ── CORS ──
    CORS_ORIGINS: list[str] = ["*"]

    # ── Storage ──
    STORAGE_BACKEND: str = "local"
    BLOB_READ_WRITE_TOKEN: str | None = None
    LOCAL_STORAGE_PATH: str = "backend/var/storage"

    # ── CSV import ──
    IMPORT_DIR: str = "/tmp/ca_imports"

    # ── WhatsApp integration ──
    WHATSAPP_PROVIDER: str = "baileys"
    WHATSAPP_API_URL: str | None = None

    # ── Object storage connection (optional) ──
    BLOB_ACCOUNT: str | None = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


def assert_production_ready(settings: Settings) -> None:
    """Raise if the app is running in production with insecure defaults.

    This catches the three most dangerous misconfigurations at the moment the
    application starts, not at the moment they are exploited:

    * the JWT signing key is the development default,
    * the cron secret is the development default,
    * ``AI_API_KEY`` is missing entirely.
    """
    if settings.ENVIRONMENT != "production":
        return

    if settings.JWT_SECRET == "dev-only-insecure-secret-change-me":
        raise RuntimeError(
            "Production requires a secure JWT_SECRET — the default value in the repository "
            "must not be used to sign tokens."
        )

    if settings.CRON_SECRET == "dev-cron-secret-change-me":
        raise RuntimeError(
            "Production requires a secure CRON_SECRET — the default value in the repository "
            "must not be used for cron authentication."
        )

    # The assistant endpoint calls an external AI provider; in production an
    # empty key would surface as opaque 500s rather than a clear startup failure.
    if not settings.AI_API_KEY:
        raise RuntimeError(
            "Production requires AI_API_KEY to be set so the assistant endpoint can "
            "authenticate to its AI provider."
        )
