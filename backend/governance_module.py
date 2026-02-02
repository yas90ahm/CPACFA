"""
Autonomous Governance and Audit Trail — Single entry point.

1. Immutable Logs: Middleware records every LLM decision, prompt, and financial data
   accessed into a secure, read-only database (append-only; hash chain optional).
   Use: governance_module.log_llm_decision(...) after each orchestrator/LLM call.

2. Anomaly Detection: CFA-level Skepticism Agent runs every 24 hours to flag journal
   entries that deviate from historical patterns (Benford's Law, weekend entries,
   round-sum amounts). Use: governance_module.run_skepticism_scan(entries).

3. Conflict Resolution: If CPA and CFA disagree on valuation, the bot pauses and
   generates a Decision Memo for the human controller (pros/cons of each approach).
   Use: governance_module.check_cpa_cfa_conflict(cpa_output, cfa_output, intent)
   before returning final answer; if memo returned, respond with memo instead.
"""
from __future__ import annotations

from governance.immutable_log import (  # noqa: run from backend/ so governance package is on path
    log_llm_decision,
    read_llm_decision_log,
    verify_chain,
)
from governance.skepticism_agent import (
    run_skepticism_scan,
    SkepticismScanResult,
    JournalEntryForScan,
)
from governance.conflict_resolution import (
    check_cpa_cfa_conflict,
    generate_decision_memo,
    DecisionMemo,
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
]
