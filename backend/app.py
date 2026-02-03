"""
FinOS CPA-Agent — REST API.
Exposes General Ledger processing, Justification Engine, and Ingestion pipeline.
"""
from __future__ import annotations

import io
import json
from datetime import date
from decimal import Decimal
from typing import Any

from flask import Flask, request, jsonify, send_file

from accounting_engine import (
    CPAAgent,
    ChartOfAccounts,
    GLAccount,
    GLEntry,
    DepreciationMethod,
    ASC_210,
    build_depreciation_schedule,
    statement_of_cash_flows_indirect,
    GeneralLedger,
    ValidationError,
    build_validated_statements,
    MathematicalIntegrityError,
    get_rounding_tolerance,
)
from justification_engine import justify
from models import AccountType, CodificationRef

try:
    from ingestion.pipeline import process_document
    from ingestion.models import PipelineResult
    HAS_INGESTION = True
except ImportError:
    HAS_INGESTION = False

try:
    from compliance.guardrail import calculate_tax_provision_with_guardrail, TaxProvisionResult
    from compliance.citation_check import run_citation_check, CitationCheckResult
    from compliance.audit_log import init_audit_db, log_chain_of_thought, get_audit_trail
    HAS_COMPLIANCE = True
except ImportError:
    HAS_COMPLIANCE = False

try:
    from governance.immutable_log import log_llm_decision, read_llm_decision_log, verify_chain
    from governance.skepticism_agent import run_skepticism_scan, JournalEntryForScan
    from governance.conflict_resolution import check_cpa_cfa_conflict
    from governance.forensic_skeptic import run_forensic_scan, ForensicEntryForScan
    from governance.audit_dashboard import get_forensic_anomalies
    HAS_GOVERNANCE = True
except ImportError:
    HAS_GOVERNANCE = False
    run_forensic_scan = None
    ForensicEntryForScan = None
    get_forensic_anomalies = None

from errors import ForensicAuditError, AgentOrchestratorError
from tax.fx_engine import (
    remeasure_to_functional,
    translate_to_reporting,
    compute_unrealized_fx_gain_loss,
    batch_remeasure_to_functional,
    FXPosition,
)
from tax.tax_provisioning import compute_deferred_taxes, TemporaryDifference
from tax.nexus_checker import check_nexus, add_known_nexus, get_known_nexus

try:
    from consolidation import (
        ConsolidationInput,
        ConsolidationResult,
        SubsidiaryTrialBalance,
        InterCompanyPair,
        MinorityOwnership,
        SubsidiaryLedgerInput,
        GLEntryLike,
        roll_up_to_consolidated_balance_sheet,
    )
    from models import TrialBalanceLine
    HAS_CONSOLIDATION = True
except ImportError:
    HAS_CONSOLIDATION = False

try:
    from strategic_analyst import run_market_intelligence
    HAS_STRATEGIC_ANALYST = True
except ImportError:
    HAS_STRATEGIC_ANALYST = False

try:
    from parser import extract as parser_extract
    from parser.models import ExtractionResult
    HAS_PARSER = True
except ImportError:
    HAS_PARSER = False
    parser_extract = None
    ExtractionResult = None

try:
    from feedback_loop import (
        on_user_correction,
        save_user_rule,
        get_reasoning_message,
    )
    HAS_FEEDBACK_LOOP = True
except ImportError:
    HAS_FEEDBACK_LOOP = False
    on_user_correction = None
    save_user_rule = None
    get_reasoning_message = None

try:
    from consistency_check import (
        run_consistency_check,
        record_treatment,
        record_policy_change_justification,
        get_treatments_for_period,
        get_policy_change_justifications,
        validate_coa,
        TreatmentRecord,
        PolicyChangeJustification,
    )
    HAS_CONSISTENCY_CHECK = True
except ImportError:
    HAS_CONSISTENCY_CHECK = False
    run_consistency_check = None
    record_treatment = None
    record_policy_change_justification = None
    get_treatments_for_period = None
    get_policy_change_justifications = None
    validate_coa = None

try:
    from export.report_generator import generate_pdf_report, generate_excel_report, generate_csv_report
    HAS_EXPORT = True
except ImportError:
    HAS_EXPORT = False
    generate_pdf_report = None
    generate_excel_report = None
    generate_csv_report = None

app = Flask(__name__)


def _decimal_to_json(d: Decimal) -> str:
    return str(d)


def _codification_to_dict(c: CodificationRef | None) -> dict | None:
    if c is None:
        return None
    return {"framework": c.framework, "citation": c.citation, "description": c.description}


# --- Pure REST Math API (Node calls Python; no auth/session) ---

def _run_trial_balance_math(body: dict) -> tuple[date, Any, Any]:
    """Run accounting_engine: coa + entries + as_of -> trial_balance, balance_sheet. Returns (as_of_date, tb, bs)."""
    coa_list = body.get("coa") or []
    entries_list = body.get("entries") or []
    as_of_str = body.get("as_of")
    accounts = {}
    for a in coa_list:
        code = a.get("code") or ""
        name = a.get("name") or code
        acc_type_str = (a.get("account_type") or "ASSET").upper()
        try:
            acc_type = AccountType(acc_type_str)
        except ValueError:
            acc_type = AccountType.ASSET
        accounts[code] = GLAccount(code=code, name=name, account_type=acc_type)
    coa = ChartOfAccounts(accounts=accounts)
    if not accounts:
        raise ValueError("Missing or empty 'coa'")
    agent = CPAAgent(coa)
    as_of_date = None
    for e in entries_list:
        dt = e.get("date")
        if isinstance(dt, str):
            d = date.fromisoformat(dt)
        else:
            d = date.today()
        if as_of_date is None or d > as_of_date:
            as_of_date = d
        entry = GLEntry(
            date=d,
            description=e.get("description") or "",
            debit_account=e.get("debit_account") or "",
            credit_account=e.get("credit_account") or "",
            amount=Decimal(str(e.get("amount", 0))),
        )
        agent.stage_entry(entry)
    agent.approve_all_pending()
    if as_of_date is None:
        as_of_date = date.today()
    if as_of_str:
        as_of_date = date.fromisoformat(as_of_str)
    tb, bs, _ = build_validated_statements(agent.gl, as_of_date, agent.coa)
    return as_of_date, tb, bs


def _jsonify_trial_balance_response(as_of_date: date, tb: Any, bs: Any) -> dict:
    def _tb_line(l):
        return {
            "account_code": l.account_code,
            "account_name": l.account_name,
            "debit": _decimal_to_json(l.debit),
            "credit": _decimal_to_json(l.credit),
            "account_type": l.account_type.value,
        }
    def _stmt_line(l):
        return {"label": l.label, "amount": _decimal_to_json(l.amount), "account_code": l.account_code}
    return {
        "as_of": as_of_date.isoformat(),
        "trial_balance": {
            "lines": [_tb_line(l) for l in tb.lines],
            "total_debits": _decimal_to_json(tb.total_debits),
            "total_credits": _decimal_to_json(tb.total_credits),
            "balances": tb.balances,
        },
        "balance_sheet": {
            "report_date": bs.report_date.isoformat(),
            "assets": [_stmt_line(l) for l in bs.assets],
            "liabilities": [_stmt_line(l) for l in bs.liabilities],
            "equity": [_stmt_line(l) for l in bs.equity],
            "total_assets": _decimal_to_json(bs.total_assets),
            "total_liabilities": _decimal_to_json(bs.total_liabilities),
            "total_equity": _decimal_to_json(bs.total_equity),
            "codification_ref": _codification_to_dict(bs.codification_ref),
        },
        "validation": {
            "balances": abs(bs.total_assets - (bs.total_liabilities + bs.total_equity)) <= get_rounding_tolerance(),
            "message": "Assets = Liabilities + Equity (ASC 210-10-45)",
        },
    }


def _math_integrity_422(e: MathematicalIntegrityError) -> tuple[Any, int]:
    details = {}
    if e.total_debits is not None:
        details["totalDebits"] = float(e.total_debits)
    if e.total_credits is not None:
        details["totalCredits"] = float(e.total_credits)
    if e.total_assets is not None:
        details["totalAssets"] = float(e.total_assets)
    if e.total_liabilities is not None:
        details["totalLiabilities"] = float(e.total_liabilities)
    if e.total_equity is not None:
        details["totalEquity"] = float(e.total_equity)
    return (
        jsonify({
            "error": "MathematicalIntegrityError",
            "message": str(e),
            "check": e.check,
            "imbalanceAmount": float(e.imbalance_amount),
            "details": details,
        }),
        422,
    )


@app.errorhandler(ForensicAuditError)
def handle_forensic_audit_error(e: ForensicAuditError) -> tuple[Any, int]:
    """Return 500 for forensic/audit persistence or parse failures (no silent green)."""
    return jsonify({"error": "ForensicAuditError", "message": str(e)}), 500


@app.errorhandler(AgentOrchestratorError)
def handle_agent_orchestrator_error(e: AgentOrchestratorError) -> tuple[Any, int]:
    """Return 500 for agent orchestrator (CPA/CFA) failures (no silent green)."""
    return jsonify({"error": "AgentOrchestratorError", "message": str(e)}), 500


@app.route("/api/math/trial-balance", methods=["POST"])
def api_math_trial_balance():
    """
    Pure REST: POST { "coa": [...], "entries": [...], "as_of": "YYYY-MM-DD"? }.
    Runs accounting_engine; returns trial_balance, balance_sheet, validation.
    Called by Node pythonBridge. No auth/session.
    """
    body = request.get_json(silent=True) or {}
    try:
        as_of_date, tb, bs = _run_trial_balance_math(body)
        return jsonify(_jsonify_trial_balance_response(as_of_date, tb, bs))
    except MathematicalIntegrityError as e:
        return _math_integrity_422(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/math/dcf", methods=["POST"])
def api_math_dcf():
    """
    Pure REST: POST { "risk_free_rate", "free_cash_flows": [...], "terminal_growth_rate", "equity_risk_premium"?, "beta"? }.
    Runs strategic_analyst.dcf_valuation; returns enterprise_value, wacc, assumptions_summary, etc.
    Called by Node pythonBridge. No auth/session.
    """
    if not HAS_STRATEGIC_ANALYST:
        return jsonify({"error": "Strategic analyst (DCF) not available"}), 503
    from strategic_analyst import dcf_valuation
    body = request.get_json(silent=True) or {}
    try:
        risk_free_rate = float(body.get("risk_free_rate", 0.045))
        free_cash_flows = [float(x) for x in (body.get("free_cash_flows") or [])]
        terminal_growth_rate = float(body.get("terminal_growth_rate", 0.02))
        equity_risk_premium = float(body.get("equity_risk_premium", 0.055))
        beta = float(body.get("beta", 1.0))
        result = dcf_valuation(
            risk_free_rate=risk_free_rate,
            free_cash_flows=free_cash_flows,
            terminal_growth_rate=terminal_growth_rate,
            equity_risk_premium=equity_risk_premium,
            beta=beta,
        )
        return jsonify({
            "enterprise_value": result.enterprise_value,
            "present_value_explicit": result.present_value_explicit,
            "present_value_terminal": result.present_value_terminal,
            "terminal_value": result.terminal_value,
            "risk_free_rate": result.risk_free_rate,
            "wacc": result.wacc,
            "terminal_growth_rate": result.terminal_growth_rate,
            "num_explicit_years": result.num_explicit_years,
            "assumptions_summary": result.assumptions_summary,
        })
    except (TypeError, ValueError) as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Justification Engine (Chat) ---
@app.route("/api/justify", methods=["POST"])
def api_justify():
    """
    Justification Chat: user asks e.g. "Why was this capitalized?"
    Returns response citing specific accounting standards (e.g. ASC 350-40).
    """
    body = request.get_json(silent=True) or {}
    question = body.get("question", "").strip() or (request.form.get("question") or "")
    if not question:
        return jsonify({"error": "Missing 'question' in body or form"}), 400
    try:
        resp = justify(question)
        return jsonify({
            "question_type": resp.question_type,
            "codification_ref": _codification_to_dict(resp.codification_ref),
            "citation": resp.citation,
            "explanation": resp.explanation,
            "supporting_detail": resp.supporting_detail,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Depreciation schedules ---
@app.route("/api/depreciation/schedule", methods=["POST"])
def api_depreciation_schedule():
    """
    POST body: method ("SL" | "DDB"), cost, salvage_value, useful_life_years,
    placed_in_service (YYYY-MM-DD), asset_id?, asset_description?
    """
    body = request.get_json(silent=True) or {}
    method_str = (body.get("method") or "SL").upper()
    method = DepreciationMethod.STRAIGHT_LINE if method_str == "SL" else DepreciationMethod.DOUBLE_DECLINING_BALANCE
    cost = Decimal(str(body.get("cost", 0)))
    salvage_value = Decimal(str(body.get("salvage_value", 0)))
    useful_life_years = int(body.get("useful_life_years", 5))
    pis = body.get("placed_in_service")
    if isinstance(pis, str):
        placed_in_service = date.fromisoformat(pis)
    else:
        placed_in_service = date.today()
    asset_id = body.get("asset_id") or ""
    asset_description = body.get("asset_description") or ""
    try:
        schedule = build_depreciation_schedule(
            method, cost, salvage_value, useful_life_years,
            placed_in_service, asset_id, asset_description
        )
        lines = [
            {
                "period": l.period,
                "period_end_date": l.period_end_date.isoformat(),
                "beginning_book_value": _decimal_to_json(l.beginning_book_value),
                "depreciation_expense": _decimal_to_json(l.depreciation_expense),
                "accumulated_depreciation": _decimal_to_json(l.accumulated_depreciation),
                "ending_book_value": _decimal_to_json(l.ending_book_value),
            }
            for l in schedule.lines
        ]
        return jsonify({
            "asset_id": schedule.asset_id,
            "asset_description": schedule.asset_description,
            "method": schedule.method.value,
            "cost": _decimal_to_json(schedule.cost),
            "salvage_value": _decimal_to_json(schedule.salvage_value),
            "useful_life_years": schedule.useful_life_years,
            "placed_in_service_date": schedule.placed_in_service_date.isoformat(),
            "codification_ref": _codification_to_dict(schedule.codification_ref),
            "lines": lines,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# --- General Ledger processing ---
@app.route("/api/gl/process", methods=["POST"])
def api_gl_process():
    """
    Alias for /api/math/trial-balance. POST { "coa": [...], "entries": [...], "as_of": "YYYY-MM-DD"? }.
    Returns trial_balance, balance_sheet, validation.
    """
    body = request.get_json(silent=True) or {}
    try:
        as_of_date, tb, bs = _run_trial_balance_math(body)
        return jsonify(_jsonify_trial_balance_response(as_of_date, tb, bs))
    except MathematicalIntegrityError as e:
        return _math_integrity_422(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except ValidationError as e:
        return jsonify({"error": "Validation failed", "message": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Ingestion: financial document pipeline ---
def _serialize_pipeline_result(result: "PipelineResult") -> dict:
    from ingestion.models import ExtractedTransaction, ClassificationResult
    def ser_ext(e: ExtractedTransaction) -> dict:
        return {
            "transaction_date": e.transaction_date,
            "description": e.description,
            "amount": str(e.amount) if e.amount is not None else None,
            "counterparty": e.counterparty,
        }
    def ser_class(c: ClassificationResult) -> dict:
        return {
            "account_code": c.account_code,
            "account_name": c.account_name,
            "confidence": c.confidence,
            "needs_review": c.needs_review,
        }
    def ser_ct(ct: Any) -> dict:
        d = {"extracted": ser_ext(ct.extracted), "classification": ser_class(ct.classification)}
        if getattr(ct, "reasoning", None):
            d["reasoning"] = ct.reasoning
        return d
    return {
        "extracted": [ser_ext(e) for e in result.extracted],
        "classified": [ser_ct(ct) for ct in result.classified],
        "needs_review": [ser_ct(ct) for ct in result.needs_review],
        "errors": result.errors,
    }


@app.route("/api/ingestion/process", methods=["POST"])
def api_ingestion_process():
    """
    Process a financial document (PDF or Excel).
    - Multipart: file (required); optional: run_forensic_scan (true), requesting_user_id
    - On upload, if run_forensic_scan=true and governance available, runs Forensic Skeptic on extracted entries.
    - Returns: extracted transactions, classified with CoA; optional forensic_scan_result.
    """
    if not HAS_INGESTION:
        return jsonify({"error": "Ingestion module not available"}), 503
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Missing 'file' in multipart body"}), 400
    run_forensic = request.form.get("run_forensic_scan", "").lower() in ("1", "true", "yes")
    requesting_user_id = request.form.get("requesting_user_id") or None
    try:
        content = file.read()
        result = process_document(content=content, filename=file.filename, confidence_threshold=0.9)
        out = _serialize_pipeline_result(result)
        if run_forensic and HAS_GOVERNANCE and ForensicEntryForScan is not None and run_forensic_scan is not None:
            entries_forensic = []
            for ct in result.classified + result.needs_review:
                ext = ct.extracted
                amt = ext.amount if ext.amount is not None else Decimal("0")
                date_str = (ext.transaction_date or "")[:10] if ext.transaction_date else ""
                entries_forensic.append(ForensicEntryForScan(
                    date=date_str,
                    description=ext.description or "",
                    amount=amt,
                    account_code=ct.classification.account_code,
                    entry_id=None,
                    created_at=None,
                    created_by=requesting_user_id,
                ))
            if entries_forensic:
                try:
                    forensic_result = run_forensic_scan(
                        entries_forensic,
                        requesting_user_id=requesting_user_id,
                        options={},
                    )
                    out["forensic_scan_result"] = {
                        "scan_timestamp_utc": forensic_result.scan_timestamp_utc,
                        "entries_scanned": forensic_result.entries_scanned,
                        "benford_deviation_score": forensic_result.benford_deviation_score,
                        "anomalies_for_dashboard": forensic_result.anomalies_for_dashboard,
                        "summary": forensic_result.summary,
                        "passed": forensic_result.passed,
                        "round_sum_flags": forensic_result.round_sum_flags,
                        "unusual_time_flags": forensic_result.unusual_time_flags,
                        "weekend_flags": forensic_result.weekend_flags,
                        "benford_flags": forensic_result.benford_flags,
                    }
                except Exception as _e:
                    out["forensic_scan_result"] = {"error": str(_e)}
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- User Correction (feedback_loop): bot message + save preference ---
@app.route("/api/feedback/correction", methods=["POST"])
def api_feedback_correction():
    """
    User manually changed a transaction category (e.g. Travel → Marketing).
    POST body: merchant_name, old_category, new_category, account_code, account_name.
    Returns: bot message "Got it. Should I treat all future transactions from [Merchant] as '[Category]'?"
    """
    if not HAS_FEEDBACK_LOOP or on_user_correction is None:
        return jsonify({"error": "Feedback loop not available"}), 503
    body = request.get_json(silent=True) or {}
    merchant_name = (body.get("merchant_name") or body.get("merchant") or "").strip()
    old_category = (body.get("old_category") or "").strip()
    new_category = (body.get("new_category") or "").strip()
    account_code = (body.get("account_code") or "9999").strip()
    account_name = (body.get("account_name") or new_category).strip()
    if not merchant_name or not new_category:
        return jsonify({"error": "Missing merchant_name and new_category"}), 400
    try:
        message = on_user_correction(
            merchant_name, old_category, new_category, account_code, account_name
        )
        return jsonify({"message": message, "merchant_name": merchant_name, "new_category": new_category})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/feedback/confirm", methods=["POST"])
def api_feedback_confirm():
    """
    User confirmed: treat all future transactions from [Merchant] as [Category].
    POST body: merchant_name, category, account_code, account_name.
    Persists to user_rules.json.
    """
    if not HAS_FEEDBACK_LOOP or save_user_rule is None:
        return jsonify({"error": "Feedback loop not available"}), 503
    body = request.get_json(silent=True) or {}
    merchant_name = (body.get("merchant_name") or body.get("merchant") or "").strip()
    category = (body.get("category") or body.get("account_name") or "").strip()
    account_code = (body.get("account_code") or "9999").strip()
    account_name = (body.get("account_name") or category).strip()
    if not merchant_name or not category:
        return jsonify({"error": "Missing merchant_name and category"}), 400
    try:
        save_user_rule(merchant_name, category, account_code, account_name)
        return jsonify({"ok": True, "message": f"Preference saved: {merchant_name} → {category}"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Transaction Interrogator (drill-down: filter by P&L line + CPA justification) ---
@app.route("/api/transaction-interrogator", methods=["GET", "POST"])
def api_transaction_interrogator():
    """
    Drill-down: user clicks a P&L line item (e.g. "Travel Expenses").
    Node owns session state; caller must POST with "transactions" in body.
    POST body: { "line_item_label": "Travel Expenses", "account_code": "7700", "transactions": [...] } (transactions required).
    Returns: { "transactions": [...], "justification": "CPA Agent explanation...", "count": N }.
    """
    if not HAS_DRILL_DOWN or run_drill_down is None:
        return jsonify({"error": "Drill-down module not available"}), 503
    line_item_label = request.args.get("line_item") or request.args.get("line_item_label")
    account_code = request.args.get("account_code")
    transactions = []
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        line_item_label = line_item_label or body.get("line_item_label") or body.get("line_item")
        account_code = account_code or body.get("account_code")
        transactions = body.get("transactions") or []
    if not line_item_label or not line_item_label.strip():
        return jsonify({"error": "Missing 'line_item' or 'line_item_label'"}), 400
    try:
        result = run_drill_down(
            transactions,
            line_item_label.strip(),
            account_code=account_code.strip() if account_code else None,
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Local Extraction (parser: PDF, CSV, Excel -> Trial Balance / Transaction List) ---
def _serialize_extraction_result(result: "ExtractionResult") -> dict:
    def ser_tb_line(l):
        return {
            "account_code": l.account_code,
            "account_name": l.account_name,
            "debit": str(l.debit),
            "credit": str(l.credit),
            "account_type": l.account_type,
        }
    def ser_tx(t):
        return {
            "date": t.date,
            "description": t.description,
            "amount": str(t.amount) if t.amount is not None else None,
            "vendor": t.vendor,
            "debit": str(t.debit) if t.debit is not None else None,
            "credit": str(t.credit) if t.credit is not None else None,
            "account_name": t.account_name,
        }
    return {
        "trial_balance": [ser_tb_line(l) for l in result.trial_balance],
        "transaction_list": [ser_tx(t) for t in result.transaction_list],
        "raw_cleaned_rows": result.raw_cleaned_rows,
        "source_file": result.source_file,
        "errors": result.errors,
        "detected_format": result.detected_format,
    }


@app.route("/api/parser/extract", methods=["POST"])
def api_parser_extract():
    """
    Local Extraction: accept PDF, CSV, Excel -> layout-aware OCR -> clean Trial Balance or Transaction List.
    Multipart: file (required). Returns JSON for CPA Agent.
    """
    if not HAS_PARSER or parser_extract is None:
        return jsonify({"error": "Parser module not available"}), 503
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "Missing 'file' in multipart body"}), 400
    try:
        content = file.read()
        mime = (file.content_type or "").split(";")[0].strip()
        result = parser_extract(
            content=content,
            filename=file.filename,
            mime_type=mime,
        )
        return jsonify(_serialize_extraction_result(result))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Compliance Guardrail (RAG + Citation Check + Chain of Thought) ---
@app.route("/api/compliance/tax-provision", methods=["POST"])
def api_compliance_tax_provision():
    """
    Calculate Tax Provision with Compliance Guardrail.
    POST body: pretax_income, effective_tax_rate; optional: proposed_entry, session_id, user_id.
    Every calculation runs a Citation Check against stored Tax/FASB law.
    If logic contradicts law (e.g. Section 162(m)), execution stops and returns warning;
    decision is logged in Chain of Thought table.
    """
    if not HAS_COMPLIANCE:
        return jsonify({"error": "Compliance module not available"}), 503
    body = request.get_json(silent=True) or {}
    try:
        pretax_income = Decimal(str(body.get("pretax_income", 0)))
        effective_tax_rate = Decimal(str(body.get("effective_tax_rate", 0)))
    except Exception:
        return jsonify({"error": "Invalid pretax_income or effective_tax_rate"}), 400
    proposed_entry = body.get("proposed_entry")
    session_id = body.get("session_id")
    user_id = body.get("user_id")
    try:
        result = calculate_tax_provision_with_guardrail(
            pretax_income=pretax_income,
            effective_tax_rate=effective_tax_rate,
            proposed_entry=proposed_entry,
            session_id=session_id,
            user_id=user_id,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    resp = {
        "allowed": result.allowed,
        "tax_provision_amount": _decimal_to_json(result.tax_provision_amount) if result.tax_provision_amount is not None else None,
        "warning_message": result.warning_message,
        "audit_log_id": result.audit_log_id,
        "reasoning": result.reasoning,
    }
    if result.citation_check:
        resp["citation_check"] = {
            "passed": result.citation_check.passed,
            "citations_checked": result.citation_check.citations_checked or [],
            "reasoning": result.citation_check.reasoning,
        }
    if not result.allowed:
        return jsonify(resp), 200  # 200 with allowed=false and warning_message for client to display
    return jsonify(resp)


@app.route("/api/compliance/citation-check", methods=["POST"])
def api_compliance_citation_check():
    """
    Run Citation Check on a proposed entry (e.g. tax provision or journal entry).
    POST body: { "proposed_entry": { description?, amount?, ... } }.
    Returns passed, warning_message, citations_checked, reasoning.
    """
    if not HAS_COMPLIANCE:
        return jsonify({"error": "Compliance module not available"}), 503
    body = request.get_json(silent=True) or {}
    proposed_entry = body.get("proposed_entry") or body
    if not proposed_entry or not isinstance(proposed_entry, dict):
        return jsonify({"error": "Missing 'proposed_entry' (object)"}), 400
    try:
        result = run_citation_check(proposed_entry)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "passed": result.passed,
        "warning_message": result.warning_message,
        "citations_checked": result.citations_checked or [],
        "reasoning": result.reasoning,
    })


@app.route("/api/compliance/audit-trail", methods=["GET"])
def api_compliance_audit_trail():
    """
    Return Chain of Thought audit trail for human auditors.
    Query params: limit (default 100), event_type, outcome (allowed|blocked).
    """
    if not HAS_COMPLIANCE:
        return jsonify({"error": "Compliance module not available"}), 503
    limit = request.args.get("limit", 100, type=int)
    event_type = request.args.get("event_type") or None
    outcome = request.args.get("outcome") or None
    try:
        rows = get_audit_trail(limit=limit, event_type=event_type, outcome=outcome)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"audit_trail": rows})


# --- Accounting Policy Monitor (consistency_check) ---
@app.route("/api/compliance/consistency-check", methods=["POST"])
def api_compliance_consistency_check():
    """
    Accounting Policy Monitor: verify treatment consistency YoY and COA integrity.
    If treatment changed (e.g. R&D capitalized in Q1 → expensed in Q2), requires a
    'Change in Accounting Principle' justification (e.g. ASC 250-10-45).
    POST body: current_treatments, period_current, period_prior?, coa?, description_to_account?, prior_description_to_account?, recorded_justifications?.
    """
    if not HAS_CONSISTENCY_CHECK or run_consistency_check is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    body = request.get_json(silent=True) or {}
    current_raw = body.get("current_treatments") or []
    current_treatments = []
    for t in current_raw:
        current_treatments.append(TreatmentRecord(
            item_key=t.get("item_key") or "",
            period=t.get("period") or "",
            treatment_kind=(t.get("treatment_kind") or "expense").strip().lower(),
            account_code=t.get("account_code"),
            citation=t.get("citation"),
        ))
    period_current = (body.get("period_current") or "").strip()
    period_prior = (body.get("period_prior") or "").strip() or None
    coa = body.get("coa")
    description_to_account = None
    if body.get("description_to_account"):
        description_to_account = [tuple(x) for x in body["description_to_account"] if isinstance(x, (list, tuple)) and len(x) >= 2]
    prior_description_to_account = None
    if body.get("prior_description_to_account"):
        prior_description_to_account = [tuple(x) for x in body["prior_description_to_account"] if isinstance(x, (list, tuple)) and len(x) >= 2]
    just_raw = body.get("recorded_justifications") or []
    recorded_justifications = []
    for j in just_raw:
        recorded_justifications.append(PolicyChangeJustification(
            effective_date=j.get("effective_date") or "",
            policy_area=j.get("policy_area") or "",
            change_description=j.get("change_description") or "",
            citation=j.get("citation"),
            reasoning=j.get("reasoning"),
        ))
    try:
        report = run_consistency_check(
            current_treatments=current_treatments,
            prior_treatments=None,
            coa=coa,
            description_to_account=description_to_account,
            prior_description_to_account=prior_description_to_account,
            period_current=period_current,
            period_prior=period_prior,
            recorded_justifications=recorded_justifications if just_raw else None,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    def _flag(f):
        return {
            "flag_type": f.flag_type,
            "message": f.message,
            "item_key": f.item_key,
            "period": f.period,
            "prior_treatment": f.prior_treatment,
            "current_treatment": f.current_treatment,
            "account_code": f.account_code,
            "detail": f.detail,
        }
    return jsonify({
        "timestamp_utc": report.timestamp_utc,
        "period_current": report.period_current,
        "period_prior": report.period_prior,
        "passed": report.passed,
        "coa_valid": report.coa_valid,
        "summary": report.summary,
        "flags": [_flag(f) for f in report.flags],
    })


@app.route("/api/compliance/treatment", methods=["POST"])
def api_compliance_treatment():
    """
    Record accounting treatment for an item/period (e.g. R&D → capitalize in 2024-Q1).
    POST body: { "item_key", "period", "treatment_kind", "account_code?", "citation?" } or { "treatments": [ ... ] }.
    """
    if not HAS_CONSISTENCY_CHECK or record_treatment is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    body = request.get_json(silent=True) or {}
    if body.get("treatments"):
        for t in body["treatments"]:
            record_treatment(TreatmentRecord(
                item_key=t.get("item_key") or "",
                period=t.get("period") or "",
                treatment_kind=(t.get("treatment_kind") or "expense").strip().lower(),
                account_code=t.get("account_code"),
                citation=t.get("citation"),
            ))
        return jsonify({"ok": True, "recorded": len(body["treatments"])})
    record_treatment(TreatmentRecord(
        item_key=body.get("item_key") or "",
        period=body.get("period") or "",
        treatment_kind=(body.get("treatment_kind") or "expense").strip().lower(),
        account_code=body.get("account_code"),
        citation=body.get("citation"),
    ))
    return jsonify({"ok": True, "recorded": 1})


@app.route("/api/compliance/policy-change-justification", methods=["POST"])
def api_compliance_policy_change_justification():
    """
    Record a 'Change in Accounting Principle' justification (e.g. ASC 250-10-45).
    POST body: effective_date, policy_area, change_description, citation?, reasoning?.
    """
    if not HAS_CONSISTENCY_CHECK or record_policy_change_justification is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    body = request.get_json(silent=True) or {}
    if not body.get("effective_date") or not body.get("policy_area") or not body.get("change_description"):
        return jsonify({"error": "effective_date, policy_area, and change_description required"}), 400
    record_policy_change_justification(PolicyChangeJustification(
        effective_date=body.get("effective_date"),
        policy_area=body.get("policy_area"),
        change_description=body.get("change_description"),
        citation=body.get("citation"),
        reasoning=body.get("reasoning"),
    ))
    return jsonify({"ok": True})


@app.route("/api/compliance/treatments", methods=["GET"])
def api_compliance_treatments():
    """Get treatment history for a period. Query: period (required)."""
    if not HAS_CONSISTENCY_CHECK or get_treatments_for_period is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    period = request.args.get("period") or ""
    if not period:
        return jsonify({"error": "Query param 'period' required"}), 400
    try:
        treatments = get_treatments_for_period(period)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "period": period,
        "treatments": [
            {"item_key": t.item_key, "period": t.period, "treatment_kind": t.treatment_kind, "account_code": t.account_code, "citation": t.citation}
            for t in treatments
        ],
    })


@app.route("/api/compliance/policy-change-justifications", methods=["GET"])
def api_compliance_policy_change_justifications():
    """List recorded Change in Accounting Principle justifications. Query: period_start?, period_end?, policy_area?."""
    if not HAS_CONSISTENCY_CHECK or get_policy_change_justifications is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    try:
        justifications = get_policy_change_justifications(
            period_start=request.args.get("period_start"),
            period_end=request.args.get("period_end"),
            policy_area=request.args.get("policy_area"),
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "justifications": [
            {"effective_date": j.effective_date, "policy_area": j.policy_area, "change_description": j.change_description, "citation": j.citation, "reasoning": j.reasoning}
            for j in justifications
        ],
    })


@app.route("/api/compliance/validate-coa", methods=["POST"])
def api_compliance_validate_coa():
    """
    Validate Chart of Accounts: no duplicate codes, valid types, no orphan/drift in mappings.
    POST body: coa (list or dict), description_to_account?, prior_description_to_account?.
    """
    if not HAS_CONSISTENCY_CHECK or validate_coa is None:
        return jsonify({"error": "Consistency check module not available"}), 503
    body = request.get_json(silent=True) or {}
    coa = body.get("coa")
    if coa is None:
        return jsonify({"error": "Missing 'coa'"}), 400
    description_to_account = None
    if body.get("description_to_account"):
        description_to_account = [tuple(x) for x in body["description_to_account"] if isinstance(x, (list, tuple)) and len(x) >= 2]
    prior_description_to_account = None
    if body.get("prior_description_to_account"):
        prior_description_to_account = [tuple(x) for x in body["prior_description_to_account"] if isinstance(x, (list, tuple)) and len(x) >= 2]
    try:
        valid, flags = validate_coa(coa, description_to_account, prior_description_to_account)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "valid": valid,
        "flags": [{"flag_type": f.flag_type, "message": f.message, "account_code": f.account_code, "detail": f.detail} for f in flags],
    })


# --- Governance: Immutable audit log, Skepticism Agent, chain verify ---
@app.route("/api/governance/audit-log", methods=["GET"])
def api_governance_audit_log():
    """
    Read-only immutable audit log: every LLM decision, prompt, and financial data accessed.
    Query params: limit (default 100), agent_type, since_iso.
    """
    if not HAS_GOVERNANCE:
        return jsonify({"error": "Governance module not available"}), 503
    limit = request.args.get("limit", 100, type=int)
    agent_type = request.args.get("agent_type") or None
    since_iso = request.args.get("since_iso") or None
    try:
        rows = read_llm_decision_log(limit=limit, agent_type=agent_type, since_iso=since_iso)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"audit_log": rows})


@app.route("/api/governance/skepticism-scan", methods=["POST"])
def api_governance_skepticism_scan():
    """
    Run CFA-level Skepticism Agent on journal entries (Benford's Law, weekend entries, round-sum).
    Designed to run every 24 hours. POST body: { "entries": [ { "date", "description", "amount", ... } ] }.
    """
    if not HAS_GOVERNANCE:
        return jsonify({"error": "Governance module not available"}), 503
    body = request.get_json(silent=True) or {}
    entries_raw = body.get("entries") or []
    options = body.get("options") or {}
    entries = []
    for e in entries_raw:
        amt = e.get("amount")
        if amt is not None:
            amt = Decimal(str(amt))
        else:
            amt = Decimal("0")
        entries.append(JournalEntryForScan(
            date=e.get("date") or "",
            description=e.get("description") or "",
            account_code=e.get("account_code"),
            account_name=e.get("account_name"),
            amount=amt,
            debit_account=e.get("debit_account"),
            credit_account=e.get("credit_account"),
            entry_id=e.get("entry_id"),
        ))
    try:
        result = run_skepticism_scan(entries, options=options)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "scan_timestamp_utc": result.scan_timestamp_utc,
        "entries_scanned": result.entries_scanned,
        "benford_deviation_score": result.benford_deviation_score,
        "benford_flags": [
            {"digit": f.digit, "expected_proportion": f.expected_proportion, "observed_proportion": f.observed_proportion, "count": f.count, "total_count": f.total_count}
            for f in result.benford_flags
        ],
        "weekend_flags": [
            {"date": f.date, "day_of_week": f.day_of_week, "description": f.description, "amount": f.amount, "account_code": f.account_code}
            for f in result.weekend_flags
        ],
        "round_sum_flags": [
            {"amount": f.amount, "round_unit": f.round_unit, "description": f.description, "date": f.date, "account_code": f.account_code}
            for f in result.round_sum_flags
        ],
        "summary": result.summary,
        "passed": result.passed,
    })


@app.route("/api/governance/forensic-scan", methods=["POST"])
def api_governance_forensic_scan():
    """
    Forensic Skeptic: Benford's Law, round-sum, unusual-time (e.g. 2 AM Sunday).
    Run every 24 hours or upon file upload. Do not alert the user who made the entry;
    anomalies are persisted to Audit Dashboard for Controller review.
    POST body: { "entries": [ { "date", "description", "amount", "created_at?", "created_by?" } ], "requesting_user_id?", "options?" }.
    """
    if not HAS_GOVERNANCE or run_forensic_scan is None:
        return jsonify({"error": "Governance / Forensic Skeptic not available"}), 503
    body = request.get_json(silent=True) or {}
    entries_raw = body.get("entries") or []
    requesting_user_id = body.get("requesting_user_id")
    options = body.get("options") or {}
    entries = []
    for e in entries_raw:
        amt = e.get("amount")
        if amt is not None:
            amt = Decimal(str(amt))
        else:
            amt = Decimal("0")
        entries.append(ForensicEntryForScan(
            date=e.get("date") or "",
            description=e.get("description") or "",
            amount=amt,
            account_code=e.get("account_code"),
            account_name=e.get("account_name"),
            debit_account=e.get("debit_account"),
            credit_account=e.get("credit_account"),
            entry_id=e.get("entry_id"),
            created_at=e.get("created_at"),
            created_by=e.get("created_by"),
        ))
    result = run_forensic_scan(entries, requesting_user_id=requesting_user_id, options=options)
    return jsonify({
        "scan_timestamp_utc": result.scan_timestamp_utc,
        "entries_scanned": result.entries_scanned,
        "benford_deviation_score": result.benford_deviation_score,
        "anomalies_for_dashboard": result.anomalies_for_dashboard,
        "summary": result.summary,
        "passed": result.passed,
        "round_sum_flags": result.round_sum_flags,
        "unusual_time_flags": result.unusual_time_flags,
        "weekend_flags": result.weekend_flags,
        "benford_flags": result.benford_flags,
    })


@app.route("/api/governance/verify-chain", methods=["GET"])
def api_governance_verify_chain():
    """Verify hash chain integrity of the immutable audit log."""
    if not HAS_GOVERNANCE:
        return jsonify({"error": "Governance module not available"}), 503
    try:
        result = verify_chain()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(result)


# --- Black Box recording (prompt, thought_process, python_execution, final_response) ---
try:
    from audit_logger import (
        init_black_box_db,
        record_prompt,
        record_thought_process,
        record_python_execution,
        record_final_response,
        record_interaction,
        get_logs,
        generate_reconstruction_report,
    )
    HAS_BLACK_BOX = True
except ImportError:
    HAS_BLACK_BOX = False


@app.route("/api/audit/black-box/record", methods=["POST"])
def api_black_box_record():
    """
    Record one Black Box entry: prompt, thought_process, python_execution, or final_response.
    Body: entry_type, payload, model_id?, user_id?, authority_level?, session_id?, request_id?
    For python_execution: payload can be JSON { code, result_summary, success?, full_result? }.
    """
    if not HAS_BLACK_BOX:
        return jsonify({"error": "Black Box audit logger not available"}), 503
    body = request.get_json(silent=True) or {}
    entry_type = (body.get("entry_type") or "").strip()
    payload = body.get("payload")
    if entry_type not in ("prompt", "thought_process", "python_execution", "final_response"):
        return jsonify({"error": "entry_type must be prompt, thought_process, python_execution, or final_response"}), 400
    if payload is None:
        return jsonify({"error": "payload required"}), 400
    if entry_type == "python_execution" and isinstance(payload, dict):
        payload = json.dumps(payload, default=str)
    payload = str(payload)
    meta = body.get("meta")
    model_id = body.get("model_id")
    user_id = body.get("user_id")
    authority_level = body.get("authority_level")
    session_id = body.get("session_id")
    request_id = body.get("request_id")
    try:
        if entry_type == "prompt":
            rid = record_prompt(payload, model_id=model_id, user_id=user_id, authority_level=authority_level, session_id=session_id, request_id=request_id)
        elif entry_type == "thought_process":
            rid = record_thought_process(payload, model_id=model_id, user_id=user_id, authority_level=authority_level, session_id=session_id, request_id=request_id)
        elif entry_type == "python_execution":
            data = json.loads(payload) if isinstance(payload, str) and payload.startswith("{") else {"code": payload, "result_summary": ""}
            rid = record_python_execution(
                data.get("code", ""),
                data.get("result_summary", ""),
                success=data.get("success", True),
                model_id=model_id,
                user_id=user_id,
                authority_level=authority_level,
                session_id=session_id,
                request_id=request_id,
                full_result=data.get("full_result"),
            )
        else:
            rid = record_final_response(payload, model_id=model_id, user_id=user_id, authority_level=authority_level, session_id=session_id, request_id=request_id, meta=meta)
        return jsonify({"ok": True, "entry_type": entry_type, "id": rid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/audit/black-box/interaction", methods=["POST"])
def api_black_box_interaction():
    """
    Record a full interaction: prompt, thought_process?, python_executions?, final_response.
    Body: prompt, thought_process?, python_executions? [ { code, result_summary, success?, full_result? } ], final_response?, model_id?, user_id?, authority_level?, session_id?, request_id?
    """
    if not HAS_BLACK_BOX:
        return jsonify({"error": "Black Box audit logger not available"}), 503
    body = request.get_json(silent=True) or {}
    prompt = body.get("prompt") or ""
    thought_process = body.get("thought_process")
    python_executions = body.get("python_executions")
    final_response = body.get("final_response") or ""
    ids = record_interaction(
        prompt=prompt,
        thought_process=thought_process,
        python_executions=python_executions,
        final_response=final_response,
        model_id=body.get("model_id"),
        user_id=body.get("user_id"),
        authority_level=body.get("authority_level"),
        session_id=body.get("session_id"),
        request_id=body.get("request_id"),
    )
    return jsonify({"ok": True, "ids": ids})


@app.route("/api/audit/black-box/logs", methods=["GET"])
def api_black_box_logs():
    """Read-only query of Black Box logs. Query params: date_from, date_to, user_id, entry_type, session_id, limit."""
    if not HAS_BLACK_BOX:
        return jsonify({"error": "Black Box audit logger not available"}), 503
    try:
        logs = get_logs(
            date_from=request.args.get("date_from"),
            date_to=request.args.get("date_to"),
            user_id=request.args.get("user_id"),
            entry_type=request.args.get("entry_type"),
            session_id=request.args.get("session_id"),
            limit=min(500, max(1, int(request.args.get("limit", 100)))),
        )
        return jsonify({"logs": logs, "count": len(logs)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/audit/black-box/reconstruction", methods=["GET"])
def api_black_box_reconstruction():
    """
    Generate a Reconstruction Report: "Why did you approve X in June?"
    Query params: date_from (required), date_to?, query? (e.g. capitalization, 50k), user_id?, session_id?
    """
    if not HAS_BLACK_BOX:
        return jsonify({"error": "Black Box audit logger not available"}), 503
    date_from = request.args.get("date_from")
    if not date_from:
        return jsonify({"error": "date_from required (e.g. 2025-06-01)"}), 400
    try:
        report = generate_reconstruction_report(
            date_from=date_from,
            date_to=request.args.get("date_to"),
            query=request.args.get("query"),
            user_id=request.args.get("user_id"),
            session_id=request.args.get("session_id"),
        )
        return jsonify(report)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/audit/dashboard/forensic-anomalies", methods=["GET"])
def api_audit_dashboard_forensic_anomalies():
    """
    Audit Dashboard (Controller only): list forensic anomalies flagged by Forensic Skeptic.
    Anomalies are not shown to the user who made the entry; Controller sees all.
    Query params: limit?, scan_since? (ISO timestamp), created_by?, flag_type? (round_sum|unusual_time|weekend|benford).
    """
    if not HAS_GOVERNANCE or get_forensic_anomalies is None:
        return jsonify({"error": "Governance / Audit Dashboard not available"}), 503
    try:
        limit = min(500, max(1, int(request.args.get("limit", 200))))
        anomalies = get_forensic_anomalies(
            limit=limit,
            scan_since=request.args.get("scan_since"),
            created_by=request.args.get("created_by"),
            flag_type=request.args.get("flag_type"),
        )
        return jsonify({"forensic_anomalies": anomalies, "count": len(anomalies)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Global Tax & FX Translation (ASC 830, deferred tax, nexus) ---
@app.route("/api/tax/fx/remeasure", methods=["POST"])
def api_tax_fx_remeasure():
    """
    ASC 830: Remeasure foreign-currency positions to functional currency.
    POST body: functional_currency, current_rates { EUR: rate, ... }, as_of_date,
    positions: [ { currency, amount, is_monetary, balance_date, historical_rate? } ].
    """
    body = request.get_json(silent=True) or {}
    functional = (body.get("functional_currency") or "USD").strip().upper()
    current_rates = body.get("current_rates") or {}
    current_rates = {k: Decimal(str(v)) for k, v in current_rates.items()}
    as_of_str = body.get("as_of_date")
    from datetime import date as date_type
    as_of = date_type.fromisoformat(as_of_str[:10]) if as_of_str else date_type.today()
    positions_raw = body.get("positions") or []
    positions = []
    for p in positions_raw:
        positions.append(FXPosition(
            currency=(p.get("currency") or "USD").strip().upper(),
            amount=Decimal(str(p.get("amount", 0))),
            is_monetary=bool(p.get("is_monetary", True)),
            balance_date=date_type.fromisoformat((p.get("balance_date") or as_of_str or str(as_of))[:10]) if (p.get("balance_date") or as_of_str) else as_of,
            historical_rate=Decimal(str(p["historical_rate"])) if p.get("historical_rate") is not None else None,
            account_code=p.get("account_code"),
            description=p.get("description"),
        ))
    try:
        results = batch_remeasure_to_functional(positions, functional, current_rates, as_of)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "functional_currency": functional,
        "as_of_date": as_of.isoformat(),
        "results": [
            {
                "functional_amount": str(r.functional_amount),
                "unrealized_gain_loss": str(r.unrealized_gain_loss),
                "rate_used": str(r.rate_used) if r.rate_used else None,
            }
            for r in results
        ],
    })


@app.route("/api/tax/fx/unrealized-gl", methods=["POST"])
def api_tax_fx_unrealized_gl():
    """
    ASC 830-20-35: Compute unrealized FX gain/loss for monetary items.
    POST body: positions [ { currency, amount, is_monetary, account_code? } ], functional_currency,
    current_rates { EUR: rate }, prior_functional_amounts? { account_code: amount }.
    """
    body = request.get_json(silent=True) or {}
    functional = (body.get("functional_currency") or "USD").strip().upper()
    current_rates = {k: Decimal(str(v)) for k, v in (body.get("current_rates") or {}).items()}
    prior = {k: Decimal(str(v)) for k, v in (body.get("prior_functional_amounts") or {}).items()}
    positions_raw = body.get("positions") or []
    from datetime import date as date_type
    as_of = date_type.fromisoformat((body.get("as_of_date") or "")[:10]) if body.get("as_of_date") else date_type.today()
    positions = []
    for p in positions_raw:
        positions.append(FXPosition(
            currency=(p.get("currency") or "USD").strip().upper(),
            amount=Decimal(str(p.get("amount", 0))),
            is_monetary=bool(p.get("is_monetary", True)),
            balance_date=as_of,
            account_code=p.get("account_code"),
        ))
    try:
        total = compute_unrealized_fx_gain_loss(positions, functional, current_rates, prior_functional_amounts=prior, as_of_date=as_of)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "functional_currency": functional,
        "unrealized_gain_loss": str(total),
    })


@app.route("/api/tax/deferred", methods=["POST"])
def api_tax_deferred():
    """
    Deferred tax assets/liabilities from temporary differences (ASC 740).
    POST body: tax_rate, report_date?, beginning_dta?, beginning_dtl?,
    temporary_differences: [ { description, book_basis, tax_basis, is_deductible_temp?, reversal_period? } ].
    """
    body = request.get_json(silent=True) or {}
    tax_rate = Decimal(str(body.get("tax_rate", "0.21")))
    report_date = body.get("report_date")
    from datetime import date as date_type
    report_date = date_type.fromisoformat(report_date[:10]) if report_date else date_type.today()
    beginning_dta = Decimal(str(body.get("beginning_dta", 0)))
    beginning_dtl = Decimal(str(body.get("beginning_dtl", 0)))
    diffs_raw = body.get("temporary_differences") or []
    diffs = []
    for d in diffs_raw:
        diffs.append(TemporaryDifference(
            description=d.get("description") or "",
            book_basis=Decimal(str(d.get("book_basis", 0))),
            tax_basis=Decimal(str(d.get("tax_basis", 0))),
            difference=Decimal(str(d["difference"])) if d.get("difference") is not None else None,
            is_deductible_temp=bool(d.get("is_deductible_temp", True)),
            reversal_period=d.get("reversal_period"),
            account_code=d.get("account_code"),
        ))
    try:
        rollforward = compute_deferred_taxes(diffs, tax_rate, report_date, beginning_dta, beginning_dtl)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "report_date": rollforward.report_date.isoformat(),
        "beginning_dta": str(rollforward.beginning_dta),
        "beginning_dtl": str(rollforward.beginning_dtl),
        "ending_dta": str(rollforward.ending_dta),
        "ending_dtl": str(rollforward.ending_dtl),
        "net_dta": str(rollforward.net_dta),
        "tax_rate": str(rollforward.tax_rate),
        "details": rollforward.details,
    })


@app.route("/api/tax/nexus/check", methods=["POST"])
def api_tax_nexus_check():
    """
    Nexus Checker: detect sales in new jurisdiction (invoice address).
    If new, alert to potential Sales Tax / VAT / GST nexus requirements.
    POST body: { "invoice_address": "..." } or { "invoice_addresses": [ ... ] }.
    """
    body = request.get_json(silent=True) or {}
    single = body.get("invoice_address")
    if single is not None:
        try:
            result = check_nexus(str(single))
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({
            "jurisdiction_country": result.jurisdiction_country,
            "jurisdiction_state": result.jurisdiction_state,
            "is_new_jurisdiction": result.is_new_jurisdiction,
            "alert_message": result.alert_message,
            "recommendation": result.recommendation,
        })
    addrs = body.get("invoice_addresses") or []
    try:
        from tax.nexus_checker import check_nexus_batch
        results = check_nexus_batch(addrs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({
        "results": [
            {
                "jurisdiction_country": r.jurisdiction_country,
                "jurisdiction_state": r.jurisdiction_state,
                "is_new_jurisdiction": r.is_new_jurisdiction,
                "alert_message": r.alert_message,
                "recommendation": r.recommendation,
            }
            for r in results
        ],
    })


@app.route("/api/tax/nexus/known", methods=["GET", "POST"])
def api_tax_nexus_known():
    """
    GET: list known nexus jurisdictions. POST: add known nexus { "country", "state"? }.
    """
    if request.method == "GET":
        try:
            known = get_known_nexus()
        except Exception as e:
            return jsonify({"error": str(e)}), 500
        return jsonify({"known_nexus": [{"country": c, "state": s} for c, s in known]})
    body = request.get_json(silent=True) or {}
    country = (body.get("country") or "").strip()
    if not country:
        return jsonify({"error": "Missing 'country'"}), 400
    state = (body.get("state") or "").strip()
    try:
        add_known_nexus(country, state)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify({"message": "Known nexus added", "country": country, "state": state or None})


# --- Multi-Entity Consolidation Engine ---
def _serialize_consolidation_result(result: "ConsolidationResult") -> dict:
    def _stmt_line(l):
        return {"label": l.label, "amount": _decimal_to_json(l.amount), "account_code": l.account_code}
    bs = result.consolidated_balance_sheet
    out = {
        "report_date": result.report_date.isoformat(),
        "reporting_currency": result.reporting_currency,
        "consolidated_balance_sheet": {
            "report_date": bs.report_date.isoformat(),
            "assets": [_stmt_line(l) for l in bs.assets],
            "liabilities": [_stmt_line(l) for l in bs.liabilities],
            "equity": [_stmt_line(l) for l in bs.equity],
            "total_assets": _decimal_to_json(bs.total_assets),
            "total_liabilities": _decimal_to_json(bs.total_liabilities),
            "total_equity": _decimal_to_json(bs.total_equity),
            "codification_ref": _codification_to_dict(bs.codification_ref),
        },
        "eliminations_applied": [
            {
                "description": e.description,
                "debit_account": e.debit_account,
                "credit_account": e.credit_account,
                "amount": _decimal_to_json(e.amount),
                "entity_debit": e.entity_debit,
                "entity_credit": e.entity_credit,
            }
            for e in result.eliminations_applied
        ],
        "minority_interest": [
            {
                "subsidiary_entity_id": m.subsidiary_entity_id,
                "subsidiary_name": m.subsidiary_name,
                "amount": _decimal_to_json(m.amount),
                "description": m.description,
            }
            for m in result.minority_interest
        ],
        "total_minority_interest": _decimal_to_json(result.total_minority_interest),
        "translation_adjustments": {k: _decimal_to_json(v) for k, v in result.translation_adjustments.items()},
        "intercompany_netted": result.intercompany_netted,
    }
    if result.missing_ic_recommendation:
        rec = result.missing_ic_recommendation
        out["missing_ic_recommendation"] = {
            "entity_receivable": rec.entity_receivable,
            "entity_payable": rec.entity_payable,
            "receivable_account": rec.receivable_account,
            "payable_account": rec.payable_account,
            "variance": _decimal_to_json(rec.variance),
            "suggested_side": rec.suggested_side,
            "explanation": rec.explanation,
            "matching_candidates_count": len(rec.matching_candidates),
        }
        if rec.suggested_entry:
            se = rec.suggested_entry
            out["missing_ic_recommendation"]["suggested_entry"] = {
                "entity_id": se.entity_id,
                "date": se.date.isoformat(),
                "description": se.description,
                "debit_account": se.debit_account,
                "credit_account": se.credit_account,
                "amount": _decimal_to_json(se.amount),
                "reference": se.reference,
            }
    return out


@app.route("/api/consolidation/rollup", methods=["POST"])
def api_consolidation_rollup():
    """
    Multi-Entity Consolidation: roll up trial balances from subsidiaries (possibly different currencies)
    into a single consolidated balance sheet. Uses ASC 830 for FX translation. Applies intercompany
    eliminations and minority interest. If intercompany receivables/payables don't net to zero,
    the agent autonomously searches both ledgers for the missing transaction.
    POST body: reporting_currency, report_date (YYYY-MM-DD), subsidiaries, fx_rates_to_reporting,
    intercompany_pairs, minority_ownerships, optional ledger_inputs.
    """
    if not HAS_CONSOLIDATION:
        return jsonify({"error": "Consolidation module not available"}), 503
    body = request.get_json(silent=True) or {}
    reporting_currency = (body.get("reporting_currency") or "USD").strip().upper()
    report_date_str = body.get("report_date")
    if not report_date_str:
        return jsonify({"error": "Missing 'report_date'"}), 400
    report_date = date.fromisoformat(str(report_date_str)[:10])
    fx_rates = {k: Decimal(str(v)) for k, v in (body.get("fx_rates_to_reporting") or {}).items()}
    translation_rates = body.get("translation_rates")
    if translation_rates is not None:
        translation_rates = {k: Decimal(str(v)) for k, v in translation_rates.items()}

    subsidiaries_raw = body.get("subsidiaries") or []
    if not subsidiaries_raw:
        return jsonify({"error": "Missing or empty 'subsidiaries'"}), 400
    subsidiaries = []
    for s in subsidiaries_raw:
        entity_id = (s.get("entity_id") or "").strip()
        entity_name = (s.get("entity_name") or entity_id).strip()
        func_currency = (s.get("functional_currency") or "USD").strip().upper()
        sub_date_str = s.get("report_date") or report_date_str
        sub_date = date.fromisoformat(str(sub_date_str)[:10])
        lines_raw = s.get("lines") or []
        lines = []
        for ln in lines_raw:
            acc_type_str = (ln.get("account_type") or "ASSET").upper()
            try:
                acc_type = AccountType(acc_type_str)
            except ValueError:
                acc_type = AccountType.ASSET
            lines.append(TrialBalanceLine(
                account_code=(ln.get("account_code") or "").strip(),
                account_name=(ln.get("account_name") or ln.get("account_code") or "").strip(),
                debit=Decimal(str(ln.get("debit", 0))),
                credit=Decimal(str(ln.get("credit", 0))),
                account_type=acc_type,
            ))
        total_debits = Decimal(str(s.get("total_debits", 0)))
        total_credits = Decimal(str(s.get("total_credits", 0)))
        balances = bool(s.get("balances", abs(total_debits - total_credits) < Decimal("0.01")))
        subsidiaries.append(SubsidiaryTrialBalance(
            entity_id=entity_id,
            entity_name=entity_name,
            functional_currency=func_currency,
            report_date=sub_date,
            lines=lines,
            total_debits=total_debits,
            total_credits=total_credits,
            balances=balances,
        ))

    pairs_raw = body.get("intercompany_pairs") or []
    intercompany_pairs = []
    for p in pairs_raw:
        intercompany_pairs.append(InterCompanyPair(
            entity_receivable=(p.get("entity_receivable") or "").strip(),
            entity_payable=(p.get("entity_payable") or "").strip(),
            receivable_account_code=(p.get("receivable_account_code") or "").strip(),
            payable_account_code=(p.get("payable_account_code") or "").strip(),
            description=(p.get("description") or "Intercompany Receivable/Payable").strip(),
        ))

    minority_raw = body.get("minority_ownerships") or []
    minority_ownerships = []
    for m in minority_raw:
        minority_ownerships.append(MinorityOwnership(
            subsidiary_entity_id=(m.get("subsidiary_entity_id") or "").strip(),
            minority_pct=Decimal(str(m.get("minority_pct", 0))),
        ))

    ledger_inputs = []
    for li in body.get("ledger_inputs") or []:
        entity_id = (li.get("entity_id") or "").strip()
        as_of_str = li.get("as_of") or report_date_str
        as_of_d = date.fromisoformat(str(as_of_str)[:10])
        entries_raw = li.get("entries") or []
        entries = []
        for e in entries_raw:
            dt = e.get("date")
            d = date.fromisoformat(str(dt)[:10]) if dt else report_date
            entries.append(GLEntryLike(
                date=d,
                description=(e.get("description") or "").strip(),
                debit_account=(e.get("debit_account") or "").strip(),
                credit_account=(e.get("credit_account") or "").strip(),
                amount=Decimal(str(e.get("amount", 0))),
                reference=e.get("reference"),
            ))
        ledger_inputs.append(SubsidiaryLedgerInput(entity_id=entity_id, entries=entries, as_of=as_of_d))

    input_data = ConsolidationInput(
        reporting_currency=reporting_currency,
        report_date=report_date,
        subsidiaries=subsidiaries,
        fx_rates_to_reporting=fx_rates,
        translation_rates=translation_rates,
        intercompany_pairs=intercompany_pairs,
        minority_ownerships=minority_ownerships,
        ledger_inputs=ledger_inputs,
    )
    try:
        result = roll_up_to_consolidated_balance_sheet(input_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(_serialize_consolidation_result(result))


# --- Market Intelligence (Strategic Analyst) ---
@app.route("/api/market-intelligence", methods=["POST"])
def api_market_intelligence():
    """
    Market Intelligence: competitor 10-K/10-Q, DSO/Inventory Turnover benchmarking,
    Board Deck Summary, DCF valuation. POST body: company_name, competitor_tickers (3),
    company_dso_days, company_inventory_turnover, industry_avg_dso_days, industry_avg_inventory_turnover,
    risk_free_rate, free_cash_flows [], terminal_growth_rate?, equity_risk_premium?, beta?.
    """
    if not HAS_STRATEGIC_ANALYST:
        return jsonify({"error": "Strategic Analyst module not available"}), 503
    body = request.get_json(silent=True) or {}
    company_name = (body.get("company_name") or "Company").strip()
    competitor_tickers = body.get("competitor_tickers") or []
    if not isinstance(competitor_tickers, list):
        competitor_tickers = [str(competitor_tickers)]
    competitor_tickers = [str(t).strip().upper() for t in competitor_tickers if t]
    try:
        company_dso_days = float(body.get("company_dso_days", 0))
        company_inventory_turnover = float(body.get("company_inventory_turnover", 0))
        industry_avg_dso_days = float(body.get("industry_avg_dso_days", 45))
        industry_avg_inventory_turnover = float(body.get("industry_avg_inventory_turnover", 6))
        risk_free_rate = float(body.get("risk_free_rate", 0.045))
        free_cash_flows = body.get("free_cash_flows") or []
        if not isinstance(free_cash_flows, list):
            free_cash_flows = [float(free_cash_flows)] if free_cash_flows is not None else []
        free_cash_flows = [float(x) for x in free_cash_flows]
        terminal_growth_rate = float(body.get("terminal_growth_rate", 0.02))
        equity_risk_premium = float(body.get("equity_risk_premium", 0.055))
        beta = float(body.get("beta", 1.0))
    except (TypeError, ValueError) as e:
        return jsonify({"error": "Invalid numeric field", "message": str(e)}), 400
    accounting_context = body.get("accounting_context")
    if accounting_context is not None and not isinstance(accounting_context, str):
        accounting_context = str(accounting_context) if accounting_context else None
    try:
        result = run_market_intelligence(
            company_name=company_name,
            competitor_tickers=competitor_tickers,
            company_dso_days=company_dso_days,
            company_inventory_turnover=company_inventory_turnover,
            industry_avg_dso_days=industry_avg_dso_days,
            industry_avg_inventory_turnover=industry_avg_inventory_turnover,
            risk_free_rate=risk_free_rate,
            free_cash_flows=free_cash_flows,
            terminal_growth_rate=terminal_growth_rate,
            web_search=None,
            equity_risk_premium=equity_risk_premium,
            beta=beta,
            accounting_context=accounting_context,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(result)


# --- Document Generation Service (PDF / CSV) ---
@app.route("/api/export/pdf", methods=["POST"])
def api_export_pdf():
    """
    Export a professional financial package as PDF.
    POST body: ReportPayload + executive_summary?, cfa_insights?, pdf_type? ("detailed" | "summary").
    - detailed: Executive Summary, Financials, CFA Insights, full Audit Trail.
    - summary: Executive Summary, key Financials, Audit Trail (rules cited only).
    Returns PDF file for download.
    """
    if not HAS_EXPORT:
        return jsonify({"error": "Export module not available"}), 503
    body = request.get_json(silent=True) or {}
    pdf_type = (body.get("pdf_type") or request.args.get("pdf_type") or "detailed").strip().lower()
    if pdf_type not in ("detailed", "summary"):
        pdf_type = "detailed"
    try:
        pdf_bytes = generate_pdf_report(body, pdf_type=pdf_type)
        name = "financial_report_summary.pdf" if pdf_type == "summary" else "financial_report.pdf"
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=name,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export/csv", methods=["POST"])
def api_export_csv():
    """
    Export CPA-verified Clean Ledger as structured CSV (injection-safe).
    POST body: { "clean_ledger": [ { "account_code", "account_name", "debit", "credit", "account_type" } ] }.
    Returns CSV file for download.
    """
    if not HAS_EXPORT:
        return jsonify({"error": "Export module not available"}), 503
    body = request.get_json(silent=True) or {}
    try:
        csv_bytes = generate_csv_report(body)
        return send_file(
            io.BytesIO(csv_bytes),
            mimetype="text/csv; charset=utf-8",
            as_attachment=True,
            download_name="clean_ledger.csv",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export/excel", methods=["POST"])
def api_export_excel():
    """
    Export a Big-4 style report as Excel (with formulas for totals).
    POST body: ReportPayload (cover, financial_statements, strategic_analysis, audit_trail).
    Returns Excel file for download.
    """
    if not HAS_EXPORT:
        return jsonify({"error": "Export module not available"}), 503
    body = request.get_json(silent=True) or {}
    try:
        excel_bytes = generate_excel_report(body)
        return send_file(
            io.BytesIO(excel_bytes),
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="financial_report.xlsx",
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Validation: Assets = Liabilities + Equity ---
@app.route("/api/validate/balance-sheet", methods=["POST"])
def api_validate_balance_sheet():
    """
    POST body: { "assets": total_assets, "liabilities": total_liabilities, "equity": total_equity }
    Returns whether Assets = Liabilities + Equity (within tolerance).
    """
    body = request.get_json(silent=True) or {}
    assets = Decimal(str(body.get("assets", 0)))
    liabilities = Decimal(str(body.get("liabilities", 0)))
    equity = Decimal(str(body.get("equity", 0)))
    tolerance = Decimal("0.02")
    rhs = liabilities + equity
    balances = abs(assets - rhs) <= tolerance
    return jsonify({
        "balances": balances,
        "assets": _decimal_to_json(assets),
        "liabilities_plus_equity": _decimal_to_json(rhs),
        "difference": _decimal_to_json(assets - rhs),
        "codification_ref": _codification_to_dict(ASC_210),
    })


# --- Quantitative Agent: Secure Python execution ---
try:
    from python_executor import execute_for_quantitative_agent, execute, ExecutionResult
    HAS_PYTHON_EXECUTOR = True
except ImportError:
    HAS_PYTHON_EXECUTOR = False


@app.route("/api/cfa/scenario-analysis", methods=["POST"])
def api_cfa_scenario_analysis():
    """
    Strategic Sandbox: recalc Cash Runway and Break-even from scenario snapshot.
    Body: { snapshot: dict, revenueChangePercent?: number, newEmployeeCount?: number, newEmployeeSalary?: number }.
    Returns: { burn_rate, runway_months, break_even_revenue } (Python sandbox logic).
    """
    body = request.get_json(silent=True) or {}
    snapshot = body.get("snapshot") or {}
    revenue_change_pct = float(body.get("revenueChangePercent") or 0)
    new_count = max(0, int(body.get("newEmployeeCount") or 0))
    new_salary = max(0.0, float(body.get("newEmployeeSalary") or 0))
    revenue = float(snapshot.get("revenue") or 0) * (1 + revenue_change_pct / 100.0)
    cogs = float(snapshot.get("costOfGoodsSold") or 0)
    op_ex = float(snapshot.get("operatingExpenses") or 0) + new_count * new_salary
    cash = float(snapshot.get("cash") or 0)
    net_income = revenue - cogs - op_ex
    burn_rate = 0.0 if net_income >= 0 else abs(net_income) / 12.0
    runway = (cash / burn_rate) if burn_rate > 0 else 999.0
    break_even_revenue = cogs + op_ex
    return jsonify({
        "burn_rate": burn_rate,
        "runway_months": min(999.0, runway),
        "break_even_revenue": break_even_revenue,
    })


@app.route("/api/quantitative/execute", methods=["POST"])
def api_quantitative_execute():
    """
    Secure Python execution for the Quantitative Agent.
    Body: { "code": str, "formula_name"?: str, "max_attempts"?: int }.
    Returns: success, result, source_code, source_code_block (collapsed for auditor), error?, attempt.
    Agent must write Python for calculations with more than two variables (NPV, WACC, multi-year depreciation).
    Uses pandas for ledger manipulation and numpy for financial modeling.
    On failure: autonomously debugs and retries up to max_attempts (default 3) before returning error.
    """
    if not HAS_PYTHON_EXECUTOR:
        return jsonify({"error": "Python executor not available", "success": False}), 503
    body = request.get_json(silent=True) or {}
    code = (body.get("code") or "").strip()
    formula_name = body.get("formula_name")
    max_attempts = min(3, max(1, int(body.get("max_attempts", 3))))
    if not code:
        return jsonify({"error": "Missing 'code' in body", "success": False}), 400
    try:
        out = execute_for_quantitative_agent(code, formula_name=formula_name, max_attempts=max_attempts)
        return jsonify(out)
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "source_code": code,
            "source_code_block": f'<details><summary>Source Code</summary>\n\n```python\n{code}\n```\n\n</details>',
        }), 500


# --- Health ---
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "finos-cpa-agent"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
