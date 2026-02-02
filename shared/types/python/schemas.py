"""
Core financial Pydantic schemas.
- LedgerEntry: UUID, timestamp, account_code, debit_amount, credit_amount, meta_justification.
- FinancialStatement: Balance Sheet, P&L, Cash Flow — nested for drill-down.
- All currency as Decimal (no floats).
- Root validator: sum of debits equals sum of credits for every transaction batch.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator


# --- Ledger ---


class LedgerEntry(BaseModel):
    """Single ledger entry. All monetary amounts are Decimal."""

    id: UUID = Field(default_factory=uuid4, description="Unique identifier")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    account_code: str = Field(..., min_length=1, description="Chart of accounts code")
    debit_amount: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), description="Debit amount")
    credit_amount: Decimal = Field(default=Decimal("0"), ge=Decimal("0"), description="Credit amount")
    meta_justification: str = Field(default="", description="Accounting justification / reference (e.g. ASC citation)")

    @model_validator(mode="after")
    def one_side_only(self) -> "LedgerEntry":
        """Each entry should be either debit or credit (not both non-zero for same line in double-entry)."""
        if self.debit_amount > 0 and self.credit_amount > 0:
            raise ValueError("LedgerEntry: debit_amount and credit_amount cannot both be positive (use separate entries)")
        return self


class LedgerEntryBatch(BaseModel):
    """A batch of ledger entries. Validates that total debits equal total credits."""

    entries: list[LedgerEntry] = Field(default_factory=list, min_length=0)

    @model_validator(mode="after")
    def debits_equal_credits(self) -> "LedgerEntryBatch":
        """Ensure the sum of debits equals the sum of credits for the entire batch."""
        total_debits = sum(e.debit_amount for e in self.entries)
        total_credits = sum(e.credit_amount for e in self.entries)
        if total_debits != total_credits:
            raise ValueError(
                f"Transaction batch must balance: sum(debits)={total_debits} != sum(credits)={total_credits}"
            )
        return self


# --- Statement line (nested drill-down) ---


class StatementLine(BaseModel):
    """Single line on a financial statement. Amount is Decimal."""

    label: str = Field(..., min_length=1)
    amount: Decimal = Field(default=Decimal("0"))
    account_code: str | None = None
    children: list["StatementLine"] = Field(default_factory=list, description="Drill-down sublines")


# --- Balance Sheet (nested) ---


class BalanceSheetSection(BaseModel):
    """One section of the balance sheet (e.g. Current Assets) with nested lines."""

    title: str = Field(..., min_length=1)
    lines: list[StatementLine] = Field(default_factory=list)
    subtotal: Decimal = Field(default=Decimal("0"))


class BalanceSheet(BaseModel):
    """Balance Sheet: Assets, Liabilities, Equity — nested for drill-down."""

    report_date: datetime | None = None
    assets: list[BalanceSheetSection] = Field(default_factory=list)
    liabilities: list[BalanceSheetSection] = Field(default_factory=list)
    equity: list[BalanceSheetSection] = Field(default_factory=list)
    total_assets: Decimal = Field(default=Decimal("0"))
    total_liabilities: Decimal = Field(default=Decimal("0"))
    total_equity: Decimal = Field(default=Decimal("0"))


# --- P&L (nested) ---


class ProfitAndLossSection(BaseModel):
    """One section of P&L (e.g. Revenue, Operating Expenses) with nested lines."""

    title: str = Field(..., min_length=1)
    lines: list[StatementLine] = Field(default_factory=list)
    subtotal: Decimal = Field(default=Decimal("0"))


class ProfitAndLoss(BaseModel):
    """Income Statement / P&L — nested for drill-down."""

    report_date: datetime | None = None
    revenue: list[ProfitAndLossSection] = Field(default_factory=list)
    expenses: list[ProfitAndLossSection] = Field(default_factory=list)
    total_revenue: Decimal = Field(default=Decimal("0"))
    total_expenses: Decimal = Field(default=Decimal("0"))
    net_income: Decimal = Field(default=Decimal("0"))


# --- Cash Flow (nested) ---


class CashFlowSection(BaseModel):
    """One section of cash flow (e.g. Operating activities) with nested lines."""

    title: str = Field(..., min_length=1)
    lines: list[StatementLine] = Field(default_factory=list)
    subtotal: Decimal = Field(default=Decimal("0"))


class CashFlowStatement(BaseModel):
    """Statement of Cash Flows — nested for drill-down."""

    report_date: datetime | None = None
    operating: list[CashFlowSection] = Field(default_factory=list)
    investing: list[CashFlowSection] = Field(default_factory=list)
    financing: list[CashFlowSection] = Field(default_factory=list)
    net_cash_operating: Decimal = Field(default=Decimal("0"))
    net_cash_investing: Decimal = Field(default=Decimal("0"))
    net_cash_financing: Decimal = Field(default=Decimal("0"))
    beginning_cash: Decimal = Field(default=Decimal("0"))
    ending_cash: Decimal = Field(default=Decimal("0"))


# --- Combined financial statement ---


class FinancialStatement(BaseModel):
    """Full financial statement: Balance Sheet, P&L, Cash Flow — all nested for drill-down."""

    balance_sheet: BalanceSheet = Field(default_factory=BalanceSheet)
    profit_and_loss: ProfitAndLoss = Field(default_factory=ProfitAndLoss)
    cash_flow: CashFlowStatement = Field(default_factory=CashFlowStatement)


# Resolve forward refs for nested StatementLine
StatementLine.model_rebuild()
