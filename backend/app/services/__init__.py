"""Service-layer modules for CA Software.

Business logic lives here: query builders, workflow transitions, billing math,
compliance deadlines, and the MCP tool handlers. Routers are thin wrappers that
authenticate the caller and delegate to these functions.
"""
from __future__ import annotations

from app.services import billing as _billing  # noqa: F401
from app.services import calendar_service as _calendar  # noqa: F401
from app.services import client_lookup as _clients  # noqa: F401
from app.services import compliance_engine as _compliance  # noqa: F401
from app.services import notifications as _notifications  # noqa: F401
from app.services import recurring as _recurring  # noqa: F401
from app.services import task_lookup as _tasks  # noqa: F401
from app.services import task_workflow as _workflow  # noqa: F401

__all__ = [
    "billing",
    "calendar_service",
    "client_lookup",
    "compliance_engine",
    "notifications",
    "recurring",
    "task_lookup",
    "task_workflow",
]
