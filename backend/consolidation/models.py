"""
Consolidation data models.
Subsidiary trial balances, intercompany mappings, consolidation inputs/results.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from models import AccountType, TrialBalanceLine, BalanceSheet, StatementLine, CodificationRef


@dataclass
class SubsidiaryTrialBalance:
    """Trial balance for one subsidiary (functional currency)."""
    entity_id: str
    entity_name: str
    functional_currency: str
    report_date: date
    lines: list[TrialBalanceLine]
    total_debits: Decimal
    total_credits: Decimal
    balances: bool  # total_debits == total_credits


@dataclass
class SubsidiaryLedgerInput:
    """Optional ledger detail for a subsidiary (for missing-IC agent)."""
    entity_id: str
    entries: list["GLEntryLike"]
    as_of: date


@dataclass
class GLEntryLike:
    """Minimal GL entry for consolidation agent (avoids importing accounting_engine)."""
    date: date
    description: str
    debit_account: str
    credit_account: str
    amount: Decimal
    reference: Optional[str] = None


@dataclass
class InterCompanyPair:
    """Mapping of intercompany receivable/payable between two entities."""
    entity_receivable: str  # entity that has the receivable (asset)
    entity_payable: str    # entity that has the payable (liability)
    receivable_account_code: str  # account code in entity_receivable's ledger
    payable_account_code: str    # account code in entity_payable's ledger
    description: str = "Intercompany Receivable/Payable"


@dataclass
class MinorityOwnership:
    """Non-controlling interest: parent owns (1 - minority_pct) of subsidiary."""
    subsidiary_entity_id: str
    minority_pct: Decimal  # 0 to 1 (e.g. 0.20 = 20% NCI)


@dataclass
class ConsolidationInput:
    """Input to the roll-up consolidation."""
    reporting_currency: str
    report_date: date
    subsidiaries: list[SubsidiaryTrialBalance]
    # FX: foreign_currency -> rate to reporting_currency (e.g. EUR: 1.08)
    fx_rates_to_reporting: dict[str, Decimal] = field(default_factory=dict)
    # Translation rate functional -> reporting (if same as fx_rates_to_reporting, use that)
    translation_rates: Optional[dict[str, Decimal]] = None
    intercompany_pairs: list[InterCompanyPair] = field(default_factory=list)
    minority_ownerships: list[MinorityOwnership] = field(default_factory=list)
    # Optional: ledger entries per entity for missing-IC search
    ledger_inputs: list[SubsidiaryLedgerInput] = field(default_factory=list)


@dataclass
class EliminationEntry:
    """One elimination journal entry (for disclosure/audit)."""
    description: str
    debit_account: str
    credit_account: str
    amount: Decimal
    entity_debit: str
    entity_credit: str


@dataclass
class MinorityInterestLine:
    """Non-controlling interest in equity (ASC 810-10-45)."""
    subsidiary_entity_id: str
    subsidiary_name: str
    amount: Decimal  # NCI share of subsidiary equity
    description: str = "Noncontrolling interest"


@dataclass
class ConsolidationResult:
    """Result of consolidation: balance sheet + eliminations + NCI."""
    report_date: date
    reporting_currency: str
    consolidated_balance_sheet: BalanceSheet
    eliminations_applied: list[EliminationEntry] = field(default_factory=list)
    minority_interest: list[MinorityInterestLine] = field(default_factory=list)
    total_minority_interest: Decimal = Decimal("0")
    translation_adjustments: dict[str, Decimal] = field(default_factory=dict)  # entity_id -> OCI translation
    intercompany_netted: bool = True  # False if IC didn't net and agent was run
    missing_ic_recommendation: Optional[Any] = None  # MissingICRecommendation from missing_ic_agent


