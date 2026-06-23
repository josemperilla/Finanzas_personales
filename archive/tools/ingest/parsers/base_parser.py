from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date
from typing import Optional
import re
from dateutil import parser as dateutil_parser


@dataclass
class RawTransaction:
    date_raw: str
    description: str
    amount_raw: str
    currency_raw: str = "COP"
    transaction_type_raw: str = ""  # "D", "C", "debito", "credito", negative sign, etc.
    extra: dict = field(default_factory=dict)


class BaseParser(ABC):

    @abstractmethod
    def extract(self, filepath: str) -> list[RawTransaction]:
        """Parse file and return list of raw transactions."""
        ...

    @abstractmethod
    def get_bank_name(self) -> str:
        ...

    # ------------------------------------------------------------------ #
    # Shared helpers                                                       #
    # ------------------------------------------------------------------ #

    def parse_cop_amount(self, raw: str) -> float:
        """
        Handle Colombian and mixed amount formats:
          "1.234.567,89"  → 1234567.89  (European — BdB, Itaú)
          "1,234,567.89"  → 1234567.89  (US — some CSV exports)
          "1.234.567"     → 1234567.0   (no decimal)
          "1234567.89"    → 1234567.89  (plain float)
          "-1.234.567,89" → -1234567.89 (negative)
        """
        if not raw:
            return 0.0

        cleaned = str(raw).strip()
        # preserve sign
        negative = cleaned.startswith("-") or cleaned.startswith("(")
        cleaned = re.sub(r"[$()\-\s]", "", cleaned)
        cleaned = cleaned.replace("COP", "").replace("$", "").strip()

        if not cleaned:
            return 0.0

        dot_count = cleaned.count(".")
        comma_count = cleaned.count(",")

        if comma_count == 1 and dot_count >= 1:
            # European format: 1.234.567,89  or  1.234,89
            result = float(cleaned.replace(".", "").replace(",", "."))
        elif dot_count == 1 and comma_count >= 1:
            # US format: 1,234,567.89
            result = float(cleaned.replace(",", ""))
        elif comma_count == 1 and dot_count == 0:
            # Ambiguous: "89,262" or "1234,56"
            # Key heuristic: if exactly 3 digits after the comma → thousands separator
            # (Colombian COP amounts don't use cent decimals in bank statements)
            after_comma = cleaned.split(",", 1)[1]
            if len(after_comma) == 3:
                result = float(cleaned.replace(",", ""))   # 89,262 → 89262
            else:
                result = float(cleaned.replace(",", "."))  # 1234,5 → 1234.5
        elif comma_count > 1 and dot_count == 0:
            # Multiple commas, no dot → US thousands: 1,809,007
            result = float(cleaned.replace(",", ""))
        elif dot_count == 0 and comma_count == 0:
            result = float(cleaned)
        else:
            # Multiple dots, no comma → thousands only: "1.234.567"
            result = float(cleaned.replace(".", "").replace(",", ""))

        return -result if negative else result

    SPANISH_MONTHS = {
        "ene": "Jan", "feb": "Feb", "mar": "Mar", "abr": "Apr",
        "may": "May", "jun": "Jun", "jul": "Jul", "ago": "Aug",
        "sep": "Sep", "oct": "Oct", "nov": "Nov", "dic": "Dec",
    }

    def parse_date(self, raw: str) -> Optional[date]:
        """
        Handle multiple date formats common in Colombian bank statements:
          DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD MMM YYYY (Spanish month names)
        """
        if not raw:
            return None
        raw = raw.strip()

        # Replace Spanish month abbreviations
        raw_lower = raw.lower()
        for es, en in self.SPANISH_MONTHS.items():
            if es in raw_lower:
                raw = re.sub(es, en, raw_lower, flags=re.IGNORECASE)
                break

        # Try DD/MM/YYYY or DD-MM-YYYY explicitly before dateutil guesses wrong
        m = re.match(r"^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})$", raw)
        if m:
            day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            try:
                return date(year, month, day)
            except ValueError:
                pass

        # Fallback to dateutil
        try:
            return dateutil_parser.parse(raw, dayfirst=True).date()
        except Exception:
            return None

    def detect_transaction_type(self, amount: float, type_indicator: str = "") -> str:
        """
        Determine debit/credit from amount sign or type indicator.
        Returns 'debit' or 'credit'.
        """
        indicator = type_indicator.strip().upper()
        if indicator in ("C", "CR", "CREDITO", "CRÉDITO", "CREDIT", "CRTO", "ABONO"):
            return "credit"
        if indicator in ("D", "DB", "DEBITO", "DÉBITO", "DEBIT", "DCTO", "CARGO"):
            return "debit"
        # Fall back to sign
        return "credit" if amount > 0 else "debit"

    def is_header_row(self, cells: list) -> bool:
        """Detect if a row is a repeated column header (skip it)."""
        if not cells:
            return False
        first = str(cells[0]).strip().upper()
        header_keywords = {"FECHA", "DATE", "DÍA", "DIA", "F.TRANSACCION", "F. TRANSACCION"}
        return first in header_keywords

    def clean_cell(self, value) -> str:
        if value is None:
            return ""
        return str(value).strip()
