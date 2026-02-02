"""
FinOS ERP Bridge — Read GL, Write Draft Journal Entries only, Dynamic COA mapper.
- Read: General Ledger (live) — read-only.
- Write: Draft Journal Entries only. AI can NEVER post to Live; human must Approve in UI.
- Mapping: Dynamic mapper from messy human descriptions to Chart of Accounts.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4


# --- Data models ---

@dataclass
class COAMapping:
    """Result of mapping a description to Chart of Accounts."""
    account_code: str
    account_name: str
    confidence: float  # 0.0–1.0
    needs_review: bool


@dataclass
class GLEntryView:
    """Single GL line (read view)."""
    date: str
    description: str
    account_code: str
    account_name: str
    debit: Decimal
    credit: Decimal
    entry_id: Optional[str] = None


@dataclass
class DraftEntry:
    """Draft journal entry (not posted to live)."""
    id: str
    date: str
    description: str
    debit_account: str
    debit_account_name: str
    credit_account: str
    credit_account_name: str
    amount: Decimal
    created_at: str
    source: str = "erp_bridge"  # e.g. "mcp_agent"
    raw_description: Optional[str] = None  # original human description before mapping


# --- Default COA rules (dynamic mapper): pattern → (code, name) ---
DEFAULT_COA_RULES: list[tuple[str, str, str]] = [
    (r"aws|amazon web services|azure|gcp|google cloud|cloud|infrastructure", "5100", "IT Infrastructure"),
    (r"software|saas|subscription|license|microsoft|slack|zoom", "5100", "IT Infrastructure"),
    (r"invoice|bill|payment to|payable", "6000", "Accounts Payable"),
    (r"salary|payroll|wages|compensation|payroll", "7100", "Payroll"),
    (r"rent|lease|premises|office space", "7200", "Rent & Occupancy"),
    (r"utilities|electric|gas|water|internet|telecom", "7300", "Utilities"),
    (r"insurance", "7400", "Insurance"),
    (r"legal|lawyer|attorney|audit|accounting fee", "7500", "Legal & Professional"),
    (r"office supplies|stationery|supplies", "7600", "Office Supplies"),
    (r"travel|flight|hotel|per diem|mileage", "7700", "Travel & Expense"),
    (r"marketing|advertising|ads|promo", "7800", "Marketing"),
    (r"bank fee|interest expense|fee|charges", "7900", "Bank & Interest"),
    (r"revenue|sales|income|receipt|customer payment", "4000", "Revenue"),
    (r"refund|rebate|credit memo", "4100", "Refunds & Rebates"),
    (r"cash|bank|deposit", "1000", "Cash"),
    (r"receivable|ar|customer balance", "1200", "Accounts Receivable"),
    (r"inventory|goods|stock", "1300", "Inventory"),
    (r"prepaid|deposit paid", "1400", "Prepaid Expenses"),
    (r"equipment|fixed asset|ppe|asset purchase", "1500", "Property & Equipment"),
    (r"loan|debt|borrowing", "2000", "Loans Payable"),
    (r"equity|capital|owner", "3000", "Equity"),
]


def map_description_to_coa(
    description: str,
    rules: Optional[list[tuple[str, str, str]]] = None,
    confidence_threshold: float = 0.85,
) -> COAMapping:
    """
    Dynamic mapper: translate messy human description into Chart of Accounts (code + name).
    Uses keyword/regex rules; extend with ML or external service in production.
    """
    desc = (description or "").strip().lower()
    if not desc:
        return COAMapping(account_code="9999", account_name="Unclassified", confidence=0.0, needs_review=True)

    rule_list = rules or DEFAULT_COA_RULES
    best_confidence = 0.0
    best_code = "9999"
    best_name = "Unclassified"

    for pattern, code, name in rule_list:
        try:
            if re.search(pattern, desc, re.IGNORECASE):
                best_confidence = 0.88
                best_code = code
                best_name = name
                break
        except re.error:
            if pattern.lower() in desc:
                best_confidence = 0.85
                best_code = code
                best_name = name
                break

    if best_code != "9999" and len(desc) >= 8:
        best_confidence = min(1.0, best_confidence + 0.06)
    needs_review = best_confidence < confidence_threshold
    return COAMapping(
        account_code=best_code,
        account_name=best_name,
        confidence=round(best_confidence, 2),
        needs_review=needs_review,
    )


# --- In-memory stores (replace with real ERP/DB in production) ---

_live_entries: list[dict[str, Any]] = []
_draft_entries: list[DraftEntry] = []
_default_coa: dict[str, str] = {}  # code -> name (filled from rules)


def _ensure_default_coa() -> None:
    global _default_coa
    if _default_coa:
        return
    for _p, code, name in DEFAULT_COA_RULES:
        _default_coa[code] = name
    for code in ["1000", "1200", "1300", "1400", "1500", "2000", "3000", "4000", "4100", "5100", "6000", "7100", "7200", "7300", "7400", "7500", "7600", "7700", "7800", "7900", "9999"]:
        _default_coa.setdefault(code, "Other" if code == "9999" else _default_coa.get(code, code))


def get_account_name(code: str) -> str:
    _ensure_default_coa()
    return _default_coa.get(code, code)


# --- Read: General Ledger (live only; no write to live from here) ---

def read_gl(as_of: Optional[date] = None, limit: int = 500) -> dict[str, Any]:
    """
    Read General Ledger (live). Read-only; no side effects.
    Returns trial balance style lines and optional raw entries.
    """
    _ensure_default_coa()
    as_of = as_of or date.today()
    # Use in-memory live entries; in production replace with ERP API
    lines: list[dict[str, Any]] = []
    seen: dict[str, list[Decimal]] = {}
    for e in _live_entries:
        edate = e.get("date")
        if isinstance(edate, str):
            try:
                d = date.fromisoformat(edate[:10])
            except Exception:
                d = date.today()
        else:
            d = date.today()
        if d > as_of:
            continue
        for key, mult in [("debit_account", Decimal("1")), ("credit_account", Decimal("-1"))]:
            acc = e.get(key)
            if not acc:
                continue
            amt = Decimal(str(e.get("amount", 0))) * mult
            if acc not in seen:
                seen[acc] = [Decimal("0"), Decimal("0")]
            if mult > 0:
                seen[acc][0] += amt
            else:
                seen[acc][1] += -amt
    for acc, (debit, credit) in seen.items():
        lines.append({
            "account_code": acc,
            "account_name": get_account_name(acc),
            "debit": str(debit),
            "credit": str(credit),
        })
    lines.sort(key=lambda x: x["account_code"])
    total_debits = sum(Decimal(l["debit"]) for l in lines)
    total_credits = sum(Decimal(l["credit"]) for l in lines)
    return {
        "as_of": as_of.isoformat(),
        "lines": lines[:limit],
        "total_debits": str(total_debits),
        "total_credits": str(total_credits),
        "balances": total_debits == total_credits,
    }


def seed_live_entries(entries: list[dict[str, Any]]) -> None:
    """Seed live GL for demo; in production this is the real ERP."""
    global _live_entries
    _live_entries = list(entries)


# --- Write: Draft Journal Entries only (AI never posts to live) ---

def create_draft_journal_entry(
    date_str: str,
    description: str,
    amount: str | Decimal,
    debit_account: Optional[str] = None,
    credit_account: Optional[str] = None,
    raw_description: Optional[str] = None,
    source: str = "mcp_agent",
) -> DraftEntry:
    """
    Create a DRAFT journal entry only. Never posts to live ledger.
    If debit/credit accounts not provided, uses dynamic COA mapper on description
    (single-line: debit expense, credit cash by default).
    """
    _ensure_default_coa()
    amt = Decimal(str(amount))
    raw = raw_description or description
    if debit_account and credit_account:
        debit_name = get_account_name(debit_account)
        credit_name = get_account_name(credit_account)
    else:
        # Map description to expense (or revenue) side; other side defaults to Cash
        mapping = map_description_to_coa(description)
        # Heuristic: if description sounds like revenue, credit revenue and debit cash; else debit expense, credit cash
        desc_lower = description.lower()
        if any(x in desc_lower for x in ["revenue", "sales", "income", "receipt", "customer payment"]):
            debit_account = debit_account or "1000"
            credit_account = credit_account or mapping.account_code
        else:
            debit_account = debit_account or mapping.account_code
            credit_account = credit_account or "1000"
        debit_name = get_account_name(debit_account)
        credit_name = get_account_name(credit_account)

    draft = DraftEntry(
        id=str(uuid4()),
        date=date_str,
        description=description,
        debit_account=debit_account,
        debit_account_name=debit_name,
        credit_account=credit_account,
        credit_account_name=credit_name,
        amount=amt,
        created_at=datetime.now(timezone.utc).isoformat(),
        source=source,
        raw_description=raw,
    )
    _draft_entries.append(draft)
    return draft


def list_draft_entries(limit: int = 100) -> list[dict[str, Any]]:
    """List draft journal entries (for UI / approval queue)."""
    out = []
    for e in reversed(_draft_entries[-limit:]):
        out.append({
            "id": e.id,
            "date": e.date,
            "description": e.description,
            "debit_account": e.debit_account,
            "debit_account_name": e.debit_account_name,
            "credit_account": e.credit_account,
            "credit_account_name": e.credit_account_name,
            "amount": str(e.amount),
            "created_at": e.created_at,
            "source": e.source,
            "raw_description": e.raw_description,
        })
    return out


def get_draft_entry(entry_id: str) -> Optional[DraftEntry]:
    """Get a single draft by id."""
    for e in _draft_entries:
        if e.id == entry_id:
            return e
    return None


# --- Explicit: NO function to post to Live. Human Approve in UI only. ---
# Posting to live ledger must be done by the frontend/backend only after
# human clicks "Approve", and must not be exposed as an MCP tool to the AI.
