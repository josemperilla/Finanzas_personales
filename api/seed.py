"""Semillas de catálogo: categorías y reglas de sistema (globales).

Reutiliza las constantes canónicas de tools/db/schema.py para no duplicar la
taxonomía. Idempotente: no inserta si ya existen.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Category, CategorizationRule
from tools.db.schema import CATEGORIES_SEED, RULES_SEED


def seed_catalog(db: Session) -> None:
    if db.scalar(select(Category).limit(1)) is None:
        for name, name_es, icon, color, is_income in CATEGORIES_SEED:
            db.add(Category(
                name=name, name_es=name_es, icon=icon, color=color,
                is_income=bool(is_income),
            ))
        db.flush()

    if db.scalar(select(CategorizationRule).limit(1)) is None:
        by_name = {c.name: c.id for c in db.scalars(select(Category)).all()}
        for pattern, match_type, cat_name, bank_scope, priority, source in RULES_SEED:
            cat_id = by_name.get(cat_name)
            if cat_id:
                db.add(CategorizationRule(
                    user_id=None, pattern=pattern, match_type=match_type,
                    category_id=cat_id, bank_scope=bank_scope,
                    priority=priority, source=source,
                ))
    db.commit()
