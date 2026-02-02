"""
Immutable Audit Trail — Records every LLM decision, prompt, and financial data accessed.
Secure, read-only database: append-only (no UPDATE/DELETE). Optional hash chain for integrity.
"""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from typing import Any, Optional


def _default_db_path() -> str:
    base = os.environ.get("GOVERNANCE_AUDIT_DB", os.path.dirname(__file__))
    return os.path.join(base, "governance_audit.db")


def _get_connection(db_path: Optional[str] = None, read_only: bool = False) -> sqlite3.Connection:
    path = db_path or _default_db_path()
    if read_only:
        uri = f"file:{path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db(db_path: Optional[str] = None) -> None:
    """Create append-only table. Enforce immutability via trigger: no UPDATE/DELETE."""
    path = db_path or _default_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS llm_decision_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_utc TEXT NOT NULL,
                prompt TEXT NOT NULL,
                financial_data_accessed TEXT NOT NULL,
                decision_summary TEXT NOT NULL,
                agent_type TEXT NOT NULL,
                request_id TEXT,
                previous_hash TEXT,
                row_hash TEXT,
                endpoint TEXT
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_llm_log_ts ON llm_decision_log(timestamp_utc);
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_llm_log_agent ON llm_decision_log(agent_type);
        """)
        # Prevent UPDATE and DELETE on this table (SQLite trigger)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS llm_log_immutable_update
            BEFORE UPDATE ON llm_decision_log
            BEGIN
                SELECT RAISE(ABORT, 'llm_decision_log is immutable: UPDATE not allowed');
            END
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS llm_log_immutable_delete
            BEFORE DELETE ON llm_decision_log
            BEGIN
                SELECT RAISE(ABORT, 'llm_decision_log is immutable: DELETE not allowed');
            END
        """)
        conn.commit()
    finally:
        conn.close()


def _compute_row_hash(
    timestamp_utc: str,
    prompt: str,
    financial_data_accessed: str,
    decision_summary: str,
    agent_type: str,
    previous_hash: Optional[str],
) -> str:
    """Compute SHA-256 hash of this row plus previous_hash for chain integrity."""
    payload = f"{timestamp_utc}|{prompt}|{financial_data_accessed}|{decision_summary}|{agent_type}|{previous_hash or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log_llm_decision(
    prompt: str,
    decision_summary: str,
    agent_type: str,
    financial_data_accessed: Optional[dict[str, Any]] = None,
    request_id: Optional[str] = None,
    endpoint: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """
    Append one immutable record: LLM decision, prompt, and financial data accessed.
    Returns the new row id. No UPDATE/DELETE is possible on this table.
    """
    _init_db(db_path)
    conn = _get_connection(db_path)
    try:
        ts = datetime.now(timezone.utc).isoformat()
        data_json = json.dumps(financial_data_accessed) if financial_data_accessed is not None else "{}"
        # Get previous row hash for chain
        prev = conn.execute(
            "SELECT row_hash FROM llm_decision_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        previous_hash = prev["row_hash"] if prev and prev["row_hash"] else None
        row_hash = _compute_row_hash(ts, prompt, data_json, decision_summary, agent_type, previous_hash)
        cur = conn.execute(
            """
            INSERT INTO llm_decision_log
            (timestamp_utc, prompt, financial_data_accessed, decision_summary, agent_type, request_id, previous_hash, row_hash, endpoint)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (ts, prompt, data_json, decision_summary, agent_type, request_id, previous_hash, row_hash, endpoint),
        )
        conn.commit()
        return cur.lastrowid or 0
    finally:
        conn.close()


def read_llm_decision_log(
    limit: int = 100,
    agent_type: Optional[str] = None,
    since_iso: Optional[str] = None,
    db_path: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Read-only query of the audit log. Use for auditors; no writes.
    """
    _init_db(db_path)
    conn = _get_connection(db_path, read_only=True)
    try:
        sql = "SELECT id, timestamp_utc, prompt, financial_data_accessed, decision_summary, agent_type, request_id, previous_hash, row_hash, endpoint FROM llm_decision_log WHERE 1=1"
        params: list[Any] = []
        if agent_type:
            sql += " AND agent_type = ?"
            params.append(agent_type)
        if since_iso:
            sql += " AND timestamp_utc >= ?"
            params.append(since_iso)
        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r["id"],
                "timestamp_utc": r["timestamp_utc"],
                "prompt": r["prompt"],
                "financial_data_accessed": json.loads(r["financial_data_accessed"]) if r["financial_data_accessed"] else {},
                "decision_summary": r["decision_summary"],
                "agent_type": r["agent_type"],
                "request_id": r["request_id"],
                "previous_hash": r["previous_hash"],
                "row_hash": r["row_hash"],
                "endpoint": r["endpoint"],
            }
            for r in rows
        ]
    finally:
        conn.close()


def verify_chain(db_path: Optional[str] = None) -> dict[str, Any]:
    """Verify hash chain integrity; returns ok and first broken id if any."""
    _init_db(db_path)
    conn = _get_connection(db_path, read_only=True)
    try:
        rows = conn.execute(
            "SELECT id, timestamp_utc, prompt, financial_data_accessed, decision_summary, agent_type, previous_hash, row_hash FROM llm_decision_log ORDER BY id ASC"
        ).fetchall()
        prev_hash = None
        for r in rows:
            expected = _compute_row_hash(
                r["timestamp_utc"],
                r["prompt"],
                r["financial_data_accessed"],
                r["decision_summary"],
                r["agent_type"],
                r["previous_hash"],
            )
            if expected != r["row_hash"]:
                return {"ok": False, "broken_id": r["id"], "message": "Row hash mismatch"}
            if r["previous_hash"] != prev_hash:
                return {"ok": False, "broken_id": r["id"], "message": "Chain link broken"}
            prev_hash = r["row_hash"]
        return {"ok": True, "message": "Chain integrity verified"}
    finally:
        conn.close()
