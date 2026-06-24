"""
Parser for Banco de Bogotá credit card statements (PDF).

PDF structure:
- Page 1 (index 0): Cover page with summary, billing info, and installment table
                    (old cuotas pendientes — NOT the current period's transactions)
- Page 2 (index 1): Blank / tear-off coupon page
- Pages 3+ (index 2+): Actual transaction tables for the current billing period

Transaction table layout (multi-line cells — all values compressed with \\n):
  Columns: Comprobante | Descripcion | Fecha Transacción | Fecha Proceso |
           Plazo | Valor Compra | Tasa E.A. | Valor Cuota Mes |
           Cuotas Pendientes | Saldo Pendiente

Foreign currency lines appear as a second \\n line in the Descripcion cell:
  "EL MAR RESTOR & CATTER\\nALL 1800.00" → merchant="EL MAR RESTOR", currency=ALL, orig=1800.00
  "METRO BARCELONA\\nEUR 84,20"           → merchant="METRO BARCELONA", currency=EUR, orig=84.20
"""

import re
import pdfplumber
from typing import Optional
from tools.ingest.parsers.base_parser import BaseParser, RawTransaction

_FOREX_LINE = re.compile(r"^([A-Z]{2,4})\s+([\d.,]+)$")

_SKIP_DESCRIPTIONS = re.compile(
    r"pago\s+portal|pago\s+pse|pago\s+total|seg\s+deud|seguro\s+de\s+vida|"
    r"cuota\s+de\s+manejo|cuota\s+manejo|gmf\s+cuatro\s+por\s+mil|4\s+x\s+mil|"
    r"fin\s+movimientos|pago\s+t\.?\s*credito\s+por\s+canal",
    re.IGNORECASE,
)


class BogotaParser(BaseParser):

    def get_bank_name(self) -> str:
        return "bogota"

    def extract(self, source) -> list[RawTransaction]:
        raw_txs: list[RawTransaction] = []
        with pdfplumber.open(source) as pdf:
            # Process ALL pages — _find_header skips tables without transaction headers.
            # Page 1 contains installment transactions; pages 3+ contain current period.
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    txs = self._parse_table(table)
                    raw_txs.extend(txs)
        return raw_txs

    # ------------------------------------------------------------------ #

    def _parse_table(self, table: list[list]) -> list[RawTransaction]:
        if not table:
            return []
        header_idx, col_map = self._find_header(table)
        if header_idx is None:
            return []
        transactions = []
        for row in table[header_idx + 1:]:
            txs = self._parse_data_row(row, col_map)
            transactions.extend(txs)
        return transactions

    def _find_header(self, table: list[list]) -> tuple[Optional[int], dict]:
        for i, row in enumerate(table):
            cells = [self.clean_cell(c) for c in row]
            combined = " ".join(cells)
            if "Comprobante" in combined and ("Descripcion" in combined or "Descripción" in combined):
                col_map = self._build_col_map(cells)
                if col_map:
                    return i, col_map
        return None, {}

    def _build_col_map(self, header_cells: list[str]) -> dict:
        col_map = {}
        for i, cell in enumerate(header_cells):
            c = cell.lower().replace("\n", " ")
            if "comprobante" in c:
                col_map.setdefault("voucher", i)
            elif "descripcion" in c or "descripción" in c:
                col_map.setdefault("desc", i)
            elif "fecha" in c and "transac" in c:
                col_map.setdefault("date_tx", i)
            elif "valor compra" in c or ("valor" in c and "compra" in c):
                col_map.setdefault("amount", i)
        return col_map if "desc" in col_map and "amount" in col_map else {}

    def _parse_data_row(self, row: list, col_map: dict) -> list[RawTransaction]:
        def col(key: str) -> list[str]:
            idx = col_map.get(key)
            if idx is None or idx >= len(row):
                return []
            raw = self.clean_cell(row[idx])
            return [line.strip() for line in raw.split("\n") if line.strip()]

        dates = col("date_tx")
        amounts = col("amount")
        desc_lines = col("desc")

        if not dates or not amounts or not desc_lines:
            return []

        # Rebuild descriptions: attach forex lines to previous merchant
        descriptions: list[tuple[str, str, str]] = []  # (merchant, currency, orig_amount_str)
        for line in desc_lines:
            m = _FOREX_LINE.match(line)
            if m and descriptions:
                merchant, _, _ = descriptions[-1]
                descriptions[-1] = (merchant, m.group(1), m.group(2))
            else:
                descriptions.append((line, "COP", ""))

        n = len(dates)
        while len(descriptions) < n:
            descriptions.append(("", "COP", ""))
        while len(amounts) < n:
            amounts.append("0")

        transactions = []
        for i in range(n):
            merchant, currency, orig_amt_raw = descriptions[i]
            date_raw = dates[i]
            amount_raw = amounts[i]

            if not merchant or not date_raw or not amount_raw:
                continue

            # Skip separator lines and excluded transaction types
            if merchant.strip("-").strip() == "" or "FIN MOVIMIENTOS" in merchant.upper():
                continue
            if _SKIP_DESCRIPTIONS.search(merchant):
                continue

            extra = {"currency_original": currency, "amount_original_str": orig_amt_raw}
            transactions.append(RawTransaction(
                date_raw=date_raw,
                description=merchant,
                amount_raw=amount_raw,
                currency_raw="COP",
                transaction_type_raw="D",
                extra=extra,
            ))

        return transactions
