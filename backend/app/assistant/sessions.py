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
    #: Files the user uploaded this session, each reduced to extracted text
    #: by :mod:`app.assistant.extract`. Keyed by a client-generated id so the
    #: assistant can reference a specific file ("summarise the attached PDF").
    uploaded_files: dict[str, dict[str, Any]] = field(default_factory=dict)

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


def add_uploaded_file(session_id: str, file_id: str, record: dict[str, Any]) -> bool:
    """Attach an uploaded file's extracted text to a session.

    Returns ``True`` if the session exists and the file was recorded. The
    caller is responsible for generating ``file_id`` and running the
    extraction; this is a thin store so the chat loop can read it back.
    """
    session = _sessions.get(session_id)
    if not session:
        return False
    session.uploaded_files[file_id] = record
    session.touch()
    return True


def get_uploaded_files(session_id: str) -> dict[str, dict[str, Any]]:
    session = _sessions.get(session_id)
    if not session:
        return {}
    return dict(session.uploaded_files)


def clear_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def prune_expired() -> int:
    expired = [sid for sid, s in _sessions.items() if s.is_expired]
    for sid in expired:
        del _sessions[sid]
    return len(expired)
