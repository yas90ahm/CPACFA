"""
FinOS CPA-Agent — Data models for General Ledger and Financial Statements.
FASB ASC / IASB traceable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Optional


class AccountType(str, Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    EQUITY = "EQUITY"
    REVENUE = "REVENUE"
    EXPENSE = "EXPENSE"


class CodificationRef:
    """FASB ASC or IASB citation for compliance traceability."""

    def __init__(self, framework: str, citation: str, description: str = ""):
        self.framework = framework  # "FASB" | "IASB"
        self.citation = citation  # e.g. "ASC 350-40"
        self.description = description

    def __str__(self) -> str:
        return f"{self.framework} {self.citation}"


@dataclass
class GLAccount:
    code: str
    name: str
    account_type: AccountType
    codification_ref: Optional[CodificationRef] = None


@dataclass
class GLEntry:
    """Single general ledger entry (double-entry: one debit + one credit)."""
    date: date
    description: str
    debit_account: str  # account code
    credit_account: str
    amount: Decimal
    reference: Optional[str] = None
    codification_ref: Optional[CodificationRef] = None


@dataclass
class TrialBalanceLine:
    account_code: str
    account_name: str
    debit: Decimal
    credit: Decimal
    account_type: AccountType
    codification_ref: Optional[CodificationRef] = None


@dataclass
class TrialBalance:
    lines: list[TrialBalanceLine]
    total_debits: Decimal
    total_credits: Decimal
    balances: bool  # total_debits == total_credits


@dataclass
class StatementLine:
    label: str
    amount: Decimal
    account_code: Optional[str] = None
    codification_ref: Optional[CodificationRef] = None


@dataclass
class BalanceSheet:
    """ASC 210-10-45, IAS 1.54."""
    report_date: date
    assets: list[StatementLine]
    liabilities: list[StatementLine]
    equity: list[StatementLine]
    total_assets: Decimal
    total_liabilities: Decimal
    total_equity: Decimal
    codification_ref: CodificationRef = field(
        default_factory=lambda: CodificationRef("FASB", "ASC 210-10-45", "Balance Sheet")
    )


@dataclass
class IncomeStatement:
    """P&L — ASC 220-10-45, IAS 1.81."""
    report_date: date
    revenue: list[StatementLine]
    expenses: list[StatementLine]
    total_revenue: Decimal
    total_expenses: Decimal
    net_income: Decimal
    codification_ref: CodificationRef = field(
        default_factory=lambda: CodificationRef("FASB", "ASC 220-10-45", "Comprehensive Income")
    )


@dataclass
class CashFlowStatement:
    """Statement of Cash Flows — Indirect Method. ASC 230-10-45."""
    report_date: date
    operating_activities: list[StatementLine]
    investing_activities: list[StatementLine]
    financing_activities: list[StatementLine]
    net_cash_operating: Decimal
    net_cash_investing: Decimal
    net_cash_financing: Decimal
    beginning_cash: Decimal
    ending_cash: Decimal
    codification_ref: CodificationRef = field(
        default_factory=lambda: CodificationRef("FASB", "ASC 230-10-45", "Statement of Cash Flows")
    )


# --- Depreciation ---
class DepreciationMethod(str, Enum):
    STRAIGHT_LINE = "SL"
    DOUBLE_DECLINING_BALANCE = "DDB"


@dataclass
class DepreciationScheduleLine:
    period: int  # 1, 2, 3...
    period_end_date: date
    beginning_book_value: Decimal
    depreciation_expense: Decimal
    accumulated_depreciation: Decimal
    ending_book_value: Decimal


@dataclass
class DepreciationSchedule:
    asset_id: str
    asset_description: str
    method: DepreciationMethod
    cost: Decimal
    salvage_value: Decimal
    useful_life_years: int
    placed_in_service_date: date
    lines: list[DepreciationScheduleLine]
    codification_ref: CodificationRef = field(
        default_factory=lambda: CodificationRef("FASB", "ASC 360-10-35", "Property, Plant & Equipment—Subsequent Measurement")
    )


# --- ASC 606 Revenue Recognition ---
@dataclass
class PerformanceObligation:
    """Step 2: Distinct good or service."""
    id: str
    description: str
    transaction_price_allocated: Decimal
    satisfied_amount: Decimal = Decimal("0")


@dataclass
class RevenueContract:
    """ASC 606 contract — 5-step model."""
    contract_id: str
    customer: str
    transaction_price: Decimal  # Step 3
    performance_obligations: list[PerformanceObligation]  # Step 2, 4
    total_revenue_recognized: Decimal = Decimal("0")
    contract_liability: Decimal = Decimal("0")  # Deferred revenue
    codification_ref: CodificationRef = field(
        default_factory=lambda: CodificationRef("FASB", "ASC 606-10-25", "Revenue from Contracts with Customers")
    )


# --- Justification / Audit trail ---
@dataclass
class JustificationRecord:
    """Audit trail for "Why was this capitalized?" etc."""
    entry_ref: str
    question_type: str  # e.g. "capitalization", "revenue_recognition"
    codification_ref: CodificationRef
    explanation: str
    supporting_detail: Optional[str] = None
