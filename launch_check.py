#!/usr/bin/env python3
"""
System Integrity check for FinOS Agent.
Verifies CPA Brain, CFA Brain, Supervisor, Python Sandbox, and Export Engine
respond within < 2-second latency. Runs edge-case ingestion tests (10MB PDF, 0-byte CSV).
"""
from __future__ import annotations

import io
import os
import sys
import time
from typing import Callable, Tuple

try:
    import requests
except ImportError:
    print("Install requests: pip install requests")
    sys.exit(1)

NODE_BASE = os.environ.get("NODE_API_URL", "http://localhost:3001").rstrip("/")
PYTHON_BASE = os.environ.get("BACKEND_PYTHON_URL", "http://localhost:5000").rstrip("/")
MAX_LATENCY_SEC = 2.0
REQUEST_TIMEOUT = 15  # overall timeout so we don't hang


def measure(name: str, fn: Callable[[], requests.Response]) -> Tuple[float, bool, str]:
    """Run fn(), return (latency_sec, ok, message)."""
    start = time.perf_counter()
    try:
        r = fn()
        latency = time.perf_counter() - start
        ok = r.status_code < 500
        msg = f"status={r.status_code}" if ok else f"status={r.status_code} body={r.text[:200]}"
        return latency, ok, msg
    except Exception as e:
        latency = time.perf_counter() - start
        return latency, False, str(e)[:200]


def check_cpa_brain() -> Tuple[float, bool, str]:
    """CPA Brain: trial balance → statements (BS + P&L)."""
    return measure(
        "CPA Brain",
        lambda: requests.post(
            f"{NODE_BASE}/api/trial-balance/statements",
            json={"entries": [{"accountName": "Cash", "debit": 1000, "credit": 0}]},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ),
    )


def check_cfa_brain() -> Tuple[float, bool, str]:
    """CFA Brain: proactive advice or liquidity."""
    return measure(
        "CFA Brain",
        lambda: requests.post(
            f"{NODE_BASE}/api/cfa/proactive-advice",
            json={"snapshot": {"revenue": 1, "netIncome": 0, "cash": 100}},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ),
    )


def check_supervisor() -> Tuple[float, bool, str]:
    """Supervisor: lead-partner / orchestration."""
    return measure(
        "Supervisor",
        lambda: requests.post(
            f"{NODE_BASE}/api/orchestrator/lead-partner",
            json={"prompt": "Prepare Q4 financials.", "thought_process": ""},
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ),
    )


def check_python_sandbox() -> Tuple[float, bool, str]:
    """Python Sandbox: quantitative execute or scenario-analysis."""
    return measure(
        "Python Sandbox",
        lambda: requests.post(
            f"{PYTHON_BASE}/api/cfa/scenario-analysis",
            json={
                "snapshot": {"revenue": 100, "cash": 50, "costOfGoodsSold": 20, "operatingExpenses": 30},
                "revenueChangePercent": 0,
                "newEmployeeCount": 0,
                "newEmployeeSalary": 0,
            },
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ),
    )


def check_export_engine() -> Tuple[float, bool, str]:
    """Export Engine: PDF export (Node proxies to Python)."""
    return measure(
        "Export Engine",
        lambda: requests.post(
            f"{NODE_BASE}/api/export/pdf",
            json={
                "cover": {"title": "Test", "report_date": "2026-01-29"},
                "financial_statements": {"balance_sheet": {}, "profit_and_loss": {}, "report_date": "2026-01-29"},
                "executive_summary": "",
                "audit_trail": [],
                "audit_trail_rules_cited": [],
                "clean_ledger": [],
                "pdf_type": "summary",
            },
            headers={"Content-Type": "application/json"},
            timeout=REQUEST_TIMEOUT,
        ),
    )


def edge_10mb_pdf() -> Tuple[float, bool, str]:
    """Edge case: ingest 10MB PDF. Expect 200 or 4xx/5xx but no crash; latency may exceed 2s."""
    buf = io.BytesIO(b"%PDF-1.4 fake\n" + b"x" * (10 * 1024 * 1024 - 20))
    buf.name = "test_10mb.pdf"
    start = time.perf_counter()
    try:
        r = requests.post(
            f"{NODE_BASE}/api/ingestion/agent",
            files={"file": ("test_10mb.pdf", buf, "application/pdf")},
            timeout=60,
        )
        latency = time.perf_counter() - start
        ok = True  # we only check it didn't crash
        msg = f"status={r.status_code} (10MB PDF ingested or rejected in {latency:.2f}s)"
        return latency, ok, msg
    except Exception as e:
        latency = time.perf_counter() - start
        return latency, False, str(e)[:200]


def edge_0byte_csv() -> Tuple[float, bool, str]:
    """Edge case: 0-byte CSV. Expect 400 with clear message."""
    start = time.perf_counter()
    try:
        r = requests.post(
            f"{NODE_BASE}/api/trial-balance/ingest",
            files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
            timeout=REQUEST_TIMEOUT,
        )
        latency = time.perf_counter() - start
        text = (r.text or "").lower()
        ok = r.status_code == 400 and (
            "empty" in text or "invalid" in text or "no trial" in text or "no trial balance" in text
        )
        msg = f"status={r.status_code} (0-byte CSV rejected as expected)" if ok else f"status={r.status_code} body={r.text[:150]}"
        return latency, ok, msg
    except Exception as e:
        latency = time.perf_counter() - start
        return latency, False, str(e)[:200]


def main() -> int:
    print("System Integrity Check")
    print(f"  NODE_BASE={NODE_BASE}  PYTHON_BASE={PYTHON_BASE}  MAX_LATENCY={MAX_LATENCY_SEC}s")
    print()

    checks = [
        ("CPA Brain", check_cpa_brain, True),   # require < 2s
        ("CFA Brain", check_cfa_brain, True),
        ("Supervisor", check_supervisor, True),
        ("Python Sandbox", check_python_sandbox, True),
        ("Export Engine", check_export_engine, True),
    ]
    edge_cases = [
        ("Ingestion 10MB PDF", edge_10mb_pdf, False),  # don't fail on latency
        ("Ingestion 0-byte CSV", edge_0byte_csv, False),
    ]

    failed = []
    for name, fn, enforce_latency in checks:
        latency, ok, msg = fn()
        within = latency <= MAX_LATENCY_SEC
        if enforce_latency and not within:
            ok = False
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}: {latency:.2f}s  {msg}")
        if not ok:
            failed.append(name)
    print()
    for name, fn, _ in edge_cases:
        latency, ok, msg = fn()
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}: {msg}")
        if not ok:
            failed.append(name)

    print()
    if failed:
        print(f"Failed: {', '.join(failed)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
