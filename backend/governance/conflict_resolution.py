"""
Conflict Resolution — When CPA and CFA agents disagree on valuation, pause and generate
a Decision Memo for the human controller outlining pros/cons of each approach.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Optional


@dataclass
class DecisionMemo:
    """Memo for human controller when CPA and CFA disagree on valuation."""
    conflict_reason: str
    cpa_summary: str
    cfa_summary: str
    cpa_pros: list[str] = field(default_factory=list)
    cpa_cons: list[str] = field(default_factory=list)
    cfa_pros: list[str] = field(default_factory=list)
    cfa_cons: list[str] = field(default_factory=list)
    recommendation: str = ""
    paused: bool = True  # Bot must pause; human must resolve


def _serialize_cpa(cpa: Any) -> dict[str, Any]:
    if cpa is None:
        return {}
    return {
        "net_income": str(cpa.net_income) if getattr(cpa, "net_income", None) is not None else None,
        "total_equity": str(cpa.total_equity) if getattr(cpa, "total_equity", None) is not None else None,
        "total_assets": str(cpa.total_assets) if getattr(cpa, "total_assets", None) is not None else None,
        "total_liabilities": str(cpa.total_liabilities) if getattr(cpa, "total_liabilities", None) is not None else None,
    }


def _serialize_cfa(cfa: Any) -> dict[str, Any]:
    if cfa is None or not isinstance(cfa, dict):
        return {}
    return {
        "roe": cfa.get("roe"),
        "valuation_note": cfa.get("valuation_note"),
        "cpa_data_used": cfa.get("cpa_data_used"),
    }


def check_cpa_cfa_conflict(
    cpa_output: Any,
    cfa_output: Any,
    intent: str,
    options: Optional[dict[str, Any]] = None,
) -> Optional[DecisionMemo]:
    """
    Detect if CPA and CFA disagree on valuation. If so, return a Decision Memo for human.
    Conflict heuristics:
    - CFA says negative ROE / "loss-making" / "overvalued" while CPA shows positive equity and positive net income (inconsistency).
    - CFA valuation note is strongly negative ("Negative ROE", "overvalued") vs CPA book values suggesting health.
    - Two materially different valuation conclusions (e.g. ROE-based vs DCF) — when we have both, we can compare.
    """
    opts = options or {}
    roe_conflict_threshold = float(opts.get("roe_negative_conflict", 0))  # CFA ROE < 0 with CPA positive NI/equity
    if intent != "cfa" or cfa_output is None:
        return None

    cpa = cpa_output
    cfa = cfa_output if isinstance(cfa_output, dict) else {}
    roe = cfa.get("roe")
    valuation_note = (cfa.get("valuation_note") or "").lower()
    net_income = getattr(cpa, "net_income", None) if cpa else None
    total_equity = getattr(cpa, "total_equity", None) if cpa else None

    conflict_reason = ""
    if roe is not None and roe < roe_conflict_threshold and net_income is not None and total_equity is not None:
        if net_income > 0 and total_equity > 0:
            conflict_reason = "CFA reports negative or low ROE while CPA shows positive Net Income and positive Equity (valuation vs book position disagreement)."
    if not conflict_reason and ("negative roe" in valuation_note or "loss-making" in valuation_note or "overvalued" in valuation_note):
        if cpa and getattr(cpa, "total_equity", None) and getattr(cpa, "net_income", None):
            ni = cpa.net_income
            eq = cpa.total_equity
            if ni > 0 and eq > 0:
                conflict_reason = "CFA valuation note suggests overvaluation or loss-making while CPA book values indicate positive income and equity (CPA vs CFA valuation conflict)."
    if not conflict_reason:
        return None

    cpa_pros = [
        "CPA view is based on GAAP/IFRS financial statements (ASC 210, ASC 220).",
        "Book values are auditable and consistent with historical cost.",
    ]
    cpa_cons = [
        "Book value may not reflect current fair value or market conditions.",
        "Does not incorporate forward-looking valuation (DCF, multiples).",
    ]
    cfa_pros = [
        "CFA view incorporates profitability and capital efficiency (ROE).",
        "Valuation note reflects investment perspective (e.g. cost of equity, sustainability).",
    ]
    cfa_cons = [
        "Valuation conclusion depends on inputs (e.g. equity, net income) from CPA; timing or classification differences can affect ROE.",
        "Single metric (ROE) may not capture full picture; DCF or peer comparison may be needed.",
    ]
    recommendation = (
        "Human controller should review: (1) consistency of Net Income and Equity between systems, "
        "(2) whether valuation conclusion is driven by accounting vs market assumptions, "
        "(3) need for additional valuation methods (DCF, peer multiples) or reconciliation."
    )

    return DecisionMemo(
        conflict_reason=conflict_reason,
        cpa_summary=f"CPA: Net Income {net_income}, Total Equity {total_equity} (book position).",
        cfa_summary=f"CFA: ROE {roe:.2%}; {cfa.get('valuation_note', '')}",
        cpa_pros=cpa_pros,
        cpa_cons=cpa_cons,
        cfa_pros=cfa_pros,
        cfa_cons=cfa_cons,
        recommendation=recommendation,
        paused=True,
    )


def generate_decision_memo(
    conflict_reason: str,
    cpa_output: Any,
    cfa_output: Any,
    custom_pros_cons: Optional[dict[str, list[str]]] = None,
) -> DecisionMemo:
    """
    Build a Decision Memo for human controller (e.g. when conflict is detected elsewhere).
    """
    cpa_summary = "CPA: " + str(_serialize_cpa(cpa_output))
    cfa_summary = "CFA: " + str(_serialize_cfa(cfa_output))
    custom = custom_pros_cons or {}
    return DecisionMemo(
        conflict_reason=conflict_reason,
        cpa_summary=cpa_summary,
        cfa_summary=cfa_summary,
        cpa_pros=custom.get("cpa_pros", ["CPA view is based on reported financial statements."]),
        cpa_cons=custom.get("cpa_cons", ["Book value may differ from fair value."]),
        cfa_pros=custom.get("cfa_pros", ["CFA view incorporates valuation metrics."]),
        cfa_cons=custom.get("cfa_cons", ["Valuation depends on inputs and assumptions."]),
        recommendation="Human controller should reconcile CPA and CFA views before proceeding.",
        paused=True,
    )
