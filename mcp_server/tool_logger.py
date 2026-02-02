"""
Tool-call logging: every tool call is logged with Intent and Refined Plan for full traceability.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

# In-memory log (append-only); in production write to DB or file
_TOOL_CALL_LOG: list[dict[str, Any]] = []

# Optional file path for persistent log (e.g. MCP_TOOL_LOG_PATH=/var/log/mcp_tools.jsonl)
LOG_FILE_PATH = os.environ.get("MCP_TOOL_LOG_PATH")


def log_tool_call(
    tool_name: str,
    role: str,
    user_id: Optional[str] = None,
    intent: Optional[str] = None,
    refined_plan: Optional[str] = None,
    rationale: Optional[str] = None,
    arguments: Optional[dict[str, Any]] = None,
    result_ok: bool = True,
    result_summary: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """
    Log a single tool call with Intent, Refined Plan, and Rationale for full traceability.
    Rationale: the AI must explain *why* it is calling this specific function.
    """
    entry = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "tool_name": tool_name,
        "role": role,
        "user_id": user_id,
        "intent": intent or "",
        "refined_plan": refined_plan or "",
        "rationale": rationale or "",
        "arguments": arguments or {},
        "result_ok": result_ok,
        "result_summary": result_summary,
        "error_message": error_message,
    }
    _TOOL_CALL_LOG.append(entry)
    if LOG_FILE_PATH:
        try:
            with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, default=str) + "\n")
        except OSError:
            pass


def get_tool_call_log(limit: int = 100) -> list[dict[str, Any]]:
    """Return the most recent tool-call log entries (for audit)."""
    return list(reversed(_TOOL_CALL_LOG[-limit:]))


def extract_intent_and_plan_from_context(context: Any) -> tuple[Optional[str], Optional[str]]:
    """
    Extract intent and refined_plan from MCP request context (meta or arguments).
    The client (agent) may pass these in meta for traceability.
    """
    intent: Optional[str] = None
    refined_plan: Optional[str] = None
    if context is None:
        return intent, refined_plan
    if hasattr(context, "request_context"):
        meta = getattr(context.request_context, "meta", None) or {}
        if isinstance(meta, dict):
            intent = meta.get("intent") or meta.get("reasoning_intent")
            refined_plan = meta.get("refined_plan") or meta.get("plan")
    if isinstance(context, dict):
        meta = context.get("meta") or context
        if isinstance(meta, dict):
            intent = intent or meta.get("intent") or meta.get("reasoning_intent")
            refined_plan = refined_plan or meta.get("refined_plan") or meta.get("plan")
    return intent, refined_plan


def extract_rationale_from_context(context: Any) -> Optional[str]:
    """
    Extract rationale from MCP request context (meta or arguments).
    The AI must explain *why* it is calling this specific function.
    """
    if context is None:
        return None
    if hasattr(context, "request_context"):
        meta = getattr(context.request_context, "meta", None) or {}
        if isinstance(meta, dict):
            r = meta.get("rationale") or meta.get("reasoning")
            if r:
                return str(r).strip()
    if isinstance(context, dict):
        meta = context.get("meta") or context
        if isinstance(meta, dict):
            r = meta.get("rationale") or meta.get("reasoning")
            if r:
                return str(r).strip()
    return None
