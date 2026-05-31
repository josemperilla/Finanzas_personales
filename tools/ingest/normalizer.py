import hashlib
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from tools.ingest.parsers.base_parser import RawTransaction, BaseParser


@dataclass
class Transaction:
    id: str
    date: date
    original_description: str
    clean_merchant: Optional[str]
    amount_original: float
    currency_original: str
    amount_cop: Optional[float]
    fx_rate: float
    transaction_type: str   # 'debit' or 'credit'
    source_bank: str
    source_file: str
    account_number: Optional[str] = None
    category_id: Optional[int] = None
    category_source: str = "none"


def generate_transaction_id(tx_date: date, description: str, amount: float, bank: str) -> str:
    """
    SHA256 fingerprint for deduplication.
    Handles legitimate collisions (same merchant, same amount, same day)
    by appending a counter suffix externally if needed.
    """
    key = f"{tx_date.isoformat()}|{description.strip().upper()}|{round(abs(amount), 2)}|{bank}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


def normalize(raw: RawTransaction, bank: str, source_file: str, parser: BaseParser) -> Optional[Transaction]:
    """Convert a RawTransaction into a canonical Transaction."""
    parsed_date = parser.parse_date(raw.date_raw)
    if parsed_date is None:
        return None

    amount = parser.parse_cop_amount(raw.amount_raw)
    tx_type = parser.detect_transaction_type(amount, raw.transaction_type_raw)

    # Normalize currency
    currency = _normalize_currency(raw.currency_raw)

    tx_id = generate_transaction_id(parsed_date, raw.description, amount, bank)

    return Transaction(
        id=tx_id,
        date=parsed_date,
        original_description=raw.description.strip(),
        clean_merchant=None,  # filled by merchant_cleaner later
        amount_original=abs(amount),
        currency_original=currency,
        amount_cop=abs(amount) if currency == "COP" else None,  # FX applied later
        fx_rate=1.0 if currency == "COP" else 0.0,
        transaction_type=tx_type,
        source_bank=bank,
        source_file=source_file,
        account_number=raw.extra.get("account_number"),
    )


def normalize_batch(
    raw_list: list[RawTransaction],
    bank: str,
    source_file: str,
    parser: BaseParser,
) -> tuple[list[Transaction], list[str]]:
    """
    Normalize a list of raw transactions.
    Returns (valid_transactions, errors).
    Handles duplicate IDs within the same batch by appending suffix.
    """
    transactions = []
    errors = []
    seen_ids: dict[str, int] = {}

    for i, raw in enumerate(raw_list):
        try:
            tx = normalize(raw, bank, source_file, parser)
            if tx is None:
                errors.append(f"Row {i}: could not parse date '{raw.date_raw}'")
                continue

            # Handle intra-batch duplicates
            base_id = tx.id
            if base_id in seen_ids:
                seen_ids[base_id] += 1
                tx.id = f"{base_id}_{seen_ids[base_id]}"
            else:
                seen_ids[base_id] = 0

            transactions.append(tx)
        except Exception as e:
            errors.append(f"Row {i}: {e}")

    return transactions, errors


def transaction_to_dict(tx: Transaction) -> dict:
    return {
        "id": tx.id,
        "date": tx.date.isoformat(),
        "original_description": tx.original_description,
        "clean_merchant": tx.clean_merchant,
        "amount_original": tx.amount_original,
        "currency_original": tx.currency_original,
        "amount_cop": tx.amount_cop,
        "fx_rate": tx.fx_rate,
        "transaction_type": tx.transaction_type,
        "category_id": tx.category_id,
        "category_source": tx.category_source,
        "source_bank": tx.source_bank,
        "source_file": tx.source_file,
        "account_number": tx.account_number,
    }


def _normalize_currency(raw: str) -> str:
    raw = str(raw).strip().upper().replace("$", "").strip()
    mapping = {
        "COP": "COP", "PESOS": "COP", "": "COP",
        "USD": "USD", "DOLARES": "USD", "DÓLARES": "USD",
        "EUR": "EUR", "EUROS": "EUR",
        "HUF": "HUF",
        "GBP": "GBP",
    }
    return mapping.get(raw, raw if raw else "COP")
