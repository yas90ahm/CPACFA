"""
Market Intelligence module — Strategic Analyst.

1. Competitor Analysis: Web Search tool to pull 10-K/10-Q filings of three key competitors.
2. Benchmarking: Compare company DSO and Inventory Turnover vs industry average.
3. Executive Narrative: 1-page Board Deck Summary (outperforming vs lagging).
4. Valuation: DCF analysis using current market risk-free rate and company growth projections.

Strict Rule: When accounting_context (CPA Historical Snapshot) is provided, the CFA Agent MUST cite
these Accounting-Locked numbers (Revenue CAGR, EBITDA Margin, Net Debt) as the historical baseline.
It is FORBIDDEN from inventing its own starting points for projections.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

# --- Types ---

WebSearchTool = Callable[[str], str]


@dataclass
class CompetitorFilingResult:
    """Result of fetching 10-K/10-Q for one competitor."""
    ticker: str
    company_name: Optional[str] = None
    filing_type: str = "10-K"  # or "10-Q"
    snippet: str = ""
    source: str = "web_search"
    url_hint: Optional[str] = None


@dataclass
class BenchmarkResult:
    """DSO and Inventory Turnover vs industry average."""
    company_dso_days: float
    industry_avg_dso_days: float
    company_inventory_turnover: float
    industry_avg_inventory_turnover: float
    dso_outperforms: bool  # True if company DSO < industry (better)
    inventory_turnover_outperforms: bool  # True if company turnover > industry (better)
    dso_delta_days: float  # company - industry (negative = better)
    turnover_delta: float  # company - industry (positive = better)
    narrative: str = ""


@dataclass
class DCFResult:
    """DCF valuation result."""
    enterprise_value: float
    present_value_explicit: float
    present_value_terminal: float
    terminal_value: float
    risk_free_rate: float
    wacc: float
    terminal_growth_rate: float
    num_explicit_years: int
    assumptions_summary: str = ""


@dataclass
class BoardDeckSummary:
    """One-page Board Deck Summary."""
    company_name: str
    headline: str
    outperforming: list[str]
    lagging: list[str]
    valuation_summary: str
    competitor_highlights: list[str]
    full_narrative: str  # 1-page text


# --- 1. Competitor Analysis: 10-K/10-Q via Web Search ---

def _default_web_search_stub(query: str) -> str:
    """Stub when no web search is provided: returns mock snippet for testing."""
    q = query.lower()
    if "10-k" in q or "10k" in q:
        return (
            "10-K Annual Report filed with SEC. Revenue growth 12% YoY. "
            "Gross margin 58%. Operating income $1.2B. Net income $890M. "
            "Days sales outstanding 42 days. Inventory turnover 6.2x."
        )
    if "10-q" in q or "10q" in q:
        return (
            "10-Q Quarterly Report. Q3 revenue $2.1B. DSO 45 days. "
            "Inventory turnover 5.8x. Guidance raised for full year."
        )
    return f"Search result for: {query[:80]}. (Use a real Web Search tool for live data.)"


def fetch_competitor_10k_10q(
    competitor_tickers: list[str],
    web_search: Optional[WebSearchTool] = None,
    max_tickers: int = 3,
) -> list[CompetitorFilingResult]:
    """
    Use Web Search to pull 10-K/10-Q filings of key competitors.
    competitor_tickers: e.g. ["AAPL", "MSFT", "GOOGL"].
    web_search: callable(query) -> str; if None, uses stub returning mock data.
    """
    search_fn = web_search or _default_web_search_stub
    results: list[CompetitorFilingResult] = []
    tickers = (competitor_tickers or [])[:max_tickers]
    for ticker in tickers:
        t = (ticker or "").strip().upper()
        if not t:
            continue
        query_10k = f"{t} 10-K SEC filing latest annual report"
        query_10q = f"{t} 10-Q SEC filing latest quarterly"
        snippet_10k = search_fn(query_10k)
        snippet_10q = search_fn(query_10q)
        results.append(CompetitorFilingResult(
            ticker=t,
            company_name=None,
            filing_type="10-K",
            snippet=snippet_10k[:500] if snippet_10k else "",
            source="web_search",
        ))
        results.append(CompetitorFilingResult(
            ticker=t,
            company_name=None,
            filing_type="10-Q",
            snippet=snippet_10q[:500] if snippet_10q else "",
            source="web_search",
        ))
    return results


# --- 2. Benchmarking: DSO and Inventory Turnover vs industry ---

def benchmark_dso_and_inventory_turnover(
    company_dso_days: float,
    company_inventory_turnover: float,
    industry_avg_dso_days: float,
    industry_avg_inventory_turnover: float,
) -> BenchmarkResult:
    """
    Compare company's Days Sales Outstanding and Inventory Turnover
    against industry averages. Lower DSO = better; higher turnover = better.
    """
    dso_delta = company_dso_days - industry_avg_dso_days
    turnover_delta = company_inventory_turnover - industry_avg_inventory_turnover
    dso_outperforms = company_dso_days < industry_avg_dso_days
    turnover_outperforms = company_inventory_turnover > industry_avg_inventory_turnover

    bullets: list[str] = []
    if dso_outperforms:
        bullets.append(
            f"DSO of {company_dso_days:.1f} days is better than industry average {industry_avg_dso_days:.1f} days (faster collections)."
        )
    else:
        bullets.append(
            f"DSO of {company_dso_days:.1f} days is above industry average {industry_avg_dso_days:.1f} days (collections lag; consider tightening credit)."
        )
    if turnover_outperforms:
        bullets.append(
            f"Inventory turnover of {company_inventory_turnover:.2f}x exceeds industry average {industry_avg_inventory_turnover:.2f}x (efficient inventory)."
        )
    else:
        bullets.append(
            f"Inventory turnover of {company_inventory_turnover:.2f}x is below industry average {industry_avg_inventory_turnover:.2f}x (potential overstock or slow-moving SKUs)."
        )
    narrative = " ".join(bullets)

    return BenchmarkResult(
        company_dso_days=company_dso_days,
        industry_avg_dso_days=industry_avg_dso_days,
        company_inventory_turnover=company_inventory_turnover,
        industry_avg_inventory_turnover=industry_avg_inventory_turnover,
        dso_outperforms=dso_outperforms,
        inventory_turnover_outperforms=turnover_outperforms,
        dso_delta_days=dso_delta,
        turnover_delta=turnover_delta,
        narrative=narrative,
    )


# --- 3. Executive Narrative: Board Deck Summary ---

def generate_board_deck_summary(
    company_name: str,
    competitor_results: list[CompetitorFilingResult],
    benchmark_result: BenchmarkResult,
    dcf_result: DCFResult,
    additional_outperforming: Optional[list[str]] = None,
    additional_lagging: Optional[list[str]] = None,
    accounting_context: Optional[str] = None,
) -> BoardDeckSummary:
    """
    Generate a 1-page Board Deck Summary highlighting where the company
    is outperforming or lagging behind the market.
    When accounting_context is provided (CPA Historical Snapshot), it is included as a read-only
    Accounting-Locked Baseline section; the narrative MUST cite these numbers and MUST NOT
    invent its own starting points for projections.
    """
    outperforming: list[str] = []
    lagging: list[str] = []

    if benchmark_result.dso_outperforms:
        outperforming.append(
            f"Days Sales Outstanding ({benchmark_result.company_dso_days:.1f} days) beats industry ({benchmark_result.industry_avg_dso_days:.1f} days)."
        )
    else:
        lagging.append(
            f"DSO ({benchmark_result.company_dso_days:.1f} days) above industry ({benchmark_result.industry_avg_dso_days:.1f} days)."
        )
    if benchmark_result.inventory_turnover_outperforms:
        outperforming.append(
            f"Inventory turnover ({benchmark_result.company_inventory_turnover:.2f}x) above industry ({benchmark_result.industry_avg_inventory_turnover:.2f}x)."
        )
    else:
        lagging.append(
            f"Inventory turnover ({benchmark_result.company_inventory_turnover:.2f}x) below industry ({benchmark_result.industry_avg_inventory_turnover:.2f}x)."
        )

    outperforming.extend(additional_outperforming or [])
    lagging.extend(additional_lagging or [])

    valuation_summary = (
        f"DCF Enterprise Value: ${dcf_result.enterprise_value:,.0f}. "
        f"Assumptions: risk-free rate {dcf_result.risk_free_rate*100:.1f}%, WACC {dcf_result.wacc*100:.1f}%, "
        f"terminal growth {dcf_result.terminal_growth_rate*100:.1f}%. {dcf_result.assumptions_summary}"
    )

    competitor_highlights: list[str] = []
    seen: set[str] = set()
    for r in competitor_results:
        if r.ticker in seen:
            continue
        seen.add(r.ticker)
        competitor_highlights.append(
            f"{r.ticker}: {r.filing_type} — {r.snippet[:120]}..." if len(r.snippet) > 120 else f"{r.ticker}: {r.filing_type} — {r.snippet}"
        )

    headline = (
        f"{company_name} — Market Intelligence Summary: "
        + (f"{len(outperforming)} area(s) outperforming" if outperforming else "no areas outperforming")
        + ", "
        + (f"{len(lagging)} area(s) lagging" if lagging else "no areas lagging")
    )

    full_narrative_parts = [
        f"# Board Deck Summary — {company_name}",
        "",
        headline,
        "",
    ]
    if accounting_context and accounting_context.strip():
        full_narrative_parts.extend([
            "## Accounting-Locked Baseline (CPA Historical Snapshot)",
            "",
            "STRICT RULE: The following numbers are the CPA-derived historical baseline. "
            "All projections and valuation narrative MUST cite these figures. "
            "It is FORBIDDEN to invent your own starting points for revenue, margins, or net debt.",
            "",
            accounting_context.strip(),
            "",
        ])
    full_narrative_parts.extend([
        "## Outperforming",
    ])
    for b in outperforming:
        full_narrative_parts.append(f"• {b}")
    if not outperforming:
        full_narrative_parts.append("• None identified in this analysis.")
    full_narrative_parts.extend(["", "## Lagging / Watch"])
    for b in lagging:
        full_narrative_parts.append(f"• {b}")
    if not lagging:
        full_narrative_parts.append("• None identified in this analysis.")
    full_narrative_parts.extend(["", "## Valuation (DCF)", valuation_summary, ""])
    if competitor_highlights:
        full_narrative_parts.extend(["## Competitor Filings (10-K/10-Q)", ""])
        for h in competitor_highlights[:6]:
            full_narrative_parts.append(f"• {h}")
    full_narrative = "\n".join(full_narrative_parts)

    return BoardDeckSummary(
        company_name=company_name,
        headline=headline,
        outperforming=outperforming,
        lagging=lagging,
        valuation_summary=valuation_summary,
        competitor_highlights=competitor_highlights,
        full_narrative=full_narrative,
    )


# --- 4. Valuation: DCF with risk-free rate and growth projections ---

def dcf_valuation(
    risk_free_rate: float,
    free_cash_flows: list[float],
    terminal_growth_rate: float,
    equity_risk_premium: float = 0.055,
    beta: float = 1.0,
    cost_of_debt_after_tax: Optional[float] = None,
    debt_ratio: float = 0.0,
    equity_ratio: float = 1.0,
) -> DCFResult:
    """
    DCF analysis using current market risk-free rate and company growth projections.

    - risk_free_rate: e.g. 0.045 (4.5% for 10Y Treasury).
    - free_cash_flows: [FCF_1, FCF_2, ...] in dollars (company's internal projections).
    - terminal_growth_rate: perpetual growth g (e.g. 0.02 for 2%).
    - WACC = (equity_ratio * cost_of_equity) + (debt_ratio * cost_of_debt_after_tax).
      cost_of_equity = risk_free_rate + beta * equity_risk_premium.
    """
    if not free_cash_flows:
        return DCFResult(
            enterprise_value=0.0,
            present_value_explicit=0.0,
            present_value_terminal=0.0,
            terminal_value=0.0,
            risk_free_rate=risk_free_rate,
            wacc=risk_free_rate + beta * equity_risk_premium,
            terminal_growth_rate=terminal_growth_rate,
            num_explicit_years=0,
            assumptions_summary="No FCF projections provided.",
        )

    cost_of_equity = risk_free_rate + beta * equity_risk_premium
    if cost_of_debt_after_tax is None:
        cost_of_debt_after_tax = risk_free_rate + 0.02  # rough
    wacc = (equity_ratio * cost_of_equity) + (debt_ratio * cost_of_debt_after_tax)
    r = wacc
    g = terminal_growth_rate

    pv_explicit = 0.0
    for t, fcf in enumerate(free_cash_flows, start=1):
        pv_explicit += fcf / ((1 + r) ** t)

    last_fcf = free_cash_flows[-1]
    terminal_fcf = last_fcf * (1 + g)
    if r <= g:
        terminal_value = 0.0
        pv_terminal = 0.0
    else:
        terminal_value = terminal_fcf / (r - g)
        n = len(free_cash_flows)
        pv_terminal = terminal_value / ((1 + r) ** n)

    enterprise_value = pv_explicit + pv_terminal

    assumptions = (
        f"Risk-free rate {risk_free_rate*100:.1f}%; ERP {equity_risk_premium*100:.1f}%; beta {beta}; "
        f"terminal g {g*100:.1f}%; {len(free_cash_flows)} years explicit FCF."
    )

    return DCFResult(
        enterprise_value=enterprise_value,
        present_value_explicit=pv_explicit,
        present_value_terminal=pv_terminal,
        terminal_value=terminal_value,
        risk_free_rate=risk_free_rate,
        wacc=wacc,
        terminal_growth_rate=terminal_growth_rate,
        num_explicit_years=len(free_cash_flows),
        assumptions_summary=assumptions,
    )


# --- One-shot: full Market Intelligence run ---

def run_market_intelligence(
    company_name: str,
    competitor_tickers: list[str],
    company_dso_days: float,
    company_inventory_turnover: float,
    industry_avg_dso_days: float,
    industry_avg_inventory_turnover: float,
    risk_free_rate: float,
    free_cash_flows: list[float],
    terminal_growth_rate: float = 0.02,
    web_search: Optional[WebSearchTool] = None,
    equity_risk_premium: float = 0.055,
    beta: float = 1.0,
    accounting_context: Optional[str] = None,
) -> dict[str, Any]:
    """
    Run the full Market Intelligence pipeline:
    1. Competitor 10-K/10-Q via web search
    2. DSO and Inventory Turnover benchmarking
    3. DCF valuation (free_cash_flows must come from CPA when accounting_context is provided)
    4. Board Deck Summary

    When accounting_context (CPA Historical Snapshot) is provided, the CFA Agent MUST cite these
    Accounting-Locked numbers as the historical baseline and is FORBIDDEN from inventing
    its own starting points for projections.
    """
    competitor_results = fetch_competitor_10k_10q(
        competitor_tickers=competitor_tickers,
        web_search=web_search,
        max_tickers=3,
    )
    benchmark_result = benchmark_dso_and_inventory_turnover(
        company_dso_days=company_dso_days,
        company_inventory_turnover=company_inventory_turnover,
        industry_avg_dso_days=industry_avg_dso_days,
        industry_avg_inventory_turnover=industry_avg_inventory_turnover,
    )
    dcf_result = dcf_valuation(
        risk_free_rate=risk_free_rate,
        free_cash_flows=free_cash_flows,
        terminal_growth_rate=terminal_growth_rate,
        equity_risk_premium=equity_risk_premium,
        beta=beta,
    )
    board_deck = generate_board_deck_summary(
        company_name=company_name,
        competitor_results=competitor_results,
        benchmark_result=benchmark_result,
        dcf_result=dcf_result,
        accounting_context=accounting_context,
    )

    return {
        "competitor_filings": [
            {
                "ticker": r.ticker,
                "filing_type": r.filing_type,
                "snippet": r.snippet,
                "source": r.source,
            }
            for r in competitor_results
        ],
        "benchmarking": {
            "company_dso_days": benchmark_result.company_dso_days,
            "industry_avg_dso_days": benchmark_result.industry_avg_dso_days,
            "company_inventory_turnover": benchmark_result.company_inventory_turnover,
            "industry_avg_inventory_turnover": benchmark_result.industry_avg_inventory_turnover,
            "dso_outperforms": benchmark_result.dso_outperforms,
            "inventory_turnover_outperforms": benchmark_result.inventory_turnover_outperforms,
            "narrative": benchmark_result.narrative,
        },
        "dcf": {
            "enterprise_value": dcf_result.enterprise_value,
            "present_value_explicit": dcf_result.present_value_explicit,
            "present_value_terminal": dcf_result.present_value_terminal,
            "terminal_value": dcf_result.terminal_value,
            "risk_free_rate": dcf_result.risk_free_rate,
            "wacc": dcf_result.wacc,
            "terminal_growth_rate": dcf_result.terminal_growth_rate,
            "assumptions_summary": dcf_result.assumptions_summary,
        },
        "board_deck_summary": {
            "company_name": board_deck.company_name,
            "headline": board_deck.headline,
            "outperforming": board_deck.outperforming,
            "lagging": board_deck.lagging,
            "valuation_summary": board_deck.valuation_summary,
            "competitor_highlights": board_deck.competitor_highlights,
            "full_narrative": board_deck.full_narrative,
        },
    }
