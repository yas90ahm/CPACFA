"""
FinOS financial document ingestion pipeline.
Parse PDF/Excel → extract (Transaction Date, Description, Amount, Counterparty)
→ classify to Chart of Accounts → flag low-confidence for human review.
"""

from ingestion.pipeline import process_document
from ingestion.models import ExtractedTransaction, ClassificationResult, PipelineResult

__all__ = ["process_document", "ExtractedTransaction", "ClassificationResult", "PipelineResult"]
