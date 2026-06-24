"""
Auto-detect bank and format from filename + content.

Filename rules (highest priority, applied to original filename):
  - Contains "CCA"         → Banco de Bogotá
  - Starts with "extract"  → Itaú (credit card)
  - Contains "itau"        → Itaú
  - Contains "avvillas"    → AV Villas
"""

import os
import re


def detect(filepath: str, original_filename: str = "", file_bytes=None) -> dict:
    """
    Detect bank and format from a file.

    original_filename: the user-facing name (e.g. "extracts-4.pdf").
                       Use this for bank detection when filepath is a temp path.
    filepath:          actual path on disk — used for format detection and PDF sniffing.
    """
    # Prefer original filename for detection; fall back to filepath basename
    name_for_detection = original_filename or os.path.basename(filepath)
    name_lower = name_for_detection.lower()
    ext = os.path.splitext(name_lower)[1]

    fmt = _detect_format(ext)
    bank, confidence = _detect_bank(name_lower, filepath, fmt)

    return {"bank": bank, "format": fmt, "confidence": confidence}


def _detect_format(ext: str) -> str:
    if ext == ".pdf":
        return "pdf"
    if ext in (".xlsx", ".xls"):
        return "xlsx"
    if ext == ".csv":
        return "csv"
    return "unknown"


def _detect_bank(name_lower: str, filepath: str, fmt: str) -> tuple[str, float]:
    # Banco de Bogotá: filenames contain "CCA"
    if "cca" in name_lower:
        return "bogota", 1.0

    # Itaú: filenames start with "extract"
    if re.match(r"^extract", name_lower):
        return "itau", 1.0

    # Other explicit name patterns
    if re.search(r"itau", name_lower):
        return "itau", 0.95
    if re.search(r"av.?villas|avvillas", name_lower):
        return "avvillas", 0.95
    if re.search(r"bogota|banco.*bogot", name_lower):
        return "bogota", 0.95

    # Content sniffing fallback for PDFs with generic filenames
    if fmt == "pdf":
        if filepath:
            return _sniff_pdf(filepath)
        if file_bytes is not None:
            return _sniff_pdf(file_bytes)

    return "unknown", 0.0


def _sniff_pdf(filepath: str) -> tuple[str, float]:
    try:
        import pdfplumber
        with pdfplumber.open(filepath) as pdf:
            if not pdf.pages:
                return "unknown", 0.0
            text = (pdf.pages[0].extract_text() or "").lower()

        if "banco de bogotá" in text or "banco de bogota" in text:
            return "bogota", 0.9
        if "itaú" in text or "itau" in text or "mastercard" in text:
            return "itau", 0.9
        if "av villas" in text or "avvillas" in text:
            return "avvillas", 0.9
    except Exception:
        pass
    return "unknown", 0.0
