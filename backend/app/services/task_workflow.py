"""Task workflow engine: validates status transitions and records state changes."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, NotFoundError


_WORKFLOW: dict[str, set[str]] = {
    "not_started": {"assigned", "in_progress", "cancelled"},
    "assigned": {"in_progress", "waiting_for_client", "waiting_for_internal", "cancelled"},
    "in_progress": {
        "waiting_for_client",
        "waiting_for_internal",
        "ready_for_review",
        "completed",
        "cancelled",
    },
    "waiting_for_client": {"in_progress", "ready_for_review"},
    "waiting_for_internal": {"in_progress", "ready_for_review"},
    "ready_for_review": {"in_progress", "changes_requested", "approved"},
    "changes_requested": {"in_progress", "ready_for_review", "rejected"},
    "ready_for_approval": {"in_progress", "approved", "changes_requested"},
    "approved": {"ready_to_file", "ready_for_approval", "completed"},
    "ready_to_file": {"filed", "approved"},
    "filed": {"delivered", "completed", "rejected_by_authority"},
    "delivered": {"completed"},
    "completed": {"delivered"},
    "cancelled": set(),
}


def available_transitions(current_status: str) -> list[str]:
    """Return the statuses that can be reached from ``current_status``."""
    return sorted(_WORKFLOW.get(current_status, set()))


def validate_transition(current_status: str, requested_status: str) -> bool:
    return requested_status in _WORKFLOW.get(current_status, set())


def transition_task(
    db: Session,
    task: Any,
    new_status: str,
    *,
    actor_id: str | None = None,
    reason: str | None = None,
    update_fields: dict[str, Any] | None = None,
) -> Any:
    if not validate_transition(task.status, new_status):
        raise BadRequestError(
            f"Cannot transition task from '{task.status}' to '{new_status}'"
        )

    old_status = task.status

    task.status = new_status
    if update_fields:
        for k, v in update_fields.items():
            if hasattr(task, k):
                setattr(task, k, v)

    from app.models import TaskStatusHistory

    history = TaskStatusHistory(
        task_id=task.id,
        from_status=old_status,
        to_status=new_status,
        approval_status=task.approval_status,
        filing_status=task.filing_status,
        progress_percent=task.progress_percent,
        changed_by_id=actor_id,
        actor_type="user" if actor_id else "system",
        reason=reason,
    )
    db.add(history)

    if new_status == "completed":
        task.completed_at = datetime.utcnow()
    elif new_status == "filed":
        task.filed_at = datetime.utcnow()
    elif new_status == "delivered":
        task.delivered_at = datetime.utcnow()

    db.commit()
    db.refresh(task)
    return task


def compute_progress(task: Any) -> int:
    """Compute progress percentage based on steps and status."""
    if not task.steps:
        return 0
    total = len(task.steps)
    completed = sum(1 for s in task.steps if s.status == "completed")
    return int((completed / total) * 100) if total else 0
