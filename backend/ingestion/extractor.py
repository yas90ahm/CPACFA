"""
Extraction logic: identify Transaction Date, Description, Amount, Counterparty from parsed content.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from ingestion.models import ExtractedTransaction


# Common column name variants (case-insensitive)
DATE_KEYS = ("date", "transaction_date", "trans_date", "posting_date", "value_date", "transaction date")
DESC_KEYS = ("description", "desc", "narrative", "memo", "details", "particulars", "transaction details")
AMOUNT_KEYS = ("amount", "debit", "credit", "value", "sum", "total", "transaction amount", "debit_amount", "credit_amount")
COUNTERPARTY_KEYS = ("counterparty", "counter_party", "payee", "payer", "name", "party", "beneficiary", "from", "to")


def _normalize_key(k: str) -> str:
    return str(k).strip().lower().replace(" ", "_").replace("-", "_")


def _find_value(row: dict[str, Any], keys: tuple[str, ...]) -> Any:
    norm = {_normalize_key(k): v for k, v in row.items()}
    for key in keys:
        for nk, v in norm.items():
            if key in nk or nk in key:
                if v is not None and (not isinstance(v, str) or v.strip()):
                    return v
    return None


def _parse_date(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    # ISO
    if re.match(r"\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    # DD/MM/YYYY or MM/DD/YYYY
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", s)
    if m:
        g = m.groups()
        return f"{g[2]}-{g[1].zfill(2)}-{g[0].zfill(2)}"
    # Try Python parse
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%b %d, %Y"):
        try:
            dt = datetime.strptime(s[:20], fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s


def _parse_amount(v: Any) -> Decimal | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        try:
            return Decimal(str(v))
        except (InvalidOperation, ValueError):
            return None
    s = str(v).strip().replace(",", "").replace(" ", "")
    if not s:
        return None
    m = re.match(r"[-+]?[\d.]+", s)
    if not m:
        return None
    try:
        return Decimal(m.group(0))
    except (InvalidOperation, ValueError):
        return None


def extract_transactions(parsed: list[dict[str, Any]]) -> list[ExtractedTransaction]:
    """
    From parsed rows (e.g. Excel rows or flattened table data), extract
    Transaction Date, Description, Amount, Counterparty per row.
    """
    out: list[ExtractedTransaction] = []
    for row in parsed:
        if not isinstance(row, dict):
            continue
        date_val = _find_value(row, DATE_KEYS)
        desc_val = _find_value(row, DESC_KEYS)
        amount_val = _find_value(row, AMOUNT_KEYS)
        counterparty_val = _find_value(row, COUNTERPARTY_KEYS)

        tx_date = _parse_date(date_val)
        amount = _parse_amount(amount_val)
        description = str(desc_val).strip() if desc_val is not None else ""
        counterparty = str(counterparty_val).strip() if counterparty_val is not None else None
        if counterparty == "":
            counterparty = None

        # Skip empty rows
        if not description and amount is None and not tx_date:
            continue

        out.append(
            ExtractedTransaction(
                transaction_date=tx_date,
                description=description or "(No description)",
                amount=amount,
                counterparty=counterparty,
                raw_row={k: v for k, v in row.items() if v is not None},
            )
        )
    return out
