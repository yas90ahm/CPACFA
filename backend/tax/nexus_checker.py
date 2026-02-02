"""
Nexus Checker — Detect sales in new jurisdictions and alert to potential Sales Tax (VAT/GST) nexus.
If the bot detects sales in a new jurisdiction (via invoice address), it alerts the user to nexus requirements.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# Known nexus jurisdictions: (country, state/region) or country-only. New jurisdictions = not in this set.
_KNOWN_NEXUS: set[tuple[str, str]] = set()  # (country_upper, state_upper)


def _normalize_country(c: str) -> str:
    s = (c or "").strip().upper()
    if len(s) == 2:
        return s
    # Map common names to ISO 2
    names = {
        "UNITED STATES": "US", "USA": "US", "U.S.": "US", "UNITED KINGDOM": "GB", "UK": "GB",
        "GERMANY": "DE", "FRANCE": "FR", "CANADA": "CA", "AUSTRALIA": "AU", "JAPAN": "JP",
    }
    return names.get(s, s[:2] if len(s) >= 2 else s)


def _normalize_state(s: str) -> str:
    return (s or "").strip().upper()[:50]


def _parse_invoice_address(address: str) -> tuple[str, str]:
    """
    Parse invoice address to extract country and state/region.
    Heuristic: look for country name/code and state (e.g. "CA, USA" or "California, US").
    """
    text = (address or "").strip()
    country = ""
    state = ""
    # Try "..., STATE COUNTRY" or "..., COUNTRY"
    parts = [p.strip() for p in re.split(r"[,;\n]", text) if p.strip()]
    if len(parts) >= 1:
        last = parts[-1].upper()
        if len(last) == 2 and last in ("US", "UK", "CA", "DE", "FR", "AU", "JP", "GB", "IN", "NL", "ES", "IT"):
            country = last if last != "UK" else "GB"
        else:
            country = _normalize_country(parts[-1])
    if len(parts) >= 2:
        state = _normalize_state(parts[-2])
    return country or "US", state


@dataclass
class NexusCheckResult:
    """Result of nexus check for an invoice/sale."""
    jurisdiction_country: str
    jurisdiction_state: str
    is_new_jurisdiction: bool  # True = not in known nexus list → alert
    alert_message: Optional[str] = None  # If new, message for user
    recommendation: str = ""
    known_nexus_list: list[tuple[str, str]] = field(default_factory=list)


def add_known_nexus(country: str, state: str = "") -> None:
    """Register a jurisdiction where the entity already has nexus (no alert for sales there)."""
    c = _normalize_country(country)
    s = _normalize_state(state) if state else ""
    _KNOWN_NEXUS.add((c, s))


def get_known_nexus() -> list[tuple[str, str]]:
    """Return current list of known nexus jurisdictions (country, state)."""
    return list(_KNOWN_NEXUS)


def check_nexus(
    invoice_address: str,
    known_nexus_override: Optional[list[tuple[str, str]]] = None,
) -> NexusCheckResult:
    """
    Check if the invoice address corresponds to a new jurisdiction (no existing nexus).
    If new, alert user to potential Sales Tax / VAT / GST nexus requirements.
    """
    country, state = _parse_invoice_address(invoice_address)
    known = known_nexus_override if known_nexus_override is not None else list(_KNOWN_NEXUS)
    known_set = set((_normalize_country(c), _normalize_state(s or "")) for c, s in known)

    # Check exact (country, state) and country-only (country, "")
    is_known = (country, state) in known_set or (country, "") in known_set
    is_new = not is_known

    alert_message = None
    recommendation = ""
    if is_new:
        alert_message = (
            f"Potential new jurisdiction: {country}" + (f" / {state}" if state else "") + ". "
            "Sales in this jurisdiction may create Sales Tax (US), VAT, or GST nexus. "
            "Consider consulting tax advisor for registration and collection requirements."
        )
        recommendation = (
            "Review nexus rules for " + country + (f" ({state})" if state else "") +
            "; register for sales tax/VAT/GST if threshold is met; add to known nexus once registered."
        )

    return NexusCheckResult(
        jurisdiction_country=country,
        jurisdiction_state=state,
        is_new_jurisdiction=is_new,
        alert_message=alert_message,
        recommendation=recommendation,
        known_nexus_list=known,
    )


def check_nexus_batch(
    invoice_addresses: list[str],
    known_nexus_override: Optional[list[tuple[str, str]]] = None,
) -> list[NexusCheckResult]:
    """Check multiple invoice addresses; return list of results (new jurisdictions flagged)."""
    return [check_nexus(addr, known_nexus_override) for addr in invoice_addresses]


# Seed default US home state so US sales in that state don't alert
def _seed_default_nexus() -> None:
    if not _KNOWN_NEXUS:
        add_known_nexus("US", "CA")  # example: California
        add_known_nexus("US", "NY")
        add_known_nexus("US", "TX")


# Optional: call on import so there is at least one known nexus for demo
_seed_default_nexus()
