"""
Classification sub-agent: map raw description (e.g. "AWS Invoice #123") to Chart of Accounts
(e.g. 5100 - IT Infrastructure) with a confidence score. Flag when confidence < 90% for human review.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from ingestion.models import ClassificationResult

# Default Chart of Accounts mapping: keyword patterns → (account_code, account_name)
# Order matters: first match wins. More specific patterns should come first.
DEFAULT_COA_RULES: list[tuple[str, str, str]] = [
    # (pattern (regex or substring), account_code, account_name)
    (r"aws|amazon web services|azure|gcp|google cloud|cloud infrastructure", "5100", "IT Infrastructure"),
    (r"software|saas|subscription|license|microsoft 365|slack|zoom", "5100", "IT Infrastructure"),
    (r"invoice|bill|payment to", "6000", "Accounts Payable"),
    (r"salary|payroll|wages|compensation", "7100", "Payroll"),
    (r"rent|lease|premises", "7200", "Rent & Occupancy"),
    (r"utilities|electric|gas|water|internet|telecom", "7300", "Utilities"),
    (r"insurance", "7400", "Insurance"),
    (r"legal|lawyer|attorney", "7500", "Legal & Professional"),
    (r"accounting|audit|tax (?!deduct)", "7500", "Legal & Professional"),
    (r"office supplies|stationery", "7600", "Office Supplies"),
    (r"travel|flight|hotel|per diem", "7700", "Travel & Expense"),
    (r"marketing|advertising|ads", "7800", "Marketing"),
    (r"bank fee|interest expense|fee", "7900", "Bank & Interest"),
    (r"revenue|sales|income|receipt", "4000", "Revenue"),
    (r"refund|rebate", "4100", "Refunds & Rebates"),
]


@dataclass
class ChartOfAccountsRule:
    pattern: str
    account_code: str
    account_name: str
    is_regex: bool = True


def _compile_rules(rules: list[tuple[str, str, str]] | None = None) -> list[ChartOfAccountsRule]:
    out: list[ChartOfAccountsRule] = []
    for item in rules or DEFAULT_COA_RULES:
        pat, code, name = item[0], item[1], item[2]
        is_regex = len(pat) > 1 and (pat.startswith("^") or "|" in pat or "\\" in pat or "[" in pat)
        out.append(ChartOfAccountsRule(pattern=pat, account_code=code, account_name=name, is_regex=is_regex))
    return out


def classify_description(
    description: str,
    rules: list[tuple[str, str, str]] | None = None,
    confidence_threshold: float = 0.9,
) -> ClassificationResult:
    """
    Map a raw description to a Chart of Accounts code and name with confidence.
    - Exact/substring match on keywords → higher confidence.
    - No match → default code with low confidence (flagged for review).
    """
    desc = (description or "").strip().lower()
    if not desc:
        return ClassificationResult(
            account_code="9999",
            account_name="Unclassified",
            confidence=0.0,
            needs_review=True,
        )

    compiled = _compile_rules(rules)
    best_confidence = 0.0
    best_code = "9999"
    best_name = "Unclassified"

    for rule in compiled:
        if rule.is_regex:
            try:
                if re.search(rule.pattern, desc, re.IGNORECASE):
                    # Regex match: confidence by length of match / specificity
                    best_confidence = 0.88
                    best_code = rule.account_code
                    best_name = rule.account_name
                    break
            except re.error:
                if rule.pattern.lower() in desc:
                    best_confidence = 0.85
                    best_code = rule.account_code
                    best_name = rule.account_name
                    break
        else:
            if rule.pattern.lower() in desc:
                # Substring: exact phrase match → 0.92
                best_confidence = 0.92
                best_code = rule.account_code
                best_name = rule.account_name
                break

    # If we had a match, optionally boost confidence for longer/more specific desc
    if best_code != "9999" and len(desc) >= 10:
        best_confidence = min(1.0, best_confidence + 0.05)

    needs_review = best_confidence < confidence_threshold
    return ClassificationResult(
        account_code=best_code,
        account_name=best_name,
        confidence=round(best_confidence, 2),
        needs_review=needs_review,
    )
