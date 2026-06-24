"""Resolución de categoría para transacciones, reutilizando el motor de reglas."""
from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from api.models import Category, CategorizationRule
from tools.categorization.rules import match_rule


def resolve_category_by_name(db: Session, name: str | None) -> Category | None:
    """Busca una categoría por su nombre español o interno (case-insensitive)."""
    if not name:
        return None
    n = name.strip().lower()
    return db.scalar(
        select(Category).where(
            or_(func.lower(Category.name_es) == n, func.lower(Category.name) == n)
        )
    )


def detect_category(
    db: Session, user_id: int, merchant: str, bank: str | None = None
) -> Category | None:
    """Aplica reglas activas (sistema + del usuario) en orden de prioridad."""
    rules = db.scalars(
        select(CategorizationRule)
        .where(
            CategorizationRule.is_active.is_(True),
            or_(CategorizationRule.user_id.is_(None), CategorizationRule.user_id == user_id),
            or_(CategorizationRule.bank_scope.is_(None), CategorizationRule.bank_scope == bank),
        )
        .order_by(CategorizationRule.priority.asc())
    ).all()
    rule_dicts = [
        {"pattern": r.pattern, "match_type": r.match_type, "category_id": r.category_id}
        for r in rules
    ]
    matched = match_rule(merchant, rule_dicts)
    if matched:
        return db.get(Category, matched["category_id"])
    return None
