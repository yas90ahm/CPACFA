"""
Auditor-Friendly CSV template — Document Generation Service.
Columns: Date, Transaction ID, Entity, Account Code, Account Name, Debit, Credit, Currency, Agent Justification.
Debits and credits in separate columns for easy reconciliation.
Footer: integrity hash (SHA-256 of totals) to prove the file has not been tampered with.
Metadata: hidden header row with Agent Version and Timestamp (lines starting with #).
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime, timezone
from typing import Any

# Default agent version when not provided
DEFAULT_AGENT_VERSION = "1.0"

# Characters that can trigger formula/injection in Excel/Sheets (prefix with ')
CSV_INJECTION_PATTERN = re.compile(r"^[\s=+\-@\t\r]")


def _escape_cell(value: Any) -> str:
    """Return string safe for CSV; prefix with single quote if value could trigger formula."""
    if value is None:
        return ""
    s = str(value).strip()
    if CSV_INJECTION_PATTERN.match(s):
        return "'" + s
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + s
    return s


def _row_to_safe(row: list[Any]) -> list[str]:
    return [_escape_cell(c) for c in row]


def _num(value: Any) -> float:
    """Coerce to float for Debit/Credit; 0 if missing or invalid."""
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _format_num(value: float) -> str:
    return f"{value:.2f}"


def _build_integrity_payload(total_debits: float, total_credits: float, row_count: int) -> str:
    """Canonical string used to compute the integrity hash (auditors can recompute)."""
    return f"TOTAL_DEBITS={_format_num(total_debits)};TOTAL_CREDITS={_format_num(total_credits)};ROWS={row_count}"


def _compute_integrity_hash(total_debits: float, total_credits: float, row_count: int) -> str:
    """SHA-256 of the totals payload so the file can be verified for tampering."""
    payload = _build_integrity_payload(total_debits, total_credits, row_count)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Column order for the auditor-friendly template
AUDITOR_CSV_COLUMNS = [
    "Date",
    "Transaction ID",
    "Entity",
    "Account Code",
    "Account Name",
    "Debit",
    "Credit",
    "Currency",
    "Agent Justification",
]


def _get_cell(record: dict[str, Any] | Any, key: str, alt_key: str | None = None) -> Any:
    if isinstance(record, dict):
        v = record.get(key)
        if v is not None:
            return v
        return record.get(alt_key) if alt_key else None
    return getattr(record, key, None) or (getattr(record, alt_key, None) if alt_key else None)


def build_auditor_friendly_csv(
    rows: list[dict[str, Any] | Any],
    *,
    agent_version: str | None = None,
    generated_timestamp: datetime | str | None = None,
) -> bytes:
    """
    Build an Auditor-Friendly CSV with:

    - **Metadata (hidden header):** First line starting with # containing Agent Version and Timestamp.
    - **Columns:** Date, Transaction ID, Entity, Account Code, Account Name, Debit, Credit, Currency, Agent Justification.
    - **Logic:** Debit and Credit in separate columns for easy reconciliation.
    - **Footer:** Two lines starting with #:
      - TOTAL_DEBITS, total_credits, ROWS (so auditors can verify).
      - INTEGRITY_HASH, SHA256, <hex> (checksum of totals to prove file not tampered).

    All data cells are escaped to prevent CSV injection.
    Returns UTF-8 bytes with BOM for Excel.
    """
    version = agent_version or DEFAULT_AGENT_VERSION
    if generated_timestamp is None:
        ts = datetime.now(timezone.utc).isoformat()
    elif isinstance(generated_timestamp, datetime):
        ts = generated_timestamp.isoformat()
    else:
        ts = str(generated_timestamp)

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")

    # --- Metadata (hidden header row; parsers can skip lines starting with #) ---
    buffer.write(f"# METADATA | Agent Version: {version} | Generated: {ts}\n")

    # --- Column header ---
    writer.writerow(_row_to_safe(AUDITOR_CSV_COLUMNS))

    total_debits = 0.0
    total_credits = 0.0
    row_count = 0

    for record in rows or []:
        date_val = _get_cell(record, "date", "Date")
        tx_id = _get_cell(record, "transaction_id", "Transaction ID")
        entity = _get_cell(record, "entity", "Entity")
        account_code = _get_cell(record, "account_code", "Account Code")
        account_name = _get_cell(record, "account_name", "Account Name")
        debit = _num(_get_cell(record, "debit", "Debit"))
        credit = _num(_get_cell(record, "credit", "Credit"))
        currency = _get_cell(record, "currency", "Currency")
        justification = _get_cell(record, "agent_justification", "Agent Justification")

        total_debits += debit
        total_credits += credit
        row_count += 1

        writer.writerow(
            _row_to_safe(
                [
                    date_val if date_val is not None else "",
                    tx_id if tx_id is not None else "",
                    entity if entity is not None else "",
                    account_code if account_code is not None else "",
                    account_name if account_name is not None else "",
                    _format_num(debit),
                    _format_num(credit),
                    currency if currency is not None else "",
                    justification if justification is not None else "",
                ]
            )
        )

    # --- Footer: totals and integrity hash ---
    buffer.write(f"# TOTAL_DEBITS,{_format_num(total_debits)},TOTAL_CREDITS,{_format_num(total_credits)},ROWS,{row_count}\n")
    integrity_hash = _compute_integrity_hash(total_debits, total_credits, row_count)
    buffer.write(f"# INTEGRITY_HASH,SHA256,{integrity_hash}\n")

    out = buffer.getvalue()
    return "\ufeff".encode("utf-8") + out.encode("utf-8")


def verify_auditor_csv_integrity(csv_content: str | bytes) -> tuple[bool, str]:
    """
    Verify the integrity of an auditor-friendly CSV by recomputing the hash from
    the data rows and comparing to the footer INTEGRITY_HASH.
    Returns (verified: bool, message: str).
    """
    if isinstance(csv_content, bytes):
        csv_content = csv_content.decode("utf-8-sig", errors="replace")
    lines = [ln.strip() for ln in csv_content.splitlines() if ln.strip()]
    if not lines:
        return False, "Empty file"
    # Find header (first non-# line)
    header_idx = 0
    for i, ln in enumerate(lines):
        if not ln.startswith("#"):
            header_idx = i
            break
    else:
        return False, "No data header found"
    # Parse data rows (skip # lines)
    total_debits = 0.0
    total_credits = 0.0
    row_count = 0
    for ln in lines[header_idx + 1 :]:
        if ln.startswith("#"):
            if "INTEGRITY_HASH" in ln:
                parts = [p.strip() for p in ln.split(",")]
                if len(parts) >= 3 and parts[1] == "SHA256":
                    stored_hash = parts[2]
                    computed = _compute_integrity_hash(total_debits, total_credits, row_count)
                    ok = stored_hash == computed
                    return ok, "Hash match" if ok else f"Hash mismatch: computed {computed}, stored {stored_hash}"
            continue
        row = next(csv.reader(io.StringIO(ln)), [])
        if len(row) >= 7:
            try:
                total_debits += float(row[5] or 0)
                total_credits += float(row[6] or 0)
                row_count += 1
            except ValueError:
                pass
    return False, "INTEGRITY_HASH footer not found"
