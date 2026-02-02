"""
Big-4 Style Report — orchestration for PDF and Excel export.
Builds a report payload and invokes PDF or Excel generator.
"""
from __future__ import annotations

from typing import Any

from .pdf_generator import build_pdf
from .excel_generator import build_excel
from .csv_generator import build_clean_ledger_csv


def normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Ensure payload has required keys with defaults for optional sections."""
    out = dict(payload)
    if "cover" not in out:
        out["cover"] = {"title": "Financial Report"}
    if "financial_statements" not in out:
        out["financial_statements"] = {"balance_sheet": {}, "profit_and_loss": {}}
    if "strategic_analysis" not in out:
        out["strategic_analysis"] = ""
    if "audit_trail" not in out:
        out["audit_trail"] = []
    return out


def generate_pdf_report(payload: dict[str, Any], pdf_type: str = "detailed") -> bytes:
    """Generate a professional financial package PDF. pdf_type: 'detailed' | 'summary'. Returns PDF bytes."""
    normalized = normalize_payload(payload)
    return build_pdf(normalized, pdf_type=pdf_type)


def generate_csv_report(payload: dict[str, Any]) -> bytes:
    """Generate CSV from CPA-verified Clean Ledger (payload['clean_ledger']). Returns CSV bytes (UTF-8, injection-safe)."""
    clean_ledger = payload.get("clean_ledger") or []
    return build_clean_ledger_csv(clean_ledger)


def generate_excel_report(payload: dict[str, Any]) -> bytes:
    """Generate a Big-4 style Excel report from the given payload (with formulas). Returns Excel bytes."""
    normalized = normalize_payload(payload)
    return build_excel(normalized)
