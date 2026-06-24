"""
Generic fallback parser — tries multiple strategies for unknown formats.
"""

import pdfplumber
import pandas as pd
from tools.ingest.parsers.base_parser import BaseParser, RawTransaction


class GenericParser(BaseParser):

    def get_bank_name(self) -> str:
        return "unknown"

    def extract(self, source) -> list[RawTransaction]:
        from io import BytesIO
        if isinstance(source, BytesIO) or (isinstance(source, str) and source.lower().endswith(".pdf")):
            return self._extract_pdf(source)
        if isinstance(source, str):
            if source.lower().endswith((".xlsx", ".xls")):
                return self._extract_excel(source)
            if source.lower().endswith(".csv"):
                return self._extract_csv(source)
        return self._extract_pdf(source)

    def _extract_pdf(self, source) -> list[RawTransaction]:
        txs = []
        with pdfplumber.open(source) as pdf:
            for page in pdf.pages:
                for table in (page.extract_tables() or []):
                    for row in table:
                        if not row:
                            continue
                        cells = [self.clean_cell(c) for c in row]
                        if self.is_header_row(cells):
                            continue
                        date_val = None
                        for cell in cells[:3]:
                            date_val = self.parse_date(cell)
                            if date_val:
                                break
                        if not date_val:
                            continue
                        desc = cells[1] if len(cells) > 1 else ""
                        amount = cells[2] if len(cells) > 2 else "0"
                        txs.append(RawTransaction(date_raw=cells[0], description=desc, amount_raw=amount))
        return txs

    def _extract_excel(self, filepath: str) -> list[RawTransaction]:
        txs = []
        try:
            df = pd.read_excel(filepath, header=None)
            for _, row in df.iterrows():
                cells = [str(c).strip() if c is not None else "" for c in row]
                if not cells:
                    continue
                date_val = self.parse_date(cells[0]) if cells else None
                if not date_val:
                    continue
                desc = cells[1] if len(cells) > 1 else ""
                amount = cells[2] if len(cells) > 2 else "0"
                txs.append(RawTransaction(date_raw=cells[0], description=desc, amount_raw=amount))
        except Exception:
            pass
        return txs

    def _extract_csv(self, filepath: str) -> list[RawTransaction]:
        txs = []
        import chardet
        with open(filepath, "rb") as f:
            enc = chardet.detect(f.read(4096)).get("encoding", "utf-8")
        try:
            df = pd.read_csv(filepath, encoding=enc, header=None, on_bad_lines="skip")
            for _, row in df.iterrows():
                cells = [str(c).strip() for c in row]
                date_val = self.parse_date(cells[0]) if cells else None
                if not date_val:
                    continue
                desc = cells[1] if len(cells) > 1 else ""
                amount = cells[2] if len(cells) > 2 else "0"
                txs.append(RawTransaction(date_raw=cells[0], description=desc, amount_raw=amount))
        except Exception:
            pass
        return txs
