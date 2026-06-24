"""
Parser for Itaú Colombia credit card statements (Mastercard).

All extracts*.pdf files are credit card statements with this structure:
- Page 1 (index 0): Cover — cupo, payment coupon, account summary. No transactions.
- Pages 2+ (index 1+): Transaction lines in plain text format:

  DD/MM/YY  voucher  Description  $ ValorOriginal  $ ValorCuota  $ SaldoPend  N/N  rate%

  Example:
    18/09/25 1851 Uber rides $ 12.630,00 $ 12.630,00 $ 0,00 1/1 24,36 %
    20/09/25 0999 The new york times $ 7.978,23 $ 7.978,23 $ 0,00 1/1 24,36 %
    USD 2,00

  Foreign currency appears on the NEXT line: "USD 2,00", "EUR 84,20", etc.

  Payment line (skip — credit to card, not a consumer expense):
    25/09/25 1127 Pago canal electronico $ -82.188,00

Amount format: European — period=thousands, comma=decimal.
  "$ 12.630,00" → 12,630.00 COP
  "$ 170.750,00" → 170,750.00 COP
  "$ 1.145.451,23" → 1,145,451.23 COP
"""

import re
import pdfplumber
from tools.ingest.parsers.base_parser import BaseParser, RawTransaction

# Regular purchase line
_CC_TX = re.compile(
    r"^(\d{2}/\d{2}/\d{2})\s+\d+\s+(.+?)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s+\$\s*([\d.,]+)\s+\d+/\d+"
)
# Payment line (negative amount — credit to card)
_CC_PAYMENT = re.compile(
    r"^(\d{2}/\d{2}/\d{2})\s+\d+\s+(.+?)\s+\$\s*-([\d.,]+)\s*$"
)
# Foreign currency next line
_FOREX_LINE = re.compile(r"^([A-Z]{2,4})\s+([\d.,]+)$")

# Bank fee / insurance lines to skip
_SKIP_DESCS = re.compile(
    r"seguro\s+de\s+vida\s+deudor|cuota\s+manejo|cuota\s+de\s+manejo|"
    r"seguro\s+tarjeta|intereses\s+capitalizados",
    re.IGNORECASE,
)


class ItauParser(BaseParser):

    def get_bank_name(self) -> str:
        return "itau"

    def extract(self, source) -> list[RawTransaction]:
        with pdfplumber.open(source) as pdf:
            # Skip page 1 (index 0) — cover/summary. Transactions start on page 2 (index 1).
            pages_text = [p.extract_text() or "" for p in pdf.pages[1:]]
        return self._extract_credit_card(pages_text)

    def _extract_credit_card(self, pages_text: list[str]) -> list[RawTransaction]:
        transactions = []

        for page_text in pages_text:
            lines = page_text.splitlines()
            i = 0
            while i < len(lines):
                line = lines[i].strip()

                # Skip payment lines (credit to card = not a consumer expense)
                if _CC_PAYMENT.match(line):
                    i += 1
                    continue

                m = _CC_TX.match(line)
                if m:
                    date_raw = self._normalize_date(m.group(1))
                    description = m.group(2).strip()
                    amount_raw = m.group(3)  # Valor original (COP equivalent)

                    # Skip bank fees and insurance
                    if _SKIP_DESCS.search(description):
                        i += 1
                        continue

                    # Check next line for foreign currency
                    currency = "COP"
                    orig_amount = amount_raw
                    if i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        fx_m = _FOREX_LINE.match(next_line)
                        if fx_m:
                            currency = fx_m.group(1)
                            orig_amount = fx_m.group(2)
                            i += 1  # consume the forex line

                    transactions.append(RawTransaction(
                        date_raw=date_raw,
                        description=description,
                        amount_raw=amount_raw,
                        currency_raw="COP",
                        transaction_type_raw="D",
                        extra={
                            "currency_original": currency,
                            "amount_original_str": orig_amount,
                        },
                    ))

                i += 1

        return transactions

    def _normalize_date(self, raw: str) -> str:
        """Convert DD/MM/YY → DD/MM/YYYY."""
        parts = raw.split("/")
        if len(parts) == 3 and len(parts[2]) == 2:
            y = int(parts[2])
            parts[2] = str(2000 + y if y < 50 else 1900 + y)
        return "/".join(parts)
