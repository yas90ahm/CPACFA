"""
Full ingestion pipeline: parse → extract → classify → flag low-confidence for human review.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ingestion.models import (
    ExtractedTransaction,
    ClassificationResult,
    ClassifiedTransaction,
    PipelineResult,
)
from ingestion.parser import parse_document
from ingestion.extractor import extract_transactions
from ingestion.classification_agent import classify_description

try:
    from feedback_loop import get_classification_from_user_rule
except ImportError:
    get_classification_from_user_rule = None

CONFIDENCE_THRESHOLD = 0.9  # Flag for human review when < 90%


def process_document(
    file_path: str | Path | None = None,
    content: bytes | None = None,
    filename: str = "",
    confidence_threshold: float = CONFIDENCE_THRESHOLD,
) -> PipelineResult:
    """
    Run the full pipeline:
    1. Parse document (PDF/Excel via unstructured or openpyxl).
    2. Extract Transaction Date, Description, Amount, Counterparty.
    3. Classify each description to Chart of Accounts (sub-agent).
    4. Flag items with confidence < confidence_threshold for human-in-the-loop.
    """
    errors: list[str] = []
    extracted: list[ExtractedTransaction] = []
    classified: list[ClassifiedTransaction] = []
    needs_review: list[ClassifiedTransaction] = []

    try:
        parsed = parse_document(file_path=file_path, content=content, filename=filename)
    except Exception as e:
        errors.append(f"Parse failed: {e}")
        return PipelineResult(extracted=[], classified=[], needs_review=[], errors=errors)

    if not parsed:
        errors.append("No content parsed from document")
        return PipelineResult(extracted=[], classified=[], needs_review=[], errors=errors)

    # If parsed is list of dicts (Excel-like rows), extract directly
    if parsed and isinstance(parsed[0], dict) and any(
        k for k in parsed[0] if "date" in str(k).lower() or "amount" in str(k).lower() or "desc" in str(k).lower()
    ):
        extracted = extract_transactions(parsed)
    else:
        # PDF / text: treat each element as a single "row" with text as description
        for item in parsed:
            if isinstance(item, dict):
                text = item.get("text") or item.get("content") or ""
                if text:
                    extracted.append(
                        ExtractedTransaction(
                            description=text[:500],
                            raw_row=item,
                        )
                    )

    for ext in extracted:
        # Check user correction rules first (feedback_loop.user_rules.json)
        user_class = None
        user_reasoning = None
        if get_classification_from_user_rule:
            user_class, user_reasoning = get_classification_from_user_rule(
                ext.description,
                ext.counterparty,
            )
        if user_class and user_reasoning:
            classification = ClassificationResult(
                account_code=user_class["account_code"],
                account_name=user_class["account_name"],
                confidence=user_class.get("confidence", 1.0),
                needs_review=False,
            )
            ct = ClassifiedTransaction(
                extracted=ext,
                classification=classification,
                reasoning=user_reasoning,
            )
        else:
            classification = classify_description(
                ext.description,
                confidence_threshold=confidence_threshold,
            )
            ct = ClassifiedTransaction(extracted=ext, classification=classification)
        classified.append(ct)
        if classification.needs_review:
            needs_review.append(ct)

    return PipelineResult(
        extracted=extracted,
        classified=classified,
        needs_review=needs_review,
        errors=errors,
    )
