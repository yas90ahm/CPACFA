"""
Accounting Policy Monitor (consistency_check).
- Verify accounting treatment for similar items is consistent Year-over-Year.
- If treatment changes (e.g. R&D capitalized in Q1 → expensed in Q2), require
  a 'Change in Accounting Principle' justification (e.g. ASC 250-10-45).
- Ensure Chart of Accounts (COA) mapping has not drifted or been corrupted by messy user data.
"""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Account types expected in COA (align with models.AccountType)
VALID_ACCOUNT_TYPES = frozenset({"ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"})

# Treatment kinds for YoY comparison (e.g. R&D: capitalize vs expense)
TREATMENT_CAPITALIZE = "capitalize"
TREATMENT_EXPENSE = "expense"
TREATMENT_AMORTIZE = "amortize"
TREATMENT_DEFER = "defer"
TREATMENT_KINDS = frozenset({TREATMENT_CAPITALIZE, TREATMENT_EXPENSE, TREATMENT_AMORTIZE, TREATMENT_DEFER})


@dataclass
class TreatmentRecord:
    """Accounting treatment for an item in a period (e.g. R&D → capitalize in Q1)."""
    item_key: str  # e.g. "R&D", "Software development", "Revenue recognition"
    period: str     # e.g. "2024-Q1", "2024-Q2", "FY2024"
    treatment_kind: str  # capitalize | expense | amortize | defer
    account_code: Optional[str] = None
    citation: Optional[str] = None  # e.g. ASC 350-40, ASC 250-10-45


@dataclass
class PolicyChangeJustification:
    """Recorded justification for a change in accounting principle."""
    effective_date: str  # ISO date
    policy_area: str    # e.g. "R&D capitalization", "Revenue recognition"
    change_description: str
    citation: Optional[str] = None  # e.g. ASC 250-10-45
    reasoning: Optional[str] = None


@dataclass
class ConsistencyFlag:
    """A single consistency or COA issue."""
    flag_type: str  # treatment_change | missing_justification | coa_duplicate | coa_invalid_type | coa_orphan | coa_drift
    message: str
    item_key: Optional[str] = None
    period: Optional[str] = None
    prior_treatment: Optional[str] = None
    current_treatment: Optional[str] = None
    account_code: Optional[str] = None
    detail: Optional[str] = None


@dataclass
class ConsistencyReport:
    """Result of Accounting Policy Monitor run."""
    timestamp_utc: str
    period_current: str
    period_prior: Optional[str] = None
    passed: bool = True
    flags: list[ConsistencyFlag] = field(default_factory=list)
    coa_valid: bool = True
    summary: str = ""


_DB_PATH: Optional[Path] = None


def _get_db_path() -> Path:
    global _DB_PATH
    if _DB_PATH is None:
        base = Path(__file__).resolve().parent
        _DB_PATH = base / "consistency_monitor.db"
    return _DB_PATH


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS treatment_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_key TEXT NOT NULL,
            period TEXT NOT NULL,
            treatment_kind TEXT NOT NULL,
            account_code TEXT,
            citation TEXT,
            recorded_at_utc TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(item_key, period)
        );
        CREATE TABLE IF NOT EXISTS policy_change_justifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            effective_date TEXT NOT NULL,
            policy_area TEXT NOT NULL,
            change_description TEXT NOT NULL,
            citation TEXT,
            reasoning TEXT,
            recorded_at_utc TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_treatment_item_period ON treatment_history(item_key, period);
        CREATE INDEX IF NOT EXISTS idx_policy_effective ON policy_change_justifications(effective_date);
    """)


def record_treatment(record: TreatmentRecord) -> None:
    """Persist treatment for an item/period (upsert)."""
    path = _get_db_path()
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        conn.execute(
            """INSERT OR REPLACE INTO treatment_history
               (item_key, period, treatment_kind, account_code, citation, recorded_at_utc)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                record.item_key,
                record.period,
                record.treatment_kind,
                record.account_code,
                record.citation,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_treatments_for_period(period: str) -> list[TreatmentRecord]:
    """Load all treatment records for a given period."""
    path = _get_db_path()
    if not path.exists():
        return []
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        cur = conn.execute(
            "SELECT item_key, period, treatment_kind, account_code, citation FROM treatment_history WHERE period = ?",
            (period,),
        )
        rows = cur.fetchall()
        return [
            TreatmentRecord(
                item_key=r[0],
                period=r[1],
                treatment_kind=r[2],
                account_code=r[3],
                citation=r[4],
            )
            for r in rows
        ]
    finally:
        conn.close()


def record_policy_change_justification(justification: PolicyChangeJustification) -> None:
    """Record a Change in Accounting Principle justification (e.g. ASC 250-10-45)."""
    path = _get_db_path()
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        conn.execute(
            """INSERT INTO policy_change_justifications
               (effective_date, policy_area, change_description, citation, reasoning, recorded_at_utc)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                justification.effective_date,
                justification.policy_area,
                justification.change_description,
                justification.citation,
                justification.reasoning,
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
    finally:
        conn.close()


def get_policy_change_justifications(
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    policy_area: Optional[str] = None,
) -> list[PolicyChangeJustification]:
    """List recorded justifications (optionally filtered by period and policy_area)."""
    path = _get_db_path()
    if not path.exists():
        return []
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        q = "SELECT effective_date, policy_area, change_description, citation, reasoning FROM policy_change_justifications WHERE 1=1"
        params: list[Any] = []
        if period_start:
            q += " AND effective_date >= ?"
            params.append(period_start[:10])
        if period_end:
            q += " AND effective_date <= ?"
            params.append(period_end[:10])
        if policy_area:
            q += " AND (policy_area = ? OR policy_area LIKE ?)"
            params.append(policy_area)
            params.append(f"%{policy_area}%")
        q += " ORDER BY effective_date DESC"
        cur = conn.execute(q, params)
        rows = cur.fetchall()
        return [
            PolicyChangeJustification(
                effective_date=r[0],
                policy_area=r[1],
                change_description=r[2],
                citation=r[3],
                reasoning=r[4],
            )
            for r in rows
        ]
    finally:
        conn.close()


def _normalize_item_key(item: str) -> str:
    """Normalize item key for matching (e.g. R&D vs R&D costs)."""
    s = (item or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    for canonical in ("r&d", "research and development", "software development", "software", "revenue recognition", "revenue"):
        if canonical in s or s in canonical:
            return canonical
    return s or "unknown"


def _policy_area_matches_item(policy_area: str, item_key: str) -> bool:
    """True if the recorded policy area applies to this item (e.g. 'R&D' in policy_area and item_key)."""
    pa = (policy_area or "").lower()
    ik = (item_key or "").lower()
    if ik in pa or pa in ik:
        return True
    norm_ik = _normalize_item_key(item_key)
    if "r&d" in norm_ik and ("r&d" in pa or "research" in pa or "development" in pa):
        return True
    if "revenue" in norm_ik and "revenue" in pa:
        return True
    if "software" in norm_ik and ("software" in pa or "capitaliz" in pa):
        return True
    return False


# --- COA validation ---


def validate_coa(
    coa: list[dict[str, Any]] | dict[str, dict[str, Any]],
    description_to_account: Optional[list[tuple[str, str]]] = None,
    prior_description_to_account: Optional[list[tuple[str, str]]] = None,
) -> tuple[bool, list[ConsistencyFlag]]:
    """
    Ensure COA has not drifted or been corrupted.
    - Duplicate account codes
    - Invalid account_type (must be ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
    - Empty or malformed code/name
    - Orphan mappings: description→account where account not in COA
    - Drift: same description mapping to different account in prior period
    """
    flags: list[ConsistencyFlag] = []
    if isinstance(coa, dict):
        coa = coa or {}
        accounts = [{"code": k, "name": (v.get("name") or ""), "account_type": str((v.get("account_type") or "ASSET") if isinstance(v, dict) else "ASSET").strip().upper()} for k, v in coa.items()]
    else:
        accounts = list(coa) if coa else []

    seen_codes: set[str] = set()
    valid_codes: set[str] = set()

    for i, acc in enumerate(accounts):
        code = (acc.get("code") or acc.get("account_code") or "").strip()
        name = (acc.get("name") or "").strip()
        acc_type = (acc.get("account_type") or "ASSET").strip().upper()

        if not code:
            flags.append(ConsistencyFlag(
                flag_type="coa_invalid",
                message="Chart of Accounts has an entry with empty account code",
                account_code=code or None,
                detail=f"Row index {i}",
            ))
            continue
        if code in seen_codes:
            flags.append(ConsistencyFlag(
                flag_type="coa_duplicate",
                message=f"Duplicate account code in COA: {code}",
                account_code=code,
            ))
            continue
        seen_codes.add(code)
        valid_codes.add(code)

        if acc_type not in VALID_ACCOUNT_TYPES:
            flags.append(ConsistencyFlag(
                flag_type="coa_invalid_type",
                message=f"Invalid account_type '{acc_type}' for code {code}; must be one of {sorted(VALID_ACCOUNT_TYPES)}",
                account_code=code,
                detail=acc_type,
            ))
        if not name:
            flags.append(ConsistencyFlag(
                flag_type="coa_invalid",
                message=f"Empty account name for code {code}",
                account_code=code,
            ))

    # Orphan mappings: description → account not in COA
    if description_to_account:
        for desc, acode in description_to_account:
            acode = (acode or "").strip()
            if not acode:
                continue
            if acode not in valid_codes and acode not in seen_codes:
                flags.append(ConsistencyFlag(
                    flag_type="coa_orphan",
                    message=f"Description maps to account code '{acode}' which is not in Chart of Accounts",
                    account_code=acode,
                    detail=(desc or "")[:80],
                ))

    # Drift: same description → different account vs prior period
    if prior_description_to_account and description_to_account:
        prior_map = {desc.strip().lower(): acode.strip() for desc, acode in prior_description_to_account if (desc or "").strip() and (acode or "").strip()}
        for desc, acode in description_to_account:
            desc_n = (desc or "").strip().lower()
            acode = (acode or "").strip()
            if not desc_n or not acode:
                continue
            if desc_n in prior_map and prior_map[desc_n] != acode:
                flags.append(ConsistencyFlag(
                    flag_type="coa_drift",
                    message=f"Same description now maps to different account: '{desc_n[:40]}...' was {prior_map[desc_n]}, now {acode}",
                    account_code=acode,
                    detail=f"Prior: {prior_map[desc_n]}",
                ))

    return (len(flags) == 0, flags)


# --- Accounting Policy Monitor (YoY + justification) ---

def run_consistency_check(
    current_treatments: list[TreatmentRecord],
    prior_treatments: Optional[list[TreatmentRecord]] = None,
    coa: Optional[list[dict[str, Any]] | dict[str, dict[str, Any]]] = None,
    description_to_account: Optional[list[tuple[str, str]]] = None,
    prior_description_to_account: Optional[list[tuple[str, str]]] = None,
    period_current: str = "",
    period_prior: Optional[str] = None,
    recorded_justifications: Optional[list[PolicyChangeJustification]] = None,
) -> ConsistencyReport:
    """
    Accounting Policy Monitor: verify treatment consistency YoY and COA integrity.
    - If the bot capitalized R&D in Q1, it cannot suddenly expense it in Q2 without a
      'Change in Accounting Principle' justification (e.g. ASC 250-10-45).
    - COA: no duplicate codes, valid types, no orphan/drift in mappings.
    """
    ts = datetime.now(timezone.utc).isoformat()
    all_flags: list[ConsistencyFlag] = []
    coa_valid = True

    # 1) COA validation
    if coa is not None:
        coa_valid, coa_flags = validate_coa(coa, description_to_account, prior_description_to_account)
        all_flags.extend(coa_flags)

    # 2) YoY treatment consistency
    prior_by_item = {}
    if prior_treatments:
        for t in prior_treatments:
            prior_by_item[t.item_key] = t
            prior_by_item[_normalize_item_key(t.item_key)] = t
    if not prior_treatments and period_prior:
        prior_treatments = get_treatments_for_period(period_prior)
        for t in prior_treatments:
            prior_by_item[t.item_key] = t
            prior_by_item[_normalize_item_key(t.item_key)] = t

    justifications = list(recorded_justifications or [])
    if not justifications and period_current:
        # Load justifications for current period (effective date in range)
        justifications = get_policy_change_justifications(period_start=period_prior or "", period_end=period_current)

    for curr in current_treatments:
        key = curr.item_key
        norm = _normalize_item_key(key)
        prior = prior_by_item.get(key) or prior_by_item.get(norm)
        if not prior:
            continue
        if prior.treatment_kind == curr.treatment_kind:
            continue
        # Treatment changed: capitalize → expense, etc.
        has_justification = any(
            _policy_area_matches_item(j.policy_area, key) or _policy_area_matches_item(j.policy_area, norm)
            for j in justifications
        )
        if not has_justification:
            all_flags.append(ConsistencyFlag(
                flag_type="treatment_change",
                message=(
                    f"Accounting treatment for '{key}' changed from {prior.treatment_kind} to {curr.treatment_kind} "
                    "without a recorded 'Change in Accounting Principle' justification (e.g. ASC 250-10-45)."
                ),
                item_key=key,
                period=period_current,
                prior_treatment=prior.treatment_kind,
                current_treatment=curr.treatment_kind,
                detail="Record a policy change justification for this item/period before applying the new treatment.",
            ))

    passed = coa_valid and len(all_flags) == 0
    summary_parts = []
    if not coa_valid:
        summary_parts.append("COA validation failed; fix duplicate codes, invalid types, or orphan/drift mappings.")
    if any(f.flag_type == "treatment_change" for f in all_flags):
        summary_parts.append("Year-over-Year treatment inconsistency: one or more items changed treatment without a Change in Accounting Principle justification.")
    summary = " ".join(summary_parts) if summary_parts else "Accounting policy consistent across periods; COA valid."

    return ConsistencyReport(
        timestamp_utc=ts,
        period_current=period_current,
        period_prior=period_prior,
        passed=passed,
        flags=all_flags,
        coa_valid=coa_valid,
        summary=summary,
    )
