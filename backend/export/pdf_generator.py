"""
Big-4 Style Report — PDF generation using ReportLab.
Produces a professional report with cover page, financial statements,
strategic analysis, and audit trail.
Design tokens aligned with report_styles.css (Enterprise Aesthetic).
"""
from __future__ import annotations

import io
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# Enterprise Aesthetic (see report_styles.css)
TRUST_BLUE = colors.HexColor("#1A365D")
TRUST_BLUE_MUTED = colors.HexColor("#e2e8f0")
AUDIT_GREEN = colors.HexColor("#047857")
AUDIT_GREEN_BG = colors.HexColor("#ecfdf5")
TEXT_SECONDARY = colors.HexColor("#4a5568")
TEXT_MUTED = colors.HexColor("#718096")


def _mini_sparkline_table(values: list[float], bar_width: float = 8, bar_max_height: float = 12) -> Table | None:
    """Mini-sparkline as a small table of vertical bars (trend next to Revenue/EBITDA)."""
    if not values or len(values) < 2:
        return None
    n = min(len(values), 6)
    vals = values[-n:]
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1
    # One row: n cells with proportional height simulated by empty cell + background
    col_widths = [bar_width] * n
    # ReportLab Table cell height is row-based; use a single row with narrow height and background colors
    row_heights = [bar_max_height]
    data = [[""] * n]
    t = Table(data, colWidths=col_widths, rowHeights=row_heights)
    styles = [("FONTSIZE", (0, 0), (-1, -1), 0), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]
    for i, v in enumerate(vals):
        # Normalize 0..1 for intensity (light to Trust Blue)
        intensity = (v - lo) / span
        r = int(26 + (1 - intensity) * 230)  # 26–256
        g = int(56 + (1 - intensity) * 200)
        b = int(93 + (1 - intensity) * 163)
        styles.append(("BACKGROUND", (i, 0), (i, 0), colors.HexColor(f"#{r:02x}{g:02x}{b:02x}")))
    t.setStyle(TableStyle(styles))
    return t


def _get_cover(payload: dict[str, Any]) -> dict[str, Any]:
    c = payload.get("cover") or {}
    return c if isinstance(c, dict) else {
        "title": getattr(c, "title", "Financial Report"),
        "subtitle": getattr(c, "subtitle", None),
        "entity_name": getattr(c, "entity_name", None),
        "report_date": getattr(c, "report_date", None),
        "period_label": getattr(c, "period_label", None),
        "prepared_by": getattr(c, "prepared_by", None),
        "codification": getattr(c, "codification", None),
    }


def _get_financials(payload: dict[str, Any]) -> dict[str, Any]:
    fs = payload.get("financial_statements") or {}
    if isinstance(fs, dict):
        return fs
    return {
        "balance_sheet": getattr(fs, "balance_sheet", {}),
        "profit_and_loss": getattr(fs, "profit_and_loss", {}),
        "report_date": getattr(fs, "report_date", None),
    }


def _fmt_num(value: Any) -> str:
    if value is None:
        return "—"
    try:
        n = float(value)
        return f"{n:,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _add_cover_page(story: list, cover: dict[str, Any]) -> None:
    title = cover.get("title") or "Financial Report"
    story.append(Spacer(1, 1.5 * inch))
    story.append(
        Paragraph(
            f'<font size="24" color="#1a365d"><b>{title}</b></font>',
            ParagraphStyle(name="CoverTitle", alignment=TA_CENTER, spaceAfter=12),
        )
    )
    if cover.get("subtitle"):
        story.append(
            Paragraph(
                f'<font size="12" color="#2d3748">{cover["subtitle"]}</font>',
                ParagraphStyle(name="CoverSub", alignment=TA_CENTER, spaceAfter=24),
            )
        )
    story.append(Spacer(1, 0.5 * inch))
    rows = []
    if cover.get("entity_name"):
        rows.append(["Entity", cover["entity_name"]])
    if cover.get("report_date"):
        rows.append(["Report date", cover["report_date"]])
    if cover.get("period_label"):
        rows.append(["Period", cover["period_label"]])
    if cover.get("prepared_by"):
        rows.append(["Prepared by", cover["prepared_by"]])
    if cover.get("codification"):
        rows.append(["Codification", cover["codification"]])
    if rows:
        t = Table(rows, colWidths=[1.5 * inch, 4 * inch])
        t.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )
        story.append(t)
    story.append(Spacer(1, 1 * inch))
    story.append(
        Paragraph(
            '<font size="9" color="#718096">CPA-verified financial statements · CFA-generated strategic analysis · Audit trail included</font>',
            ParagraphStyle(name="CoverFooter", alignment=TA_CENTER),
        )
    )
    story.append(PageBreak())


def _add_executive_summary(story: list, executive_summary: Any) -> None:
    """Supervisor Agent brief."""
    story.append(
        Paragraph(
            '<font size="16" color="#1a365d"><b>Executive Summary</b></font>',
            ParagraphStyle(name="ESHeading", spaceAfter=12),
        )
    )
    story.append(
        Paragraph(
            '<font size="9" color="#718096">Supervisor Agent brief</font>',
            ParagraphStyle(name="ESSub", spaceAfter=16),
        )
    )
    if isinstance(executive_summary, str) and executive_summary.strip():
        for para in executive_summary.strip().split("\n\n"):
            if para.strip():
                story.append(
                    Paragraph(
                        f'<font size="10">{para.strip().replace("<", "&lt;").replace(">", "&gt;")}</font>',
                        ParagraphStyle(name="ESBody", spaceAfter=8),
                    )
                )
    else:
        story.append(
            Paragraph(
                '<font size="10">No executive summary provided.</font>',
                ParagraphStyle(name="ESBody", spaceAfter=8),
            )
        )
    story.append(PageBreak())


def _add_cfa_insights(story: list, cfa_insights: Any) -> None:
    """Key ratios and trend visualizations (text/table)."""
    story.append(
        Paragraph(
            '<font size="16" color="#1a365d"><b>CFA Insights</b></font>',
            ParagraphStyle(name="CFAHeading", spaceAfter=12),
        )
    )
    story.append(
        Paragraph(
            '<font size="9" color="#718096">Key ratios and trends</font>',
            ParagraphStyle(name="CFASub", spaceAfter=16),
        )
    )
    if isinstance(cfa_insights, str) and cfa_insights.strip():
        for para in cfa_insights.strip().split("\n\n"):
            if para.strip():
                story.append(
                    Paragraph(
                        f'<font size="10">{para.strip().replace("<", "&lt;").replace(">", "&gt;")}</font>',
                        ParagraphStyle(name="CFABody", spaceAfter=8),
                    )
                )
    elif isinstance(cfa_insights, list) and cfa_insights:
        rows = [["Metric", "Value", "Trend / Note"]]
        for item in cfa_insights:
            if isinstance(item, dict):
                metric = item.get("metric") or item.get("title") or item.get("ratio") or ""
                value = item.get("value") or item.get("content") or ""
                trend = item.get("trend") or item.get("note") or ""
                rows.append([str(metric), str(value), str(trend)])
            else:
                rows.append([str(item), "", ""])
        if len(rows) > 1:
            t = Table(rows, colWidths=[2.2 * inch, 1.5 * inch, 2.3 * inch])
            t.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 10),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
                    ]
                )
            )
            story.append(t)
    else:
        story.append(
            Paragraph(
                '<font size="10">No CFA insights in this report.</font>',
                ParagraphStyle(name="CFABody", spaceAfter=8),
            )
        )
    story.append(PageBreak())


def _extract_rules_cited(audit_trail: list[Any]) -> list[str]:
    """Extract unique accounting rules (e.g. IFRS 15, ASC 740) from audit trail citations."""
    seen: set[str] = set()
    rules: list[str] = []
    for entry in audit_trail or []:
        citations = ""
        if isinstance(entry, dict):
            citations = entry.get("citations") or ""
        else:
            citations = getattr(entry, "citations", "") or ""
        for part in citations.replace(",", " ").replace(";", " ").split():
            s = part.strip()
            if len(s) > 2 and s not in seen:
                seen.add(s)
                rules.append(s)
    return rules


def _add_audit_trail_rules_only(story: list, rules_cited: list[str]) -> None:
    """Audit Trail: list of every accounting rule cited (e.g. IFRS 15)."""
    story.append(
        Paragraph(
            '<font size="16" color="#1a365d"><b>Audit Trail — Rules Cited</b></font>',
            ParagraphStyle(name="ATRHeading", spaceAfter=12),
        )
    )
    story.append(
        Paragraph(
            '<font size="9" color="#718096">Every accounting rule (e.g. IFRS 15, ASC 740) cited during the process.</font>',
            ParagraphStyle(name="ATRSub", spaceAfter=16),
        )
    )
    if not rules_cited:
        story.append(
            Paragraph(
                '<font size="10">No rules cited in this report.</font>',
                ParagraphStyle(name="ATREmpty", spaceAfter=8),
            )
        )
        return
    for i, rule in enumerate(rules_cited, 1):
        story.append(
            Paragraph(
                f'<font size="10">{i}. {rule.replace("<", "&lt;").replace(">", "&gt;")}</font>',
                ParagraphStyle(name="ATRItem", spaceAfter=4),
            )
        )


def _add_financial_statements(story: list, financials: dict[str, Any]) -> None:
    # Trust Blue for headings (Enterprise Aesthetic)
    story.append(
        Paragraph(
            '<font size="16" color="#1A365D"><b>CPA-Verified Financial Statements</b></font>',
            ParagraphStyle(name="FSHeading", spaceAfter=12),
        )
    )
    report_date = financials.get("report_date")
    if report_date:
        story.append(
            Paragraph(
                f'<font size="10" color="#4a5568">As of {report_date}</font>',
                ParagraphStyle(name="FSDate", spaceAfter=16),
            )
        )
    bs = financials.get("balance_sheet") or {}
    total_key_map = {"assets": "total_assets", "liabilities": "total_liabilities", "equity": "total_equity"}
    if bs:
        story.append(
            Paragraph(
                '<font size="12" color="#1A365D"><b>Balance Sheet</b></font>',
                ParagraphStyle(name="BSHeading", spaceAfter=8),
            )
        )
        rows = [["Account", "Amount"]]
        for key in ("assets", "liabilities", "equity"):
            arr = bs.get(key) or []
            for item in arr:
                label = item.get("label", "") if isinstance(item, dict) else str(item)
                amt = item.get("amount", 0) if isinstance(item, dict) else 0
                rows.append([label, _fmt_num(amt)])
            total = bs.get(total_key_map[key])
            if total is not None:
                rows.append([f"Total {key.title()}", _fmt_num(total)])
        if len(rows) > 1:
            t = Table(rows, colWidths=[3.5 * inch, 1.5 * inch])
            style = [
                ("BACKGROUND", (0, 0), (-1, 0), TRUST_BLUE_MUTED),
                ("TEXTCOLOR", (0, 0), (-1, 0), TRUST_BLUE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
            # Audit Green for total rows (balanced totals)
            for i in range(1, len(rows)):
                if rows[i][0].startswith("Total "):
                    style.append(("BACKGROUND", (0, i), (-1, i), AUDIT_GREEN_BG))
                    style.append(("TEXTCOLOR", (0, i), (-1, i), AUDIT_GREEN))
                    style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
            t.setStyle(TableStyle(style))
            story.append(KeepTogether([t]))
        story.append(Spacer(1, 0.3 * inch))
    pl = financials.get("profit_and_loss") or {}
    revenue_trend = pl.get("revenue_trend") or financials.get("revenue_trend")
    ebitda_trend = pl.get("ebitda_trend") or financials.get("ebitda_trend")
    net_income_trend = pl.get("net_income_trend") or financials.get("net_income_trend")
    has_trend = bool(revenue_trend or ebitda_trend or net_income_trend)
    if pl:
        story.append(
            Paragraph(
                '<font size="12" color="#1A365D"><b>Statement of Comprehensive Income (P&L)</b></font>',
                ParagraphStyle(name="PLHeading", spaceAfter=8),
            )
        )
        if has_trend:
            rows = [["Account", "Amount", "Trend"]]
        else:
            rows = [["Account", "Amount"]]
        col_widths = [3.5 * inch, 1.5 * inch]
        if has_trend:
            col_widths.append(0.6 * inch)
        for key in ("revenue", "expenses"):
            arr = pl.get(key) or []
            for item in arr:
                label = item.get("label", "") if isinstance(item, dict) else str(item)
                amt = item.get("amount", 0) if isinstance(item, dict) else 0
                if has_trend:
                    rows.append([label, _fmt_num(amt), ""])
                else:
                    rows.append([label, _fmt_num(amt)])
            total = pl.get(f"total_{key}")
            if total is not None:
                spark_cell = _mini_sparkline_table(revenue_trend) if key == "revenue" and revenue_trend else ""
                if has_trend:
                    rows.append([f"Total {key.title()}", _fmt_num(total), spark_cell])
                else:
                    rows.append([f"Total {key.title()}", _fmt_num(total)])
        net = pl.get("net_income")
        if net is not None:
            trend_vals = net_income_trend or ebitda_trend
            spark_cell = _mini_sparkline_table(trend_vals) if trend_vals else ""
            if has_trend:
                rows.append(["Net Income", _fmt_num(net), spark_cell])
            else:
                rows.append(["Net Income", _fmt_num(net)])
        if len(rows) > 1:
            t = Table(rows, colWidths=col_widths)
            style = [
                ("BACKGROUND", (0, 0), (-1, 0), TRUST_BLUE_MUTED),
                ("TEXTCOLOR", (0, 0), (-1, 0), TRUST_BLUE),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, 0), 1, colors.black),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ]
            for i in range(1, len(rows)):
                if rows[i][0].startswith("Total ") or rows[i][0] == "Net Income":
                    style.append(("BACKGROUND", (0, i), (-1, i), AUDIT_GREEN_BG))
                    style.append(("TEXTCOLOR", (0, i), (-1, i), AUDIT_GREEN))
                    style.append(("FONTNAME", (0, i), (-1, i), "Helvetica-Bold"))
            t.setStyle(TableStyle(style))
            story.append(KeepTogether([t]))
    story.append(PageBreak())


def _add_strategic_analysis(story: list, strategic_analysis: Any) -> None:
    story.append(
        Paragraph(
            '<font size="16" color="#1a365d"><b>CFA-Generated Strategic Analysis</b></font>',
            ParagraphStyle(name="SAHeading", spaceAfter=12),
        )
    )
    if isinstance(strategic_analysis, str):
        for para in strategic_analysis.split("\n\n"):
            if para.strip():
                story.append(
                    Paragraph(
                        f'<font size="10">{para.strip().replace("<", "&lt;").replace(">", "&gt;")}</font>',
                        ParagraphStyle(name="SABody", spaceAfter=8),
                    )
                )
    elif isinstance(strategic_analysis, list):
        for item in strategic_analysis:
            if isinstance(item, dict):
                title = item.get("title", "")
                content = item.get("content", "")
                if title:
                    story.append(
                        Paragraph(
                            f'<font size="12" color="#2d3748"><b>{title}</b></font>',
                            ParagraphStyle(name="SASub", spaceAfter=4),
                        )
                    )
                if content:
                    story.append(
                        Paragraph(
                            f'<font size="10">{content.replace("<", "&lt;").replace(">", "&gt;")}</font>',
                            ParagraphStyle(name="SABody", spaceAfter=12),
                        )
                    )
    story.append(PageBreak())


def _add_audit_trail(story: list, audit_trail: list[Any]) -> None:
    story.append(
        Paragraph(
            '<font size="16" color="#1a365d"><b>Audit Trail — AI Reasoning Logs</b></font>',
            ParagraphStyle(name="ATHeading", spaceAfter=12),
        )
    )
    story.append(
        Paragraph(
            '<font size="9" color="#718096">Chain of thought and compliance decisions recorded for auditors.</font>',
            ParagraphStyle(name="ATSub", spaceAfter=16),
        )
    )
    if not audit_trail:
        story.append(
            Paragraph(
                '<font size="10">No audit trail entries in this report.</font>',
                ParagraphStyle(name="ATEmpty", spaceAfter=8),
            )
        )
        return
    for i, entry in enumerate(audit_trail):
        if isinstance(entry, dict):
            ts = entry.get("timestamp_utc", "")
            event = entry.get("event_type", "")
            reasoning = entry.get("reasoning", "")
            citations = entry.get("citations", "")
            outcome = entry.get("outcome", "")
            warning = entry.get("warning_message")
        else:
            ts = getattr(entry, "timestamp_utc", "")
            event = getattr(entry, "event_type", "")
            reasoning = getattr(entry, "reasoning", "")
            citations = getattr(entry, "citations", "")
            outcome = getattr(entry, "outcome", "")
            warning = getattr(entry, "warning_message", None)
        block = [
            Paragraph(
                f'<font size="10" color="#2d3748"><b>#{i + 1} {event}</b> · {ts} · Outcome: {outcome}</font>',
                ParagraphStyle(name="ATEvent", spaceAfter=4),
            ),
            Paragraph(
                f'<font size="9">Reasoning: {reasoning[:500]}{"…" if len(reasoning) > 500 else ""}</font>',
                ParagraphStyle(name="ATReason", spaceAfter=2),
            ),
        ]
        if citations:
            block.append(
                Paragraph(
                    f'<font size="8" color="#718096">Citations: {citations[:300]}{"…" if len(citations) > 300 else ""}</font>',
                    ParagraphStyle(name="ATCite", spaceAfter=2),
                )
            )
        if warning:
            block.append(
                Paragraph(
                    f'<font size="8" color="#c53030">Warning: {warning}</font>',
                    ParagraphStyle(name="ATWarn", spaceAfter=8),
                )
            )
        for el in block:
            story.append(el)
        story.append(Spacer(1, 0.15 * inch))


def build_pdf(payload: dict[str, Any], pdf_type: str = "detailed") -> bytes:
    """
    Build a professional financial package PDF from a report payload.
    pdf_type: "detailed" | "summary"
    - detailed: Cover, Executive Summary, Financials, CFA Insights, Strategic Analysis, full Audit Trail.
    - summary: Cover, Executive Summary, key Financials, Audit Trail (rules cited only).
    Returns PDF bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    story = []
    cover = _get_cover(payload)
    _add_cover_page(story, cover)
    executive_summary = payload.get("executive_summary") or payload.get("supervisor_brief") or ""
    _add_executive_summary(story, executive_summary)
    financials = _get_financials(payload)
    _add_financial_statements(story, financials)
    if pdf_type != "summary":
        cfa_insights = payload.get("cfa_insights") or payload.get("strategic_analysis")
        _add_cfa_insights(story, cfa_insights or "")
        strategic = payload.get("strategic_analysis") or ""
        if strategic and strategic != cfa_insights:
            _add_strategic_analysis(story, strategic)
    audit = payload.get("audit_trail") or []
    rules_cited = payload.get("audit_trail_rules_cited")
    if rules_cited is None:
        rules_cited = _extract_rules_cited(audit)
    if pdf_type == "summary":
        _add_audit_trail_rules_only(story, rules_cited)
    else:
        _add_audit_trail(story, audit)
        if rules_cited and audit:
            story.append(Spacer(1, 0.3 * inch))
            _add_audit_trail_rules_only(story, rules_cited)
    doc.build(story)
    buffer.seek(0)
    return buffer.read()
