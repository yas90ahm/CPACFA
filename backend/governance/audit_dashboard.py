"""
Audit Dashboard store for Controller review.
Persists forensic anomalies (Benford, round-sum, unusual-time) so the Controller
can review them; the Forensic Skeptic does not alert the user who made the entry.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any, Optional

# ForensicAnomalyRecord-like: flag_type, entry_id, amount, entry_date, entry_time_utc,
# day_of_week, description, account_code, round_unit, created_by (all optional except flag_type)

_DB_PATH: Optional[Path] = None


def _get_db_path() -> Path:
    global _DB_PATH
    if _DB_PATH is None:
        base = Path(__file__).resolve().parent
        _DB_PATH = base / "audit_dashboard.db"
    return _DB_PATH


def _init_db(conn: sqlite3.Connection) -> None:
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS forensic_anomalies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_timestamp_utc TEXT NOT NULL,
            entry_id TEXT,
            flag_type TEXT NOT NULL,
            amount TEXT,
            entry_date TEXT,
            entry_time_utc TEXT,
            day_of_week TEXT,
            description TEXT,
            account_code TEXT,
            round_unit INTEGER,
            created_by TEXT,
            created_at_utc TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_forensic_scan_ts ON forensic_anomalies(scan_timestamp_utc);
        CREATE INDEX IF NOT EXISTS idx_forensic_created_by ON forensic_anomalies(created_by);
        CREATE INDEX IF NOT EXISTS idx_forensic_flag_type ON forensic_anomalies(flag_type);
    """)


def persist_forensic_anomalies(scan_timestamp_utc: str, anomalies: list[Any]) -> int:
    """Persist forensic anomalies to the Audit Dashboard store. Returns count inserted.
    Each item must have: flag_type, and optionally entry_id, amount, entry_date, entry_time_utc,
    day_of_week, description, account_code, round_unit, created_by (as attributes or dict keys).
    """
    path = _get_db_path()
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        count = 0
        for a in anomalies:
            entry_id = getattr(a, "entry_id", None) or (a.get("entry_id") if isinstance(a, dict) else None)
            flag_type = getattr(a, "flag_type", None) or (a.get("flag_type") if isinstance(a, dict) else "")
            amount = getattr(a, "amount", None) or (a.get("amount") if isinstance(a, dict) else None)
            entry_date = getattr(a, "entry_date", None) or (a.get("entry_date") if isinstance(a, dict) else None)
            entry_time_utc = getattr(a, "entry_time_utc", None) or (a.get("entry_time_utc") if isinstance(a, dict) else None)
            day_of_week = getattr(a, "day_of_week", None) or (a.get("day_of_week") if isinstance(a, dict) else None)
            description = getattr(a, "description", None) or (a.get("description") if isinstance(a, dict) else None)
            account_code = getattr(a, "account_code", None) or (a.get("account_code") if isinstance(a, dict) else None)
            round_unit = getattr(a, "round_unit", None) or (a.get("round_unit") if isinstance(a, dict) else None)
            created_by = getattr(a, "created_by", None) or (a.get("created_by") if isinstance(a, dict) else None)
            conn.execute(
                """INSERT INTO forensic_anomalies (
                    scan_timestamp_utc, entry_id, flag_type, amount, entry_date, entry_time_utc,
                    day_of_week, description, account_code, round_unit, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    scan_timestamp_utc,
                    entry_id,
                    flag_type,
                    amount,
                    entry_date,
                    entry_time_utc,
                    day_of_week,
                    description,
                    account_code,
                    round_unit,
                    created_by,
                ),
            )
            count += 1
        conn.commit()
        return count
    finally:
        conn.close()


def get_forensic_anomalies(
    limit: int = 500,
    scan_since: Optional[str] = None,
    created_by: Optional[str] = None,
    flag_type: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    List forensic anomalies for the Audit Dashboard (Controller view).
    Returns list of dicts with keys: id, scan_timestamp_utc, entry_id, flag_type, amount, entry_date,
    entry_time_utc, day_of_week, description, account_code, round_unit, created_by, created_at_utc.
    """
    path = _get_db_path()
    if not path.exists():
        return []
    conn = sqlite3.connect(str(path))
    try:
        _init_db(conn)
        conn.row_factory = sqlite3.Row
        q = "SELECT * FROM forensic_anomalies WHERE 1=1"
        params: list[Any] = []
        if scan_since:
            q += " AND scan_timestamp_utc >= ?"
            params.append(scan_since)
        if created_by:
            q += " AND created_by = ?"
            params.append(created_by)
        if flag_type:
            q += " AND flag_type = ?"
            params.append(flag_type)
        q += " ORDER BY created_at_utc DESC LIMIT ?"
        params.append(limit)
        cur = conn.execute(q, params)
        rows = cur.fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
