"""Construye el snapshot de contexto financiero para el chat (agnóstico de DB)."""
from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.models import Transaction


def _fmt(amount: float) -> str:
    return f"${amount:,.0f} COP"


def build_context(db: Session, user_id: int, months_back: int = 6) -> str:
    since = date.today() - timedelta(days=months_back * 31)
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.date >= since,
        )
    ).all()
    if not txs:
        return "No hay datos de transacciones disponibles todavía."

    by_month_spent: dict[str, float] = defaultdict(float)
    by_month_income: dict[str, float] = defaultdict(float)
    by_category: dict[str, float] = defaultdict(float)
    by_merchant: dict[str, float] = defaultdict(float)

    for t in txs:
        month = t.date.strftime("%Y-%m")
        amount = t.amount_cop or 0
        if t.transaction_type == "credit":
            by_month_income[month] += amount
        else:
            by_month_spent[month] += amount
            if t.category and t.category.name_es:
                by_category[t.category.name_es] += amount
            if t.clean_merchant:
                by_merchant[t.clean_merchant] += amount

    lines = ["## Totales por mes", "| Mes | Gastos | Ingresos | Balance |", "|---|---|---|---|"]
    for m in sorted(set(by_month_spent) | set(by_month_income), reverse=True)[:6]:
        spent, income = by_month_spent[m], by_month_income[m]
        lines.append(f"| {m} | {_fmt(spent)} | {_fmt(income)} | {_fmt(income - spent)} |")

    lines += ["\n## Gastos por categoría", "| Categoría | Total |", "|---|---|"]
    for cat, total in sorted(by_category.items(), key=lambda x: -x[1])[:15]:
        lines.append(f"| {cat} | {_fmt(total)} |")

    lines += ["\n## Top comercios por gasto", "| Comercio | Total |", "|---|---|"]
    for merchant, total in sorted(by_merchant.items(), key=lambda x: -x[1])[:15]:
        lines.append(f"| {merchant} | {_fmt(total)} |")

    return "\n".join(lines)
