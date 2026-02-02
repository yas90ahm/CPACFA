"""
Document Generation Service — CSV export of CPA-verified Clean Ledger.
Uses stdlib csv with escaping to prevent CSV injection (=, +, -, @, \\t, \\r).
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any


# Characters that can trigger formula/injection in Excel/Sheets (prefix with ')
CSV_INJECTION_PATTERN = re.compile(r"^[\s=+\-@\t\r]")


def _escape_cell(value: Any) -> str:
    """Return string safe for CSV; prefix with single quote if value could trigger formula."""
    if value is None:
        return ""
    s = str(value).strip()
    if CSV_INJECTION_PATTERN.match(s):
        return "'" + s
    # If contains comma, newline, or double-quote, csv.writer will quote; ensure no injection
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def _row_to_safe(row: list[Any]) -> list[str]:
    return [_escape_cell(c) for c in row]


def build_clean_ledger_csv(clean_ledger: list[dict[str, Any]]) -> bytes:
    """
    Build a structured CSV from the CPA-verified Clean Ledger.
    Columns: account_code, account_name, debit, credit, account_type.
    All columns are escaped to prevent CSV injection.
    Returns CSV file bytes (UTF-8 with BOM for Excel).
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
    writer.writerow(_row_to_safe(["account_code", "account_name", "debit", "credit", "account_type"]))
    for line in clean_ledger or []:
        if isinstance(line, dict):
            account_code = line.get("account_code") or line.get("accountCode") or ""
            account_name = line.get("account_name") or line.get("accountName") or ""
            debit = line.get("debit")
            credit = line.get("credit")
            account_type = line.get("account_type") or line.get("accountType") or ""
        else:
            account_code = getattr(line, "account_code", None) or getattr(line, "accountCode", "") or ""
            account_name = getattr(line, "account_name", None) or getattr(line, "accountName", "") or ""
            debit = getattr(line, "debit", None)
            credit = getattr(line, "credit", None)
            account_type = getattr(line, "account_type", None) or getattr(line, "accountType", "") or ""
        try:
            debit_val = f"{float(debit):.2f}" if debit is not None else ""
        except (TypeError, ValueError):
            debit_val = _escape_cell(debit)
        try:
            credit_val = f"{float(credit):.2f}" if credit is not None else ""
        except (TypeError, ValueError):
            credit_val = _escape_cell(credit)
        writer.writerow(_row_to_safe([account_code, account_name, debit_val, credit_val, account_type]))
    out = buffer.getvalue()
    # UTF-8 BOM for Excel
    return "\ufeff".encode("utf-8") + out.encode("utf-8")
