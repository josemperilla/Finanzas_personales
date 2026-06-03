"""Serialización de transacciones al esquema de salida (incluye datos de categoría)."""
from api.models import Transaction
from api.schemas import TransactionOut


def transaction_out(tx: Transaction) -> TransactionOut:
    cat = tx.category
    return TransactionOut(
        id=tx.id,
        date=tx.date,
        original_description=tx.original_description,
        clean_merchant=tx.clean_merchant,
        amount_original=tx.amount_original,
        currency_original=tx.currency_original,
        amount_cop=tx.amount_cop,
        transaction_type=tx.transaction_type,
        category_id=tx.category_id,
        category_name=cat.name_es if cat else None,
        category_color=cat.color if cat else None,
        category_icon=cat.icon if cat else None,
        source_bank=tx.source_bank,
        account_number=tx.account_number,
        is_recurring=tx.is_recurring,
        notes=tx.notes,
        created_at=tx.created_at,
    )
