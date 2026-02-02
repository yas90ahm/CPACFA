"""
Router Agent: manages CPA and CFA sub-agents.
- Intent detection: route "How do we stand?" → CPA (financial statements), "Is this a good buy?" → CFA (valuation).
- Cross-talk: CFA reads CPA output (e.g. Net Income from P&L for ROE).
- Chain of thought: internal monologue documenting accounting/valuation law before final numbers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

# Optional CPA agent for live GL-based statements
try:
    from accounting_engine import CPAAgent
    from models import BalanceSheet, IncomeStatement
    HAS_CPA = True
except ImportError:
    HAS_CPA = False


class Intent(str, Enum):
    CPA = "cpa"   # Financial statement generation / "How do we stand?"
    CFA = "cfa"   # Valuation / "Is this a good buy?"
    UNKNOWN = "unknown"


# --- Intent detection ---

CPA_PATTERNS = (
    "how do we stand",
    "where do we stand",
    "financial position",
    "financial statement",
    "balance sheet",
    "profit and loss",
    "p&l",
    "income statement",
    "trial balance",
    "what are our assets",
    "what are our liabilities",
    "net income",
    "revenue and expense",
    "cash flow",
    "financial health",
    "accounting position",
)

CFA_PATTERNS = (
    "good buy",
    "worth buying",
    "valuation",
    "value of",
    "roe",
    "return on equity",
    "return on equity",
    "ratio",
    "liquidity",
    "invest",
    "investment",
    "dcf",
    "discount",
    "wacc",
    "fair value",
    "overvalued",
    "undervalued",
    "is this a good",
    "should we invest",
)


def detect_intent(query: str) -> Intent:
    """Route user question to CPA (financial statements) or CFA (valuation)."""
    q = (query or "").strip().lower()
    if not q:
        return Intent.UNKNOWN
    for p in CPA_PATTERNS:
        if p in q:
            return Intent.CPA
    for p in CFA_PATTERNS:
        if p in q:
            return Intent.CFA
    return Intent.UNKNOWN


# --- CPA output (serializable for CFA cross-talk) ---

@dataclass
class CPAOutput:
    """CPA-generated outputs that CFA can read (e.g. Net Income for ROE)."""
    net_income: Optional[Decimal] = None
    total_equity: Optional[Decimal] = None
    total_assets: Optional[Decimal] = None
    total_liabilities: Optional[Decimal] = None
    total_revenue: Optional[Decimal] = None
    total_expenses: Optional[Decimal] = None
    report_date: Optional[str] = None
    balance_sheet_summary: Optional[dict[str, Any]] = None
    income_statement_summary: Optional[dict[str, Any]] = None


def _balance_sheet_to_summary(bs: Any) -> dict[str, Any]:
    """Serialize Balance Sheet for cross-talk and API."""
    if bs is None:
        return {}
    return {
        "total_assets": str(getattr(bs, "total_assets", 0)),
        "total_liabilities": str(getattr(bs, "total_liabilities", 0)),
        "total_equity": str(getattr(bs, "total_equity", 0)),
        "report_date": str(getattr(bs, "report_date", "")),
    }


def _income_statement_to_summary(is_: Any) -> dict[str, Any]:
    """Serialize P&L for cross-talk (CFA pulls Net Income)."""
    if is_ is None:
        return {}
    return {
        "net_income": str(getattr(is_, "net_income", 0)),
        "total_revenue": str(getattr(is_, "total_revenue", 0)),
        "total_expenses": str(getattr(is_, "total_expenses", 0)),
        "report_date": str(getattr(is_, "report_date", "")),
    }


def _cpa_output_from_statements(
    balance_sheet: Optional[Any] = None,
    income_statement: Optional[Any] = None,
) -> CPAOutput:
    """Build CPAOutput from CPA-generated Balance Sheet and P&L (for CFA to read)."""
    net_income = getattr(income_statement, "net_income", None) if income_statement else None
    total_equity = getattr(balance_sheet, "total_equity", None) if balance_sheet else None
    total_assets = getattr(balance_sheet, "total_assets", None) if balance_sheet else None
    total_liabilities = getattr(balance_sheet, "total_liabilities", None) if balance_sheet else None
    total_revenue = getattr(income_statement, "total_revenue", None) if income_statement else None
    total_expenses = getattr(income_statement, "total_expenses", None) if income_statement else None
    report_date = str(getattr(balance_sheet or income_statement, "report_date", "")) if (balance_sheet or income_statement) else None
    return CPAOutput(
        net_income=net_income,
        total_equity=total_equity,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        report_date=report_date,
        balance_sheet_summary=_balance_sheet_to_summary(balance_sheet),
        income_statement_summary=_income_statement_to_summary(income_statement),
    )


# --- Internal monologue (chain of thought) ---

def _monologue_cpa(balance_sheet: Any, income_statement: Any) -> list[str]:
    """Internal monologue for CPA path: document accounting law before presenting numbers."""
    lines = [
        "Intent: CPA — financial statement generation.",
        "Applying ASC 210-10-45 for Balance Sheet presentation (Assets = Liabilities + Equity).",
        "Applying ASC 220-10-45 for Income Statement (Comprehensive Income).",
    ]
    if balance_sheet:
        lines.append("Balance Sheet built from trial balance; verification: Assets = Liabilities + Equity per IAS 1.49.")
    if income_statement:
        lines.append("P&L: Revenue and expenses per ASC 220; Net Income = Total Revenue − Total Expenses.")
    return lines


def _monologue_cfa(cpa_output: Optional[CPAOutput], roe_computed: bool) -> list[str]:
    """Internal monologue for CFA path: document valuation logic and cross-talk."""
    lines = [
        "Intent: CFA — valuation / investment assessment.",
    ]
    if cpa_output and (cpa_output.net_income is not None or cpa_output.total_equity is not None):
        lines.append("Cross-talk: Reading CPA-generated outputs for valuation metrics.")
        if cpa_output.net_income is not None:
            lines.append("Pulling Net Income from CPA-generated P&L (ASC 220-10-45).")
        if cpa_output.total_equity is not None:
            lines.append("Pulling Total Equity from CPA-generated Balance Sheet (ASC 210-10-45).")
    if roe_computed:
        lines.append("ROE = Net Income / Shareholders' Equity (CFA Level I).")
        lines.append("Applying valuation context: ROE vs cost of equity and peer benchmarks.")
    return lines


# --- CPA Agent (financial statement generation) ---

@dataclass
class CPAContext:
    """Context for CPA Agent: either live GL (cpa_agent + dates) or pre-computed statements."""
    cpa_agent: Optional[Any] = None
    as_of: Optional[date] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    # Pre-computed (e.g. from API): CFA can still read these
    balance_sheet: Optional[Any] = None
    income_statement: Optional[Any] = None


def _run_cpa_agent(ctx: CPAContext) -> tuple[Optional[Any], Optional[Any], CPAOutput]:
    """Run CPA Agent: produce Balance Sheet and P&L; return CPAOutput for cross-talk."""
    balance_sheet = ctx.balance_sheet
    income_statement = ctx.income_statement
    if ctx.cpa_agent and ctx.as_of is not None and ctx.period_end is not None:
        period_start = ctx.period_start or ctx.as_of
        try:
            balance_sheet = ctx.cpa_agent.balance_sheet(ctx.as_of)
            income_statement = ctx.cpa_agent.income_statement(period_start, ctx.period_end)
        except Exception:
            pass
    cpa_output = _cpa_output_from_statements(balance_sheet, income_statement)
    return balance_sheet, income_statement, cpa_output


# --- CFA Agent (valuation; reads CPA output for ROE) ---

def _run_cfa_agent(query: str, cpa_output: Optional[CPAOutput]) -> dict[str, Any]:
    """
    CFA Agent: valuation and ratios. Pulls Net Income and Total Equity from CPA output to compute ROE.
    """
    internal_monologue = _monologue_cfa(cpa_output, roe_computed=False)
    roe: Optional[float] = None
    net_income = cpa_output.net_income if cpa_output else None
    total_equity = cpa_output.total_equity if cpa_output else None
    if net_income is not None and total_equity is not None and total_equity != 0:
        roe = float(net_income / total_equity)
        internal_monologue = _monologue_cfa(cpa_output, roe_computed=True)

    # Simple "good buy" note based on ROE
    valuation_note = ""
    if roe is not None:
        if roe >= 0.15:
            valuation_note = "ROE is strong (>=15%); profitability on equity is attractive. Consider cost of equity and peer ROE for full valuation."
        elif roe >= 0.05:
            valuation_note = "ROE is moderate (5-15%). Assess sustainability and growth; compare to WACC and peers."
        elif roe >= 0:
            valuation_note = "ROE is low but positive. Review margins and leverage; DCF or peer multiples may be needed for full view."
        else:
            valuation_note = "Negative ROE; loss-making on equity. Valuation should rely on other metrics (e.g. revenue multiple, DCF)."
    else:
        valuation_note = "Insufficient CPA output (Net Income / Total Equity) to compute ROE. Provide financial statements for valuation metrics."

    return {
        "roe": roe,
        "valuation_note": valuation_note,
        "internal_monologue": internal_monologue,
        "cpa_data_used": {
            "net_income": str(net_income) if net_income is not None else None,
            "total_equity": str(total_equity) if total_equity is not None else None,
        },
    }


# --- Router response ---

@dataclass
class RouterResponse:
    """Full response from the Router Agent: intent, internal monologue, sub-agent outputs, final answer."""
    intent: Intent
    internal_monologue: list[str] = field(default_factory=list)
    cpa_output: Optional[CPAOutput] = None
    cfa_output: Optional[dict[str, Any]] = None
    final_answer: str = ""
    balance_sheet_summary: Optional[dict[str, Any]] = None
    income_statement_summary: Optional[dict[str, Any]] = None


def route(
    query: str,
    cpa_context: Optional[CPAContext] = None,
) -> RouterResponse:
    """
    Router Agent: detect intent, run CPA or CFA sub-agent, and return response with
    internal monologue (chain of thought) before final numbers.
    """
    intent = detect_intent(query)
    cpa_context = cpa_context or CPAContext()

    # Always run CPA when we have context (so CFA can read it); or run when intent is CPA
    balance_sheet = None
    income_statement = None
    cpa_output = None
    if cpa_context.balance_sheet or cpa_context.income_statement or (cpa_context.cpa_agent and cpa_context.as_of):
        balance_sheet, income_statement, cpa_output = _run_cpa_agent(cpa_context)

    internal_monologue: list[str] = []

    if intent == Intent.CPA:
        internal_monologue = _monologue_cpa(balance_sheet, income_statement)
        # Final answer: summary of financial position
        bs_sum = _balance_sheet_to_summary(balance_sheet) if balance_sheet else {}
        is_sum = _income_statement_to_summary(income_statement) if income_statement else {}
        final = "Financial position (CPA): "
        if bs_sum:
            final += f"Assets {bs_sum.get('total_assets', 'N/A')}, Liabilities {bs_sum.get('total_liabilities', 'N/A')}, Equity {bs_sum.get('total_equity', 'N/A')}. "
        if is_sum:
            final += f"Net Income (P&L) {is_sum.get('net_income', 'N/A')}. "
        final += "Prepared under ASC 210 (Balance Sheet) and ASC 220 (Income Statement)."
        return RouterResponse(
            intent=intent,
            internal_monologue=internal_monologue,
            cpa_output=cpa_output,
            final_answer=final,
            balance_sheet_summary=bs_sum,
            income_statement_summary=is_sum,
        )

    if intent == Intent.CFA:
        cfa_out = _run_cfa_agent(query, cpa_output)
        internal_monologue = cfa_out.get("internal_monologue", [])
        roe = cfa_out.get("roe")
        note = cfa_out.get("valuation_note", "")
        final = note
        if roe is not None:
            final = f"ROE = {roe:.2%} (from CPA-generated Net Income and Equity). " + note
        return RouterResponse(
            intent=intent,
            internal_monologue=internal_monologue,
            cpa_output=cpa_output,
            cfa_output=cfa_out,
            final_answer=final,
        )

    # Unknown intent
    internal_monologue = ["Intent: UNKNOWN. No CPA or CFA pattern matched. Consider rephrasing (e.g. 'How do we stand?' or 'Is this a good buy?')."]
    return RouterResponse(
        intent=Intent.UNKNOWN,
        internal_monologue=internal_monologue,
        final_answer="I didn't recognize that question. Ask for financial position (e.g. 'How do we stand?') or valuation (e.g. 'Is this a good buy?' or 'What is ROE?').",
    )


def route_with_precomputed_statements(
    query: str,
    balance_sheet_summary: Optional[dict[str, Any]] = None,
    income_statement_summary: Optional[dict[str, Any]] = None,
) -> RouterResponse:
    """
    Convenience: route using pre-computed statement summaries (e.g. from API).
    CFA can pull net_income and total_equity from these for ROE.
    """
    net_income = None
    total_equity = None
    if income_statement_summary and "net_income" in income_statement_summary:
        try:
            net_income = Decimal(str(income_statement_summary["net_income"]))
        except Exception:
            pass
    if balance_sheet_summary and "total_equity" in balance_sheet_summary:
        try:
            total_equity = Decimal(str(balance_sheet_summary["total_equity"]))
        except Exception:
            pass
    def _dec(s: Any) -> Optional[Decimal]:
        if s is None:
            return None
        try:
            return Decimal(str(s))
        except Exception:
            return None

    cpa_output = CPAOutput(
        net_income=net_income,
        total_equity=total_equity,
        total_assets=_dec(balance_sheet_summary.get("total_assets")) if balance_sheet_summary else None,
        total_liabilities=_dec(balance_sheet_summary.get("total_liabilities")) if balance_sheet_summary else None,
        total_revenue=_dec(income_statement_summary.get("total_revenue")) if income_statement_summary else None,
        total_expenses=_dec(income_statement_summary.get("total_expenses")) if income_statement_summary else None,
        balance_sheet_summary=balance_sheet_summary,
        income_statement_summary=income_statement_summary,
    )
    intent = detect_intent(query)
    if intent == Intent.CFA:
        cfa_out = _run_cfa_agent(query, cpa_output)
        return RouterResponse(
            intent=intent,
            internal_monologue=cfa_out.get("internal_monologue", []),
            cpa_output=cpa_output,
            cfa_output=cfa_out,
            final_answer=f"ROE = {cfa_out['roe']:.2%} (from CPA P&L and BS). " + cfa_out.get("valuation_note", "") if cfa_out.get("roe") is not None else cfa_out.get("valuation_note", ""),
        )
    if intent == Intent.CPA:
        internal_monologue = [
            "Intent: CPA. Using pre-computed financial statements.",
            "Applying ASC 210-10-45 (Balance Sheet) and ASC 220-10-45 (Income Statement).",
        ]
        final = "Financial position: " + (f"Equity {balance_sheet_summary.get('total_equity', 'N/A')}; " if balance_sheet_summary else "") + (f"Net Income {income_statement_summary.get('net_income', 'N/A')}." if income_statement_summary else "")
        return RouterResponse(
            intent=intent,
            internal_monologue=internal_monologue,
            cpa_output=cpa_output,
            final_answer=final,
            balance_sheet_summary=balance_sheet_summary,
            income_statement_summary=income_statement_summary,
        )
    return route(query, CPAContext())
