"""
Build the context snapshot for the chat assistant.
Injects pre-computed financial summaries so Claude can answer common questions
directly from the context, without needing to generate SQL.
"""

import sqlite3
from tools.db.connection import get_connection
from tools.analysis.metrics import available_months


SCHEMA_DDL = """
-- Tablas disponibles en la base de datos:

transactions (
    id TEXT PK,
    date DATE,                    -- formato YYYY-MM-DD
    original_description TEXT,
    clean_merchant TEXT,          -- nombre limpio del comercio
    amount_original REAL,         -- monto en moneda original
    currency_original TEXT,       -- COP, USD, EUR, HUF, etc.
    amount_cop REAL,              -- monto convertido a COP
    fx_rate REAL,
    transaction_type TEXT,        -- 'debit' (gasto) o 'credit' (ingreso)
    category_id INT,
    category_source TEXT,         -- 'rule', 'claude', 'manual', 'none'
    source_bank TEXT,             -- 'bogota', 'itau', 'avvillas'
    is_recurring INT              -- 1 si es suscripción/recurrente
)

categories (
    id INT PK,
    name TEXT,                    -- nombre en inglés (ej: 'restaurantes')
    name_es TEXT                  -- nombre en español (ej: 'Restaurantes')
)

budgets (
    category_id INT,
    month TEXT,                   -- formato YYYY-MM
    amount_cop REAL
)

-- Categorías disponibles: alimentacion, restaurantes, delivery, transporte,
-- entretenimiento, salud, suscripciones, viajes, educacion, compras_online,
-- servicios, transferencias, ingresos, otros
"""


def _fmt(amount: float) -> str:
    return f"${amount:,.0f} COP"


def build_context_snapshot(conn: sqlite3.Connection = None) -> str:
    """
    Return a rich text summary of all key financial data.
    Includes subscriptions, monthly totals, category breakdown, and top merchants.
    This lets Claude answer common questions without generating SQL.
    """
    if conn is None:
        conn = get_connection()

    months = available_months(conn)
    if not months:
        return "No hay datos de transacciones disponibles todavía."

    lines = []

    # ── Overview ──────────────────────────────────────────────────────────────
    total_txs = conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    banks = [r[0] for r in conn.execute(
        "SELECT DISTINCT source_bank FROM transactions"
    ).fetchall()]
    date_range = f"{months[-1]} a {months[0]}"
    lines.append(f"## Resumen general")
    lines.append(f"- Período: {date_range} ({len(months)} meses)")
    lines.append(f"- Total transacciones: {total_txs}")
    lines.append(f"- Bancos: {', '.join(banks)}")

    # ── Monthly summary (last 6 months) ───────────────────────────────────────
    recent_months = months[:6]
    lines.append(f"\n## Totales por mes (últimos {len(recent_months)} meses)")
    lines.append("| Mes | Gastos | Ingresos | Balance |")
    lines.append("|-----|--------|----------|---------|")
    for m in recent_months:
        spent = conn.execute(
            "SELECT COALESCE(SUM(amount_cop),0) FROM transactions "
            "WHERE strftime('%Y-%m', date)=? AND transaction_type='debit'", (m,)
        ).fetchone()[0]
        income = conn.execute(
            "SELECT COALESCE(SUM(amount_cop),0) FROM transactions "
            "WHERE strftime('%Y-%m', date)=? AND transaction_type='credit'", (m,)
        ).fetchone()[0]
        balance = income - spent
        sign = "+" if balance >= 0 else ""
        lines.append(f"| {m} | {_fmt(spent)} | {_fmt(income)} | {sign}{_fmt(balance)} |")

    # ── Category breakdown (last 3 months, debits only) ────────────────────────
    last3 = recent_months[:3]
    if last3:
        placeholders = ",".join("?" * len(last3))
        cat_rows = conn.execute(f"""
            SELECT c.name_es, COALESCE(SUM(t.amount_cop),0) as total,
                   COUNT(*) as n_txs
            FROM transactions t
            JOIN categories c ON c.id = t.category_id
            WHERE strftime('%Y-%m', t.date) IN ({placeholders})
              AND t.transaction_type = 'debit'
            GROUP BY c.name_es
            ORDER BY total DESC
            LIMIT 15
        """, last3).fetchall()

        lines.append(f"\n## Gastos por categoría (últimos {len(last3)} meses: {', '.join(last3)})")
        lines.append("| Categoría | Total | Transacciones |")
        lines.append("|-----------|-------|---------------|")
        for row in cat_rows:
            lines.append(f"| {row[0]} | {_fmt(row[1])} | {row[2]} |")

    # ── Subscriptions ──────────────────────────────────────────────────────────
    subs = conn.execute("""
        SELECT t.clean_merchant,
               COUNT(DISTINCT strftime('%Y-%m', t.date)) AS months_active,
               ROUND(AVG(t.amount_cop), 0) AS avg_amount,
               MAX(t.date) AS last_date,
               c.name_es AS category
        FROM transactions t
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.transaction_type = 'debit'
          AND (
            c.name = 'suscripciones'
            OR t.is_recurring = 1
            OR t.clean_merchant IN (
                SELECT clean_merchant
                FROM transactions
                WHERE transaction_type = 'debit'
                  AND clean_merchant IS NOT NULL
                GROUP BY clean_merchant
                HAVING COUNT(DISTINCT strftime('%Y-%m', date)) >= 3
                   AND MAX(amount_cop) < 200000
            )
          )
        GROUP BY t.clean_merchant
        ORDER BY months_active DESC, avg_amount DESC
        LIMIT 20
    """).fetchall()

    if subs:
        lines.append("\n## Suscripciones y pagos recurrentes detectados")
        lines.append("| Comercio | Meses activo | Promedio mensual | Último pago | Categoría |")
        lines.append("|----------|:------------:|-----------------|------------|-----------|")
        for s in subs:
            lines.append(
                f"| {s[0]} | {s[1]} | {_fmt(s[2])} | {s[3]} | {s[4] or '—'} |"
            )
    else:
        lines.append("\n## Suscripciones: ninguna detectada aún.")

    # ── Top merchants (last 3 months, debits) ─────────────────────────────────
    if last3:
        top = conn.execute(f"""
            SELECT clean_merchant,
                   COALESCE(SUM(amount_cop),0) AS total,
                   COUNT(*) AS n_txs,
                   c.name_es AS category
            FROM transactions t
            LEFT JOIN categories c ON c.id = t.category_id
            WHERE strftime('%Y-%m', t.date) IN ({placeholders})
              AND t.transaction_type = 'debit'
              AND clean_merchant IS NOT NULL
            GROUP BY clean_merchant
            ORDER BY total DESC
            LIMIT 15
        """, last3).fetchall()

        lines.append(f"\n## Top 15 comercios por gasto (últimos {len(last3)} meses)")
        lines.append("| Comercio | Total | Visitas | Categoría |")
        lines.append("|----------|-------|---------|-----------|")
        for row in top:
            lines.append(f"| {row[0]} | {_fmt(row[1])} | {row[2]} | {row[3] or '—'} |")

    return "\n".join(lines)


def execute_safe_query(sql: str, conn: sqlite3.Connection = None) -> str:
    """
    Execute a validated SELECT query and return results as a markdown table.
    Max 200 rows to avoid token explosion.
    """
    if conn is None:
        conn = get_connection()

    try:
        cursor = conn.execute(sql)
        rows = cursor.fetchmany(200)
        if not rows:
            return "La consulta no devolvió resultados."

        cols = [desc[0] for desc in cursor.description]
        header = "| " + " | ".join(cols) + " |"
        separator = "| " + " | ".join("---" for _ in cols) + " |"
        data_rows = []
        for row in rows:
            formatted = []
            for val in row:
                if isinstance(val, float):
                    formatted.append(f"{val:,.0f}")
                else:
                    formatted.append(str(val) if val is not None else "—")
            data_rows.append("| " + " | ".join(formatted) + " |")

        return "\n".join([header, separator] + data_rows)
    except Exception as e:
        return f"Error ejecutando consulta: {e}"
