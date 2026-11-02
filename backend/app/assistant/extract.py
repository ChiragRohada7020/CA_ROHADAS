"""Extract readable text from uploaded files for the assistant.

The assistant is text-first, so an uploaded PDF, spreadsheet, Word doc, or
plain-text file has to be reduced to text before it can be fed to the model.
This module is deliberately dependency-light: plain text is decoded in-process,
and the optional binary formats (PDF/DOCX/XLSX) are imported lazily so the
assistant works even when those packages are absent.

A note on corrupt XLSX files
----------------------------
A real XLSX is a ZIP of XML. ``openpyxl`` reads the ZIP's *central directory*
first, so a file whose central directory is damaged — e.g. one re-saved by a
browser or a truncated export — is rejected with "bad offset for central
directory" even though the individual sheet/shared-strings entries are intact.

``_read_xlsx_from_zip`` is the fallback: it walks the ZIP's *local* file
headers (which live at the start of each entry, not in the central directory)
and reads the shared strings and sheet XML directly. That recovers the data
from files openpyxl cannot open.
"""
from __future__ import annotations

import io
import os
import re
import zipfile
from typing import Optional
from xml.etree import ElementTree as ET

#: Hard cap on extracted text. Beyond this we truncate rather than let one
#: uploaded file blow out the conversation context (and the model's token bill).
MAX_TEXT_BYTES = 1_000_000

_TEXT_EXTS = {
    ".txt", ".csv", ".json", ".md", ".log", ".ini", ".cfg", ".yaml", ".yml",
    ".py", ".ts", ".tsx", ".js", ".jsx", ".xml", ".html", ".htm", ".sql",
    ".sh", ".bash", ".env", ".csv", ".tsv", ".diff", ".patch", ".tex",
}

_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}


def _decode_text(data: bytes) -> str:
    """Decode bytes as text, trying common encodings in order."""
    for enc in ("utf-8", "utf-16", "utf-16-le", "utf-16-be", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _looks_like_zip(data: bytes) -> bool:
    """A real XLSX/DOCX/PDF starts with a fixed magic-byte signature."""
    return data[:4] == b"PK\x03\x04" or data[:4] == b"%PDF"


def _looks_like_biff(data: bytes) -> bool:
    """Old ``.xls`` (BIFF) files start with the OLE2 compound-document
    signature ``D0 CF 11 E0``. Distinct from the ZIP-based XLSX."""
    return data[:4] == b"\xd0\xcf\x11\xe0"


def _looks_like_text(data: bytes) -> bool:
    """Heuristic: is this mostly decodable text?

    A spreadsheet mislabelled ``.xlsx`` is often really a CSV or a TSV, so
    rather than failing with ``bad offset for central directory`` we detect
    that case and parse it as text.
    """
    if not data:
        return False
    sample = data[:4096]
    # NUL bytes mean binary — a real XLSX/DOCX has none in its first chunk.
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    # Tab/newline/comma density: a CSV/TSV is mostly those.
    textish = sum(1 for b in sample if b in (9, 10, 13, 44) or 32 <= b < 127)
    return textish / max(len(sample), 1) > 0.85


def _spreadsheet_text(data: bytes) -> str:
    """Parse a spreadsheet that is really a text table (CSV/TSV/flat).

    Used as a fallback when ``openpyxl`` rejects the file — e.g. a CSV that
    was saved with an ``.xlsx`` extension. Splits on tabs first, then commas,
    so both TSV and CSV work.
    """
    text = _decode_text(data)
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return "[Spreadsheet contained no data]"

    # TSV if every line has a tab and most lines have more tabs than commas.
    tab_lines = sum(1 for ln in lines if "\t" in ln)
    comma_lines = sum(1 for ln in lines if "," in ln)
    if tab_lines and tab_lines >= comma_lines:
        delimiter = "\t"
    else:
        delimiter = ","

    out = ["--- Sheet: Sheet1 ---"]
    for ln in lines:
        cells = [c.strip() for c in ln.split(delimiter)]
        out.append("\t".join(cells))
    return "\n".join(out)


def _truncate(text: str) -> str:
    if len(text) <= MAX_TEXT_BYTES:
        return text
    return text[:MAX_TEXT_BYTES] + f"\n… [truncated; {len(text) - MAX_TEXT_BYTES} more chars]"


def _read_xlsx_from_zip(data: bytes) -> str | None:
    """Recover sheet data from an XLSX whose ZIP central directory is corrupt.

    ``openpyxl`` reads the central directory first, so a damaged one — common
    when a browser re-saves an XLSX — is rejected with "bad offset for central
    directory" even though the individual sheet/shared-strings entries are
    intact. This walks the ZIP's *local* file headers directly (they live at
    the start of each entry, not in the central directory) and reads the XML.

    Returns extracted text, or ``None`` if the data is not a usable XLSX ZIP.
    """
    try:
        # Parse local file headers manually so a corrupt central directory
        # (which zipfile.ZipFile requires) does not block recovery.
        entries = _zip_local_entries(data)
    except Exception:
        return None
    if not entries:
        return None

    shared: list[str] = []
    if "xl/sharedStrings.xml" in entries:
        try:
            root = ET.fromstring(entries["xl/sharedStrings.xml"])
            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            shared = [
                "".join(t.text or "" for t in si.findall(".//s:t", ns))
                for si in root.findall("s:si", ns)
            ]
        except Exception:
            shared = []

    # Standard OpenXML sheet names: xl/worksheets/sheet1.xml, sheet2.xml, …
    sheet_files = sorted(
        n for n in entries if re.match(r"xl/worksheets/(sheet\d+\.xml|sheet\.xml)$", n)
    )
    if not sheet_files:
        # Broader scan: any XML under xl/worksheets/ might be a sheet.
        sheet_files = sorted(n for n in entries if n.startswith("xl/worksheets/") and n.endswith(".xml"))
    if not sheet_files:
        # Last resort: any XML entry that contains sheet/row elements.
        for name, payload in entries.items():
            if not name.endswith(".xml"):
                continue
            try:
                if b"<sheetData>" in payload or b"<row" in payload:
                    sheet_files.append(name)
            except Exception:
                continue
        sheet_files = sorted(set(sheet_files))
    if not sheet_files:
        return None

    lines: list[str] = []
    for sheet_name in sheet_files:
        try:
            root = ET.fromstring(entries[sheet_name])
        except Exception:
            continue
        ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        lines.append(f"--- Sheet: {sheet_name} ---")
        for row in root.findall(".//s:row", ns):
                cells: list[str] = []
                for c in row.findall("s:c", ns):
                    t = c.get("t")
                    v = c.find("s:v", ns)
                    value = ""
                    if v is not None and v.text is not None:
                        if t == "s" and shared:
                            try:
                                value = shared[int(v.text)]
                            except (IndexError, ValueError):
                                value = v.text
                        else:
                            value = v.text
                    else:
                        # Inline strings: <c t="inlineStr"><is><t>Name</t></is></c>
                        is_el = c.find("s:is", ns)
                        if is_el is not None:
                            t_el = is_el.find("s:t", ns)
                            value = t_el.text or "" if t_el is not None else ""
                    cells.append(value)
                lines.append("\t".join(cells))
    return "\n".join(lines).strip() or "[Spreadsheet contained no data]"


def _zip_local_entries(data: bytes) -> dict[str, bytes]:
    """Return ``{name: payload}`` by walking ZIP local file headers.

    Unlike :func:`zipfile.ZipFile`, this does not need the central directory,
    so it recovers entries from files where the central directory is damaged.
    It scans the *whole* buffer for local-file-header signatures rather than
    stopping at the first non-header byte, so entries survive even when the
    first header is damaged or preceded by garbage.
    """
    entries: dict[str, bytes] = {}
    pos = 0
    n = len(data)
    while pos + 30 <= n:
        # Find the next local file header signature from here.
        sig = data.find(b"PK\x03\x04", pos)
        if sig == -1:
            break
        pos = sig
        # local file header layout (all little-endian):
        # sig(4) ver(2) flags(2) method(2) modtime(2) moddate(2)
        # crc32(4) comp_size(4) uncomp_size(4) name_len(2) extra_len(2)
        comp_size = int.from_bytes(data[pos + 18:pos + 22], "little")
        name_len = int.from_bytes(data[pos + 26:pos + 28], "little")
        extra_len = int.from_bytes(data[pos + 28:pos + 30], "little")
        name_start = pos + 30
        name_end = name_start + name_len
        if name_end > n:
            break
        name = data[name_start:name_end].decode("utf-8", "replace")
        payload_start = name_end + extra_len
        payload_end = payload_start + comp_size
        if payload_end > n:
            break
        raw = data[payload_start:payload_end]
        method = int.from_bytes(data[pos + 8:pos + 10], "little")
        if method == 0:
            payload = raw  # stored
        elif method == 8:
            import zlib

            try:
                payload = zlib.decompress(raw, -15)
            except Exception:
                pos = payload_end
                continue
        else:
            pos = payload_end
            continue
        # Only keep XLSX/DOCX XML entries; a duplicate name keeps the first.
        if name not in entries:
            entries[name] = payload
        pos = payload_end
    return entries


def _markitdown_text(data: bytes, filename: str) -> str | None:
    """Convert a file with Microsoft's MarkItDown, if installed.

    MarkItDown handles far more formats than the hand-written readers here
    (XLSX, DOCX, PDF, images, HTML, audio, video, …) and produces clean
    Markdown. Returns ``None`` when the package is absent or the conversion
    raised — the caller then falls back to a format-specific reader.
    """
    try:
        from markitdown import MarkItDown
    except Exception:
        return None
    try:
        md = MarkItDown()
        result = md.convert(io.BytesIO(data), filename=filename)
        return (result.text_content or "").strip()
    except Exception:
        return None


def extract_text(filename: str, data: bytes, mime_type: str = "") -> str:
    """Return extracted text for an uploaded file.

    Returns a human-readable note (starting with ``[``) when the file type
    cannot be reduced to text — the model still gets a useful signal instead
    of a wall of binary.
    """
    name = (filename or "file").lower()
    ext = os.path.splitext(name)[1]

    if ext in _TEXT_EXTS:
        return _truncate(_decode_text(data))

    if ext == ".pdf":
        try:
            from pypdf import PdfReader  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dep
            return f"[PDF uploaded but the reader is not installed: {exc}]"
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [p.extract_text() or "" for p in reader.pages]
            return _truncate("\n".join(pages).strip() or "[PDF contained no extractable text]")
        except Exception as exc:
            return f"[Could not read PDF: {exc}]"

    if ext in (".docx", ".doc"):
        try:
            from docx import Document  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dep
            return f"[Word document uploaded but the reader is not installed: {exc}]"
        try:
            doc = Document(io.BytesIO(data))
            parts = [p.text for p in doc.paragraphs]
            for table in doc.tables:
                for row in table.rows:
                    parts.append("\t".join(cell.text for cell in row.cells))
            return _truncate("\n".join(parts).strip() or "[Document contained no text]")
        except Exception as exc:
            return f"[Could not read Word document: {exc}]"

    if ext == ".xls":
        # Old BIFF format — openpyxl cannot read these, xlrd can.
        try:
            import xlrd  # type: ignore
        except Exception as exc:  # pragma: no cover - optional dep
            return f"[Old .xls uploaded but the reader is not installed: {exc}]"
        try:
            wb = xlrd.open_workbook(file_contents=data)
            lines: list[str] = []
            for ws in wb.sheets():
                lines.append(f"--- Sheet: {ws.name} ---")
                for r in range(ws.nrows):
                    cells = ["" if v is None else str(v) for v in ws.row_values(r)]
                    lines.append("\t".join(cells))
            return _truncate("\n".join(lines).strip() or "[Spreadsheet contained no data]")
        except Exception as exc:
            return f"[Could not read old .xls: {exc}]"

    if ext == ".xlsx":
        # A real XLSX is a ZIP (magic bytes PK). If the file is not a ZIP it is
        # almost certainly a text table saved with a spreadsheet extension —
        # e.g. a CSV named chirag.xlsx — which openpyxl rejects with
        # "bad offset for central directory". Detect that up front and parse
        # it as text instead of failing.
        if not _looks_like_zip(data) and _looks_like_text(data):
            return _truncate(_spreadsheet_text(data))

        # 1. Microsoft's MarkItDown — the most robust converter for valid
        #    XLSX files (and it adds DOCX/PDF/image/audio coverage too).
        converted = _markitdown_text(data, filename)
        if converted:
            return _truncate(converted)

        # 2. openpyxl — handles styles, formulas and merged cells precisely.
        wb = None
        try:
            from openpyxl import load_workbook  # type: ignore
        except Exception:  # pragma: no cover - optional dep
            load_workbook = None
        if load_workbook is not None:
            try:
                wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
            except Exception:
                wb = None
        if wb is not None:
            lines: list[str] = []
            for ws in wb.worksheets:
                lines.append(f"--- Sheet: {ws.title} ---")
                for row in ws.iter_rows(values_only=True):
                    cells = ["" if v is None else str(v) for v in row]
                    lines.append("\t".join(cells))
            return _truncate("\n".join(lines).strip() or "[Spreadsheet contained no data]")

        # 3. Recover sheet XML directly from the ZIP's local file headers.
        #    This works both when openpyxl is absent and when the central
        #    directory is corrupt (openpyxl cannot open either).
        recovered = _read_xlsx_from_zip(data)
        if recovered is not None:
            return _truncate(recovered)

        # 4. Last-ditch: maybe it is still a text table openpyxl choked on.
        if _looks_like_text(data):
            return _truncate(_spreadsheet_text(data))
        return f"[Could not read spreadsheet: openpyxl could not open the file and no sheet XML was recoverable]"

    if ext in _IMAGE_EXTS:
        return "[Image uploaded — text extraction is not supported for images. Describe the image to the assistant instead.]"

    return f"[Binary file uploaded ({name or 'file'}) — text extraction is not supported for this file type.]"