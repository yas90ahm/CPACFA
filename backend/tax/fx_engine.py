"""
FX Logic — ASC 830 (Foreign Currency Matters).
- Functional currency vs. reporting currency.
- Remeasurement: monetary items at current rate, nonmonetary at historical rate.
- Unrealized gains/losses on foreign-currency monetary positions (recognized in net income per ASC 830-20-35).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional


# ASC 830-10-20: Functional currency is the currency of the primary economic environment.
# Reporting currency is the currency in which the entity presents its financial statements.


@dataclass
class FXPosition:
    """Single FX position (monetary or nonmonetary) in a foreign currency."""
    currency: str  # e.g. "EUR", "GBP"
    amount: Decimal  # amount in foreign currency
    is_monetary: bool  # True = monetary (receivables, payables, cash); False = nonmonetary (inventory, PPE at historical)
    balance_date: date  # date of balance
    historical_rate: Optional[Decimal] = None  # rate when nonmonetary item was acquired (for nonmonetary)
    account_code: Optional[str] = None
    description: Optional[str] = None


@dataclass
class FXResult:
    """Result of remeasurement/translation and unrealized G/L."""
    functional_amount: Decimal  # amount in functional currency after remeasurement
    reporting_amount: Optional[Decimal] = None  # amount in reporting currency after translation
    unrealized_gain_loss: Decimal = Decimal("0")  # remeasurement G/L (to net income)
    rate_used: Optional[Decimal] = None
    is_translation_adjustment: bool = False  # True if translation to reporting (OCI), not remeasurement (P&L)


def remeasure_to_functional(
    position: FXPosition,
    functional_currency: str,
    current_rate: Decimal,
    as_of_date: date,
) -> FXResult:
    """
    Remeasure a foreign-currency position to functional currency per ASC 830.
    - Monetary: current exchange rate at balance sheet date → unrealized G/L in net income.
    - Nonmonetary: historical rate (or rate at acquisition) → no G/L from rate change.
    """
    if position.currency == functional_currency:
        return FXResult(
            functional_amount=position.amount,
            rate_used=Decimal("1"),
            unrealized_gain_loss=Decimal("0"),
        )
    if position.is_monetary:
        # Monetary: current rate; G/L = (current_rate - prior_rate) * amount (prior period would be needed for true unrealized)
        # For single-period: we treat as if we're remeasuring from prior rate to current rate; if no prior, unrealized = 0 for this calc
        functional_amount = (position.amount * current_rate).quantize(Decimal("0.01"))
        rate_used = current_rate
        # Unrealized: typically computed by comparing to prior period carrying value in functional; here we only have current remeasurement
        unrealized_gain_loss = Decimal("0")  # caller can pass prior functional amount to compute delta
        return FXResult(
            functional_amount=functional_amount,
            rate_used=rate_used,
            unrealized_gain_loss=unrealized_gain_loss,
        )
    else:
        # Nonmonetary: historical rate
        hist = position.historical_rate or current_rate
        functional_amount = (position.amount * hist).quantize(Decimal("0.01"))
        return FXResult(
            functional_amount=functional_amount,
            rate_used=hist,
            unrealized_gain_loss=Decimal("0"),
        )


def translate_to_reporting(
    functional_amount: Decimal,
    functional_currency: str,
    reporting_currency: str,
    translation_rate: Decimal,
) -> FXResult:
    """
    Translate from functional to reporting currency. Per ASC 830, translation adjustments
    go to OCI (other comprehensive income), not net income.
    """
    if functional_currency == reporting_currency:
        return FXResult(
            functional_amount=functional_amount,
            reporting_amount=functional_amount,
            rate_used=Decimal("1"),
            is_translation_adjustment=False,
        )
    reporting_amount = (functional_amount * translation_rate).quantize(Decimal("0.01"))
    return FXResult(
        functional_amount=functional_amount,
        reporting_amount=reporting_amount,
        rate_used=translation_rate,
        unrealized_gain_loss=Decimal("0"),
        is_translation_adjustment=True,
    )


def compute_unrealized_fx_gain_loss(
    positions: list[FXPosition],
    functional_currency: str,
    current_rates: dict[str, Decimal],  # foreign_currency -> rate to functional
    prior_functional_amounts: Optional[dict[str, Decimal]] = None,  # account or key -> prior period functional amount
    as_of_date: Optional[date] = None,
) -> Decimal:
    """
    Compute unrealized FX gain/loss for monetary items per ASC 830-20-35.
    Remeasure monetary items at current rate; unrealized G/L = current functional value minus
    prior period functional value (or, if no prior, use rate at transaction date if available).
    Simplified: if prior_functional_amounts not provided, we compute current functional value only;
    caller can pass prior and we return (current - prior) summed.
    """
    total_unrealized = Decimal("0")
    prior = prior_functional_amounts or {}
    as_of = as_of_date or date.today()

    for i, pos in enumerate(positions):
        if pos.currency == functional_currency:
            continue
        rate = current_rates.get(pos.currency)
        if rate is None:
            continue
        if pos.is_monetary:
            current_functional = (pos.amount * rate).quantize(Decimal("0.01"))
            key = pos.account_code or str(i)
            prior_functional = prior.get(key, current_functional)  # if no prior, assume no change
            total_unrealized += current_functional - prior_functional
        # nonmonetary: no unrealized G/L

    return total_unrealized


def batch_remeasure_to_functional(
    positions: list[FXPosition],
    functional_currency: str,
    current_rates: dict[str, Decimal],
    as_of_date: date,
) -> list[FXResult]:
    """Remeasure a list of positions to functional currency."""
    return [
        remeasure_to_functional(p, functional_currency, current_rates.get(p.currency, Decimal("1")), as_of_date)
        for p in positions
    ]
