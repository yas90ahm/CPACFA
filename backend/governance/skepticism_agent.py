"""
CFA-level Skepticism Agent — Runs on journal entries to flag anomalies.
- Benford's Law: first-digit distribution vs expected (deviation suggests manipulation).
- Unusual weekend/holiday entries: entries dated Sat/Sun or configurable holidays.
- Round-sum entries: amounts that are exact multiples of 1000, 10000, etc.
Designed to run every 24 hours (e.g. cron or scheduler).
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Optional


# Benford's Law expected proportions for first digit 1–9
BENFORD_EXPECTED: dict[int, float] = {
    1: 0.301, 2: 0.176, 3: 0.125, 4: 0.097, 5: 0.079,
    6: 0.067, 7: 0.058, 8: 0.051, 9: 0.046,
}

ROUND_UNITS = [10_000_000, 5_000_000, 1_000_000, 500_000, 100_000, 50_000, 10_000, 5_000, 1_000, 500, 100]


@dataclass
class JournalEntryForScan:
    """Single journal entry for skepticism scan."""
    date: str  # YYYY-MM-DD
    description: str
    account_code: Optional[str] = None
    account_name: Optional[str] = None
    amount: Decimal = Decimal("0")
    debit_account: Optional[str] = None
    credit_account: Optional[str] = None
    entry_id: Optional[str] = None


@dataclass
class BenfordFlag:
    """Benford's Law deviation flag."""
    digit: int
    expected_proportion: float
    observed_proportion: float
    count: int
    total_count: int
    chi_square_contribution: float


@dataclass
class WeekendEntryFlag:
    """Entry dated on weekend."""
    date: str
    day_of_week: str
    description: str
    amount: str
    account_code: Optional[str] = None
    entry_id: Optional[str] = None


@dataclass
class RoundSumFlag:
    """Entry amount is a round sum (e.g. exact multiple of 10000)."""
    amount: str
    round_unit: int
    description: str
    date: str
    account_code: Optional[str] = None
    entry_id: Optional[str] = None


@dataclass
class SkepticismScanResult:
    """Result of running the Skepticism Agent on a set of entries."""
    scan_timestamp_utc: str
    entries_scanned: int
    benford_deviation_score: float  # 0–1, higher = more deviation
    benford_flags: list[BenfordFlag] = field(default_factory=list)
    weekend_flags: list[WeekendEntryFlag] = field(default_factory=list)
    round_sum_flags: list[RoundSumFlag] = field(default_factory=list)
    summary: str = ""
    passed: bool = True  # False if any high-severity flags


def _first_digit(n: Decimal) -> int:
    """First significant digit 1–9 for positive amounts."""
    a = abs(n)
    if a == 0:
        return 0
    while a < 1:
        a *= 10
    while a >= 10:
        a /= 10
    d = int(a)
    return d if 1 <= d <= 9 else 0


def _benford_analysis(amounts: list[Decimal]) -> tuple[float, list[BenfordFlag]]:
    """Benford's Law: compare observed first-digit distribution to expected. Returns deviation score and per-digit flags."""
    digit_counts: dict[int, int] = {d: 0 for d in range(1, 10)}
    valid = [a for a in amounts if a and abs(a) > 0]
    for a in valid:
        d = _first_digit(a)
        if 1 <= d <= 9:
            digit_counts[d] += 1
    n = len(valid)
    flags: list[BenfordFlag] = []
    chi_square = 0.0
    for d in range(1, 10):
        exp_p = BENFORD_EXPECTED[d]
        obs = digit_counts[d] / n if n > 0 else 0
        exp_count = n * exp_p
        if exp_count > 0:
            chi_square += (digit_counts[d] - exp_count) ** 2 / exp_count
        flags.append(BenfordFlag(
            digit=d,
            expected_proportion=exp_p,
            observed_proportion=obs,
            count=digit_counts[d],
            total_count=n,
            chi_square_contribution=(digit_counts[d] - exp_count) ** 2 / exp_count if exp_count > 0 else 0,
        ))
    # Normalize deviation to 0–1 (chi-square critical 8 df 0.05 ~ 15.5)
    deviation_score = min(1.0, chi_square / 20.0)
    return deviation_score, flags


def _is_weekend(d: date) -> bool:
    """Saturday=5, Sunday=6."""
    return d.weekday() >= 5


def _parse_date(s: str) -> Optional[date]:
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def run_skepticism_scan(
    entries: list[JournalEntryForScan],
    options: Optional[dict[str, Any]] = None,
) -> SkepticismScanResult:
    """
    Run CFA-level Skepticism Agent on journal entries.
    Flags: Benford's Law deviation, weekend entries, round-sum amounts.
    Designed to be run every 24 hours (e.g. cron calling this with latest entries).
    """
    from datetime import timezone
    scan_ts = datetime.now(timezone.utc).isoformat()
    opts = options or {}
    benford_threshold = float(opts.get("benford_deviation_threshold", 0.35))
    flag_weekends = opts.get("flag_weekend_entries", True)
    flag_round_sum_min_unit = int(opts.get("flag_round_sum_min_unit", 1000))

    amounts = [e.amount for e in entries if e.amount and abs(e.amount) > 0]
    weekend_flags: list[WeekendEntryFlag] = []
    round_sum_flags: list[RoundSumFlag] = []

    # Benford
    benford_deviation, benford_flags = _benford_analysis(amounts) if amounts else (0.0, [])

    # Weekend entries
    if flag_weekends:
        for e in entries:
            d = _parse_date(e.date)
            if d and _is_weekend(d):
                weekend_flags.append(WeekendEntryFlag(
                    date=e.date,
                    day_of_week=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.weekday()],
                    description=e.description,
                    amount=str(e.amount),
                    account_code=e.account_code,
                    entry_id=e.entry_id,
                ))

    # Round-sum
    for e in entries:
        a = abs(float(e.amount))
        if a < 100:
            continue
        for unit in ROUND_UNITS:
            if unit < flag_round_sum_min_unit:
                continue
            if math.isclose(a, round(a / unit) * unit, abs_tol=0.02):
                round_sum_flags.append(RoundSumFlag(
                    amount=str(e.amount),
                    round_unit=unit,
                    description=e.description,
                    date=e.date,
                    account_code=e.account_code,
                    entry_id=e.entry_id,
                ))
                break

    passed = benford_deviation < benford_threshold and (len(weekend_flags) + len(round_sum_flags)) < 20
    summary_parts = []
    if benford_deviation >= benford_threshold:
        summary_parts.append(f"Benford deviation score {benford_deviation:.2f} exceeds threshold {benford_threshold}; review first-digit distribution.")
    if weekend_flags:
        summary_parts.append(f"{len(weekend_flags)} entry/entries dated on weekend; unusual for typical closing.")
    if round_sum_flags:
        summary_parts.append(f"{len(round_sum_flags)} round-sum amount(s) (exact multiples of 1000+); flag for audit.")
    summary = " ".join(summary_parts) if summary_parts else "No anomalies flagged; scan passed."

    return SkepticismScanResult(
        scan_timestamp_utc=scan_ts,
        entries_scanned=len(entries),
        benford_deviation_score=round(benford_deviation, 4),
        benford_flags=benford_flags,
        weekend_flags=weekend_flags,
        round_sum_flags=round_sum_flags,
        summary=summary,
        passed=passed,
    )
