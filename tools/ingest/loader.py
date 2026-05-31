"""
Entry point for the ingest pipeline.

load_file(filepath_or_bytes, filename) → IngestResult

When called from Streamlit (bytes upload), the bytes are passed directly to parsers
via BytesIO — no tempfile involved. pdfplumber supports BytesIO natively.
"""

import hashlib
import os
from dataclasses import dataclass, field
from io import BytesIO
from typing import Union

from tools.db.connection import get_connection
from tools.db.queries import upsert_transaction, log_ingest, file_already_ingested
from tools.ingest.detector import detect
from tools.ingest.normalizer import normalize_batch, transaction_to_dict
from tools.ingest.deduplicator import check_duplicates
from tools.ingest.merchant_cleaner import clean_merchant
from tools.ingest.fx_rates import convert_to_cop


@dataclass
class IngestResult:
    bank: str
    format: str
    rows_extracted: int = 0
    rows_inserted: int = 0
    rows_skipped: int = 0
    errors: list = field(default_factory=list)
    status: str = "success"
    already_ingested: bool = False


def load_file(filepath_or_bytes: Union[str, bytes, BytesIO], filename: str = "") -> IngestResult:
    """
    Load a bank statement file into the DB.

    Accepts:
      - str path  → reads from disk (terminal / test usage)
      - bytes     → from Streamlit uploaded_file.read()
      - BytesIO   → file-like object
    """
    conn = get_connection()

    if isinstance(filepath_or_bytes, str):
        # File path: read bytes for hashing, keep path for parser
        filepath = filepath_or_bytes
        with open(filepath, "rb") as f:
            data = f.read()
        effective_filename = filename or os.path.basename(filepath)
        source: Union[str, BytesIO] = filepath
    else:
        # Bytes or BytesIO from Streamlit
        data = filepath_or_bytes if isinstance(filepath_or_bytes, bytes) else filepath_or_bytes.read()
        effective_filename = filename
        source = BytesIO(data)  # pass BytesIO directly to parser — no tempfile needed

    file_hash = _hash_bytes(data)

    if file_already_ingested(file_hash, conn):
        return IngestResult(bank="?", format="?", already_ingested=True, status="success")

    return _process_file(source, effective_filename, file_hash, conn)


def _process_file(source: Union[str, BytesIO], filename: str, file_hash: str, conn) -> IngestResult:
    result = IngestResult(bank="unknown", format="unknown")

    # 1. Detect bank and format using the original filename
    filepath_for_sniff = source if isinstance(source, str) else None
    detection = detect(filepath_for_sniff or "", original_filename=filename)
    result.bank = detection["bank"]
    result.format = detection["format"]

    # If bank unknown and we have a BytesIO, try content sniffing
    if result.bank == "unknown" and isinstance(source, BytesIO):
        source.seek(0)
        detection = detect("", original_filename=filename, file_bytes=source)
        source.seek(0)
        result.bank = detection["bank"]
        result.format = detection["format"]

    # 2. Parse
    try:
        parser = _get_parser(result.bank, result.format)
        if parser is None:
            result.status = "failed"
            result.errors.append(f"No parser disponible para banco='{result.bank}' formato='{result.format}'")
            _write_log(result, filename, file_hash, conn)
            return result

        if isinstance(source, BytesIO):
            source.seek(0)

        raw_txs = parser.extract(source)
        result.rows_extracted = len(raw_txs)
    except Exception as e:
        import traceback
        result.status = "failed"
        result.errors.append(f"Error de parsing: {e} | {traceback.format_exc()[-300:]}")
        _write_log(result, filename, file_hash, conn)
        return result

    if result.rows_extracted == 0:
        result.status = "partial"
        result.errors.append("El parser no encontró transacciones en el archivo.")
        _write_log(result, filename, file_hash, conn)
        return result

    # 3. Normalize
    transactions, norm_errors = normalize_batch(raw_txs, result.bank, filename, parser)
    result.errors.extend(norm_errors)

    # 4. FX rates for non-COP transactions
    for tx in transactions:
        if tx.currency_original != "COP":
            try:
                amount_cop, fx_rate = convert_to_cop(tx.amount_original, tx.currency_original, tx.date)
                tx.amount_cop = amount_cop
                tx.fx_rate = fx_rate
            except Exception as e:
                result.errors.append(f"FX error {tx.id}: {e}")
                tx.amount_cop = tx.amount_original
                tx.fx_rate = 1.0

    # 5. Clean merchant names
    for tx in transactions:
        tx.clean_merchant = clean_merchant(tx.original_description, result.bank)

    # 6. Deduplicate
    dedup = check_duplicates(transactions, conn)
    result.rows_skipped = len(dedup.duplicates)

    # 7. Categorize
    _categorize(dedup.new, conn)

    # 8. Upsert
    for tx in dedup.new:
        try:
            upsert_transaction(transaction_to_dict(tx), conn)
            result.rows_inserted += 1
        except Exception as e:
            result.errors.append(f"DB insert error {tx.id}: {e}")

    conn.commit()

    if result.errors and result.rows_inserted == 0:
        result.status = "failed"
    elif result.errors:
        result.status = "partial"
    else:
        result.status = "success"

    _write_log(result, filename, file_hash, conn)
    return result


def _categorize(transactions, conn) -> None:
    from tools.categorization.engine import categorize_batch
    categorize_batch(transactions, conn)


def _get_parser(bank: str, fmt: str):
    if fmt == "pdf":
        if bank == "bogota":
            from tools.ingest.parsers.bogota_parser import BogotaParser
            return BogotaParser()
        if bank == "itau":
            from tools.ingest.parsers.itau_parser import ItauParser
            return ItauParser()
        if bank == "avvillas":
            from tools.ingest.parsers.avvillas_parser import AVVillasParser
            return AVVillasParser()
        from tools.ingest.parsers.generic_parser import GenericParser
        return GenericParser()
    if fmt in ("xlsx", "xls", "csv"):
        from tools.ingest.parsers.generic_parser import GenericParser
        return GenericParser()
    return None


def _write_log(result: IngestResult, filename: str, file_hash: str, conn) -> None:
    log_ingest({
        "filename": filename,
        "file_hash": file_hash,
        "bank": result.bank,
        "format": result.format,
        "rows_extracted": result.rows_extracted,
        "rows_inserted": result.rows_inserted,
        "rows_skipped": result.rows_skipped,
        "status": result.status,
        "error_message": "; ".join(result.errors)[:500] if result.errors else None,
    }, conn)


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
