"""
Optional HTTP server for the Draft finalization webhook.
Human approval is sent here; the server marks the draft as approved (finalize to live is done by ERP/backend).
Run separately: python -m mcp_server.webhook_server
"""

from __future__ import annotations

import os
from typing import Any

try:
    from flask import Flask, request, jsonify
    HAS_FLASK = True
except ImportError:
    HAS_FLASK = False

from .draft_webhook import finalize_draft_via_webhook, get_webhook_contract

if HAS_FLASK:
    app = Flask(__name__)

    @app.route("/webhook/finalize-draft", methods=["POST"])
    def webhook_finalize_draft() -> tuple[dict[str, Any], int]:
        """
        Human signature webhook: approve a draft so it can be finalized to live ledger.
        Body: { "draft_id": "...", "signed_by": "user@example.com", "signature_token": "optional" }
        """
        body = request.get_json(silent=True) or {}
        draft_id = (body.get("draft_id") or "").strip()
        signed_by = (body.get("signed_by") or "").strip()
        signature_token = body.get("signature_token")
        if not draft_id or not signed_by:
            return jsonify({
                "ok": False,
                "error": "missing_fields",
                "message": "draft_id and signed_by are required.",
            }), 400
        result = finalize_draft_via_webhook(draft_id, signed_by=signed_by, signature_token=signature_token)
        if not result.get("ok"):
            return jsonify(result), 404
        return jsonify(result), 200

    @app.route("/webhook/contract", methods=["GET"])
    def webhook_contract() -> tuple[dict[str, Any], int]:
        """Return the webhook contract (for integration docs)."""
        return jsonify(get_webhook_contract()), 200

    @app.route("/health", methods=["GET"])
    def health() -> tuple[dict[str, Any], int]:
        return jsonify({"status": "ok", "service": "mcp-webhook"}), 200


def main() -> None:
    if not HAS_FLASK:
        raise RuntimeError("Flask not installed. Run: pip install flask")
    port = int(os.environ.get("MCP_WEBHOOK_PORT", "5050"))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_DEBUG", "false").lower() == "true")


if __name__ == "__main__":
    main()
