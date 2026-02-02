"""
Layout-aware extraction: PDF (OCR / unstructured), CSV, Excel.
Produces raw list of dicts for column_cleaner and engine.
"""
from __future__ import annotations

import csv
import io
import tempfile
from pathlib import Path
from typing import Any

# Optional: unstructured for layout-aware PDF + table extraction
try:
    from unstructured.partition.auto import partition
    HAS_UNSTRUCTURED = True
except ImportError:
    HAS_UNSTRUCTURED = False

# Optional: openpyxl for Excel
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

# Optional: pandas for CSV/Excel (unified and robust)
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False


def _normalize_header(h: str) -> str:
    return str(h or "").strip().replace(" ", "_").lower()


def _row_dict(header: list[str], row: list[Any]) -> dict[str, Any]:
    return {header[i] if i < len(header) else f"col_{i}": (row[i] if i < len(row) else None) for i in range(max(len(header), len(row)))}


# --- CSV ---
def extract_csv(content: bytes, filename: str = "") -> list[dict[str, Any]]:
    """Parse CSV into list of row dicts (first row = header)."""
    text = content.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []
    header = [str(h or f"col_{i}").strip() for i, h in enumerate(rows[0])]
    out = []
    for r in rows[1:]:
        if not any(c is not None and str(c).strip() for c in r):
            continue
        out.append(_row_dict(header, r))
    return out


# --- Excel ---
def extract_excel_openpyxl(path: Path) -> list[dict[str, Any]]:
    """Parse Excel (first sheet) into list of row dicts."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    out: list[dict[str, Any]] = []
    sheet = wb.active
    if not sheet:
        wb.close()
        return []
    rows = list(sheet.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return []
    header = [str(h or f"col_{i}").strip() for i, h in enumerate(rows[0])]
    for row in rows[1:]:
        if not any(c is not None for c in row):
            continue
        out.append(_row_dict(header, list(row)))
    return out


def extract_excel_pandas(content: bytes, ext: str) -> list[dict[str, Any]]:
    """Parse Excel with pandas; returns list of row dicts."""
    if ext == ".xlsx" or content[:4] == b"PK\x03\x04":
        df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0)
    else:
        df = pd.read_excel(io.BytesIO(content), sheet_name=0, header=0)
    df = df.dropna(how="all").fillna("")
    return df.to_dict(orient="records")


# --- PDF: layout-aware OCR / unstructured ---
def extract_pdf_unstructured(path: Path) -> list[dict[str, Any]]:
    """
    Layout-aware PDF extraction via unstructured.
    Extracts tables as structured rows when possible; otherwise text elements as Description.
    """
    elements = partition(filename=str(path))
    tables: list[dict[str, Any]] = []
    current_table: list[dict[str, Any]] = []
    header: list[str] = []

    for el in elements:
        text = getattr(el, "text", None) or str(el)
        if not text or not text.strip():
            continue
        # If element looks like a table row (tabs or pipes, multiple values), split into columns
        parts = [p.strip() for p in text.replace("\t", "|").split("|") if p.strip()]
        if len(parts) >= 2 and any(_looks_numeric(p) for p in parts):
            if not header and not current_table:
                header = [f"col_{i}" for i in range(len(parts))]
            row = _row_dict(header if header else [f"col_{i}" for i in range(len(parts))], parts)
            current_table.append(row)
        else:
            if current_table:
                tables.extend(current_table)
                current_table = []
                header = []
            tables.append({"Description": text.strip()})

    if current_table:
        tables.extend(current_table)
    return tables if tables else [{"Description": "(No content extracted)"}]


def _looks_numeric(s: str) -> bool:
    s = str(s).strip().replace(",", "").replace(" ", "")
    if not s:
        return False
    if s.startswith("(") and s.endswith(")"):
        s = s[1:-1]
    return s.replace(".", "", 1).replace("-", "", 1).isdigit()


def extract_pdf(content: bytes, path: Path | None) -> list[dict[str, Any]]:
    """Extract PDF: use unstructured if available (layout-aware); else return minimal."""
    if path is None:
        fd, tmp = tempfile.mkstemp(suffix=".pdf")
        try:
            with open(fd, "wb") as f:
                f.write(content)
            return extract_pdf(content, Path(tmp))
        finally:
            Path(tmp).unlink(missing_ok=True)

    if HAS_UNSTRUCTURED:
        return extract_pdf_unstructured(path)
    return [{"Description": "PDF extraction requires: pip install unstructured[pdf]", "text": ""}]


def extract_document(
    content: bytes | None = None,
    file_path: str | Path | None = None,
    filename: str = "",
    mime_type: str = "",
) -> list[dict[str, Any]]:
    """
    Route by file type: PDF, CSV, Excel.
    Returns raw list of row dicts for column_cleaner.
    """
    path: Path | None = None
    suffix = (Path(filename).suffix if filename else "").lower()
    if file_path:
        path = Path(file_path)
        if not path.exists():
            return []
        suffix = path.suffix.lower()
    elif content:
        if not suffix and mime_type:
            if "pdf" in mime_type:
                suffix = ".pdf"
            elif "csv" in mime_type or "text/csv" in mime_type:
                suffix = ".csv"
            elif "spreadsheet" in mime_type or "excel" in mime_type:
                suffix = ".xlsx"
        if suffix == ".pdf":
            if path is None:
                fd, tmp = tempfile.mkstemp(suffix=".pdf")
                try:
                    with open(fd, "wb") as f:
                        f.write(content or b"")
                    path = Path(tmp)
                    return extract_pdf(content or b"", path)
                finally:
                    Path(tmp).unlink(missing_ok=True)
            return extract_pdf(content or b"", path)
        if suffix in (".csv", ".txt"):
            return extract_csv(content or b"")
        if suffix in (".xlsx", ".xls"):
            if path is None:
                if HAS_PANDAS:
                    return extract_excel_pandas(content or b"", suffix)
                fd, tmp = tempfile.mkstemp(suffix=suffix)
                try:
                    with open(fd, "wb") as f:
                        f.write(content or b"")
                    path = Path(tmp)
                    if HAS_OPENPYXL:
                        return extract_excel_openpyxl(path)
                finally:
                    Path(tmp).unlink(missing_ok=True)
            else:
                if HAS_OPENPYXL:
                    return extract_excel_openpyxl(path)
                if HAS_PANDAS and content:
                    return extract_excel_pandas(content, suffix)
    return []
