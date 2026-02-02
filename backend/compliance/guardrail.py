"""
Compliance Guardrail — orchestrates Tax Provision calculation, Citation Check, and audit logging.
Every Tax Provision calculation triggers a Citation Check; if logic contradicts stored law, execution stops and warning is output; all decisions are logged to Chain of Thought.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

from compliance.citation_check import run_citation_check, CitationCheckResult, SECTION_162M_WARNING
from compliance.audit_log import init_audit_db, log_chain_of_thought


@dataclass
class TaxProvisionResult:
    """Result of tax provision calculation after guardrail (citation check + audit)."""
    allowed: bool  # True if entry is allowed; False if blocked due to violation
    tax_provision_amount: Optional[Decimal] = None
    warning_message: Optional[str] = None  # If blocked: e.g. Section 162(m) warning
    citation_check: Optional[CitationCheckResult] = None
    audit_log_id: Optional[int] = None  # Chain of Thought row id
    reasoning: str = ""


def calculate_tax_provision_with_guardrail(
    pretax_income: Decimal,
    effective_tax_rate: Decimal,
    proposed_entry: Optional[dict[str, Any]] = None,
    *,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> TaxProvisionResult:
    """
    Compute tax provision and run Compliance Guardrail:
    1. Calculate tax provision (pretax_income * effective_tax_rate).
    2. Build proposed entry (if not provided) for citation check.
    3. Run Citation Check against RAG (Tax/FASB). If contradicts stored law (e.g. 162(m)), stop and return warning.
    4. Log decision to Chain of Thought table.
    """
    init_audit_db()

    # 1) Tax provision amount
    tax_provision_amount = (pretax_income * effective_tax_rate).quantize(Decimal("0.01"))

    # 2) Proposed entry for citation check
    entry = proposed_entry or {
        "description": "Income tax provision",
        "amount": str(tax_provision_amount),
        "debit_account": "tax_expense",
        "credit_account": "tax_payable",
        "pretax_income": str(pretax_income),
        "effective_tax_rate": str(effective_tax_rate),
    }

    # 3) Citation Check
    citation_result = run_citation_check(entry)

    # 4) If contradicts law: stop execution, log, return warning
    if not citation_result.passed:
        audit_id = log_chain_of_thought(
            event_type="tax_provision_calculation",
            reasoning=citation_result.reasoning,
            citations=", ".join(citation_result.citations_checked),
            outcome="blocked",
            proposed_entry=entry,
            warning_message=citation_result.warning_message or SECTION_162M_WARNING,
            session_id=session_id,
            user_id=user_id,
        )
        return TaxProvisionResult(
            allowed=False,
            tax_provision_amount=tax_provision_amount,
            warning_message=citation_result.warning_message or SECTION_162M_WARNING,
            citation_check=citation_result,
            audit_log_id=audit_id,
            reasoning=citation_result.reasoning,
        )

    # 5) Allowed: log and return success
    audit_id = log_chain_of_thought(
        event_type="tax_provision_calculation",
        reasoning=citation_result.reasoning,
        citations=", ".join(citation_result.citations_checked),
        outcome="allowed",
        proposed_entry=entry,
        session_id=session_id,
        user_id=user_id,
    )
    return TaxProvisionResult(
        allowed=True,
        tax_provision_amount=tax_provision_amount,
        citation_check=citation_result,
        audit_log_id=audit_id,
        reasoning=citation_result.reasoning,
    )
