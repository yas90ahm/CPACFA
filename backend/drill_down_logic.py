"""
Transaction Interrogator — drill-down logic for P&L line items.

1. Filter original source data for all transactions tagged to a category (e.g. "Travel Expenses").
2. CPA Agent justification: explain categorization logic (e.g. "Tagged as Travel based on
   merchant names 'Delta' and 'Marriott'").
"""

from __future__ import annotations

import re
from typing import Any


def _normalize_label(label: str) -> str:
    """Normalize for matching: lower, collapse spaces, strip & and 'and'."""
    if not label:
        return ""
    s = re.sub(r"\s+", " ", (label or "").strip().lower())
    s = re.sub(r"\s*&\s*", " ", s)
    s = re.sub(r"\s+and\s+", " ", s)
    return s.strip()


def _label_matches(line_item_label: str, account_name: str) -> bool:
    """True if line_item_label matches account_name (normalized substring or exact)."""
    if not line_item_label or not account_name:
        return False
    norm_line = _normalize_label(line_item_label)
    norm_account = _normalize_label(account_name)
    if norm_line == norm_account:
        return True
    if norm_line in norm_account or norm_account in norm_line:
        return True
    # Word overlap: "Travel Expenses" vs "Travel & Expense"
    line_words = set(norm_line.split())
    account_words = set(norm_account.split())
    return bool(line_words & account_words)


def filter_transactions_by_category(
    transactions: list[dict[str, Any]],
    line_item_label: str,
    *,
    account_code: str | None = None,
) -> list[dict[str, Any]]:
    """
    Filter transactions tagged to the given P&L line (category).
    Each transaction dict should have 'account_name' and optionally 'account_code'.
    If account_code is provided, also filter by it.
    """
    if not transactions or not line_item_label:
        return []
    out = []
    for t in transactions:
        acc_name = (t.get("account_name") or t.get("accountName") or "").strip()
        acc_code = (t.get("account_code") or t.get("accountCode") or "").strip()
        if account_code and acc_code and acc_code != account_code:
            continue
        if _label_matches(line_item_label, acc_name):
            out.append(t)
    return out


def _extract_merchant_signals(transactions: list[dict[str, Any]]) -> list[str]:
    """Extract distinct merchant/vendor/description tokens that look like names (e.g. Delta, Marriott)."""
    seen: set[str] = set()
    signals: list[str] = []
    for t in transactions:
        desc = (t.get("description") or t.get("counterparty") or t.get("vendor") or "").strip()
        if not desc or len(desc) < 2:
            continue
        # Take first word or quoted part as potential merchant name
        parts = re.split(r"[\s,;]+", desc)
        for p in parts:
            p = p.strip().strip('"\'')
            if 2 <= len(p) <= 40 and p.isalnum() and p.lower() not in seen:
                seen.add(p.lower())
                signals.append(p)
    return signals[:15]


def _extract_keyword_signals(transactions: list[dict[str, Any]], category_label: str) -> list[str]:
    """Keywords from descriptions that support the category (e.g. flight, hotel for Travel)."""
    keyword_candidates: dict[str, int] = {}
    for t in transactions:
        desc = (t.get("description") or t.get("counterparty") or "").strip().lower()
        if not desc:
            continue
        words = re.findall(r"[a-z]{3,}", desc)
        for w in words:
            keyword_candidates[w] = keyword_candidates.get(w, 0) + 1
    # Prefer words that appear in multiple transactions
    sorted_keys = sorted(keyword_candidates.keys(), key=lambda k: -keyword_candidates[k])
    return sorted_keys[:10]


def generate_categorization_justification(
    transactions: list[dict[str, Any]],
    line_item_label: str,
) -> str:
    """
    CPA Agent explanation of why transactions were tagged to this category.
    E.g. "These were tagged as Travel based on the merchant names 'Delta' and 'Marriott'
    and keywords such as 'flight' and 'hotel'."
    """
    if not transactions:
        return (
            f"No transactions are currently tagged to '{line_item_label}'. "
            "Upload source data (bank statement or GL export) and run ingestion to see drill-down."
        )
    merchants = _extract_merchant_signals(transactions)
    keywords = _extract_keyword_signals(transactions, line_item_label)
    parts = [f"These {len(transactions)} transaction(s) were tagged as **{line_item_label}**"]
    if merchants:
        sample = ", ".join(f"'{m}'" for m in merchants[:7])
        parts.append(f"based on the merchant/vendor names: {sample}.")
    if keywords:
        sample = ", ".join(f"'{k}'" for k in keywords[:5])
        parts.append(f"Relevant description keywords include: {sample}.")
    if not merchants and not keywords:
        parts.append("using the Chart of Accounts classification rules applied to each description.")
    return " ".join(parts)


def run_drill_down(
    transactions: list[dict[str, Any]],
    line_item_label: str,
    account_code: str | None = None,
) -> dict[str, Any]:
    """
    Filter transactions by category and generate CPA justification.
    Returns { "transactions": [...], "justification": "..." }.
    """
    filtered = filter_transactions_by_category(
        transactions,
        line_item_label,
        account_code=account_code,
    )
    justification = generate_categorization_justification(filtered, line_item_label)
    return {
        "transactions": filtered,
        "justification": justification,
        "line_item_label": line_item_label,
        "count": len(filtered),
    }
