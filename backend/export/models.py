"""
Big-4 Style Report — payload types for PDF and Excel export.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class CoverPageData:
    title: str = "Financial Report"
    subtitle: Optional[str] = None
    entity_name: Optional[str] = None
    report_date: Optional[str] = None
    period_label: Optional[str] = None
    prepared_by: Optional[str] = None
    codification: Optional[str] = None


@dataclass
class StatementSection:
    lines: list[dict[str, Any]]  # [{ "label": str, "amount": number }]
    total: Optional[float] = None


@dataclass
class FinancialStatementsData:
    balance_sheet: dict[str, Any]  # assets, liabilities, equity, total_assets, total_liabilities, total_equity
    profit_and_loss: dict[str, Any]  # revenue, expenses, total_revenue, total_expenses, net_income
    report_date: Optional[str] = None


@dataclass
class AuditTrailEntry:
    timestamp_utc: str
    event_type: str
    reasoning: str
    citations: str
    outcome: str
    warning_message: Optional[str] = None
    id: Optional[int] = None


@dataclass
class ReportPayload:
    cover: CoverPageData | dict[str, Any]
    financial_statements: FinancialStatementsData | dict[str, Any]
    strategic_analysis: str | list[dict[str, Any]]  # string or [{ "title", "content" }]
    audit_trail: list[AuditTrailEntry] | list[dict[str, Any]]
    report_date: Optional[str] = None
