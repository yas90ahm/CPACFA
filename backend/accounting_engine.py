"""
FinOS CPA-Agent — Accounting Engine.
Processes General Ledger; prepares formal financial statements with FASB/IASB traceability.
Features: Depreciation (SL, DDB), ASC 606 Revenue Recognition, Statement of Cash Flows (Indirect).
Verification: Assets = Liabilities + Equity at all times.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Optional

from models import (
    AccountType,
    BalanceSheet,
    CashFlowStatement,
    CodificationRef,
    DepreciationMethod,
    DepreciationSchedule,
    DepreciationScheduleLine,
    GLEntry,
    GLAccount,
    IncomeStatement,
    PerformanceObligation,
    RevenueContract,
    StatementLine,
    TrialBalance,
    TrialBalanceLine,
)


# --- Codification refs (FASB) ---
ASC_210 = CodificationRef("FASB", "ASC 210-10-45", "Balance Sheet")
ASC_220 = CodificationRef("FASB", "ASC 220-10-45", "Comprehensive Income")
ASC_230 = CodificationRef("FASB", "ASC 230-10-45", "Statement of Cash Flows")
ASC_350_40 = CodificationRef("FASB", "ASC 350-40", "Internal-Use Software—Capitalization")
ASC_360_35 = CodificationRef("FASB", "ASC 360-10-35", "Depreciation—Subsequent Measurement")
ASC_606 = CodificationRef("FASB", "ASC 606-10-25", "Revenue from Contracts with Customers")


@dataclass
class ChartOfAccounts:
    """Map account code -> GLAccount."""
    accounts: dict[str, GLAccount] = field(default_factory=dict)

    def get_type(self, code: str) -> AccountType:
        acc = self.accounts.get(code)
        return acc.account_type if acc else AccountType.ASSET

    def get_name(self, code: str) -> str:
        acc = self.accounts.get(code)
        return acc.name if acc else code


@dataclass
class GeneralLedger:
    """
    General Ledger state: approved entries (GL) and pending (staged) entries.
    Balance sheet and trial balance use only approved entries for a clear audit trail
    (Unadjusted → approve staged entries → Adjusted Trial Balance).
    """
    entries: list[GLEntry] = field(default_factory=list)  # Approved only; used for BS/TB
    pending_entries: list[GLEntry] = field(default_factory=list)  # Staged as Pending
    coa: Optional[ChartOfAccounts] = None

    def post(self, entry: GLEntry) -> None:
        """Post directly to GL (e.g. when user approves). Entry is included in balance_sheet."""
        self.entries.append(entry)

    def stage_entry(self, entry: GLEntry) -> None:
        """Save entry as Pending. Not included in balance_sheet until approved."""
        self.pending_entries.append(entry)

    def approve_entry(self, index: int) -> GLEntry:
        """Move pending_entries[index] to the GL (approved). Returns the approved entry."""
        if index < 0 or index >= len(self.pending_entries):
            raise IndexError(f"approve_entry: index {index} out of range (0..{len(self.pending_entries) - 1})")
        entry = self.pending_entries.pop(index)
        self.entries.append(entry)
        return entry

    def approve_all(self) -> list[GLEntry]:
        """Approve all pending entries; returns the list of approved entries."""
        approved = list(self.pending_entries)
        self.entries.extend(approved)
        self.pending_entries.clear()
        return approved

    def balances_by_account(self, as_of: Optional[date] = None) -> dict[str, tuple[Decimal, Decimal]]:
        """Returns { account_code: (debits, credits) } up to as_of (inclusive). Uses approved entries only."""
        debits: dict[str, Decimal] = defaultdict(Decimal)
        credits: dict[str, Decimal] = defaultdict(Decimal)
        for e in self.entries:
            if as_of is not None and e.date > as_of:
                continue
            debits[e.debit_account] += e.amount
            credits[e.credit_account] += e.amount
        out: dict[str, tuple[Decimal, Decimal]] = {}
        all_codes = set(debits) | set(credits)
        for code in all_codes:
            out[code] = (debits[code], credits[code])
        return out

    def trial_balance(self, as_of: date, coa: ChartOfAccounts) -> TrialBalance:
        """Build Trial Balance as of date from approved entries only. Zero tolerance for imbalance."""
        bal = self.balances_by_account(as_of)
        lines: list[TrialBalanceLine] = []
        total_d = Decimal("0")
        total_c = Decimal("0")
        for code, (d, c) in bal.items():
            if d == c == 0:
                continue
            name = coa.get_name(code)
            acc_type = coa.get_type(code)
            ref = coa.accounts[code].codification_ref if code in coa.accounts else None
            lines.append(TrialBalanceLine(code, name, d, c, acc_type, ref))
            total_d += d
            total_c += c
        tolerance = Decimal("0.01")
        balances = abs(total_d - total_c) < tolerance
        return TrialBalance(lines=lines, total_debits=total_d, total_credits=total_c, balances=balances)

    def balance_sheet(self, as_of: date, coa: ChartOfAccounts) -> BalanceSheet:
        """Build Balance Sheet. Verification: Assets = Liabilities + Equity."""
        tb = self.trial_balance(as_of, coa)
        assets: list[StatementLine] = []
        liabilities: list[StatementLine] = []
        equity: list[StatementLine] = []
        for line in tb.lines:
            amt = line.debit - line.credit
            if line.account_type == AccountType.LIABILITY or line.account_type == AccountType.EQUITY:
                amt = -amt
            st_line = StatementLine(line.account_name, amt, line.account_code, line.codification_ref)
            if line.account_type == AccountType.ASSET:
                assets.append(st_line)
            elif line.account_type == AccountType.LIABILITY:
                liabilities.append(st_line)
            elif line.account_type == AccountType.EQUITY:
                equity.append(st_line)
        total_a = sum(l.amount for l in assets)
        total_l = sum(l.amount for l in liabilities)
        total_e = sum(l.amount for l in equity)
        return BalanceSheet(
            report_date=as_of,
            assets=assets,
            liabilities=liabilities,
            equity=equity,
            total_assets=total_a,
            total_liabilities=total_l,
            total_equity=total_e,
            codification_ref=ASC_210,
        )

    def income_statement(self, period_start: date, period_end: date, coa: ChartOfAccounts) -> IncomeStatement:
        """Build P&L for period. Revenue and expenses only."""
        bal_start = self.balances_by_account(period_start)
        bal_end = self.balances_by_account(period_end)
        revenue: list[StatementLine] = []
        expenses: list[StatementLine] = []
        for code in set(bal_start) | set(bal_end):
            acc_type = coa.get_type(code)
            if acc_type != AccountType.REVENUE and acc_type != AccountType.EXPENSE:
                continue
            d_s, c_s = bal_start.get(code, (Decimal("0"), Decimal("0")))
            d_e, c_e = bal_end.get(code, (Decimal("0"), Decimal("0")))
            # Period movement
            rev_amt = (c_e - c_s) - (d_e - d_s) if acc_type == AccountType.REVENUE else Decimal("0")
            exp_amt = (d_e - d_s) - (c_e - c_s) if acc_type == AccountType.EXPENSE else Decimal("0")
            if acc_type == AccountType.REVENUE and rev_amt != 0:
                revenue.append(StatementLine(coa.get_name(code), rev_amt, code, None))
            if acc_type == AccountType.EXPENSE and exp_amt != 0:
                expenses.append(StatementLine(coa.get_name(code), exp_amt, code, None))
        total_rev = sum(l.amount for l in revenue)
        total_exp = sum(l.amount for l in expenses)
        return IncomeStatement(
            report_date=period_end,
            revenue=revenue,
            expenses=expenses,
            total_revenue=total_rev,
            total_expenses=total_exp,
            net_income=total_rev - total_exp,
            codification_ref=ASC_220,
        )


# --- Validation: Assets = Liabilities + Equity at all times ---
class ValidationError(Exception):
    pass


def validate_balance_sheet(bs: BalanceSheet, tolerance: Decimal = Decimal("0.02")) -> None:
    """Raises ValidationError if Assets != Liabilities + Equity."""
    rhs = bs.total_liabilities + bs.total_equity
    diff = abs(bs.total_assets - rhs)
    if diff > tolerance:
        raise ValidationError(
            f"Balance Sheet does not balance. Assets={bs.total_assets} != Liabilities+Equity={rhs}. "
            "Under ASC 210-10-45 and IAS 1.49, Assets must equal Liabilities plus Equity."
        )


def validate_ledger_at_date(gl: GeneralLedger, as_of: date, coa: ChartOfAccounts) -> None:
    """Validate that the ledger produces a balanced Balance Sheet at as_of."""
    bs = gl.balance_sheet(as_of, coa)
    validate_balance_sheet(bs)


# --- Depreciation: Straight Line and Double Declining Balance ---
def depreciation_schedule_sl(
    cost: Decimal,
    salvage_value: Decimal,
    useful_life_years: int,
    placed_in_service: date,
    asset_id: str = "",
    asset_description: str = "",
) -> DepreciationSchedule:
    """Straight-line depreciation. ASC 360-10-35."""
    depreciable = cost - salvage_value
    if useful_life_years <= 0:
        raise ValueError("Useful life must be positive")
    annual = depreciable / useful_life_years
    lines: list[DepreciationScheduleLine] = []
    acc_dep = Decimal("0")
    bv = cost
    for year in range(1, useful_life_years + 1):
        period_end = date(placed_in_service.year + year, placed_in_service.month, placed_in_service.day)
        exp = min(annual, cost - salvage_value - acc_dep)  # last period rounding
        acc_dep += exp
        bv = cost - acc_dep
        lines.append(
            DepreciationScheduleLine(
                period=year,
                period_end_date=period_end,
                beginning_book_value=bv + exp,
                depreciation_expense=exp,
                accumulated_depreciation=acc_dep,
                ending_book_value=bv,
            )
        )
    return DepreciationSchedule(
        asset_id=asset_id,
        asset_description=asset_description,
        method=DepreciationMethod.STRAIGHT_LINE,
        cost=cost,
        salvage_value=salvage_value,
        useful_life_years=useful_life_years,
        placed_in_service_date=placed_in_service,
        lines=lines,
        codification_ref=ASC_360_35,
    )


def depreciation_schedule_ddb(
    cost: Decimal,
    salvage_value: Decimal,
    useful_life_years: int,
    placed_in_service: date,
    asset_id: str = "",
    asset_description: str = "",
) -> DepreciationSchedule:
    """Double-declining balance. ASC 360-10-35. Switch to SL when SL > DDB not required here for simplicity."""
    if useful_life_years <= 0:
        raise ValueError("Useful life must be positive")
    rate = Decimal("2") / useful_life_years
    lines: list[DepreciationScheduleLine] = []
    acc_dep = Decimal("0")
    bv = cost
    for year in range(1, useful_life_years + 1):
        period_end = date(placed_in_service.year + year, placed_in_service.month, placed_in_service.day)
        exp = bv * rate
        remaining = cost - salvage_value - acc_dep
        if exp > remaining or year == useful_life_years:
            exp = remaining
        exp = max(exp, Decimal("0"))
        acc_dep += exp
        bv = cost - acc_dep
        lines.append(
            DepreciationScheduleLine(
                period=year,
                period_end_date=period_end,
                beginning_book_value=bv + exp,
                depreciation_expense=exp,
                accumulated_depreciation=acc_dep,
                ending_book_value=bv,
            )
        )
    return DepreciationSchedule(
        asset_id=asset_id,
        asset_description=asset_description,
        method=DepreciationMethod.DOUBLE_DECLINING_BALANCE,
        cost=cost,
        salvage_value=salvage_value,
        useful_life_years=useful_life_years,
        placed_in_service_date=placed_in_service,
        lines=lines,
        codification_ref=ASC_360_35,
    )


def build_depreciation_schedule(
    method: DepreciationMethod,
    cost: Decimal,
    salvage_value: Decimal,
    useful_life_years: int,
    placed_in_service: date,
    asset_id: str = "",
    asset_description: str = "",
) -> DepreciationSchedule:
    if method == DepreciationMethod.STRAIGHT_LINE:
        return depreciation_schedule_sl(
            cost, salvage_value, useful_life_years, placed_in_service, asset_id, asset_description
        )
    return depreciation_schedule_ddb(
        cost, salvage_value, useful_life_years, placed_in_service, asset_id, asset_description
    )


# --- ASC 606 Revenue Recognition (5-step model) ---
def recognize_revenue_asc606(
    contract: RevenueContract,
    performance_obligation_id: str,
    amount_satisfied: Decimal,
) -> Decimal:
    """
    Step 5: Recognize revenue when (or as) performance obligation is satisfied.
    Returns amount recognized this period.
    """
    for po in contract.performance_obligations:
        if po.id != performance_obligation_id:
            continue
        remaining = po.transaction_price_allocated - po.satisfied_amount
        to_recognize = min(amount_satisfied, remaining)
        po.satisfied_amount += to_recognize
        contract.total_revenue_recognized += to_recognize
        return to_recognize
    return Decimal("0")


def allocate_transaction_price_asc606(
    contract: RevenueContract,
    allocation_weights: list[Decimal],
) -> None:
    """Step 4: Allocate transaction price to each performance obligation (by weight)."""
    total = sum(allocation_weights)
    if total == 0:
        return
    for i, po in enumerate(contract.performance_obligations):
        if i < len(allocation_weights):
            po.transaction_price_allocated = (contract.transaction_price * allocation_weights[i]) / total


# --- Statement of Cash Flows (Indirect Method) ---
def statement_of_cash_flows_indirect(
    gl: GeneralLedger,
    period_start: date,
    period_end: date,
    coa: ChartOfAccounts,
    beginning_cash: Decimal,
    ending_cash: Decimal,
) -> CashFlowStatement:
    """
    ASC 230-10-45: Indirect method.
    Operating: start with net income, adjust for non-cash and changes in working capital.
    Investing: PPE/asset purchases and sales (simplified: use GL movements in investing accounts).
    Financing: debt and equity changes (simplified: use GL movements in financing accounts).
    """
    is_ = gl.income_statement(period_start, period_end, coa)
    net_income = is_.net_income

    bal_start = gl.balances_by_account(period_start)
    bal_end = gl.balances_by_account(period_end)
    all_codes = set(bal_start) | set(bal_end)

    operating: list[StatementLine] = [
        StatementLine("Net Income", net_income, None, ASC_220),
    ]
    # Non-cash: add back depreciation (expense that didn't reduce cash)
    dep_codes = [c for c in all_codes if "depreciation" in coa.get_name(c).lower() or "depreciation" in c.lower()]
    dep_change = Decimal("0")
    for code in dep_codes:
        _, c_s = bal_start.get(code, (Decimal("0"), Decimal("0")))
        _, c_e = bal_end.get(code, (Decimal("0"), Decimal("0")))
        dep_change += c_e - c_s
    if dep_change != 0:
        operating.append(StatementLine("Depreciation and amortization (add back)", dep_change, None, ASC_360_35))

    # Changes in working capital (simplified: delta in current assets/liabilities)
    current_asset_codes = [c for c in all_codes if coa.get_type(c) == AccountType.ASSET and c not in dep_codes]
    current_liab_codes = [c for c in all_codes if coa.get_type(c) == AccountType.LIABILITY]
    delta_ca = Decimal("0")
    for c in current_asset_codes:
        d_s, c_s = bal_start.get(c, (Decimal("0"), Decimal("0")))
        d_e, c_e = bal_end.get(c, (Decimal("0"), Decimal("0")))
        delta_ca += (d_e - c_e) - (d_s - c_s)
    delta_cl = Decimal("0")
    for c in current_liab_codes:
        d_s, c_s = bal_start.get(c, (Decimal("0"), Decimal("0")))
        d_e, c_e = bal_end.get(c, (Decimal("0"), Decimal("0")))
        delta_cl += (c_e - d_e) - (c_s - d_s)
    if delta_ca != 0:
        operating.append(StatementLine("Change in current assets", -delta_ca, None, ASC_230))
    if delta_cl != 0:
        operating.append(StatementLine("Change in current liabilities", delta_cl, None, ASC_230))

    net_cash_operating = net_income + dep_change - delta_ca + delta_cl

    investing: list[StatementLine] = []
    investing_codes = [c for c in all_codes if "equipment" in coa.get_name(c).lower() or "property" in coa.get_name(c).lower()]
    inv_delta = Decimal("0")
    for c in investing_codes:
        d_s, c_s = bal_start.get(c, (Decimal("0"), Decimal("0")))
        d_e, c_e = bal_end.get(c, (Decimal("0"), Decimal("0")))
        inv_delta += (d_e - c_e) - (d_s - c_s)
    if inv_delta != 0:
        investing.append(StatementLine("Capital expenditures / PPE", -inv_delta, None, ASC_230))
    net_cash_investing = -inv_delta

    financing: list[StatementLine] = []
    financing_codes = [c for c in all_codes if coa.get_type(c) in (AccountType.LIABILITY, AccountType.EQUITY)]
    fin_delta = Decimal("0")
    for c in financing_codes:
        d_s, c_s = bal_start.get(c, (Decimal("0"), Decimal("0")))
        d_e, c_e = bal_end.get(c, (Decimal("0"), Decimal("0")))
        fin_delta += (c_e - d_e) - (c_s - d_s)
    if fin_delta != 0:
        financing.append(StatementLine("Net change in debt and equity", fin_delta, None, ASC_230))
    net_cash_financing = fin_delta

    return CashFlowStatement(
        report_date=period_end,
        operating_activities=operating,
        investing_activities=investing,
        financing_activities=financing,
        net_cash_operating=net_cash_operating,
        net_cash_investing=net_cash_investing,
        net_cash_financing=net_cash_financing,
        beginning_cash=beginning_cash,
        ending_cash=ending_cash,
        codification_ref=ASC_230,
    )


# --- High-level CPA-Agent service ---
class CPAAgent:
    """
    CPA-Agent: processes General Ledger and prepares formal financial statements.
    Entries are staged as Pending; balance_sheet uses only Approved entries.
    Validation: Assets = Liabilities + Equity at all times.
    """

    def __init__(self, coa: ChartOfAccounts):
        self.coa = coa
        self.gl = GeneralLedger(coa=coa)

    def stage_entry(self, entry: GLEntry) -> None:
        """Stage an entry as Pending. Not included in balance_sheet until approved."""
        self.gl.stage_entry(entry)

    def post_entry(self, entry: GLEntry) -> None:
        """Stage entry (Pending). Use stage_entry for clarity; post_entry retained for compatibility."""
        self.gl.stage_entry(entry)

    def approve_entry(self, index: int) -> GLEntry:
        """Approve pending entry at index; moves it to the GL. Returns the approved entry."""
        return self.gl.approve_entry(index)

    def approve_all_pending(self) -> list[GLEntry]:
        """Approve all pending (staged) entries. Returns the list of approved entries."""
        return self.gl.approve_all()

    def pending_entries(self) -> list[GLEntry]:
        """List entries staged as Pending (not yet included in balance_sheet)."""
        return list(self.gl.pending_entries)

    def trial_balance(self, as_of: date) -> TrialBalance:
        return self.gl.trial_balance(as_of, self.coa)

    def balance_sheet(self, as_of: date) -> BalanceSheet:
        bs = self.gl.balance_sheet(as_of, self.coa)
        validate_balance_sheet(bs)
        return bs

    def income_statement(self, period_start: date, period_end: date) -> IncomeStatement:
        return self.gl.income_statement(period_start, period_end, self.coa)

    def get_historical_metrics(
        self,
        as_of: date,
        period_start: Optional[date] = None,
        period_end: Optional[date] = None,
        dcf_explicit_years: int = 5,
        dcf_growth_rate: float = 0.05,
    ) -> dict[str, Any]:
        """
        Return CPA-derived metrics for CFA/DCF: net_income, total_revenue, total_assets,
        total_equity, total_liabilities, free_cash_flows (FCF proxy from net income),
        report_date. Injected into strategic_analyst DCF so CFA never has to ask for data.
        """
        period_end = period_end or as_of
        period_start = period_start or period_end
        bs = self.balance_sheet(as_of)
        is_ = self.income_statement(period_start, period_end)
        net_income = getattr(is_, "net_income", None)
        total_revenue = getattr(is_, "total_revenue", None)
        total_assets = getattr(bs, "total_assets", None)
        total_equity = getattr(bs, "total_equity", None)
        total_liabilities = getattr(bs, "total_liabilities", None)
        ni_float = float(net_income) if net_income is not None else 0.0
        free_cash_flows = [ni_float * ((1 + dcf_growth_rate) ** t) for t in range(dcf_explicit_years)]
        return {
            "net_income": net_income,
            "total_revenue": total_revenue,
            "total_assets": total_assets,
            "total_equity": total_equity,
            "total_liabilities": total_liabilities,
            "free_cash_flows": free_cash_flows,
            "report_date": str(getattr(bs, "report_date", period_end)),
        }

    def statement_of_cash_flows(
        self,
        period_start: date,
        period_end: date,
        beginning_cash: Decimal,
        ending_cash: Decimal,
    ) -> CashFlowStatement:
        return statement_of_cash_flows_indirect(
            self.gl, period_start, period_end, self.coa, beginning_cash, ending_cash
        )

    def validate_as_of(self, as_of: date) -> None:
        """Ensure Assets = Liabilities + Equity at as_of."""
        validate_ledger_at_date(self.gl, as_of, self.coa)

    def depreciation_schedule(
        self,
        method: DepreciationMethod,
        cost: Decimal,
        salvage_value: Decimal,
        useful_life_years: int,
        placed_in_service: date,
        asset_id: str = "",
        asset_description: str = "",
    ) -> DepreciationSchedule:
        return build_depreciation_schedule(
            method, cost, salvage_value, useful_life_years,
            placed_in_service, asset_id, asset_description
        )
