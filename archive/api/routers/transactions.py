"""Endpoints de transacciones: listar (paginado + filtros), crear manual, editar categoría."""
from __future__ import annotations

import uuid
from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from api.db import get_db
from api.deps import get_current_user
from api.models import Transaction, User
from api.schemas import (
    ManualTransactionIn,
    TransactionOut,
    TransactionPage,
    UpdateCategoryIn,
)
from api.services.categorize import detect_category, resolve_category_by_name
from api.services.serialize import transaction_out

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _month_bounds(month: str) -> tuple[date_type, date_type]:
    year, mon = int(month[:4]), int(month[5:7])
    start = date_type(year, mon, 1)
    end = date_type(year + (mon == 12), (mon % 12) + 1, 1)
    return start, end


@router.get("", response_model=TransactionPage)
def list_transactions(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
    category_id: int | None = None,
    source_bank: str | None = None,
    transaction_type: str | None = Query(default=None, pattern="^(debit|credit)$"),
    search: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    conditions = [Transaction.user_id == user.id]
    if month:
        start, end = _month_bounds(month)
        conditions += [Transaction.date >= start, Transaction.date < end]
    if category_id is not None:
        conditions.append(Transaction.category_id == category_id)
    if source_bank:
        conditions.append(Transaction.source_bank == source_bank)
    if transaction_type:
        conditions.append(Transaction.transaction_type == transaction_type)
    if search:
        conditions.append(func.lower(Transaction.clean_merchant).contains(search.lower()))

    total = db.scalar(select(func.count()).select_from(Transaction).where(*conditions)) or 0
    rows = db.scalars(
        select(Transaction)
        .where(*conditions)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return TransactionPage(
        items=[transaction_out(t) for t in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_manual(
    body: ManualTransactionIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Categoría: explícita si viene, si no se infiere por reglas.
    category = resolve_category_by_name(db, body.categoria)
    if category is None:
        category = detect_category(db, user.id, body.comercio, body.banco)
    category_source = "manual" if body.categoria else ("rule" if category else "none")

    tx = Transaction(
        id=f"manual_{uuid.uuid4().hex}",
        user_id=user.id,
        date=body.fecha or date_type.today(),
        original_description=body.comercio,
        clean_merchant=body.comercio,
        amount_original=body.monto,
        currency_original=body.moneda.upper(),
        amount_cop=body.monto if body.moneda.upper() == "COP" else None,
        fx_rate=1.0,
        transaction_type="credit" if (category and category.is_income) else "debit",
        category_id=category.id if category else None,
        category_source=category_source,
        source_bank=body.banco,
        account_number=body.tarjeta,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return transaction_out(tx)


@router.patch("/{tx_id}/category", response_model=TransactionOut)
def update_category(
    tx_id: str,
    body: UpdateCategoryIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transacción no encontrada")
    category = resolve_category_by_name(db, body.categoria)
    if category is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Categoría inválida")
    tx.category_id = category.id
    tx.category_source = "manual"
    db.commit()
    db.refresh(tx)
    return transaction_out(tx)


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    tx_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transacción no encontrada")
    db.delete(tx)
    db.commit()
