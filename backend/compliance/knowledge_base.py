"""
Compliance RAG Knowledge Base — 2025/2026 Tax Codes and FASB Updates.
In-memory store; replace with real vector DB (e.g. Chroma, Pinecone) for production.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class LawChunk:
    """Single chunk of tax or accounting law for RAG retrieval."""
    id: str
    framework: str  # "IRC" | "FASB" | "IFRS"
    citation: str
    section: str
    text: str
    keywords: list[str]  # for keyword scoring; e.g. ["162(m)", "executive", "compensation"]


# --- 2025/2026 Tax & FASB chunks ---
TAX_AND_FASB_CHUNKS: list[LawChunk] = [
    # IRC Section 162(m) — Executive compensation deduction limit
    LawChunk(
        id="irc-162m-2025",
        framework="IRC",
        citation="IRC Section 162(m)",
        section="Deduction for executive compensation in excess of $1 million",
        text=(
            "No deduction shall be allowed under this chapter for any applicable employee "
            "remuneration with respect to any covered employee to the extent that the amount of "
            "such remuneration for the taxable year exceeds $1,000,000. Applicable employee "
            "remuneration means remuneration for services performed by a covered employee. "
            "Covered employees include the CEO, CFO, and the three other most highly compensated "
            "executive officers. Amounts in excess of $1 million are not deductible for federal "
            "income tax purposes."
        ),
        keywords=["162(m)", "162m", "executive", "compensation", "deduction", "million", "covered employee", "CEO", "CFO"],
    ),
    LawChunk(
        id="irc-162m-performance",
        framework="IRC",
        citation="IRC Section 162(m) — Performance-based exception (repealed for public companies)",
        section="Post-TCJA 162(m)",
        text=(
            "For taxable years beginning after December 31, 2017, the exception for "
            "performance-based compensation under former Section 162(m) was repealed. "
            "Public companies may not deduct compensation in excess of $1 million per "
            "covered employee, including performance-based pay. Private companies are not "
            "subject to the $1 million cap under 162(m)."
        ),
        keywords=["162(m)", "performance-based", "repeal", "public company", "deduction cap"],
    ),
    # ASC 740 — Income taxes
    LawChunk(
        id="asc-740-10-25",
        framework="FASB",
        citation="ASC 740-10-25",
        section="Income Taxes—Recognition",
        text=(
            "An entity shall recognize the amount of taxes payable or refundable for the current "
            "year. It shall also recognize deferred tax liabilities and assets for the future "
            "tax consequences of events that have been recognized in the financial statements "
            "or tax returns. A valuation allowance shall be recognized if it is more likely "
            "than not that some portion or all of a deferred tax asset will not be realized."
        ),
        keywords=["ASC 740", "income tax", "deferred tax", "provision", "valuation allowance"],
    ),
    LawChunk(
        id="asc-740-10-30",
        framework="FASB",
        citation="ASC 740-10-30",
        section="Income Taxes—Initial Measurement",
        text=(
            "The tax benefit of an operating loss carryforward shall be recognized as an asset "
            "if it is more likely than not that the benefit will be realized. Current and "
            "deferred tax consequences of the Tax Cuts and Jobs Act (TCJA) and other tax law "
            "changes shall be recognized in the period of enactment."
        ),
        keywords=["ASC 740", "tax provision", "carryforward", "enactment"],
    ),
    # General tax deductibility
    LawChunk(
        id="irc-162-ordinary",
        framework="IRC",
        citation="IRC Section 162(a)",
        section="Trade or business expenses",
        text=(
            "There shall be allowed as a deduction all the ordinary and necessary expenses "
            "paid or incurred during the taxable year in carrying on any trade or business. "
            "Such deduction is subject to specific limitations elsewhere in the Code, including "
            "Section 162(m) for certain executive compensation."
        ),
        keywords=["162(a)", "ordinary", "necessary", "deduction", "business expense"],
    ),
    # FASB 2025/2026 updates (representative)
    LawChunk(
        id="fasb-2025-income-taxes",
        framework="FASB",
        citation="FASB ASU 2025 (Income Tax Disclosures)",
        section="2025 Income Tax Disclosure Updates",
        text=(
            "FASB has expanded income tax disclosure requirements for public entities, "
            "including rate reconciliation and disaggregation of income tax amounts. "
            "Tax provision and deferred tax reconciliation must be consistent with "
            "applicable IRC and state tax law; deductions disallowed under IRC 162(m) "
            "shall not be reflected as deductible in the tax provision."
        ),
        keywords=["FASB", "2025", "income tax", "disclosure", "provision", "162(m)"],
    ),
]


def _score_chunk(chunk: LawChunk, query: str) -> float:
    """Simple keyword/semantic-style scoring. Replace with vector similarity in production."""
    q = query.lower().strip()
    text = (chunk.text + " " + chunk.section + " " + chunk.citation).lower()
    score = 0.0
    terms = [t for t in q.split() if len(t) > 1]
    for t in terms:
        if t in text:
            score += 1.0
        if any(t in k.lower() for k in chunk.keywords):
            score += 1.5
    if "162" in q or "162(m)" in q or "162m" in q:
        if chunk.citation and "162" in chunk.citation:
            score += 3.0
    if "tax" in q and "provision" in q and chunk.framework == "FASB":
        score += 1.0
    return score


class ComplianceKnowledgeBase:
    """In-memory RAG store for Tax Codes and FASB Updates. Query returns relevant chunks."""

    def __init__(self, chunks: Optional[list[LawChunk]] = None):
        self._chunks = list(chunks or TAX_AND_FASB_CHUNKS)

    def query(self, query: str, top_k: int = 5, framework: Optional[str] = None) -> list[LawChunk]:
        """Return top_k chunks most relevant to the query."""
        subset = self._chunks
        if framework:
            subset = [c for c in subset if c.framework == framework]
        scored = [
            (c, _score_chunk(c, query))
            for c in subset
        ]
        scored = [(c, s) for c, s in scored if s > 0]
        scored.sort(key=lambda x: -x[1])
        return [c for c, _ in scored[:top_k]]

    def get_162m_chunks(self) -> list[LawChunk]:
        """Return all chunks related to Section 162(m) for citation checks."""
        return [c for c in self._chunks if "162" in c.citation]


_default_store: Optional[ComplianceKnowledgeBase] = None


def get_compliance_kb() -> ComplianceKnowledgeBase:
    global _default_store
    if _default_store is None:
        _default_store = ComplianceKnowledgeBase()
    return _default_store
