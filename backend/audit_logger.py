"""
Black Box recording system for the AI.

Requirement: Every prompt, internal thought (<thought_process>), Python code execution,
and final response must be saved to a read-only database.

- Default: SQLite append-only (black_box_audit.db) with triggers preventing UPDATE/DELETE.
- Alternative: Supabase or bitemporal DB (e.g. XTDB) can be used by implementing an
  adapter that satisfies the same insert/query contract and setting BLACK_BOX_BACKEND=supabase|xtdb
  (adapter implementation is project-specific).

Metadata per entry: Timestamp, Model ID, User ID, Authority Level (viewer|accountant|controller|auditor|system).

Audit view: generate_reconstruction_report(date_from, date_to, query=...) answers
"Why did you approve this $50k capitalization in June?" by pulling the exact logs
from that date and returning a timeline and explanation.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

# Entry types for the Black Box
ENTRY_PROMPT = "prompt"
ENTRY_THOUGHT_PROCESS = "thought_process"
ENTRY_PYTHON_EXECUTION = "python_execution"
ENTRY_FINAL_RESPONSE = "final_response"

AUTHORITY_LEVELS = ("viewer", "accountant", "controller", "auditor", "system")


@dataclass
class BlackBoxEntry:
    """One Black Box log entry (before persistence)."""
    entry_type: str  # prompt | thought_process | python_execution | final_response
    payload: str  # raw content (prompt text, XML thought, code+result, response)
    timestamp_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    model_id: Optional[str] = None
    user_id: Optional[str] = None
    authority_level: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    # Optional structured payload for querying (e.g. {"amount": 50000, "topic": "capitalization"})
    meta: Optional[dict[str, Any]] = None


def _default_db_path() -> str:
    base = os.environ.get("BLACK_BOX_DB_PATH", os.path.dirname(__file__))
    return os.path.join(base, "black_box_audit.db")


def _get_connection(db_path: Optional[str] = None, read_only: bool = False) -> sqlite3.Connection:
    path = db_path or _default_db_path()
    if read_only:
        uri = f"file:{path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def init_black_box_db(db_path: Optional[str] = None) -> None:
    """
    Create the Black Box table if it does not exist.
    Append-only: triggers prevent UPDATE/DELETE (read-only for auditors).
    """
    path = db_path or _default_db_path()
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS black_box_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp_utc TEXT NOT NULL,
                model_id TEXT,
                user_id TEXT,
                authority_level TEXT,
                session_id TEXT,
                request_id TEXT,
                entry_type TEXT NOT NULL,
                payload TEXT NOT NULL,
                meta TEXT,
                created_at_utc TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_black_box_ts ON black_box_log(timestamp_utc);
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_black_box_user ON black_box_log(user_id);
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_black_box_type ON black_box_log(entry_type);
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_black_box_session ON black_box_log(session_id);
        """)
        # Immutable: no UPDATE/DELETE (read-only audit trail)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS black_box_immutable_update
            BEFORE UPDATE ON black_box_log
            BEGIN
                SELECT RAISE(ABORT, 'black_box_log is immutable: UPDATE not allowed');
            END
        """)
        conn.execute("""
            CREATE TRIGGER IF NOT EXISTS black_box_immutable_delete
            BEFORE DELETE ON black_box_log
            BEGIN
                SELECT RAISE(ABORT, 'black_box_log is immutable: DELETE not allowed');
            END
        """)
        conn.commit()
    finally:
        conn.close()


def _insert_entry(
    entry_type: str,
    payload: str,
    timestamp_utc: str,
    model_id: Optional[str],
    user_id: Optional[str],
    authority_level: Optional[str],
    session_id: Optional[str],
    request_id: Optional[str],
    meta: Optional[dict[str, Any]],
    db_path: Optional[str],
) -> int:
    init_black_box_db(db_path)
    conn = _get_connection(db_path)
    try:
        meta_json = json.dumps(meta) if meta is not None else None
        cur = conn.execute(
            """
            INSERT INTO black_box_log
            (timestamp_utc, model_id, user_id, authority_level, session_id, request_id, entry_type, payload, meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                timestamp_utc,
                model_id,
                user_id,
                authority_level,
                session_id,
                request_id,
                entry_type,
                payload,
                meta_json,
            ),
        )
        conn.commit()
        return cur.lastrowid or 0
    finally:
        conn.close()


def record_prompt(
    prompt: str,
    model_id: Optional[str] = None,
    user_id: Optional[str] = None,
    authority_level: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """Record the user (or system) prompt. Returns row id."""
    ts = datetime.now(timezone.utc).isoformat()
    return _insert_entry(
        ENTRY_PROMPT,
        prompt,
        ts,
        model_id,
        user_id,
        authority_level,
        session_id,
        request_id,
        None,
        db_path,
    )


def record_thought_process(
    thought_process: str,
    model_id: Optional[str] = None,
    user_id: Optional[str] = None,
    authority_level: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> int:
    """Record internal thought (<thought_process> XML or text). Returns row id."""
    ts = datetime.now(timezone.utc).isoformat()
    return _insert_entry(
        ENTRY_THOUGHT_PROCESS,
        thought_process,
        ts,
        model_id,
        user_id,
        authority_level,
        session_id,
        request_id,
        None,
        db_path,
    )


def record_python_execution(
    code: str,
    result_summary: str,
    success: bool = True,
    model_id: Optional[str] = None,
    user_id: Optional[str] = None,
    authority_level: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    full_result: Optional[dict[str, Any]] = None,
    db_path: Optional[str] = None,
) -> int:
    """Record Python code execution (e.g. Quantitative Agent). Returns row id."""
    ts = datetime.now(timezone.utc).isoformat()
    payload = json.dumps({
        "code": code,
        "result_summary": result_summary,
        "success": success,
        "full_result": full_result,
    }, default=str)
    return _insert_entry(
        ENTRY_PYTHON_EXECUTION,
        payload,
        ts,
        model_id,
        user_id,
        authority_level,
        session_id,
        request_id,
        None,
        db_path,
    )


def record_final_response(
    response: str,
    model_id: Optional[str] = None,
    user_id: Optional[str] = None,
    authority_level: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    meta: Optional[dict[str, Any]] = None,
    db_path: Optional[str] = None,
) -> int:
    """Record the final response sent to the user. Returns row id."""
    ts = datetime.now(timezone.utc).isoformat()
    return _insert_entry(
        ENTRY_FINAL_RESPONSE,
        response,
        ts,
        model_id,
        user_id,
        authority_level,
        session_id,
        request_id,
        meta,
        db_path,
    )


def record_interaction(
    prompt: str,
    thought_process: Optional[str] = None,
    python_executions: Optional[list[dict[str, Any]]] = None,
    final_response: str = "",
    model_id: Optional[str] = None,
    user_id: Optional[str] = None,
    authority_level: Optional[str] = None,
    session_id: Optional[str] = None,
    request_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> list[int]:
    """
    Record a full interaction: prompt, optional thought_process, optional Python runs, final response.
    Returns list of row ids in order.
    """
    ids: list[int] = []
    ts = datetime.now(timezone.utc).isoformat()
    def insert(entry_type: str, payload: str, meta: Optional[dict[str, Any]] = None) -> int:
        return _insert_entry(
            entry_type, payload, ts,
            model_id, user_id, authority_level, session_id, request_id, meta, db_path,
        )
    ids.append(insert(ENTRY_PROMPT, prompt))
    if thought_process:
        ids.append(insert(ENTRY_THOUGHT_PROCESS, thought_process))
    if python_executions:
        for run in python_executions:
            ids.append(insert(ENTRY_PYTHON_EXECUTION, json.dumps(run, default=str)))
    if final_response:
        ids.append(insert(ENTRY_FINAL_RESPONSE, final_response))
    return ids


# --- Read-only queries for auditors ---


def get_logs(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    user_id: Optional[str] = None,
    entry_type: Optional[str] = None,
    session_id: Optional[str] = None,
    limit: int = 500,
    db_path: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Read-only query of Black Box logs. Use for auditors.
    date_from / date_to: ISO format (e.g. 2025-06-01, 2025-06-30T23:59:59).
    """
    init_black_box_db(db_path)
    conn = _get_connection(db_path, read_only=True)
    try:
        sql = """
            SELECT id, timestamp_utc, model_id, user_id, authority_level, session_id, request_id, entry_type, payload, meta
            FROM black_box_log WHERE 1=1
        """
        params: list[Any] = []
        if date_from:
            sql += " AND timestamp_utc >= ?"
            params.append(date_from)
        if date_to:
            sql += " AND timestamp_utc <= ?"
            params.append(date_to)
        if user_id:
            sql += " AND user_id = ?"
            params.append(user_id)
        if entry_type:
            sql += " AND entry_type = ?"
            params.append(entry_type)
        if session_id:
            sql += " AND session_id = ?"
            params.append(session_id)
        sql += " ORDER BY id ASC LIMIT ?"
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        return [
            {
                "id": r["id"],
                "timestamp_utc": r["timestamp_utc"],
                "model_id": r["model_id"],
                "user_id": r["user_id"],
                "authority_level": r["authority_level"],
                "session_id": r["session_id"],
                "request_id": r["request_id"],
                "entry_type": r["entry_type"],
                "payload": r["payload"],
                "meta": json.loads(r["meta"]) if r["meta"] else None,
            }
            for r in rows
        ]
    finally:
        conn.close()


def generate_reconstruction_report(
    date_from: str,
    date_to: Optional[str] = None,
    query: Optional[str] = None,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    db_path: Optional[str] = None,
) -> dict[str, Any]:
    """
    Generate a Reconstruction Report for audit: "Why did you approve X in June?"
    Pulls exact logs from the date range and optionally filters by query text (e.g. "capitalization", "50k").
    Returns a structured report with timeline and explanation.
    """
    if not date_to:
        date_to = date_from + "T23:59:59.999999"
    elif len(date_to) <= 10:
        date_to = date_to + "T23:59:59.999999"
    logs = get_logs(
        date_from=date_from,
        date_to=date_to,
        user_id=user_id,
        session_id=session_id,
        limit=1000,
        db_path=db_path,
    )
    if query:
        q = query.lower().strip()
        logs = [r for r in logs if q in (r.get("payload") or "").lower() or q in (str(r.get("meta") or "")).lower()]
    # Build narrative timeline
    timeline: list[dict[str, Any]] = []
    for r in logs:
        entry_type = r["entry_type"]
        payload = r["payload"]
        if entry_type == ENTRY_PYTHON_EXECUTION:
            try:
                data = json.loads(payload)
                payload = f"Code: {data.get('code', '')[:500]}... Result: {data.get('result_summary', '')}"
            except Exception:
                pass
        timeline.append({
            "id": r["id"],
            "timestamp_utc": r["timestamp_utc"],
            "entry_type": entry_type,
            "user_id": r["user_id"],
            "authority_level": r["authority_level"],
            "preview": (payload or "")[:2000] + ("..." if len(payload or "") > 2000 else ""),
        })
    # Summary narrative
    summary_parts: list[str] = []
    summary_parts.append(f"Reconstruction report for period {date_from} to {date_to}.")
    summary_parts.append(f"Total log entries: {len(logs)}.")
    if query:
        summary_parts.append(f"Filtered by query: \"{query}\" ({len(logs)} matching entries).")
    prompts = [r for r in logs if r["entry_type"] == ENTRY_PROMPT]
    thoughts = [r for r in logs if r["entry_type"] == ENTRY_THOUGHT_PROCESS]
    python_runs = [r for r in logs if r["entry_type"] == ENTRY_PYTHON_EXECUTION]
    responses = [r for r in logs if r["entry_type"] == ENTRY_FINAL_RESPONSE]
    summary_parts.append(f"Breakdown: {len(prompts)} prompt(s), {len(thoughts)} thought_process(es), {len(python_runs)} Python execution(s), {len(responses)} final response(s).")
    if logs:
        summary_parts.append("Timeline (chronological): see 'timeline' and 'entries' for full payloads.")
    return {
        "report_type": "reconstruction",
        "date_from": date_from,
        "date_to": date_to,
        "query": query,
        "user_id": user_id,
        "session_id": session_id,
        "summary": " ".join(summary_parts),
        "entry_count": len(logs),
        "timeline": timeline,
        "entries": logs,
    }
