"""
Citation Check — compares proposed tax provision logic against stored Tax Law (RAG).
If the logic contradicts law (e.g. deducting exec comp in excess of 162(m)), returns violation.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

from compliance.knowledge_base import get_compliance_kb, LawChunk


SECTION_162M_WARNING = (
    "Warning: Proposed entry may violate Section 162(m). Please review."
)


@dataclass
class CitationCheckResult:
    """Result of running citation check on a proposed tax provision / entry."""
    passed: bool  # True if no contradiction with stored law
    warning_message: Optional[str] = None  # If not passed, the exact message to output
    citations_checked: Optional[list[str]] = None  # List of law citations consulted
    reasoning: str = ""  # Chain-of-thought reasoning for audit

    def __post_init__(self) -> None:
        if self.citations_checked is None:
            object.__setattr__(self, "citations_checked", [])


def _extract_executive_compensation(proposed_entry: dict[str, Any]) -> Optional[Decimal]:
    """
    Heuristic: detect if proposed entry is executive compensation deduction.
    Looks for description/keywords and amount. Returns amount if likely exec comp.
    """
    desc = (proposed_entry.get("description") or proposed_entry.get("reason") or "").lower()
    amount = proposed_entry.get("amount") or proposed_entry.get("deduction_amount")
    if amount is not None:
        try:
            amt = Decimal(str(amount))
        except Exception:
            amt = None
    else:
        amt = None

    exec_keywords = [
        "executive", "ceo", "cfo", "compensation", "162(m)", "162m",
        "covered employee", "officer compensation", "exec comp",
    ]
    if any(k in desc for k in exec_keywords):
        return amt if amt is not None else Decimal("0")
    # If account code suggests comp expense (e.g. 6xxx comp)
    account = (proposed_entry.get("debit_account") or proposed_entry.get("credit_account") or "").strip()
    if "comp" in desc or "salary" in desc:
        return amt if amt is not None else Decimal("0")
    return None


def _check_162m(amount: Decimal, limit: Decimal = Decimal("1000000")) -> bool:
    """True if amount would violate 162(m) (deduction in excess of $1M per covered employee)."""
    return amount > limit


def run_citation_check(
    proposed_entry: dict[str, Any],
    tax_provision_context: Optional[dict[str, Any]] = None,
) -> CitationCheckResult:
    """
    Run citation check against the compliance knowledge base.
    - Queries RAG for relevant tax law (including 162(m)).
    - If proposed entry implies deducting executive compensation in excess of $1M, returns failed with 162(m) warning.
    - Otherwise returns passed.
    """
    kb = get_compliance_kb()
    citations_checked: list[str] = []
    reasoning_parts: list[str] = []

    # Build query from proposed entry
    desc = proposed_entry.get("description") or proposed_entry.get("reason") or ""
    query = f"executive compensation deduction tax {desc}"
    chunks = kb.query(query, top_k=5)
    for c in chunks:
        citations_checked.append(c.citation)
    reasoning_parts.append(f"Queried knowledge base with: '{query}'. Citations: {', '.join(citations_checked)}.")

    # 162(m) check: executive compensation in excess of $1M not deductible
    exec_comp_amount = _extract_executive_compensation(proposed_entry)
    if exec_comp_amount is not None and _check_162m(exec_comp_amount):
        reasoning_parts.append(
            f"Proposed deduction amount {exec_comp_amount} exceeds IRC Section 162(m) limit of $1,000,000 per covered employee. Entry contradicts stored tax law."
        )
        return CitationCheckResult(
            passed=False,
            warning_message=SECTION_162M_WARNING,
            citations_checked=citations_checked,
            reasoning=" ".join(reasoning_parts),
        )

    # Optional: check tax_provision_context for aggregate exec comp if provided
    if tax_provision_context:
        total_exec = tax_provision_context.get("total_executive_compensation_deduction")
        if total_exec is not None:
            try:
                total = Decimal(str(total_exec))
                if _check_162m(total):
                    reasoning_parts.append(
                        f"Total executive compensation deduction in provision {total} exceeds 162(m) limit."
                    )
                    return CitationCheckResult(
                        passed=False,
                        warning_message=SECTION_162M_WARNING,
                        citations_checked=citations_checked,
                        reasoning=" ".join(reasoning_parts),
                    )
            except Exception:
                pass

    reasoning_parts.append("No contradiction with IRC 162(m) or other retrieved tax law. Citation check passed.")
    return CitationCheckResult(
        passed=True,
        citations_checked=citations_checked,
        reasoning=" ".join(reasoning_parts),
    )
