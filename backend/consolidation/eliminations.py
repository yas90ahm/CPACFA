"""
Intercompany eliminations (ASC 810).
Net intercompany receivables and payables; produce elimination entries.
If balances don't net to zero, the roll-up service can invoke the missing-IC agent.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

from .models import (
    EliminationEntry,
    InterCompanyPair,
    SubsidiaryTrialBalance,
)


@dataclass
class InterCompanyEliminationResult:
    """Result of computing one IC pair elimination."""
    pair: InterCompanyPair
    receivable_balance: Decimal  # in reporting currency (entity_receivable side)
    payable_balance: Decimal    # in reporting currency (entity_payable side)
    nets_to_zero: bool
    variance: Decimal  # receivable - payable (should be 0)
    elimination_entries: list[EliminationEntry] = field(default_factory=list)
    # If not nets_to_zero: amount that was eliminated anyway (min of the two)
    amount_eliminated: Decimal = Decimal("0")


def _get_line_balance(
    lines: list,
    account_code: str,
) -> tuple[Decimal, Decimal]:
    """Return (debit, credit) for account_code from trial balance lines."""
    for line in lines:
        if line.account_code == account_code:
            return (line.debit, line.credit)
    return (Decimal("0"), Decimal("0"))


def _balance_sheet_amount(debit: Decimal, credit: Decimal, is_asset: bool) -> Decimal:
    """Asset: positive = debit - credit; Liability: positive = credit - debit."""
    if is_asset:
        return debit - credit
    return credit - debit


def compute_intercompany_eliminations(
    pairs: list[InterCompanyPair],
    subsidiary_balances: dict[str, dict[str, tuple[Decimal, Decimal]]],
    tolerance: Decimal = Decimal("0.02"),
) -> list[InterCompanyEliminationResult]:
    """
    For each IC pair, get receivable balance (entity_receivable) and payable balance (entity_payable).
    They should net to zero. If so, create elimination: Dr Payable, Cr Receivable.
    subsidiary_balances: entity_id -> account_code -> (debit, credit) in reporting currency.
    """
    results: list[InterCompanyEliminationResult] = []
    for pair in pairs:
        rec_d, rec_c = subsidiary_balances.get(pair.entity_receivable, {}).get(
            pair.receivable_account_code, (Decimal("0"), Decimal("0"))
        )
        pay_d, pay_c = subsidiary_balances.get(pair.entity_payable, {}).get(
            pair.payable_account_code, (Decimal("0"), Decimal("0"))
        )
        receivable_balance = rec_d - rec_c  # asset: debit - credit
        payable_balance = pay_c - pay_d    # liability: credit - debit
        variance = receivable_balance - payable_balance
        nets_to_zero = abs(variance) <= tolerance
        amount_eliminated = min(receivable_balance, payable_balance)
        if amount_eliminated < Decimal("0"):
            amount_eliminated = Decimal("0")
        entries: list[EliminationEntry] = []
        if amount_eliminated > Decimal("0"):
            entries.append(EliminationEntry(
                description=f"Eliminate IC: {pair.entity_receivable} / {pair.entity_payable}",
                debit_account=pair.payable_account_code,
                credit_account=pair.receivable_account_code,
                amount=amount_eliminated,
                entity_debit=pair.entity_payable,
                entity_credit=pair.entity_receivable,
            ))
        results.append(InterCompanyEliminationResult(
            pair=pair,
            receivable_balance=receivable_balance,
            payable_balance=payable_balance,
            nets_to_zero=nets_to_zero,
            variance=variance,
            elimination_entries=entries,
            amount_eliminated=amount_eliminated,
        ))
    return results
