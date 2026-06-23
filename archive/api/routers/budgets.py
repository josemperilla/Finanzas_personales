"""Endpoints de presupuestos por categoría y mes (sincronizados por usuario)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_db
from api.deps import get_current_user
from api.models import Budget, User
from api.schemas import BudgetIn, BudgetOut

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetOut])
def list_budgets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    month: str | None = Query(default=None, pattern=r"^\d{4}-\d{2}$"),
):
    conditions = [Budget.user_id == user.id]
    if month:
        conditions.append(Budget.month == month)
    return db.scalars(select(Budget).where(*conditions)).all()


@router.put("", response_model=BudgetOut)
def upsert_budget(
    body: BudgetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.category_id == body.category_id,
            Budget.month == body.month,
        )
    )
    if budget is None:
        budget = Budget(
            user_id=user.id,
            category_id=body.category_id,
            month=body.month,
            amount_cop=body.amount_cop,
        )
        db.add(budget)
    else:
        budget.amount_cop = body.amount_cop
    db.commit()
    db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    budget = db.get(Budget, budget_id)
    if budget is not None and budget.user_id == user.id:
        db.delete(budget)
        db.commit()
