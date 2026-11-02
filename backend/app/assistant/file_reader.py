"""The file-reader pipeline for the assistant.

The assistant is text-first: it can only answer about a file if the file's
contents reach it as text. This module is the single place that turns an
uploaded file into the text the model sees.

Pipeline
--------
upload (multipart)
    → :class:`FileReader.extract`  # bytes -> text, format-aware
    → session store                # attached to one conversation
    → chat loop                    # text injected into the user message
    → model                       # answers from the file's contents

Supported formats
----------------
Plain text, CSV, TSV, JSON, Markdown, code… — decoded in-process.
PDF, DOCX, XLSX — via pypdf / python-docx / openpyxl (lazy imports).
Old ``.xls`` (BIFF) — via xlrd.
Anything else — a readable note instead of a crash, so the model still gets
a useful signal rather than a wall of binary.

Mislabelled files are handled too: a CSV saved with an ``.xlsx`` extension is
not a real XLSX (openpyxl rejects it with "bad offset for central directory"),
so the reader detects that by content and parses it as text.
"""
from __future__ import annotations

from typing import Any

from app.assistant.extract import (
    MAX_TEXT_BYTES,
    extract_text,
)


class FileReader:
    """Read an uploaded file and return the text the assistant should see.

    The reader is format-aware and never raises: every input — valid,
    mislabelled, corrupt, or binary — produces a string the chat loop can
    safely attach to a session.
    """

    #: Maximum bytes the reader will accept before refusing the upload.
    MAX_UPLOAD_BYTES = 4 * 1024 * 1024

    def extract(self, filename: str, data: bytes, mime_type: str = "") -> dict[str, Any]:
        """Return ``{name, mime_type, size_bytes, text, chars}``.

        ``text`` is the file's contents (or a readable note when it cannot be
        reduced to text). ``chars`` is its length, so callers can report
        progress without re-reading the file.
        """
        text = extract_text(filename, data, mime_type)
        return {
            "name": filename or "file",
            "mime_type": mime_type or "application/octet-stream",
            "size_bytes": len(data),
            "text": text,
            "chars": len(text),
        }

    def is_too_large(self, data: bytes) -> bool:
        return len(data) > self.MAX_UPLOAD_BYTES


#: Module-level singleton — the chat router and tests share one reader.
file_reader = FileReader()