"""
Chain of Thought audit table — every compliance decision logged for human auditors.
Uses SQLite (stdlib) for portability; path configurable via env or default in project.
"""
from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional


@dataclass
class ChainOfThoughtRecord:
    """Single audit log row."""
    id: Optional[int]
    timestamp_utc: str
    event_type: str  # e.g. "tax_provision_calculation", "citation_check"
    reasoning: str
    citations: str  # JSON array or comma-separated
    proposed_entry: Optional[str]  # JSON
    outcome: str  # "allowed" | "blocked"
    warning_message: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None


def _default_db_path() -> str:
    base = os.environ.get("COMPLIANCE_AUDIT_DB", os.path.dirname(__file__))
    return os.path.join(base, "compliance_audit.db")


def _get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    path = db_path or _default_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_audit_db(db_path: Optional[str] = None) -> None:
    """Create the chain_of_thought table if it does not exist."""
    conn = _get_connection(db_path)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS chain_of_thought (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_utc TEXT NOT NULL,
                event_type TEXT NOT NULL,
                reasoning TEXT NOT NULL,
                citations TEXT NOT NULL,
                proposed_entry TEXT,
                outcome TEXT NOT NULL,
                warning_message TEXT,
                session_id TEXT,
                user_id TEXT
            )
        """)
        conn.commit()
    finally:
        conn.close()


def log_chain_of_thought(
    event_type: str,
    reasoning: str,
    citations: str,
    outcome: str,
    proposed_entry: Optional[dict[str, Any]] = None,
    warning_message: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """
    Insert one row into the Chain of Thought table. Returns the new row id.
    """
    init_audit_db(db_path)  # ensure table exists
    conn = _get_connection(db_path)
    try:
        ts = datetime.now(timezone.utc).isoformat()
        proposed_json = json.dumps(proposed_entry) if proposed_entry is not None else None
        cur = conn.execute(
            """
            INSERT INTO chain_of_thought
            (timestamp_utc, event_type, reasoning, citations, proposed_entry, outcome, warning_message, session_id, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts,
                event_type,
                reasoning,
                citations,
                proposed_json,
                outcome,
                warning_message,
                session_id,
                user_id,
            ),
        )
        conn.commit()
        return cur.lastrowid or 0
    finally:
        conn.close()


def get_audit_trail(
    limit: int = 100,
    event_type: Optional[str] = None,
    outcome: Optional[str] = None,
    db_path: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Return recent Chain of Thought rows for auditors."""
    init_audit_db(db_path)
    conn = _get_connection(db_path)
    try:
        sql = "SELECT * FROM chain_of_thought WHERE 1=1"
        params: list[Any] = []
        if event_type:
            sql += " AND event_type = ?"
            params.append(event_type)
        if outcome:
            sql += " AND outcome = ?"
            params.append(outcome)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r["id"],
                "timestamp_utc": r["timestamp_utc"],
                "event_type": r["event_type"],
                "reasoning": r["reasoning"],
                "citations": r["citations"],
                "proposed_entry": json.loads(r["proposed_entry"]) if r["proposed_entry"] else None,
                "outcome": r["outcome"],
                "warning_message": r["warning_message"],
                "session_id": r["session_id"],
                "user_id": r["user_id"],
            }
            for r in rows
        ]
    finally:
        conn.close()
