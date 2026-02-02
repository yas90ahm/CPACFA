"""
Forensic Skeptic Agent.
- Every 24 hours or upon file upload: Benford's Law + round-sum + unusual-time checks.
- Do not alert the user who made the entry; flag for Audit Dashboard for Controller review.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any, Optional

from .skepticism_agent import (
    BENFORD_EXPECTED,
    ROUND_UNITS,
    _benford_analysis,
    _first_digit,
    _parse_date,
    JournalEntryForScan,
)

# Unusual time: e.g. 2:00 AM - 5:59 AM (off-hours), or Sunday 2 AM
UNUSUAL_HOUR_START = 0   # midnight
UNUSUAL_HOUR_END = 6    # 6 AM (flag 0-5)
WEEKEND_DAYS = (5, 6)   # Saturday, Sunday


@dataclass
class ForensicEntryForScan:
    """Journal entry with optional timestamp and creator for forensic scan."""
    date: str
    description: str
    amount: Decimal = Decimal("0")
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    entry_id: Optional[str] = None
    created_at: Optional[str] = None  # ISO datetime e.g. "2025-01-29T02:00:00Z"
    created_by: Optional[str] = None  # user_id who made the entry


@dataclass
class ForensicAnomalyRecord:
    """Single anomaly to persist to Audit Dashboard."""
    flag_type: str  # "benford" | "round_sum" | "unusual_time" | "weekend"
    entry_id: Optional[str] = None
    amount: Optional[str] = None
    entry_date: Optional[str] = None
    entry_time_utc: Optional[str] = None
    day_of_week: Optional[str] = None
    description: Optional[str] = None
    account_code: Optional[str] = None
    round_unit: Optional[int] = None
    created_by: Optional[str] = None


@dataclass
class ForensicScanResult:
    """Result of Forensic Skeptic scan."""
    scan_timestamp_utc: str
    entries_scanned: int
    benford_deviation_score: float
    anomalies_for_dashboard: int  # total persisted
    summary: str
    passed: bool
    # Anomalies to show to requesting user (excluding those they created)
    round_sum_flags: list[dict[str, Any]] = field(default_factory=list)
    unusual_time_flags: list[dict[str, Any]] = field(default_factory=list)
    weekend_flags: list[dict[str, Any]] = field(default_factory=list)
    benford_flags: list[dict[str, Any]] = field(default_factory=list)


def _parse_datetime(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        if "T" in s:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        return datetime.fromisoformat(s[:10] + "T00:00:00+00:00")
    except Exception:
        return None


def _is_unusual_time(dt: datetime) -> bool:
    """Flag 00:00-05:59 UTC as unusual (e.g. 2 AM)."""
    hour = dt.hour
    return UNUSUAL_HOUR_START <= hour < UNUSUAL_HOUR_END


def _is_weekend(d: date) -> bool:
    return d.weekday() in WEEKEND_DAYS


def _to_scan_entry(e: ForensicEntryForScan) -> JournalEntryForScan:
    return JournalEntryForScan(
        date=e.date,
        description=e.description,
        account_code=e.account_code,
        account_name=e.account_name,
        amount=e.amount,
        debit_account=e.debit_account,
        credit_account=e.credit_account,
        entry_id=e.entry_id,
    )


def run_forensic_scan(
    entries: list[ForensicEntryForScan],
    requesting_user_id: Optional[str] = None,
    options: Optional[dict[str, Any]] = None,
) -> ForensicScanResult:
    """
    Run Forensic Skeptic: Benford's Law, round-sum, unusual-time (e.g. 2 AM Sunday).
    Persist all anomalies to Audit Dashboard. Do not include in response the anomalies
    where created_by == requesting_user_id (do not alert that user).
    """
    from datetime import timezone as tz
    scan_ts = datetime.now(tz.utc).isoformat()
    opts = options or {}
    benford_threshold = float(opts.get("benford_deviation_threshold", 0.35))
    flag_round_sum_min_unit = int(opts.get("flag_round_sum_min_unit", 1000))
    flag_unusual_time = opts.get("flag_unusual_time", True)
    flag_weekend = opts.get("flag_weekend_entries", True)

    # Benford on amounts
    amounts = [e.amount for e in entries if e.amount and abs(e.amount) > 0]
    benford_deviation, benford_flags_list = _benford_analysis(amounts) if amounts else (0.0, [])

    anomalies_to_persist: list[ForensicAnomalyRecord] = []
    round_sum_for_response: list[dict[str, Any]] = []
    unusual_time_for_response: list[dict[str, Any]] = []
    weekend_for_response: list[dict[str, Any]] = []

    # Round-sum
    for e in entries:
        a = abs(float(e.amount))
        if a < 100:
            continue
        for unit in ROUND_UNITS:
            if unit < flag_round_sum_min_unit:
                continue
            if math.isclose(a, round(a / unit) * unit, abs_tol=0.02):
                rec = ForensicAnomalyRecord(
                    flag_type="round_sum",
                    entry_id=e.entry_id,
                    amount=str(e.amount),
                    entry_date=e.date,
                    description=e.description,
                    account_code=e.account_code,
                    round_unit=unit,
                    created_by=e.created_by,
                )
                anomalies_to_persist.append(rec)
                if e.created_by != requesting_user_id:
                    round_sum_for_response.append({
                        "amount": str(e.amount),
                        "round_unit": unit,
                        "description": e.description,
                        "date": e.date,
                        "account_code": e.account_code,
                        "entry_id": e.entry_id,
                        "created_by": e.created_by,
                    })
                break

    # Unusual time and weekend (using created_at if present, else date)
    for e in entries:
        dt = _parse_datetime(e.created_at)
        d = _parse_date(e.date)
        entry_time_utc = None
        day_of_week = None
        if d:
            day_of_week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()]
        if dt:
            entry_time_utc = dt.strftime("%H:%M:%S")
            if flag_unusual_time and _is_unusual_time(dt):
                rec = ForensicAnomalyRecord(
                    flag_type="unusual_time",
                    entry_id=e.entry_id,
                    amount=str(e.amount),
                    entry_date=e.date,
                    entry_time_utc=entry_time_utc,
                    day_of_week=day_of_week,
                    description=e.description,
                    account_code=e.account_code,
                    created_by=e.created_by,
                )
                anomalies_to_persist.append(rec)
                if e.created_by != requesting_user_id:
                    unusual_time_for_response.append({
                        "date": e.date,
                        "time_utc": entry_time_utc,
                        "day_of_week": day_of_week,
                        "description": e.description,
                        "amount": str(e.amount),
                        "account_code": e.account_code,
                        "entry_id": e.entry_id,
                        "created_by": e.created_by,
                    })
        if d and flag_weekend and _is_weekend(d):
            rec = ForensicAnomalyRecord(
                flag_type="weekend",
                entry_id=e.entry_id,
                amount=str(e.amount),
                entry_date=e.date,
                day_of_week=day_of_week,
                description=e.description,
                account_code=e.account_code,
                created_by=e.created_by,
            )
            anomalies_to_persist.append(rec)
            if e.created_by != requesting_user_id:
                weekend_for_response.append({
                    "date": e.date,
                    "day_of_week": day_of_week or "",
                    "description": e.description,
                    "amount": str(e.amount),
                    "account_code": e.account_code,
                    "entry_id": e.entry_id,
                    "created_by": e.created_by,
                })

    # Benford: if deviation exceeds threshold, add one aggregate "benford" anomaly for the scan
    if benford_deviation >= benford_threshold and amounts:
        anomalies_to_persist.append(ForensicAnomalyRecord(
            flag_type="benford",
            amount=None,
            description=f"Benford deviation {benford_deviation:.2f} exceeds threshold {benford_threshold}",
            created_by=None,
        ))

    # Persist to Audit Dashboard
    try:
        from .audit_dashboard import persist_forensic_anomalies
        persisted = persist_forensic_anomalies(scan_ts, anomalies_to_persist)
    except Exception:
        persisted = 0

    # Build summary
    summary_parts = []
    if benford_deviation >= benford_threshold:
        summary_parts.append(
            f"Benford deviation {benford_deviation:.2f} exceeds threshold; first-digit distribution flagged for Controller."
        )
    if round_sum_for_response or any(a.flag_type == "round_sum" for a in anomalies_to_persist):
        n_round = sum(1 for a in anomalies_to_persist if a.flag_type == "round_sum")
        summary_parts.append(f"{n_round} round-sum entr(y/ies) flagged for Audit Dashboard.")
    if unusual_time_for_response or any(a.flag_type == "unusual_time" for a in anomalies_to_persist):
        n_time = sum(1 for a in anomalies_to_persist if a.flag_type == "unusual_time")
        summary_parts.append(f"{n_time} unusual-time entr(y/ies) flagged for Audit Dashboard.")
    if weekend_for_response or any(a.flag_type == "weekend" for a in anomalies_to_persist):
        n_week = sum(1 for a in anomalies_to_persist if a.flag_type == "weekend")
        summary_parts.append(f"{n_week} weekend entr(y/ies) flagged for Audit Dashboard.")
    summary = " ".join(summary_parts) if summary_parts else "No anomalies; scan passed."

    passed = benford_deviation < benford_threshold and len(anomalies_to_persist) == 0

    benford_for_response = []
    if benford_deviation >= benford_threshold:
        for f in benford_flags_list:
            benford_for_response.append({
                "digit": f.digit,
                "expected_proportion": f.expected_proportion,
                "observed_proportion": f.observed_proportion,
                "count": f.count,
                "total_count": f.total_count,
            })

    return ForensicScanResult(
        scan_timestamp_utc=scan_ts,
        entries_scanned=len(entries),
        benford_deviation_score=round(benford_deviation, 4),
        anomalies_for_dashboard=persisted,
        summary=summary,
        passed=passed,
        round_sum_flags=round_sum_for_response,
        unusual_time_flags=unusual_time_for_response,
        weekend_flags=weekend_for_response,
        benford_flags=benford_for_response,
    )
