"""
Local Extraction engine: PDF / CSV / Excel -> clean Trial Balance or Transaction List JSON for CPA Agent.
"""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

from .column_cleaner import (
    CANONICAL_ACCOUNT_CODE,
    CANONICAL_ACCOUNT_NAME,
    CANONICAL_AMOUNT,
    CANONICAL_CREDIT,
    CANONICAL_DATE,
    CANONICAL_DEBIT,
    CANONICAL_DESCRIPTION,
    CANONICAL_PRICE,
    CANONICAL_VENDOR,
    standardize_columns,
    infer_format,
)
from .models import ExtractionResult, TrialBalanceLine, TransactionRow
from .ocr_engine import extract_document


def _parse_amount(v: Any) -> Optional[Decimal]:
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
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    m = re.match(r"[-+]?[\d.]+", s)
    if not m:
        return None
    try:
        return Decimal(m.group(0))
    except (InvalidOperation, ValueError):
        return None


def _parse_date(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    if re.match(r"\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = re.match(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", s)
    if m:
        g = m.groups()
        return f"{g[2]}-{g[1].zfill(2)}-{g[0].zfill(2)}"
    return s


def _to_trial_balance_lines(rows: list[dict[str, Any]]) -> list[TrialBalanceLine]:
    out: list[TrialBalanceLine] = []
    for row in rows:
        account_name = row.get(CANONICAL_ACCOUNT_NAME) or row.get("AccountName")
        account_code = row.get(CANONICAL_ACCOUNT_CODE) or row.get("AccountCode") or ""
        debit_val = row.get(CANONICAL_DEBIT) or row.get("Debit")
        credit_val = row.get(CANONICAL_CREDIT) or row.get("Credit")
        account_name_str = str(account_name or "").strip()
        if not account_name_str:
            continue
        debit = _parse_amount(debit_val)
        credit = _parse_amount(credit_val)
        if debit is None:
            debit = Decimal("0")
        if credit is None:
            credit = Decimal("0")
        out.append(
            TrialBalanceLine(
                account_code=str(account_code or "").strip(),
                account_name=account_name_str,
                debit=debit,
                credit=credit,
            )
        )
    return out


def _to_transaction_list(rows: list[dict[str, Any]]) -> list[TransactionRow]:
    out: list[TransactionRow] = []
    for row in rows:
        date_val = row.get(CANONICAL_DATE) or row.get("Date")
        desc = row.get(CANONICAL_DESCRIPTION) or row.get("Description") or ""
        amount_val = row.get(CANONICAL_AMOUNT) or row.get(CANONICAL_PRICE) or row.get("Amount") or row.get("Price")
        vendor = row.get(CANONICAL_VENDOR) or row.get("Vendor")
        debit_val = row.get(CANONICAL_DEBIT) or row.get("Debit")
        credit_val = row.get(CANONICAL_CREDIT) or row.get("Credit")
        account_name = row.get(CANONICAL_ACCOUNT_NAME) or row.get("AccountName")
        tx_date = _parse_date(date_val)
        amount = _parse_amount(amount_val)
        debit = _parse_amount(debit_val)
        credit = _parse_amount(credit_val)
        if not desc and amount is None and not tx_date and not vendor:
            continue
        out.append(
            TransactionRow(
                date=tx_date,
                description=str(desc or "").strip(),
                amount=amount,
                vendor=str(vendor).strip() if vendor else None,
                debit=debit,
                credit=credit,
                account_name=str(account_name).strip() if account_name else None,
                raw=dict(row),
            )
        )
    return out


def extract(
    file_path: str | Path | None = None,
    content: bytes | None = None,
    filename: str = "",
    mime_type: str = "",
) -> ExtractionResult:
    """
    Local Extraction: accept PDF, CSV, Excel -> layout-aware parse -> clean columns -> Trial Balance or Transaction List.
    Returns clean JSON-ready result for CPA Agent.
    """
    errors: list[str] = []
    source = filename or (str(file_path) if file_path else "upload")

    try:
        raw_rows = extract_document(
            content=content,
            file_path=str(file_path) if file_path else None,
            filename=filename,
            mime_type=mime_type,
        )
    except Exception as e:
        errors.append(f"Extract failed: {e}")
        return ExtractionResult(
            source_file=source,
            errors=errors,
            detected_format="",
        )

    if not raw_rows:
        errors.append("No rows extracted from document")
        return ExtractionResult(
            source_file=source,
            errors=errors,
            detected_format="",
        )

    cleaned = standardize_columns(raw_rows)
    detected = infer_format(cleaned)

    trial_balance: list[TrialBalanceLine] = []
    transaction_list: list[TransactionRow] = []

    if detected in ("trial_balance", "mixed"):
        trial_balance = _to_trial_balance_lines(cleaned)
    if detected in ("transaction_list", "mixed"):
        transaction_list = _to_transaction_list(cleaned)
    if detected == "mixed" and not trial_balance and not transaction_list:
        transaction_list = _to_transaction_list(cleaned)
    if not trial_balance and not transaction_list:
        transaction_list = _to_transaction_list(cleaned)

    return ExtractionResult(
        trial_balance=trial_balance,
        transaction_list=transaction_list,
        raw_cleaned_rows=cleaned,
        source_file=source,
        errors=errors,
        detected_format=detected,
    )
