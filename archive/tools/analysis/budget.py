import sqlite3
from datetime import date
import calendar
from tools.db.connection import get_connection
from tools.analysis.metrics import get_current_month


def set_budget(category_id: int, month: str, amount_cop: float, conn: sqlite3.Connection = None) -> None:
    if conn is None:
        conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO budgets (category_id, month, amount_cop) VALUES (?,?,?)",
        (category_id, month, amount_cop),
    )
    conn.commit()


def get_budget_vs_actual(month: str = None, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    if month is None:
        month = get_current_month()

    rows = conn.execute(
        """
        SELECT c.id, c.name_es AS category, c.icon, c.color,
               b.amount_cop AS budget_cop,
               COALESCE(SUM(CASE WHEN t.transaction_type='debit' THEN t.amount_cop ELSE 0 END), 0) AS spent_cop
        FROM budgets b
        JOIN categories c ON b.category_id = c.id
        LEFT JOIN transactions t ON t.category_id = c.id AND strftime('%Y-%m', t.date) = b.month
        WHERE b.month = ?
        GROUP BY c.id
        ORDER BY spent_cop DESC
        """,
        (month,),
    ).fetchall()

    result = []
    for row in rows:
        budget = row["budget_cop"] or 0
        spent = row["spent_cop"] or 0
        remaining = budget - spent
        pct = (spent / budget * 100) if budget > 0 else 0
        result.append({
            "category_id": row["id"],
            "category": row["category"],
            "icon": row["icon"],
            "color": row["color"],
            "budget_cop": budget,
            "spent_cop": spent,
            "remaining_cop": remaining,
            "pct_used": pct,
        })
    return result


def project_month_end(month: str = None, conn: sqlite3.Connection = None) -> list[dict]:
    """Estimate end-of-month spend at current daily pace."""
    if conn is None:
        conn = get_connection()
    if month is None:
        month = get_current_month()

    today = date.today()
    year, m = int(month[:4]), int(month[5:7])
    days_in_month = calendar.monthrange(year, m)[1]

    if today.year == year and today.month == m:
        days_elapsed = today.day
    else:
        days_elapsed = days_in_month

    daily_rate = days_elapsed / days_in_month if days_elapsed > 0 else 1

    bva = get_budget_vs_actual(month, conn)
    for row in bva:
        projected = row["spent_cop"] / daily_rate if daily_rate > 0 else row["spent_cop"]
        row["projected_cop"] = round(projected, 0)
        row["days_elapsed"] = days_elapsed
        row["days_in_month"] = days_in_month
    return bva
