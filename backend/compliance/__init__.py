"""
FinOS Compliance Guardrail — RAG-based tax/FASB verification and audit trail.
- Knowledge base: 2025/2026 Tax Codes and FASB Updates (vector-store-ready).
- Citation check: runs on every Tax Provision calculation.
- Logic: blocks execution and outputs Section 162(m) warning if proposed entry contradicts stored law.
- Audit: every decision logged in Chain of Thought table for human auditors.
"""
from __future__ import annotations

from compliance.guardrail import (
    calculate_tax_provision_with_guardrail,
    TaxProvisionResult,
)
from compliance.citation_check import CitationCheckResult
from compliance.audit_log import (
    init_audit_db,
    log_chain_of_thought,
    get_audit_trail,
)

__all__ = [
    "calculate_tax_provision_with_guardrail",
    "TaxProvisionResult",
    "CitationCheckResult",
    "init_audit_db",
    "log_chain_of_thought",
    "get_audit_trail",
]
