"""Template metadata for the visual template selector.

Holds display names, descriptions, and thumbnail layout hints for every
available invoice PDF template.  Kept separate from the renderer so the
frontend can list templates without importing ReportLab.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class TemplateMetadata:
    """Display metadata for one invoice template."""

    id: str
    name: str
    description: str
    category: str
    accent_color: str
    header_style: str  # "asymmetric" | "editorial" | "band" | "split" | "grid"
    best_for: str
    features: list[str] = field(default_factory=list)


TEMPLATES: list[TemplateMetadata] = []  # DISABLED — all templates removed pending new design


def list_templates() -> list[TemplateMetadata]:
    """Return all available templates, ordered by category then name."""
    return sorted(TEMPLATES, key=lambda t: (t.category, t.name))


def get_template(template_id: str) -> TemplateMetadata | None:
    """Return the metadata for a single template, or None if unknown."""
    for t in TEMPLATES:
        if t.id == template_id:
            return t
    return None


def template_ids() -> list[str]:
    """Return the list of all template IDs."""
    return [t.id for t in TEMPLATES]


def template_summary() -> list[dict[str, Any]]:
    """Return a JSON-safe summary of every template."""
    return [
        {
            "id": t.id,
            "name": t.name,
            "description": t.description,
            "category": t.category,
            "accent_color": t.accent_color,
            "header_style": t.header_style,
            "best_for": t.best_for,
            "features": t.features,
        }
        for t in list_templates()
    ]
