"""
OAuth2 scope-based permissions for ERP MCP.
- read_gl: Read access to General Ledger.
- write_draft: Write access to Draft Journal Entries only.
- NO live_write scope for AI — posting to Live ledger requires human Approve in UI.
"""
from __future__ import annotations

from typing import Optional

# Scopes the AI / MCP client can request
SCOPE_READ_GL = "read_gl"
SCOPE_WRITE_DRAFT = "write_draft"
# Intentionally no SCOPE_LIVE_WRITE — AI can never post to live

ALL_SCOPES = frozenset({SCOPE_READ_GL, SCOPE_WRITE_DRAFT})


def parse_scopes_from_token(token: Optional[str]) -> frozenset[str]:
    """
    Parse allowed scopes from token. For demo: token can be a comma-separated list
    of scopes (e.g. "read_gl,write_draft") or a JWT payload placeholder.
    In production: validate JWT and read 'scope' claim from Authorization Server.
    """
    if not token or not token.strip():
        return frozenset()
    # Demo: treat token as "scope1,scope2" or "Bearer scope1,scope2"
    raw = token.strip()
    if raw.lower().startswith("bearer "):
        raw = raw[7:].strip()
    allowed = set()
    for s in raw.split(","):
        s = s.strip()
        if s in ALL_SCOPES:
            allowed.add(s)
    return frozenset(allowed)


def require_scope(allowed_scopes: frozenset[str], required: str) -> None:
    """Raise PermissionError if required scope is not in allowed_scopes."""
    if required not in allowed_scopes:
        raise PermissionError(f"Missing required scope: {required}. Allowed: {allowed_scopes}")


def get_scopes_from_context(context: Optional[dict]) -> frozenset[str]:
    """Get scopes from MCP request context (e.g. meta or headers)."""
    if not context:
        return frozenset()
    # Check common places: meta.scopes, meta.token, headers
    meta = context.get("meta") or {}
    scopes = meta.get("scopes")
    if isinstance(scopes, (list, set)):
        return frozenset(s for s in scopes if s in ALL_SCOPES)
    token = meta.get("token") or context.get("token")
    if token:
        return parse_scopes_from_token(str(token))
    return frozenset()
