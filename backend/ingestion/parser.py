"""
Document parser: PDF and Excel via unstructured (with openpyxl fallback for Excel).
"""

from __future__ import annotations

import io
import tempfile
from pathlib import Path
from typing import Any

# Optional: unstructured for PDF + Excel
try:
    from unstructured.partition.auto import partition
    HAS_UNSTRUCTURED = True
except ImportError:
    HAS_UNSTRUCTURED = False

# Fallback: openpyxl for Excel
try:
    import openpyxl
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False


def _parse_with_unstructured(file_path: str | Path) -> list[dict[str, Any]]:
    """Parse with unstructured; return list of elements (tables → rows, text → chunks)."""
    elements = partition(filename=str(file_path))
    out: list[dict[str, Any]] = []
    for el in elements:
        if hasattr(el, "metadata") and getattr(el.metadata, "text_as_html", None):
            # Table: could parse HTML to rows
            pass
        text = getattr(el, "text", None) or str(el)
        if text and text.strip():
            out.append({"type": type(el).__name__, "text": text.strip()})
    return out


def _parse_excel_openpyxl(file_path: str | Path) -> list[dict[str, Any]]:
    """Parse Excel with openpyxl; return list of row dicts (header from first row)."""
    wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
    rows_list: list[dict[str, Any]] = []
    for sheet in wb.worksheets:
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue
        header = [str(c).strip().lower().replace(" ", "_") if c is not None else f"col_{i}" for i, c in enumerate(rows[0])]
        for row in rows[1:]:
            if not any(c is not None for c in row):
                continue
            rows_list.append(dict(zip(header, (c if c is not None else "" for c in row))))
    wb.close()
    return rows_list


def parse_document(file_path: str | Path | None = None, content: bytes | None = None, filename: str = "") -> list[dict[str, Any]]:
    """
    Parse a financial document (PDF or Excel).
    - file_path: path to file on disk.
    - content: raw bytes (used if file_path is None; written to a temp file for unstructured).
    Returns list of dicts: for Excel typically one dict per row; for PDF, list of text/element dicts.
    """
    path: str | Path
    if file_path is not None:
        path = Path(file_path)
        if not path.exists():
            return []
        suffix = path.suffix.lower()
    else:
        if not content:
            return []
        suffix = Path(filename).suffix.lower() if filename else ".bin"
        if suffix not in (".xlsx", ".xls", ".pdf"):
            suffix = ".xlsx" if content[:4] == b"PK\x03\x04" else ".pdf"
        fd, path = tempfile.mkstemp(suffix=suffix)
        try:
            with open(fd, "wb") as f:
                f.write(content)
            return parse_document(file_path=path, filename=filename or str(path))
        finally:
            Path(path).unlink(missing_ok=True)

    suffix = path.suffix.lower()

    if suffix in (".xlsx", ".xls"):
        if HAS_OPENPYXL:
            return _parse_excel_openpyxl(path)
        if HAS_UNSTRUCTURED:
            return _parse_with_unstructured(path)
        raise RuntimeError("Install openpyxl or unstructured to parse Excel files.")

    if suffix == ".pdf":
        if HAS_UNSTRUCTURED:
            return _parse_with_unstructured(path)
        raise RuntimeError("Install unstructured to parse PDF files.")

    if HAS_UNSTRUCTURED:
        return _parse_with_unstructured(path)
    if suffix in (".xlsx", ".xls") and HAS_OPENPYXL:
        return _parse_excel_openpyxl(path)
    return []
