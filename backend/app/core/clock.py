"""Timezone helpers.

The statutory filing calendar is Indian Standard Time. UTC is stored; IST is
reasoned in. ``date.today()`` returns the server's date, which for a Mumbai
server that is UTC+5:30 is "tomorrow" between 18:30 and 24:00 UTC, so every date
calculation in the app goes through ``today_local`` instead.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
except ImportError:  # pragma: no cover - fallback when tzdata is missing
    IST = timezone(timedelta(hours=5, minutes=30))


def today_local() -> date:
    """Return today's date in IST."""
    return datetime.now(IST).date()


def now_local() -> datetime:
    """Return the current datetime in IST."""
    return datetime.now(IST)


def now_utc() -> datetime:
    """Return the current datetime in UTC."""
    return datetime.now(timezone.utc)


def ist_from_utc(dt: datetime) -> datetime:
    """Convert a UTC datetime to IST."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(IST)


def utc_from_ist(dt: datetime) -> datetime:
    """Convert an IST datetime to UTC."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    return dt.astimezone(timezone.utc)
