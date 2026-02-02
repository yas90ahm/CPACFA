"""
FinOS CPA-Agent — Justification Engine.
Chat feature: user asks "Why was this capitalized?" (or similar);
the bot responds by citing specific accounting standards (e.g. ASC 350-40).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from models import CodificationRef


# --- Standard citations for Justification ---
ASC_350_40 = CodificationRef(
    "FASB",
    "ASC 350-40",
    "Intangibles—Goodwill and Other—Internal-Use Software",
)
ASC_350_40_EXPLANATION = (
    "Under ASC 350-40, internal-use software costs were capitalized because "
    "the costs were incurred during the application development stage (design, coding, testing) "
    "after management authorized and committed to funding the project and it was probable "
    "the project would be completed and the software used as intended. "
    "Costs in the preliminary project stage (conceptualization, planning) and post-implementation "
    "stage are expensed as incurred. Capitalization under ASC 350-40 applies to software "
    "developed or acquired for internal use, not for sale (which is under ASC 985-20)."
)

ASC_360_10 = CodificationRef(
    "FASB",
    "ASC 360-10",
    "Property, Plant, and Equipment—Overall",
)
ASC_360_10_EXPLANATION = (
    "Under ASC 360-10, property, plant, and equipment are capitalized at cost when acquired "
    "or constructed, and the cost includes all expenditures necessary to bring the asset "
    "to its intended use. Subsequent to acquisition, depreciation is recognized over the "
    "asset's useful life (ASC 360-10-35). Capitalization is required when the asset provides "
    "future economic benefits and its cost can be measured reliably."
)

ASC_606 = CodificationRef(
    "FASB",
    "ASC 606-10-25",
    "Revenue from Contracts with Customers",
)
ASC_606_EXPLANATION = (
    "Under ASC 606 (Revenue from Contracts with Customers), revenue is recognized when (or as) "
    "the entity satisfies a performance obligation by transferring control of a good or service "
    "to the customer. The five-step model requires: (1) Identify the contract, (2) Identify "
    "performance obligations, (3) Determine the transaction price, (4) Allocate the transaction "
    "price to performance obligations, and (5) Recognize revenue when each performance obligation "
    "is satisfied. Revenue is not recognized upfront if control has not transferred."
)

ASC_230 = CodificationRef(
    "FASB",
    "ASC 230-10-45",
    "Statement of Cash Flows",
)
ASC_230_EXPLANATION = (
    "Under ASC 230-10-45, the statement of cash flows is prepared using either the direct or "
    "indirect method. The indirect method begins with net income and reconciles to cash from "
    "operating activities by adjusting for non-cash items (e.g. depreciation) and changes in "
    "working capital. This presentation is required for GAAP compliance and provides a clear "
    "link between accrual net income and cash flows."
)

ASC_210 = CodificationRef(
    "FASB",
    "ASC 210-10-45",
    "Balance Sheet—Overall",
)
ASC_210_EXPLANATION = (
    "Under ASC 210-10-45 (and IAS 1.49), the balance sheet must present assets, liabilities, "
    "and equity such that Assets = Liabilities + Equity at all times. This fundamental "
    "accounting equation is verified as part of the closing process; any imbalance indicates "
    "an error in posting or classification that must be corrected before financial statements "
    "are issued."
)


@dataclass
class JustificationResponse:
    """Response from the Justification Engine."""
    question_type: str
    codification_ref: CodificationRef
    citation: str
    explanation: str
    supporting_detail: Optional[str] = None


# --- Question patterns and mappings ---
CAPITALIZATION_PATTERNS = [
    r"why\s+(?:was|were)\s+(?:this|these)\s+capitalized",
    r"why\s+capitaliz(e|ed|ation)",
    r"capitalization\s+(?:reason|justification|explain)",
    r"why\s+(?:software|internal)\s+(?:cost|costs)",
    r"asc\s*350\s*[-.]?\s*40",
    r"internal[- ]use\s+software",
]
REVENUE_PATTERNS = [
    r"why\s+(?:was|is)\s+revenue\s+recognized",
    r"revenue\s+recognition",
    r"asc\s*606",
    r"when\s+do\s+we\s+recognize\s+revenue",
]
BALANCE_SHEET_PATTERNS = [
    r"assets?\s*=\s*liabilities?\s*\+\s*equity",
    r"why\s+must\s+(?:the\s+)?balance\s+sheet\s+balance",
    r"asc\s*210",
]
CASH_FLOW_PATTERNS = [
    r"indirect\s+method",
    r"statement\s+of\s+cash\s+flows",
    r"why\s+add\s+back\s+depreciation",
    r"asc\s*230",
]
DEPRECIATION_PATTERNS = [
    r"depreciation\s+(?:schedule|method)",
    r"straight[- ]line|double[- ]declining",
    r"asc\s*360",
]


def _match_any(text: str, patterns: list[str]) -> bool:
    t = text.lower().strip()
    for p in patterns:
        if re.search(p, t, re.IGNORECASE):
            return True
    return False


def justify(question: str, context: Optional[dict] = None) -> JustificationResponse:
    """
    Justification Engine: answer user question with specific accounting standard citation.
    Example: "Why was this capitalized?" -> ASC 350-40 explanation.
    """
    q = question.strip()
    if not q:
        return JustificationResponse(
            question_type="unknown",
            codification_ref=ASC_210,
            citation=str(ASC_210),
            explanation="Please ask a specific question about accounting treatment (e.g. capitalization, revenue recognition, balance sheet, cash flows).",
        )

    if _match_any(q, CAPITALIZATION_PATTERNS):
        return JustificationResponse(
            question_type="capitalization",
            codification_ref=ASC_350_40,
            citation=str(ASC_350_40),
            explanation=ASC_350_40_EXPLANATION,
            supporting_detail="For software developed for internal use, see ASC 350-40. For PPE, see ASC 360-10.",
        )

    if _match_any(q, REVENUE_PATTERNS):
        return JustificationResponse(
            question_type="revenue_recognition",
            codification_ref=ASC_606,
            citation=str(ASC_606),
            explanation=ASC_606_EXPLANATION,
        )

    if _match_any(q, BALANCE_SHEET_PATTERNS):
        return JustificationResponse(
            question_type="balance_sheet_equation",
            codification_ref=ASC_210,
            citation=str(ASC_210),
            explanation=ASC_210_EXPLANATION,
        )

    if _match_any(q, CASH_FLOW_PATTERNS):
        return JustificationResponse(
            question_type="statement_of_cash_flows",
            codification_ref=ASC_230,
            citation=str(ASC_230),
            explanation=ASC_230_EXPLANATION,
        )

    if _match_any(q, DEPRECIATION_PATTERNS):
        return JustificationResponse(
            question_type="depreciation",
            codification_ref=ASC_360_10,
            citation=str(ASC_360_10),
            explanation=(
                "Under ASC 360-10-35, depreciation is the systematic allocation of the cost of "
                "property, plant, and equipment over the asset's useful life. Common methods include "
                "straight-line (SL) and double-declining balance (DDB). SL allocates equal amounts "
                "each period; DDB applies a declining rate to the carrying value. The method must "
                "reflect the pattern in which the asset's future economic benefits are consumed."
            ),
            supporting_detail="ASC 360-10-35-4.",
        )

    # Default: point to general GAAP
    return JustificationResponse(
        question_type="general",
        codification_ref=ASC_210,
        citation="FASB ASC (General)",
        explanation=(
            "FinOS CPA-Agent applies FASB Accounting Standards Codification (ASC) and, where applicable, "
            "IASB standards (e.g. IAS 1). For capitalization, see ASC 350-40 (internal-use software) or "
            "ASC 360-10 (PP&E). For revenue, see ASC 606. For balance sheet presentation, see ASC 210-10-45. "
            "Ask a more specific question (e.g. 'Why was this capitalized?') for a cited response."
        ),
    )
