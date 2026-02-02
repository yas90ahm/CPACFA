"""
Draft finalization via webhook: any Write operation to the ERP is a "Draft" that requires
a human signature (approval) via webhook before being finalized to live ledger.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

# Drafts created by post_journal_entry are stored here; webhook callback marks them approved
_signed_drafts: dict[str, dict[str, Any]] = {}


@dataclass
class DraftRecord:
    """A draft journal entry awaiting human approval."""
    id: str
    date: str
    description: str
    debit_account: str
    credit_account: str
    amount: str
    created_at: str
    source: str
    status: str = "draft"  # draft | pending_approval | approved | finalized
    signed_at: Optional[str] = None
    signed_by: Optional[str] = None
    webhook_received_at: Optional[str] = None


def register_draft(draft_id: str, payload: dict[str, Any]) -> None:
    """Register a draft so it can be finalized via webhook."""
    _signed_drafts[draft_id] = {
        "payload": payload,
        "status": "draft",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "signed_at": None,
        "signed_by": None,
    }


def get_draft(draft_id: str) -> Optional[dict[str, Any]]:
    """Get draft by id."""
    return _signed_drafts.get(draft_id)


def finalize_draft_via_webhook(
    draft_id: str,
    signed_by: str,
    signature_token: Optional[str] = None,
) -> dict[str, Any]:
    """
    Human approval webhook: mark draft as approved and ready for finalization.
    The actual post to live ledger is done by the ERP/backend when it sees status=approved;
    this server only records the signature and timestamp for traceability.
    """
    rec = _signed_drafts.get(draft_id)
    if not rec:
        return {"ok": False, "error": "draft_not_found", "message": f"Draft {draft_id} not found."}
    if rec.get("status") == "approved":
        return {"ok": True, "already_approved": True, "draft_id": draft_id}
    now = datetime.now(timezone.utc).isoformat()
    rec["status"] = "approved"
    rec["signed_at"] = now
    rec["signed_by"] = signed_by
    rec["webhook_received_at"] = now
    rec["signature_token"] = signature_token  # optional proof
    return {
        "ok": True,
        "draft_id": draft_id,
        "status": "approved",
        "signed_at": now,
        "signed_by": signed_by,
        "message": "Draft approved. Backend/ERP will finalize to live ledger.",
    }


def get_webhook_contract() -> dict[str, Any]:
    """Return the webhook contract for human signature (for integration docs)."""
    return {
        "description": "Any write from the bot is a Draft. To finalize, call this webhook after human approval.",
        "method": "POST",
        "url_placeholder": "{MCP_SERVER_URL}/webhook/finalize-draft",
        "body": {
            "draft_id": "string (required)",
            "signed_by": "string (required) — user id or email",
            "signature_token": "string (optional) — proof of approval",
        },
        "response": {
            "ok": "boolean",
            "draft_id": "string",
            "status": "approved",
            "signed_at": "ISO8601",
            "signed_by": "string",
        },
    }
