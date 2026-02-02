"""
FinOS Autonomous Governance and Audit Trail.
- Immutable logs: every LLM decision, prompt, and financial data accessed (read-only DB).
- Skepticism Agent: Benford's Law, weekend entries, round-sum (run every 24h).
- Forensic Skeptic: Benford, round-sum, unusual-time; flag for Audit Dashboard (Controller); do not alert user who made entry.
- Conflict resolution: CPA vs CFA disagreement → Decision Memo for human controller.
"""
from __future__ import annotations

from .immutable_log import (
    log_llm_decision,
    read_llm_decision_log,
    verify_chain,
)
from .skepticism_agent import (
    run_skepticism_scan,
    SkepticismScanResult,
    JournalEntryForScan,
)
from .conflict_resolution import (
    check_cpa_cfa_conflict,
    generate_decision_memo,
    DecisionMemo,
)
from .forensic_skeptic import (
    run_forensic_scan,
    ForensicEntryForScan,
    ForensicScanResult,
    ForensicAnomalyRecord,
)
from .audit_dashboard import (
    persist_forensic_anomalies,
    get_forensic_anomalies,
)

__all__ = [
    "log_llm_decision",
    "read_llm_decision_log",
    "verify_chain",
    "run_skepticism_scan",
    "SkepticismScanResult",
    "JournalEntryForScan",
    "check_cpa_cfa_conflict",
    "generate_decision_memo",
    "DecisionMemo",
    "run_forensic_scan",
    "ForensicEntryForScan",
    "ForensicScanResult",
    "ForensicAnomalyRecord",
    "persist_forensic_anomalies",
    "get_forensic_anomalies",
]
