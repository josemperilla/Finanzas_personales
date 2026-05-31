"""
Core financial metrics for the dashboard.
All functions return plain Python structures (lists of dicts or scalars)
suitable for direct use in Streamlit + Plotly.
"""

import sqlite3
from datetime import date, timedelta
from tools.db.connection import get_connection
from tools.db.queries import get_monthly_totals, get_category_breakdown, get_top_merchants


def get_current_month() -> str:
    return date.today().strftime("%Y-%m")


def get_prev_month(month: str = None) -> str:
    if month is None:
        month = get_current_month()
    y, m = int(month[:4]), int(month[5:7])
    m -= 1
    if m == 0:
        m, y = 12, y - 1
    return f"{y}-{m:02d}"


def monthly_summary(month: str = None, conn: sqlite3.Connection = None) -> dict:
    """KPIs for a single month."""
    if conn is None:
        conn = get_connection()
    if month is None:
        month = get_current_month()

    row = conn.execute(
        """
        SELECT
          SUM(CASE WHEN transaction_type='debit'  THEN amount_cop ELSE 0 END) AS gastos,
          SUM(CASE WHEN transaction_type='credit' THEN amount_cop ELSE 0 END) AS ingresos,
          COUNT(CASE WHEN transaction_type='debit' THEN 1 END)                AS n_gastos,
          COUNT(CASE WHEN transaction_type='credit' THEN 1 END)               AS n_ingresos
        FROM transactions
        WHERE strftime('%Y-%m', date) = ?
        """,
        (month,),
    ).fetchone()

    gastos   = row[0] or 0.0
    ingresos = row[1] or 0.0
    n_gastos = row[2] or 0

    # Previous month comparison
    prev_month = get_prev_month(month)
    prev_row = conn.execute(
        "SELECT SUM(amount_cop) FROM transactions WHERE transaction_type='debit' AND strftime('%Y-%m', date)=?",
        (prev_month,),
    ).fetchone()
    prev_gastos = prev_row[0] or 0.0

    delta_pct = ((gastos - prev_gastos) / prev_gastos * 100) if prev_gastos else 0.0

    return {
        "month": month,
        "gastos": gastos,
        "ingresos": ingresos,
        "n_gastos": n_gastos,
        "prev_gastos": prev_gastos,
        "delta_pct": delta_pct,
        "balance": ingresos - gastos,
    }


def monthly_trend(months_back: int = 12, conn: sqlite3.Connection = None) -> list[dict]:
    """Month-by-month spend trend for charts."""
    if conn is None:
        conn = get_connection()
    return get_monthly_totals(months_back, conn)


def category_breakdown_month(month: str = None, conn: sqlite3.Connection = None) -> list[dict]:
    """Spend by category for a given month."""
    if conn is None:
        conn = get_connection()
    if month is None:
        month = get_current_month()
    return get_category_breakdown(month, conn)


def top_merchants(months_back: int = 3, limit: int = 15, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    return get_top_merchants(months_back, limit, conn)


def available_months(conn: sqlite3.Connection = None) -> list[str]:
    """Return sorted list of months that have transactions."""
    if conn is None:
        conn = get_connection()
    rows = conn.execute(
        "SELECT DISTINCT strftime('%Y-%m', date) as m FROM transactions ORDER BY m DESC"
    ).fetchall()
    return [r[0] for r in rows]


def mom_comparison(months: int = 3, conn: sqlite3.Connection = None) -> list[dict]:
    """
    Category spend comparison across last N months.
    Returns list of dicts: {category, month1_cop, month2_cop, ...}
    """
    if conn is None:
        conn = get_connection()
    avail = available_months(conn)
    selected = avail[:months]
    if not selected:
        return []

    result = {}
    for month in selected:
        breakdown = get_category_breakdown(month, conn)
        for row in breakdown:
            cat = row["category"]
            if cat not in result:
                result[cat] = {"category": cat, "icon": row["icon"], "color": row["color"]}
            result[cat][month] = row["total_cop"]

    return list(result.values())
