"""
Missing intercompany transaction agent.
When intercompany receivables/payables don't net to zero, autonomously search
both ledgers to find the "missing" transaction (unrecorded or misposted).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from .models import GLEntryLike, InterCompanyPair, SubsidiaryLedgerInput


@dataclass
class MissingICRecommendation:
    """Recommendation for the missing intercompany transaction."""
    entity_receivable: str
    entity_payable: str
    receivable_account: str
    payable_account: str
    variance: Decimal  # receivable_balance - payable_balance
    suggested_side: str  # "entity_receivable" | "entity_payable"
    suggested_entry: Optional[SuggestedEntry] = None
    matching_candidates: list[UnmatchedEntry] = field(default_factory=list)
    explanation: str = ""


@dataclass
class SuggestedEntry:
    """Suggested journal entry to post to balance IC."""
    entity_id: str
    date: date
    description: str
    debit_account: str
    credit_account: str
    amount: Decimal
    reference: Optional[str] = None


@dataclass
class UnmatchedEntry:
    """An entry on one side with no matching opposite side."""
    entity_id: str
    account_code: str
    date: date
    description: str
    amount: Decimal
    side: str  # "debit" | "credit"
    reference: Optional[str] = None


def _entries_for_entity(ledger_inputs: list[SubsidiaryLedgerInput], entity_id: str):
    for li in ledger_inputs:
        if li.entity_id == entity_id:
            return li.entries
    return []


def _balance_for_account(entries: list[GLEntryLike], account_code: str, as_of: date) -> tuple[Decimal, list[tuple[GLEntryLike, str, Decimal]]]:
    """Returns (net_balance, list of (entry, 'debit'|'credit', amount))."""
    debits = Decimal("0")
    credits = Decimal("0")
    detail: list[tuple[GLEntryLike, str, Decimal]] = []
    for e in entries:
        if e.date > as_of:
            continue
        if e.debit_account == account_code:
            debits += e.amount
            detail.append((e, "debit", e.amount))
        if e.credit_account == account_code:
            credits += e.amount
            detail.append((e, "credit", e.amount))
    return (debits - credits, detail)


def _normalize_amount_for_matching(a: Decimal) -> Decimal:
    return a.quantize(Decimal("0.01"))


def find_missing_ic_transaction(
    pair: InterCompanyPair,
    receivable_balance: Decimal,
    payable_balance: Decimal,
    ledger_inputs: list[SubsidiaryLedgerInput],
    as_of_date: date,
    variance_tolerance: Decimal = Decimal("0.02"),
) -> Optional[MissingICRecommendation]:
    """
    If receivable_balance != payable_balance (beyond tolerance), search both ledgers
    for entries that could explain the variance. Return a recommendation (which side
    is likely missing an entry, and suggested entry if determinable). If no ledger
    detail is provided, still returns a recommendation with variance and explanation.
    """
    variance = receivable_balance - payable_balance
    if abs(variance) <= variance_tolerance:
        return None

    entries_rec = _entries_for_entity(ledger_inputs, pair.entity_receivable)
    entries_pay = _entries_for_entity(ledger_inputs, pair.entity_payable)

    _, rec_detail = _balance_for_account(entries_rec, pair.receivable_account_code, as_of_date)
    _, pay_detail = _balance_for_account(entries_pay, pair.payable_account_code, as_of_date)

    # Build lists of debit/credit amounts by entry for matching
    rec_debits = [(e, amt) for e, side, amt in rec_detail if side == "debit"]
    rec_credits = [(e, amt) for e, side, amt in rec_detail if side == "credit"]
    pay_debits = [(e, amt) for e, side, amt in pay_detail if side == "debit"]
    pay_credits = [(e, amt) for e, side, amt in pay_detail if side == "credit"]

    # Receivable (asset): debits increase, credits decrease. Payable (liability): credits increase, debits decrease.
    # So for a valid IC pair: each debit to receivable should have a matching credit to payable (same amount, same date).
    # Find receivables debits that don't have a matching payable credit (by amount, date within 5 days)
    date_slack_days = 5
    used_pay_credits: set[int] = set()
    unmatched_rec: list[UnmatchedEntry] = []
    for e, amt in rec_debits:
        amt_n = _normalize_amount_for_matching(amt)
        found = False
        for i, (pe, pam) in enumerate(pay_credits):
            if i in used_pay_credits:
                continue
            if _normalize_amount_for_matching(pam) != amt_n:
                continue
            if abs((e.date - pe.date).days) <= date_slack_days:
                used_pay_credits.add(i)
                found = True
                break
        if not found:
            unmatched_rec.append(UnmatchedEntry(
                entity_id=pair.entity_receivable,
                account_code=pair.receivable_account_code,
                date=e.date,
                description=e.description,
                amount=amt,
                side="debit",
                reference=e.reference,
            ))

    # Find payable credits that don't have a matching receivable debit
    used_rec_debits: set[int] = set()
    unmatched_pay: list[UnmatchedEntry] = []
    for e, amt in pay_credits:
        amt_n = _normalize_amount_for_matching(amt)
        found = False
        for i, (re, ram) in enumerate(rec_debits):
            if i in used_rec_debits:
                continue
            if _normalize_amount_for_matching(ram) != amt_n:
                continue
            if abs((e.date - re.date).days) <= date_slack_days:
                used_rec_debits.add(i)
                found = True
                break
        if not found:
            unmatched_pay.append(UnmatchedEntry(
                entity_id=pair.entity_payable,
                account_code=pair.payable_account_code,
                date=e.date,
                description=e.description,
                amount=amt,
                side="credit",
                reference=e.reference,
            ))

    # Determine suggested side: if variance > 0, receivable is higher -> likely missing on payable side (record Dr Expense, Cr Payable in entity_payable).
    # If variance < 0, payable is higher -> likely missing on receivable side (record Dr Receivable, Cr Revenue in entity_receivable).
    suggested_side = "entity_payable" if variance > 0 else "entity_receivable"
    suggested_entry: Optional[SuggestedEntry] = None
    candidates = unmatched_rec + unmatched_pay
    if unmatched_rec and variance < 0:
        # Suggest recording the largest unmatched receivable debit in the payable entity
        best = max(unmatched_rec, key=lambda x: x.amount)
        suggested_entry = SuggestedEntry(
            entity_id=pair.entity_receivable,
            date=best.date,
            description=f"IC entry to match {pair.entity_payable} payable: {best.description}",
            debit_account=pair.receivable_account_code,
            credit_account="REVENUE_IC",  # placeholder; user must map
            amount=best.amount,
            reference=best.reference,
        )
    elif unmatched_pay and variance > 0:
        best = max(unmatched_pay, key=lambda x: x.amount)
        suggested_entry = SuggestedEntry(
            entity_id=pair.entity_payable,
            date=best.date,
            description=f"IC entry to match {pair.entity_receivable} receivable: {best.description}",
            debit_account="EXPENSE_IC",  # placeholder; user must map
            credit_account=pair.payable_account_code,
            amount=best.amount,
            reference=best.reference,
        )

    explanation = (
        f"Intercompany receivable ({pair.entity_receivable}) = {receivable_balance}, "
        f"payable ({pair.entity_payable}) = {payable_balance}; variance = {variance}. "
            + (
                f"Found {len(unmatched_rec)} unmatched receivable entries and {len(unmatched_pay)} unmatched payable entries. "
                if candidates else "No ledger detail was provided to match entries. "
            )
            + (
                f"Suggested: post entry in {suggested_side} to clear variance."
                if suggested_side else ""
            )
    )

    return MissingICRecommendation(
        entity_receivable=pair.entity_receivable,
        entity_payable=pair.entity_payable,
        receivable_account=pair.receivable_account_code,
        payable_account=pair.payable_account_code,
        variance=variance,
        suggested_side=suggested_side,
        suggested_entry=suggested_entry,
        matching_candidates=candidates,
        explanation=explanation,
    )
