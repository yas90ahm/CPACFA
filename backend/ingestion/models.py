"""
Ingestion pipeline data models.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass
class ExtractedTransaction:
    """Single extracted transaction from a document."""

    transaction_date: Optional[str] = None  # ISO date or raw string
    description: str = ""
    amount: Optional[Decimal] = None
    counterparty: Optional[str] = None
    raw_row: Optional[dict] = None  # original parsed row for audit


@dataclass
class ClassificationResult:
    """Result of mapping a description to Chart of Accounts."""

    account_code: str
    account_name: str
    confidence: float  # 0.0–1.0
    needs_review: bool  # True if confidence < 0.9


@dataclass
class ClassifiedTransaction:
    """Extracted transaction + classification."""

    extracted: ExtractedTransaction
    classification: ClassificationResult
    reasoning: Optional[str] = None  # e.g. "I've categorized this as 'Marketing' based on your previous preference."


@dataclass
class PipelineResult:
    """Result of the full ingestion pipeline."""

    extracted: list[ExtractedTransaction]
    classified: list[ClassifiedTransaction]
    needs_review: list[ClassifiedTransaction] = field(default_factory=list)  # confidence < 90%
    errors: list[str] = field(default_factory=list)
