"""
Parser for Bancolombia CSV exports.

Bancolombia offers CSV downloads from:
  - App móvil → Mi perfil → Descargar movimientos
  - Portal web → Cuentas → Movimientos → Exportar

Two known CSV formats (both handled here):

Format A — semicolon-separated (cuenta de ahorros/corriente):
  Fecha;Descripción;Oficina;Referencia;Valor
  05/06/2026;COMPRA EN EXITO;001;REF123;-45900
  04/06/2026;TRANSFERENCIA A JUAN;001;REF456;-23000
  03/06/2026;CONSIGNACION;001;REF789;150000   ← positive = ingreso, skip on import

Format B — semicolon-separated (tarjeta de crédito):
  Fecha;Descripción;Valor
  05/06/2026;APPLE.COM/BILL;12900
  04/06/2026;PAGO TARJETA;-265403   ← negative = pago, skip

Amount sign convention:
  - Negative value → expense (débito) → import
  - Positive value → income or payment → skip (handled by transaction_type_raw="credito")

Date format: DD/MM/YYYY
Amount: plain integer or float, possibly with sign, no thousand separators in CSV export.

If your CSV uses commas as separators, save it from Excel/Numbers as semicolon first,
or the parser will auto-detect.
"""

import csv
import io
from pathlib import Path
from typing import Optional, Union

from tools.ingest.parsers.base_parser import BaseParser, RawTransaction


# Descriptions to skip — payments, fees, reversals that aren't consumer expenses
_SKIP_DESCRIPTIONS = {
    "pago tarjeta", "pago t.credito", "pago t.debito",
    "pago canal digital", "pago portal", "pago pse",
    "cuota de manejo", "cuota manejo", "seguro de vida",
    "seguro deudor", "4 x mil", "gmf", "impuesto",
}


class BancolombiaParser(BaseParser):

    def get_bank_name(self) -> str:
        return "bancolombia"

    def extract(self, source: Union[str, Path]) -> list[RawTransaction]:
        path = Path(source)
        suffix = path.suffix.lower()

        if suffix == ".csv":
            return self._extract_csv(path)

        raise ValueError(
            f"BancolombiaParser only handles CSV files. Got: {suffix}\n"
            "  To export: App Bancolombia → Mi perfil → Descargar movimientos → CSV"
        )

    def _extract_csv(self, path: Path) -> list[RawTransaction]:
        content = path.read_text(encoding="utf-8-sig", errors="replace")

        # Auto-detect delimiter: prefer semicolon (Bancolombia default), fall back to comma
        delimiter = ";" if content.count(";") > content.count(",") else ","

        reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)

        # Normalize header names (strip whitespace, lowercase)
        raw_rows = list(reader)
        if not raw_rows:
            return []

        # Map flexible column names to canonical names
        headers = {k.strip().lower(): k for k in raw_rows[0].keys()}
        fecha_col   = self._find_col(headers, ["fecha"])
        desc_col    = self._find_col(headers, ["descripción", "descripcion", "description"])
        valor_col   = self._find_col(headers, ["valor", "value", "débito", "debito", "monto"])
        type_col    = self._find_col(headers, ["tipo", "type", "clase"])

        if not fecha_col or not desc_col or not valor_col:
            raise ValueError(
                f"Columnas requeridas no encontradas en el CSV.\n"
                f"  Encontradas: {list(headers.keys())}\n"
                f"  Esperadas: Fecha, Descripción, Valor"
            )

        results = []
        for row in raw_rows:
            fecha_raw = (row.get(fecha_col) or "").strip()
            desc_raw  = (row.get(desc_col)  or "").strip()
            valor_raw = (row.get(valor_col) or "").strip()
            tipo_raw  = (row.get(type_col)  or "") if type_col else ""

            if not fecha_raw or not valor_raw:
                continue

            # Skip known payment/fee descriptions
            if any(skip in desc_raw.lower() for skip in _SKIP_DESCRIPTIONS):
                continue

            # Determine transaction type from sign or explicit type column
            amount_str = valor_raw.replace(".", "").replace(",", ".").replace("$", "").strip()
            try:
                amount_float = float(amount_str)
            except ValueError:
                continue

            if amount_float == 0:
                continue

            # Positive amounts in Bancolombia CSV = ingresos (consignaciones, pagos recibidos)
            # Negative amounts = débitos (compras, retiros)
            # We import only débitos (expenses).
            if amount_float > 0:
                tx_type = "credito"
            else:
                tx_type = tipo_raw or "debito"
                amount_str = str(abs(amount_float))

            results.append(RawTransaction(
                date_raw=fecha_raw,
                description=desc_raw,
                amount_raw=amount_str,
                currency_raw="COP",
                transaction_type_raw=tx_type,
                extra={},
            ))

        return results

    @staticmethod
    def _find_col(headers: dict, candidates: list) -> Optional[str]:
        """Return the original column name matching any candidate (case-insensitive)."""
        for candidate in candidates:
            if candidate in headers:
                return headers[candidate]
        return None
