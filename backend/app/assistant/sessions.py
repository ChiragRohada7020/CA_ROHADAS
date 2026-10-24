"""Chat session management for the assistant.

Sessions store conversation history (a list of role/message dicts) keyed by
session ID. Sessions are scoped per tenant. In-memory is sufficient for the
dev server; a Redis backend would be used in production.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any


@dataclass
class ChatSession:
    id: str
    tenant_id: str
    user_id: str | None
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity: datetime = field(default_factory=datetime.utcnow)
    messages: list[dict[str, Any]] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)

    def touch(self) -> None:
        self.last_activity = datetime.utcnow()

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() - self.last_activity > timedelta(hours=2)


_sessions: dict[str, ChatSession] = {}


def generate_session_id() -> str:
    return secrets.token_urlsafe(24)


def create_session(
    *,
    tenant_id: str,
    user_id: str | None = None,
) -> ChatSession:
    session_id = generate_session_id()
    session = ChatSession(id=session_id, tenant_id=tenant_id, user_id=user_id)
    _sessions[session_id] = session
    return session


def get_or_create_session(
    session_id: str | None,
    *,
    tenant_id: str,
    user_id: str | None = None,
) -> ChatSession:
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        if not session.is_expired:
            session.touch()
            return session
        del _sessions[session_id]
    return create_session(tenant_id=tenant_id, user_id=user_id)


def get_session(session_id: str) -> ChatSession | None:
    session = _sessions.get(session_id)
    if session and session.is_expired:
        _sessions.pop(session_id, None)
        return None
    if session:
        session.touch()
    return session


def add_message(session_id: str, message: dict[str, Any]) -> None:
    session = _sessions.get(session_id)
    if session:
        session.messages.append(message)
        session.touch()


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def prune_expired() -> int:
    expired = [sid for sid, s in _sessions.items() if s.is_expired]
    for sid in expired:
        del _sessions[sid]
    return len(expired)
