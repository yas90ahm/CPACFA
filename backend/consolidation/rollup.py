"""
Roll-up service: translate subsidiary trial balances to reporting currency (ASC 830)
and produce a single consolidated balance sheet with eliminations and minority interest.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Optional

from models import AccountType, BalanceSheet, StatementLine, TrialBalanceLine, CodificationRef

try:
    from tax.fx_engine import translate_to_reporting
    HAS_FX = True
except ImportError:
    HAS_FX = False

from .models import (
    ConsolidationInput,
    ConsolidationResult,
    EliminationEntry,
    MinorityInterestLine,
    MinorityOwnership,
    SubsidiaryLedgerInput,
    SubsidiaryTrialBalance,
)
from .eliminations import compute_intercompany_eliminations, InterCompanyEliminationResult
from .missing_ic_agent import find_missing_ic_transaction, MissingICRecommendation


ASC_210 = CodificationRef("FASB", "ASC 210-10-45", "Balance Sheet")
ASC_810 = CodificationRef("FASB", "ASC 810-10-45", "Consolidation")
TOLERANCE = Decimal("0.02")


def _translate_amount(
    amount: Decimal,
    functional_currency: str,
    reporting_currency: str,
    rates: dict[str, Decimal],
) -> Decimal:
    """Translate amount from functional to reporting currency (ASC 830)."""
    if functional_currency == reporting_currency:
        return amount
    rate = rates.get(functional_currency, Decimal("1"))
    return (amount * rate).quantize(Decimal("0.01"))


def _subsidiary_balances_in_reporting(
    input_data: ConsolidationInput,
) -> tuple[dict[str, dict[str, tuple[Decimal, Decimal]]], list[tuple[str, str, str, AccountType, Decimal, Decimal]]]:
    """
    Translate each subsidiary's trial balance to reporting currency.
    Returns:
      1) subsidiary_balances: entity_id -> account_code -> (debit, credit) in reporting
      2) translated_lines: (entity_id, account_code, account_name, account_type, debit, credit) for aggregation
    """
    rates = input_data.translation_rates or input_data.fx_rates_to_reporting
    reporting = input_data.reporting_currency
    subsidiary_balances: dict[str, dict[str, tuple[Decimal, Decimal]]] = {}
    translated_lines: list[tuple[str, str, str, AccountType, Decimal, Decimal]] = []

    for sub in input_data.subsidiaries:
        func_ccy = sub.functional_currency
        eid = sub.entity_id
        subsidiary_balances[eid] = {}
        for line in sub.lines:
            d = _translate_amount(line.debit, func_ccy, reporting, rates)
            c = _translate_amount(line.credit, func_ccy, reporting, rates)
            subsidiary_balances[eid][line.account_code] = (d, c)
            translated_lines.append((
                eid,
                line.account_code,
                line.account_name,
                line.account_type,
                d,
                c,
            ))
    return subsidiary_balances, translated_lines


def roll_up_to_consolidated_balance_sheet(input_data: ConsolidationInput) -> ConsolidationResult:
    """
    Roll up subsidiary trial balances to a single consolidated balance sheet.
    1) Translate each subsidiary to reporting currency (ASC 830).
    2) Compute intercompany eliminations; if any pair doesn't net to zero, run missing-IC agent.
    3) Apply eliminations and aggregate assets, liabilities, equity.
    4) Add minority interest to equity.
    """
    reporting = input_data.reporting_currency
    report_date = input_data.report_date
    subsidiary_balances, translated_lines = _subsidiary_balances_in_reporting(input_data)

    elimination_results = compute_intercompany_eliminations(
        input_data.intercompany_pairs,
        subsidiary_balances,
        tolerance=TOLERANCE,
    )
    all_elimination_entries: list[EliminationEntry] = []
    elimination_adjustments: dict[tuple[str, str], Decimal] = {}  # (eid, account_code) -> amount to subtract
    missing_ic: Optional[MissingICRecommendation] = None
    intercompany_netted = True

    for res in elimination_results:
        all_elimination_entries.extend(res.elimination_entries)
        if res.amount_eliminated > 0:
            elimination_adjustments[(res.pair.entity_receivable, res.pair.receivable_account_code)] = res.amount_eliminated
            elimination_adjustments[(res.pair.entity_payable, res.pair.payable_account_code)] = res.amount_eliminated
        if not res.nets_to_zero:
            rec = find_missing_ic_transaction(
                res.pair,
                res.receivable_balance,
                res.payable_balance,
                input_data.ledger_inputs,
                report_date,
                variance_tolerance=TOLERANCE,
            )
            if rec and (missing_ic is None or abs(rec.variance) > abs(missing_ic.variance)):
                missing_ic = rec
            intercompany_netted = False

    # Build adj_debit / adj_credit for receivables (subtract from debit) and payables (subtract from credit)
    adj_debit: dict[tuple[str, str], Decimal] = {}
    adj_credit: dict[tuple[str, str], Decimal] = {}
    for res in elimination_results:
        if res.amount_eliminated <= 0:
            continue
        key_rec = (res.pair.entity_receivable, res.pair.receivable_account_code)
        key_pay = (res.pair.entity_payable, res.pair.payable_account_code)
        adj_debit[key_rec] = adj_debit.get(key_rec, Decimal("0")) + res.amount_eliminated
        adj_credit[key_pay] = adj_credit.get(key_pay, Decimal("0")) + res.amount_eliminated

    assets_list: list[StatementLine] = []
    liab_list: list[StatementLine] = []
    equity_list: list[StatementLine] = []
    subsidiary_equity: dict[str, Decimal] = {}

    # Aggregate from translated lines with adjustments
    assets_agg = defaultdict(Decimal)
    liab_agg = defaultdict(Decimal)
    equity_agg = defaultdict(Decimal)
    for eid, account_code, account_name, account_type, d, c in translated_lines:
        key = (eid, account_code)
        d_adj = d - adj_debit.get(key, Decimal("0"))
        c_adj = c - adj_credit.get(key, Decimal("0"))
        if account_type == AccountType.ASSET:
            amt = d_adj - c_adj
            assets_agg[account_name or account_code] += amt
        elif account_type == AccountType.LIABILITY:
            amt = c_adj - d_adj
            liab_agg[account_name or account_code] += amt
        elif account_type == AccountType.EQUITY:
            amt = c_adj - d_adj
            subsidiary_equity[eid] = subsidiary_equity.get(eid, Decimal("0")) + amt
            equity_agg[account_name or account_code] += amt

    assets_list = [StatementLine(lbl, amt, None, ASC_210) for lbl, amt in sorted(assets_agg.items()) if amt != 0]
    liab_list = [StatementLine(lbl, amt, None, ASC_210) for lbl, amt in sorted(liab_agg.items()) if amt != 0]
    equity_list = [StatementLine(lbl, amt, None, ASC_210) for lbl, amt in sorted(equity_agg.items()) if amt != 0]

    # Minority interest (ASC 810): NCI = subsidiary equity * minority_pct
    nci_lines: list[MinorityInterestLine] = []
    total_nci = Decimal("0")
    sub_names = {s.entity_id: s.entity_name for s in input_data.subsidiaries}
    for mo in input_data.minority_ownerships:
        sub_equity = subsidiary_equity.get(mo.subsidiary_entity_id, Decimal("0"))
        nci_amount = (sub_equity * mo.minority_pct).quantize(Decimal("0.01"))
        total_nci += nci_amount
        nci_lines.append(MinorityInterestLine(
            subsidiary_entity_id=mo.subsidiary_entity_id,
            subsidiary_name=sub_names.get(mo.subsidiary_entity_id, mo.subsidiary_entity_id),
            amount=nci_amount,
        ))
    if nci_lines:
        equity_list.append(StatementLine(
            "Noncontrolling interest",
            total_nci,
            None,
            ASC_810,
        ))

    total_assets = sum(l.amount for l in assets_list)
    total_liabilities = sum(l.amount for l in liab_list)
    total_equity = sum(l.amount for l in equity_list)

    consolidated_bs = BalanceSheet(
        report_date=report_date,
        assets=assets_list,
        liabilities=liab_list,
        equity=equity_list,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        total_equity=total_equity,
        codification_ref=ASC_210,
    )

    translation_adjustments = {}
    if input_data.translation_rates or input_data.fx_rates_to_reporting:
        for sub in input_data.subsidiaries:
            if sub.functional_currency != reporting:
                translation_adjustments[sub.entity_id] = Decimal("0")  # placeholder; could compute OCI from fx_engine

    return ConsolidationResult(
        report_date=report_date,
        reporting_currency=reporting,
        consolidated_balance_sheet=consolidated_bs,
        eliminations_applied=all_elimination_entries,
        minority_interest=nci_lines,
        total_minority_interest=total_nci,
        translation_adjustments=translation_adjustments,
        intercompany_netted=intercompany_netted,
        missing_ic_recommendation=missing_ic,
    )
