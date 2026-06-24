"""
Parser for AV Villas statements.
TODO: Implement once AV Villas PDFs are available for inspection.
Falls back to generic extraction.
"""

from tools.ingest.parsers.itau_parser import ItauParser


class AVVillasParser(ItauParser):

    def get_bank_name(self) -> str:
        return "avvillas"
