"""
User Correction mechanism for the CPA Agent.

1. When a user manually changes a transaction category (e.g. Travel → Marketing),
   the bot asks: "Got it. Should I treat all future transactions from [Merchant] as '[Category]'?"
2. User preferences are stored in a local user_rules.json file.
3. On the next similar upload, the CPA Agent checks user_rules first and can say:
   "I've categorized this as 'Marketing' based on your previous preference."
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

# Default path: same directory as this module, or override via env
DEFAULT_USER_RULES_PATH = Path(__file__).resolve().parent / "user_rules.json"
USER_RULES_PATH = Path(os.environ.get("USER_RULES_PATH", str(DEFAULT_USER_RULES_PATH)))


def _normalize_merchant(s: str) -> str:
    """Normalize for storage and lookup: strip, collapse spaces, lowercase for key."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", (s or "").strip()).strip()


def _load_rules() -> list[dict[str, Any]]:
    path = USER_RULES_PATH
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("rules", data) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    except (json.JSONDecodeError, OSError):
        return []


def _save_rules(rules: list[dict[str, Any]]) -> None:
    path = USER_RULES_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"rules": rules}, f, indent=2)


def on_user_correction(
    merchant_name: str,
    old_category: str,
    new_category: str,
    account_code: str,
    account_name: str,
) -> str:
    """
    Call when the user manually changes a transaction category (e.g. Travel → Marketing).
    Returns the bot message to show: "Got it. Should I treat all future transactions from [Merchant] as '[Category]'?"
    Does not persist until the user confirms via save_user_rule.
    """
    merchant = _normalize_merchant(merchant_name) or "this merchant"
    return f"Got it. Should I treat all future transactions from {merchant} as '{new_category}'?"


def save_user_rule(
    merchant_name: str,
    category: str,
    account_code: str,
    account_name: str,
) -> None:
    """
    Store the user's preference (e.g. after they confirm "Yes" to the prompt).
    Persists to user_rules.json.
    """
    merchant = _normalize_merchant(merchant_name)
    if not merchant:
        return
    rules = _load_rules()
    # Remove any existing rule for this merchant (update in place)
    rules = [r for r in rules if _normalize_merchant(r.get("merchant", "")) != merchant]
    rules.append({
        "merchant": merchant_name.strip(),
        "category": category,
        "account_code": account_code,
        "account_name": account_name,
    })
    _save_rules(rules)


def get_rule_for_transaction(description: str, counterparty: str | None = None) -> dict[str, Any] | None:
    """
    Check user_rules.json for a matching preference.
    If the transaction description or counterparty matches a stored merchant (substring or exact),
    return the rule dict: {"merchant", "category", "account_code", "account_name"}.
    Otherwise return None.
    """
    rules = _load_rules()
    if not rules:
        return None
    desc = (description or "").strip().lower()
    counterparty_str = (counterparty or "").strip().lower()
    for r in rules:
        m = (r.get("merchant") or "").strip()
        if not m:
            continue
        m_lower = m.lower()
        if m_lower in desc or desc in m_lower:
            return r
        if counterparty_str and (m_lower in counterparty_str or counterparty_str in m_lower):
            return r
        # Word overlap: "Delta Airlines" vs description "Delta flight 123"
        m_words = set(re.split(r"\s+", m_lower))
        combined = f"{desc} {counterparty_str}"
        combined_words = set(re.split(r"\s+", combined))
        if m_words & combined_words:
            return r
    return None


def get_reasoning_message(merchant: str, category: str) -> str:
    """
    Message to include in chat when the CPA Agent applied a user preference.
    """
    return f"I've categorized this as '{category}' based on your previous preference."


def get_classification_from_user_rule(
    description: str,
    counterparty: str | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """
    If a user rule matches this transaction, return (classification_dict, reasoning_message).
    classification_dict has: account_code, account_name, confidence=1.0, from_user_rule=True.
    reasoning_message is the string to show in chat.
    Otherwise return (None, None).
    """
    rule = get_rule_for_transaction(description, counterparty)
    if not rule:
        return None, None
    category = rule.get("account_name") or rule.get("category") or "Unclassified"
    merchant = rule.get("merchant", "")
    return (
        {
            "account_code": rule.get("account_code", "9999"),
            "account_name": category,
            "confidence": 1.0,
            "from_user_rule": True,
        },
        get_reasoning_message(merchant, category),
    )
