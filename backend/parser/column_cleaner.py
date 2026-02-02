"""
Data cleaning: standardize column names regardless of source bank/file format.
Maps variants to canonical: Vendor, Price, Date, Description, Amount, AccountName, Debit, Credit.
"""
from __future__ import annotations

import re
from typing import Any

# Canonical output keys
CANONICAL_DATE = "Date"
CANONICAL_VENDOR = "Vendor"
CANONICAL_PRICE = "Price"
CANONICAL_AMOUNT = "Amount"
CANONICAL_DESCRIPTION = "Description"
CANONICAL_ACCOUNT_NAME = "AccountName"
CANONICAL_ACCOUNT_CODE = "AccountCode"
CANONICAL_DEBIT = "Debit"
CANONICAL_CREDIT = "Credit"

# Source column variants (case-insensitive, normalized: lower, spaces -> underscore)
DATE_VARIANTS = (
    "date", "transaction_date", "trans_date", "posting_date", "value_date",
    "transaction date", "posting date", "doc_date", "document_date",
    "booking_date", "clearing_date", "effective_date",
)
VENDOR_VARIANTS = (
    "vendor", "payee", "payer", "counterparty", "counter_party", "name",
    "party", "beneficiary", "from", "to", "merchant", "description_of_payment",
    "payee_name", "payer_name", "company", "recipient",
)
PRICE_AMOUNT_VARIANTS = (
    "price", "amount", "value", "sum", "total", "transaction_amount",
    "debit_amount", "credit_amount", "balance", "running_balance",
    "gross", "net", "fee", "tax",
)
DESCRIPTION_VARIANTS = (
    "description", "desc", "narrative", "memo", "details", "particulars",
    "transaction_details", "remarks", "notes", "reference", "payment_details",
)
ACCOUNT_NAME_VARIANTS = (
    "accountname", "account_name", "account name", "account", "name",
    "description", "gl_account", "ledger_account", "account_description",
)
ACCOUNT_CODE_VARIANTS = (
    "accountcode", "account_code", "account code", "code", "gl_code",
    "ledger_code", "account_number", "acct_no",
)
DEBIT_VARIANTS = ("debit", "debits", "dr", "debit_amount", "debit_balance")
CREDIT_VARIANTS = ("credit", "credits", "cr", "credit_amount", "credit_balance")


def _normalize_header(h: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(h or "").strip().lower())


def _match_key(normalized: str, variants: tuple[str, ...]) -> bool:
    n = _normalize_header(normalized)
    for v in variants:
        if v in n or n in v:
            return True
    return False


# Map: canonical key -> tuple of variants (for matching)
CANONICAL_MAP: dict[str, tuple[str, ...]] = {
    CANONICAL_DATE: DATE_VARIANTS,
    CANONICAL_VENDOR: VENDOR_VARIANTS,
    CANONICAL_PRICE: PRICE_AMOUNT_VARIANTS,
    CANONICAL_AMOUNT: PRICE_AMOUNT_VARIANTS,
    CANONICAL_DESCRIPTION: DESCRIPTION_VARIANTS,
    CANONICAL_ACCOUNT_NAME: ACCOUNT_NAME_VARIANTS,
    CANONICAL_ACCOUNT_CODE: ACCOUNT_CODE_VARIANTS,
    CANONICAL_DEBIT: DEBIT_VARIANTS,
    CANONICAL_CREDIT: CREDIT_VARIANTS,
}


def standardize_columns(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Map each row's keys to canonical column names (Date, Vendor, Price, etc.).
    If multiple source columns map to the same canonical (e.g. Price and Amount),
    prefer Amount for numeric and keep first match for text.
    """
    if not rows:
        return []

    raw_headers = list(rows[0].keys())
    # Build mapping: raw_header -> canonical_key (first match wins per canonical)
    header_to_canonical: dict[str, str] = {}
    used_canonical: set[str] = set()

    for raw in raw_headers:
        n = _normalize_header(raw)
        for canonical, variants in CANONICAL_MAP.items():
            if canonical in used_canonical:
                continue
            for v in variants:
                vn = _normalize_header(v)
                if vn in n or n in vn:
                    header_to_canonical[raw] = canonical
                    used_canonical.add(canonical)
                    break
            if raw in header_to_canonical:
                break
        if raw not in header_to_canonical:
            # Keep unknown columns with cleaned name (Title Case, no spaces)
            header_to_canonical[raw] = raw.strip().title().replace(" ", "")

    out: list[dict[str, Any]] = []
    for row in rows:
        clean: dict[str, Any] = {}
        for k, v in row.items():
            canon = header_to_canonical.get(k, k)
            if canon in clean and canon in (CANONICAL_AMOUNT, CANONICAL_PRICE, CANONICAL_DEBIT, CANONICAL_CREDIT):
                # Prefer non-empty numeric
                try:
                    if v is not None and str(v).strip() and (clean[canon] is None or str(clean[canon]).strip() == ""):
                        clean[canon] = v
                except Exception:
                    pass
            else:
                clean[canon] = v
        out.append(clean)
    return out


def infer_format(cleaned_rows: list[dict[str, Any]]) -> str:
    """Infer 'trial_balance' | 'transaction_list' | 'mixed' from cleaned row keys."""
    if not cleaned_rows:
        return "mixed"
    keys = set(cleaned_rows[0].keys())
    has_tb = (CANONICAL_ACCOUNT_NAME in keys or "AccountName" in keys) and (
        CANONICAL_DEBIT in keys or CANONICAL_CREDIT in keys
    )
    has_tx = (CANONICAL_DATE in keys or CANONICAL_DESCRIPTION in keys or CANONICAL_AMOUNT in keys) or (
        CANONICAL_VENDOR in keys or CANONICAL_PRICE in keys
    )
    if has_tb and has_tx:
        return "mixed"
    if has_tb:
        return "trial_balance"
    if has_tx:
        return "transaction_list"
    return "mixed"
