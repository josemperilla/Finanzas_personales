"""
retroactive_import.py — Importa extractos bancarios históricos al Google Sheet.

Flujo:
  PDF/CSV → parser → RawTransaction
           → POST al webhook como type:manual
           → webhook.gs: detectCategory() + appendToSheet()
           → Google Sheet queda poblado

Variables de entorno requeridas (.env):
  WEBHOOK_URL  → URL del GAS web app con el _secret ya incluido como query param.
                 Ej: https://script.google.com/macros/s/.../exec?_secret=TU_SECRET

Uso:
  # Ver qué se importaría (sin enviar nada)
  python tools/retroactive_import.py --bank bogota --file "Extractos_lectura/enero.pdf" --userId jose --dry-run

  # Importar PDF de Bogotá
  python tools/retroactive_import.py --bank bogota --file "Extractos_lectura/enero.pdf" --userId jose

  # Importar CSV de Bancolombia
  python tools/retroactive_import.py --bank bancolombia --file "Extractos_lectura/movimientos.csv" --userId jose

  # Filtrar solo un mes específico
  python tools/retroactive_import.py --bank bogota --file "..." --userId jose --month 2026-05

  # Delay entre requests en ms para no saturar el webhook (default: 300)
  python tools/retroactive_import.py --bank bogota --file "..." --userId jose --delay 500
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

sys.path.insert(0, str(Path(__file__).parent.parent))

from tools.ingest.parsers.bogota_parser import BogotaParser
from tools.ingest.parsers.itau_parser import ItauParser
from tools.ingest.parsers.bancolombia_parser import BancolombiaParser
from tools.ingest.parsers.base_parser import RawTransaction
from tools.ingest.merchant_cleaner import clean_merchant

# ── Configuración ──────────────────────────────────────────────────────────────

load_dotenv()

WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

PARSERS = {
    "bogota":      BogotaParser,
    "itau":        ItauParser,
    "bancolombia": BancolombiaParser,
}

BANK_DISPLAY = {
    "bogota":      "Bogotá",
    "itau":        "Itaú",
    "bancolombia": "Bancolombia",
}

# ── Conversión RawTransaction → payload manual ─────────────────────────────────

def raw_to_payload(tx: RawTransaction, bank: str, user_id: str) -> Optional[dict]:
    """
    Convierte un RawTransaction a un payload de tipo 'manual' para el webhook.
    Devuelve None si la transacción debe saltarse (monto <= 0, fecha inválida,
    o es un pago/abono al crédito).
    """
    parser = PARSERS[bank]()

    monto = parser.parse_cop_amount(tx.amount_raw)
    if monto <= 0:
        return None

    # Saltar créditos / pagos a la tarjeta
    tx_type = (tx.transaction_type_raw or "").lower()
    if tx_type in ("c", "credito", "credit", "abono", "pago"):
        return None

    fecha_obj = parser.parse_date(tx.date_raw)
    if fecha_obj is None:
        return None

    return {
        "type":      "manual",
        "userId":    user_id,
        "banco":     BANK_DISPLAY.get(bank, bank.title()),
        "fecha":     fecha_obj.strftime("%Y-%m-%d"),
        "tipo":      "Compra",
        "monto":     round(monto),
        "comercio":  clean_merchant(tx.description, bank),
        "tarjeta":   tx.extra.get("tarjeta", ""),
        "categoria": "",
    }

# ── Filtro de mes ──────────────────────────────────────────────────────────────

def matches_month(payload: dict, month_filter: Optional[str]) -> bool:
    if not month_filter:
        return True
    return payload["fecha"].startswith(month_filter)

# ── Envío al webhook ───────────────────────────────────────────────────────────

def post_transaction(payload: dict) -> dict:
    if not WEBHOOK_URL:
        raise RuntimeError(
            "WEBHOOK_URL no está configurada en .env\n"
            "  Agrega: WEBHOOK_URL=https://script.google.com/macros/s/.../exec?_secret=TU_SECRET"
        )
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
    ap = argparse.ArgumentParser(description="Importa extractos bancarios (PDF/CSV) al Google Sheet.")
    ap.add_argument("--bank",    required=True, choices=list(PARSERS.keys()),
                    help="Banco del extracto: bogota | itau | bancolombia")
    ap.add_argument("--file",    required=True, help="Ruta al archivo (PDF o CSV)")
    ap.add_argument("--userId",  required=True, help="Usuario destino: jose | dani")
    ap.add_argument("--month",   default=None,  help="Filtrar por mes, ej: 2026-05 (opcional)")
    ap.add_argument("--dry-run", action="store_true", help="Solo muestra las transacciones, no envía nada")
    ap.add_argument("--delay",   type=int, default=300,
                    help="Delay entre requests en ms (default: 300)")
    args = ap.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"✗ Archivo no encontrado: {file_path}")
        sys.exit(1)

    # ── 1. Parsear archivo ─────────────────────────────────────────────────────
    print(f"\n{'─'*58}")
    print(f"  Banco   : {BANK_DISPLAY.get(args.bank, args.bank)}")
    print(f"  Archivo : {file_path.name}")
    print(f"  Usuario : {args.userId}")
    if args.month:
        print(f"  Filtro  : {args.month}")
    if args.dry_run:
        print("  Modo    : DRY-RUN (no se enviará nada)")
    print(f"{'─'*58}\n")

    parser = PARSERS[args.bank]()
    try:
        raw_txs: list[RawTransaction] = parser.extract(str(file_path))
    except Exception as e:
        print(f"✗ Error al parsear el archivo: {e}")
        sys.exit(1)

    print(f"  Transacciones en el archivo : {len(raw_txs)}")

    # ── 2. Convertir + filtrar ─────────────────────────────────────────────────
    payloads = []
    skipped  = 0
    for tx in raw_txs:
        payload = raw_to_payload(tx, args.bank, args.userId)
        if payload is None:
            skipped += 1
            continue
        if not matches_month(payload, args.month):
            skipped += 1
            continue
        payloads.append(payload)

    print(f"  A importar                  : {len(payloads)}")
    print(f"  Saltadas (pagos/créditos)   : {skipped}\n")

    if not payloads:
        print("  Sin transacciones para importar.")
        print("  Verifica el filtro de mes o el formato del archivo.")
        return

    # ── 3. Preview / envío ────────────────────────────────────────────────────
    ok_count  = 0
    err_count = 0

    for i, payload in enumerate(payloads, 1):
        fecha    = payload["fecha"]
        monto    = f"${payload['monto']:,.0f}".replace(",", ".")
        comercio = payload["comercio"][:35]
        prefix   = f"  [{i:>3}/{len(payloads)}] {fecha}  {monto:>12}  {comercio:<36}"

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

    # ── 4. Resumen ────────────────────────────────────────────────────────────
    if not args.dry_run:
        print(f"\n{'─'*58}")
        print(f"  ✓ Enviadas OK : {ok_count}")
        if err_count:
            print(f"  ✗ Con errores : {err_count}")
        print(f"{'─'*58}\n")
    else:
        print(f"\n  [dry-run] {len(payloads)} transacciones listas para importar.")
        print(f"  Ejecuta sin --dry-run para enviarlas.\n")


if __name__ == "__main__":
    main()
