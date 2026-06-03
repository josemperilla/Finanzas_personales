"""Migra transacciones desde el Google Sheet (legacy) a la base de datos de la API.

Fuentes de datos soportadas:
  1. CSV exportado del Sheet (historial completo)  ->  --csv ruta.csv
  2. Webhook GET en vivo (últimos 12 meses)        ->  --webhook URL --secret SECRET

El destino es la DB de la API (SQLite local o Postgres en prod). Reutiliza:
  - la misma fórmula de ID del pipeline (tools/ingest/normalizer.py) para que
    los IDs de dedupe sean estables y compatibles.
  - el motor de reglas (detect_category) como fallback cuando el Sheet no trae
    una categoría utilizable.

Es idempotente: omite transacciones cuyo id ya existe para ese usuario.

Columnas esperadas del Sheet:
  Timestamp, Fecha, Banco, Tipo, Monto (COP), Comercio, Tarjeta/Cuenta,
  Categoría, SMS_Original

Uso:
  python -m tools.migrate_sheet_to_db --csv export.csv --user-email yo@correo.com \
      --password "MiClave" [--database-url ...] [--dry-run]
"""
import argparse
import csv
import hashlib
import os
import re
import sys
from datetime import date, datetime
from typing import Optional


def generate_transaction_id(tx_date: date, description: str, amount: float, bank: str) -> str:
    """Misma fórmula que tools/ingest/normalizer.py (inlineada para evitar
    arrastrar las dependencias pesadas del pipeline de ingesta)."""
    key = f"{tx_date.isoformat()}|{description.strip().upper()}|{round(abs(amount), 2)}|{bank}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]


# Mapeo de las categorías en español del Sheet -> nombres canónicos de la API.
SHEET_CATEGORY_MAP = {
    "comida": "restaurantes",
    "transporte": "transporte",
    "suscripciones": "suscripciones",
    "mercado": "alimentacion",
    "salud": "salud",
    "deporte": "entretenimiento",
    "compras": "compras_online",
    "alojamiento": "viajes",
    "viajes": "viajes",
    "software": "suscripciones",
    "otro": "otros",
}

# Tipos que representan entradas de dinero (resto = débito/gasto).
CREDIT_TIPOS = {
    "abono", "credito", "crédito", "ingreso", "consignacion", "consignacion",
    "consignación", "deposito", "depósito", "transferencia recibida", "nomina", "nómina",
}

# Valores en SMS_Original que no aportan información real como nota.
NOISE_NOTES = {"manual", "no reconocido", ""}


def parse_amount(raw) -> float:
    """Convierte montos como '1.234.567', '1,234,567' o '50000' a float."""
    if raw is None:
        return 0.0
    s = str(raw).strip().replace("$", "").replace(" ", "")
    if not s:
        return 0.0
    # Quita separadores de miles (puntos y comas). El Sheet no usa decimales en COP.
    s = re.sub(r"[.,]", "", s)
    try:
        return abs(float(s))
    except ValueError:
        return 0.0


def parse_date(fecha_raw, timestamp_raw) -> Optional[date]:
    """Usa Fecha; si está vacía o inválida, cae a Timestamp."""
    for raw in (fecha_raw, timestamp_raw):
        if not raw:
            continue
        text = str(raw).strip()
        if not text:
            continue
        # Formatos comunes que produce Apps Script / exportación CSV.
        for fmt in (
            "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y/%m/%d %H:%M:%S", "%Y/%m/%d",
            "%d/%m/%Y %H:%M:%S", "%d/%m/%Y", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y",
        ):
            try:
                return datetime.strptime(text, fmt).date()
            except ValueError:
                continue
        # ISO con zona horaria (ej. 2026-05-30T15:11:08.000Z)
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
        except ValueError:
            continue
    return None


def transaction_type_from_tipo(tipo: str) -> str:
    return "credit" if str(tipo).strip().lower() in CREDIT_TIPOS else "debit"


def rows_from_csv(path: str) -> list:
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def rows_from_webhook(url: str, secret: str) -> list:
    import requests

    resp = requests.get(
        url, params={"action": "transactions", "_secret": secret}, timeout=30
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(f"Webhook devolvió error: {body.get('error')}")
    return body.get("data", [])


def get_field(row: dict, *names: str):
    """Lee un valor del row probando varios encabezados posibles."""
    for n in names:
        if n in row and row[n] not in (None, ""):
            return row[n]
    return ""


def run(args) -> int:
    # Permite sobreescribir el destino antes de importar la capa de DB
    # (el engine se crea al importar api.db).
    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    from sqlalchemy import select

    from api.db import Base, SessionLocal, engine
    from api.models import Transaction, User
    from api.security import hash_password
    from api.seed import seed_catalog
    from api.services.categorize import detect_category, resolve_category_by_name

    # Asegura esquema + catálogo (idempotente).
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_catalog(db)

        # Crea o encuentra el usuario destino.
        user = db.scalar(select(User).where(User.email == args.user_email))
        if user is None:
            if not args.password:
                print("ERROR: el usuario no existe; pasa --password para crearlo.", file=sys.stderr)
                return 2
            user = User(
                email=args.user_email,
                password_hash=hash_password(args.password),
                display_name=args.display_name or None,
            )
            db.add(user)
            db.flush()
            print(f"Usuario creado: {user.email} (id={user.id})")
        else:
            print(f"Usuario existente: {user.email} (id={user.id})")

        # Carga las filas de la fuente elegida.
        if args.csv:
            rows = rows_from_csv(args.csv)
            print(f"Filas leídas del CSV: {len(rows)}")
        else:
            rows = rows_from_webhook(args.webhook, args.secret)
            print(f"Filas leídas del webhook: {len(rows)}")

        inserted = skipped_dupe = skipped_bad = 0
        seen_ids: dict = {}

        for i, row in enumerate(rows):
            comercio = str(get_field(row, "Comercio", "comercio")).strip()
            banco = str(get_field(row, "Banco", "banco")).strip() or "Desconocido"
            tipo = str(get_field(row, "Tipo", "tipo")).strip()
            monto = parse_amount(get_field(row, "Monto (COP)", "Monto", "monto"))
            tx_date = parse_date(
                get_field(row, "Fecha", "fecha"),
                get_field(row, "Timestamp", "timestamp"),
            )
            sheet_cat = str(get_field(row, "Categoría", "categoria")).strip()
            tarjeta = str(get_field(row, "Tarjeta/Cuenta", "tarjeta")).strip() or None
            sms = str(get_field(row, "SMS_Original", "sms_original")).strip()

            # Filas inservibles: sin fecha, sin comercio o sin monto.
            if tx_date is None or not comercio or monto <= 0:
                skipped_bad += 1
                continue

            # ID estable y dedupe intra-lote (sufijo numérico ante colisiones).
            base_id = generate_transaction_id(tx_date, comercio, monto, banco)
            tx_id = base_id
            if base_id in seen_ids:
                seen_ids[base_id] += 1
                tx_id = f"{base_id}_{seen_ids[base_id]}"
            else:
                seen_ids[base_id] = 0

            # Idempotencia frente a la DB (por usuario).
            existing = db.scalar(
                select(Transaction.id).where(
                    Transaction.id == tx_id, Transaction.user_id == user.id
                )
            )
            if existing:
                skipped_dupe += 1
                continue

            # Resolución de categoría: 1) categoría del Sheet -> canónica,
            # 2) fallback al motor de reglas, 3) ninguna.
            category = None
            category_source = "none"
            canonical = SHEET_CATEGORY_MAP.get(sheet_cat.lower())
            if canonical:
                category = resolve_category_by_name(db, canonical)
                if category:
                    category_source = "manual"
            if category is None:
                category = detect_category(db, user.id, comercio, banco)
                if category:
                    category_source = "rule"

            notes = sms if sms.lower() not in NOISE_NOTES else None

            if not args.dry_run:
                db.add(Transaction(
                    id=tx_id,
                    user_id=user.id,
                    date=tx_date,
                    original_description=comercio,
                    clean_merchant=comercio,
                    amount_original=monto,
                    currency_original="COP",
                    amount_cop=monto,
                    fx_rate=1.0,
                    transaction_type=transaction_type_from_tipo(tipo),
                    category_id=category.id if category else None,
                    category_source=category_source,
                    source_bank=banco,
                    source_file="google_sheet_migration",
                    account_number=tarjeta,
                    notes=notes,
                ))
            inserted += 1

        if args.dry_run:
            db.rollback()
            print("\n[DRY-RUN] No se escribió nada.")
        else:
            db.commit()

        print(
            f"\nResumen: nuevas={inserted}  duplicadas={skipped_dupe}  "
            f"descartadas(sin datos)={skipped_bad}  total={len(rows)}"
        )
        return 0
    finally:
        db.close()


def main() -> int:
    p = argparse.ArgumentParser(description="Migra el Google Sheet a la DB de la API.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--csv", help="Ruta a un CSV exportado del Google Sheet.")
    src.add_argument("--webhook", help="URL del webhook GET (Apps Script).")
    p.add_argument("--secret", help="WEBHOOK_SECRET (requerido con --webhook).")
    p.add_argument("--user-email", required=True, help="Email del usuario destino.")
    p.add_argument("--password", help="Clave para crear el usuario si no existe.")
    p.add_argument("--display-name", help="Nombre visible del usuario (opcional).")
    p.add_argument("--database-url", help="Sobrescribe DATABASE_URL para esta corrida.")
    p.add_argument("--dry-run", action="store_true", help="No escribe; solo reporta.")
    args = p.parse_args()

    if args.webhook and not args.secret:
        p.error("--webhook requiere --secret")

    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
