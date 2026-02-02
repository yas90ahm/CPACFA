"""
Tax Provisioning — Deferred tax assets/liabilities from temporary differences (book vs. tax basis).
ASC 740: Temporary differences between book and tax basis give rise to DTA/DTL at enacted tax rate.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


@dataclass
class TemporaryDifference:
    """Single temporary difference (book basis - tax basis)."""
    description: str
    book_basis: Decimal  # carrying amount per books
    tax_basis: Decimal  # tax basis
    difference: Optional[Decimal] = None  # book - tax; if None, computed
    is_deductible_temp: bool = True  # True = future deductible (DTA), False = future taxable (DTL)
    reversal_period: Optional[str] = None  # e.g. "2025", "2026" for rollforward
    account_code: Optional[str] = None

    def __post_init__(self) -> None:
        if self.difference is None:
            object.__setattr__(self, "difference", self.book_basis - self.tax_basis)


@dataclass
class DeferredTaxRollforward:
    """Rollforward of deferred tax assets and liabilities (ASC 740-10-50)."""
    report_date: date
    beginning_dta: Decimal = Decimal("0")
    beginning_dtl: Decimal = Decimal("0")
    increases_dta: Decimal = Decimal("0")
    increases_dtl: Decimal = Decimal("0")
    decreases_dta: Decimal = Decimal("0")
    decreases_dtl: Decimal = Decimal("0")
    ending_dta: Decimal = Decimal("0")
    ending_dtl: Decimal = Decimal("0")
    net_dta: Decimal = Decimal("0")  # ending_dta - ending_dtl (net position)
    tax_rate: Decimal = Decimal("0.21")  # enacted rate (e.g. US federal 21%)
    details: list[dict] = field(default_factory=list)


def compute_deferred_taxes(
    temporary_differences: list[TemporaryDifference],
    tax_rate: Decimal,
    report_date: Optional[date] = None,
    beginning_dta: Decimal = Decimal("0"),
    beginning_dtl: Decimal = Decimal("0"),
) -> DeferredTaxRollforward:
    """
    Compute deferred tax assets and liabilities from temporary differences per ASC 740.
    - Deductible temporary differences (future deductible) → DTA.
    - Taxable temporary differences (future taxable) → DTL.
    DTA/DTL = temporary difference × enacted tax rate.
    """
    report_date = report_date or date.today()
    rate = tax_rate
    dta_from_period = Decimal("0")
    dtl_from_period = Decimal("0")
    details: list[dict] = []

    for td in temporary_differences:
        diff = td.difference if td.difference is not None else (td.book_basis - td.tax_basis)
        deferred_amount = (diff * rate).quantize(Decimal("0.01"))
        if td.is_deductible_temp:
            # Future deductible → DTA (positive diff when book < tax for expense items, or book > tax for liability)
            dta_from_period += deferred_amount
            details.append({
                "description": td.description,
                "difference": str(diff),
                "deferred_tax_asset": str(deferred_amount),
                "deferred_tax_liability": "0",
                "reversal_period": td.reversal_period,
            })
        else:
            dtl_from_period += deferred_amount
            details.append({
                "description": td.description,
                "difference": str(diff),
                "deferred_tax_asset": "0",
                "deferred_tax_liability": str(deferred_amount),
                "reversal_period": td.reversal_period,
            })

    ending_dta = beginning_dta + dta_from_period
    ending_dtl = beginning_dtl + dtl_from_period
    net_dta = ending_dta - ending_dtl

    return DeferredTaxRollforward(
        report_date=report_date,
        beginning_dta=beginning_dta,
        beginning_dtl=beginning_dtl,
        increases_dta=dta_from_period,
        increases_dtl=dtl_from_period,
        decreases_dta=Decimal("0"),
        decreases_dtl=Decimal("0"),
        ending_dta=ending_dta,
        ending_dtl=ending_dtl,
        net_dta=net_dta,
        tax_rate=rate,
        details=details,
    )
