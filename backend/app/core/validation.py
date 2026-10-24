"""Validation helpers for Indian identifiers.

Checks the *structure* of PAN, TAN, CIN, LLPIN, GSTIN, IFSC, PIN and Indian
mobile numbers. Does NOT claim to verify a number against a government database,
and does NOT hard-fail on a GSTIN check-digit mismatch (several published
examples fail the checksum). A mismatch is returned as a warning the user may
acknowledge.
"""
from __future__ import annotations

import re
from typing import Literal


# ── Regex patterns ────────────────────────────────────────────────────────────

PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
TAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9][A-Z]{4}[0-9A-Z]{1}[Z][0-9A-Z]{1}$")
CIN_PATTERN = re.compile(r"^[A-Z]{1}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9]{4}[A-Z]{6}[0-9]{1}[A-Z]{1}$|^([A-Z]{1}[0-9]{5}[0-9]{4}[A-Z]{1}[0-9]{4}[A-Z]{6}[0-9]{1}[A-Z]{1})$")
LLPIN_PATTERN = re.compile(r"^[A-Z]{2}[0-9]{6}$|^[A-Z]{3}[0-9]{6}$")
IFSC_PATTERN = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
PIN_PATTERN = re.compile(r"^[1-9][0-9]{5}$")
INDIAN_MOBILE_PATTERN = re.compile(r"^(\+?91[- ]?)?[6-9][0-9]{9}$")


# ── Check digit ──

def _gstin_check_digit(gstin: str) -> str:
    """Compute the 15th-character checksum for a GSTIN."""
    code_points = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    weights = [1, 2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6, 7]
    total = 0
    for i, ch in enumerate(gstin[:14]):
        val = code_points.index(ch)
        product = val * weights[i]
        total += product // 36 + product % 36
    check = (36 - (total % 36)) % 36
    return code_points[check]


def validate_gstin(gstin: str) -> tuple[bool, str | None]:
    """Validate a GSTIN's structure and checksum.

    Returns ``(is_valid, warning)``. A check-digit mismatch returns ``(True, warning)``
    so the caller can warn without rejecting.
    """
    if not GSTIN_PATTERN.match(gstin):
        return False, "Malformed GSTIN"

    expected = _gstin_check_digit(gstin)
    if expected != gstin[14]:
        return True, "GSTIN check-digit mismatch — please verify"

    if len(gstin) >= 10:
        pan = gstin[2:12]
        # Cross-check that the embedded PAN is structurally valid
        if not PAN_PATTERN.match(pan):
            return True, "GSTIN embeds an invalid PAN"

    return True, None


def validate_identifier(
    value: str,
    identifier_type: Literal["pan", "tan", "gstin", "cin", "llpin", "ifsc", "pin", "mobile"],
) -> tuple[bool, str | None]:
    """Validate a single identifier.

    Returns ``(is_valid, warning_or_error)``.
    """
    value = value.strip().upper()

    patterns: dict[str, re.Pattern] = {
        "pan": PAN_PATTERN,
        "tan": TAN_PATTERN,
        "cin": CIN_PATTERN,
        "llpin": LLPIN_PATTERN,
        "ifsc": IFSC_PATTERN,
        "pin": PIN_PATTERN,
        "mobile": INDIAN_MOBILE_PATTERN,
    }

    if identifier_type == "gstin":
        return validate_gstin(value)

    pattern = patterns.get(identifier_type)
    if pattern is None:
        return False, f"Unknown identifier type: {identifier_type}"

    if pattern.match(value if identifier_type != "mobile" else value.replace("+", "").replace("-", "").replace(" ", "")):
        return True, None

    return False, f"Malformed {identifier_type.upper()}"


def normalize_mobile(mobile: str) -> str:
    """Strip country code and formatting; return 10-digit number or raise ValueError."""
    mobile = mobile.strip()
    if mobile.startswith("+91"):
        mobile = mobile[3:]
    elif mobile.startswith("91") and len(mobile) == 12:
        mobile = mobile[2:]
    mobile = mobile.replace("-", "").replace(" ", "")
    if not INDIAN_MOBILE_PATTERN.fullmatch(mobile):
        raise ValueError(f"Not a valid Indian mobile number: {mobile}")
    return mobile[-10:]
