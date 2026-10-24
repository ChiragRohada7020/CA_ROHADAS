"""Application errors and exception handling.

Every error that the API returns as a structured JSON response starts life here.
Raw ``HTTPException`` / ``ValidationError`` / ``OperationalError`` leaks stack
traces and inconsistent shapes; ``AppError`` is the single structured envelope
the routers, services and the global handler all agree on.
"""
from __future__ import annotations

from enum import IntEnum
from typing import Any


class ErrorCode(IntEnum):
    """Enumerated error codes returned to the client.

    The integer is the HTTP status so ``exc.status_code`` is derivable directly
    from the code.  The human-readable key is the name lower-cased.
    """

    BAD_REQUEST = 400
    UNAUTHENTICATED = 401
    PERMISSION_DENIED = 403
    NOT_FOUND = 404
    VALIDATION = 422
    CONFLICT = 409
    UNAVAILABLE = 503

    @property
    def http_status(self) -> int:
        return int(self.value)

    @property
    def key(self) -> str:
        return self.name.lower()


class AppError(Exception):
    """Base class for all application errors.

    The global handler (see ``app/main.py``) catches ``AppError`` and renders it
    as ``{"error": {"code", "message", "details"}}` exactly like FastAPI's
    ``HTTPException``, which the front-end error parser expects.
    """

    status_code: int = 500
    code: str = "internal"

    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = details

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.code!r}, {self.status_code}, {self.message!r})"


class BadRequestError(AppError):
    status_code = ErrorCode.BAD_REQUEST.http_status
    code = "bad_request"


class AuthenticationError(AppError):
    status_code = ErrorCode.UNAUTHENTICATED.http_status
    code = "unauthenticated"


class PermissionDeniedError(AppError):
    status_code = ErrorCode.PERMISSION_DENIED.http_status
    code = "permission_denied"


class NotFoundError(AppError):
    status_code = ErrorCode.NOT_FOUND.http_status
    code = "not_found"


class ValidationError(AppError):
    status_code = ErrorCode.VALIDATION.http_status
    code = "validation"


class ConflictError(AppError):
    status_code = ErrorCode.CONFLICT.http_status
    code = "conflict"


class UnavailableError(AppError):
    status_code = ErrorCode.UNAVAILABLE.http_status
    code = "unavailable"


class TokenExpiredError(AuthenticationError):
    code = "token_expired"


class TokenInvalidError(AuthenticationError):
    code = "token_invalid"


class RefreshTokenRevokedError(AuthenticationError):
    code = "refresh_token_revoked"
