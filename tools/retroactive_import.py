"""
retroactive_import.py — Importa extractos bancarios históricos al Google Sheet.

Flujo:
  PDF → parser existente (BogotaParser / ItauParser) → RawTransaction
      → POST al webhook como type:manual
      → webhook.gs: detectCategory() + appendToSheet()
      → Google Sheet queda poblado

Uso:
  # Ver qué se importaría (sin enviar)
  python tools/retroactive_import.py --bank bogota --file "Extractos_lectura/mayo_bogota.pdf" --dry-run

  # Importar todas las transacciones del PDF
  python tools/retroactive_import.py --bank itau --file "Extractos_lectura/extracts.pdf"

  # Filtrar solo un mes específico
  python tools/retroactive_import.py --bank bogota --file "Extractos_lectura/mayo_bogota.pdf" --month 2026-05

  # Delay entre requests (ms) para no saturar el webhook
  python tools/retroactive_import.py --bank bogota --file "..." --delay 500
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv

# Agregar raíz del proyecto al path para los imports relativos de los parsers
sys.path.insert(0, str(Path(__file__).parent.parent))

from tools.ingest.parsers.bogota_parser import BogotaParser
from tools.ingest.parsers.itau_parser import ItauParser
from tools.ingest.parsers.base_parser import RawTransaction

# ── Configuración ──────────────────────────────────────────────────────────────

load_dotenv()

WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

BANK_DISPLAY = {
    "bogota": "Bogotá",
    "itau":   "Itaú",
}

# ── Conversión RawTransaction → payload manual ─────────────────────────────────

def raw_to_payload(tx: RawTransaction, bank: str) -> Optional[dict]:
    """
    Convierte un RawTransaction del parser a un payload de tipo 'manual'
    que el webhook entiende. Devuelve None si la transacción debe saltarse.
    """
    parser = BogotaParser() if bank == "bogota" else ItauParser()

    # Parsear monto
    monto = parser.parse_cop_amount(tx.amount_raw)
    if monto <= 0:
        return None  # Saltar créditos / pagos

    # Parsear fecha
    fecha_obj = parser.parse_date(tx.date_raw)
    if fecha_obj is None:
        return None
    fecha_str = fecha_obj.strftime("%Y-%m-%d")

    return {
        "type":      "manual",
        "banco":     BANK_DISPLAY.get(bank, bank.title()),
        "fecha":     fecha_str,
        "tipo":      "Compra",
        "monto":     round(monto),
        "comercio":  tx.description.strip(),
        "tarjeta":   "",
        "categoria": "",   # el webhook corre detectCategory() sobre el comercio
    }

# ── Filtro de mes ──────────────────────────────────────────────────────────────

def matches_month(payload: dict, month_filter: Optional[str]) -> bool:
    if not month_filter:
        return True
    # month_filter = "2026-05"
    return payload["fecha"].startswith(month_filter)

# ── Envío al webhook ───────────────────────────────────────────────────────────

def post_transaction(payload: dict) -> dict:
    if not WEBHOOK_URL:
        raise RuntimeError("WEBHOOK_URL no configurada en .env")

    resp = requests.post(
        WEBHOOK_URL,
        headers={"Content-Type": "text/plain"},
        data=json.dumps(payload),
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Importa un extracto PDF al Google Sheet.")
    ap.add_argument("--bank",     required=True, choices=["bogota", "itau"], help="Banco del extracto")
    ap.add_argument("--file",     required=True, help="Ruta al PDF del extracto")
    ap.add_argument("--month",    default=None,  help="Filtrar por mes, ej: 2026-05 (opcional)")
    ap.add_argument("--dry-run",  action="store_true", help="Solo muestra las transacciones, no envía nada")
    ap.add_argument("--delay",    type=int, default=300, help="Delay entre requests en ms (default: 300)")
    args = ap.parse_args()

    pdf_path = Path(args.file)
    if not pdf_path.exists():
        print(f"✗ Archivo no encontrado: {pdf_path}")
        sys.exit(1)

    # ── 1. Parsear PDF ──────────────────────────────────────────────────────────
    print(f"\n{'─'*55}")
    print(f"  Banco : {BANK_DISPLAY.get(args.bank, args.bank)}")
    print(f"  Archivo: {pdf_path.name}")
    if args.month:
        print(f"  Filtro : {args.month}")
    if args.dry_run:
        print("  Modo   : DRY-RUN (no se enviará nada)")
    print(f"{'─'*55}\n")

    parser = BogotaParser() if args.bank == "bogota" else ItauParser()
    try:
        raw_txs: list[RawTransaction] = parser.extract(str(pdf_path))
    except Exception as e:
        print(f"✗ Error al parsear el PDF: {e}")
        sys.exit(1)

    print(f"  Transacciones en el PDF: {len(raw_txs)}")

    # ── 2. Convertir + filtrar ──────────────────────────────────────────────────
    payloads = []
    for tx in raw_txs:
        payload = raw_to_payload(tx, args.bank)
        if payload is None:
            continue
        if not matches_month(payload, args.month):
            continue
        payloads.append(payload)

    print(f"  A importar             : {len(payloads)}\n")

    if not payloads:
        print("  Sin transacciones para importar. Verifica el filtro de mes o el PDF.")
        return

    # ── 3. Preview / envío ──────────────────────────────────────────────────────
    ok_count = 0
    err_count = 0

    for i, payload in enumerate(payloads, 1):
        fecha   = payload["fecha"]
        monto   = f"${payload['monto']:,.0f}".replace(",", ".")
        comercio = payload["comercio"][:35]
        prefix  = f"  [{i:>3}/{len(payloads)}] {fecha}  {monto:>12}  {comercio:<36}"

        if args.dry_run:
            print(f"{prefix}  (dry-run)")
            continue

        try:
            result = post_transaction(payload)
            if result.get("ok"):
                print(f"{prefix}  ✓")
                ok_count += 1
            else:
                print(f"{prefix}  ✗ {result.get('error', 'respuesta no ok')}")
                err_count += 1
        except Exception as e:
            print(f"{prefix}  ✗ {e}")
            err_count += 1

        if args.delay > 0:
            time.sleep(args.delay / 1000)

    # ── 4. Resumen ──────────────────────────────────────────────────────────────
    if not args.dry_run:
        print(f"\n{'─'*55}")
        print(f"  ✓ Enviadas OK : {ok_count}")
        if err_count:
            print(f"  ✗ Con errores : {err_count}")
        print(f"{'─'*55}\n")
    else:
        print(f"\n  [dry-run] {len(payloads)} transacciones listas para importar.")
        print(f"  Ejecuta sin --dry-run para enviarlas.\n")


if __name__ == "__main__":
    main()
