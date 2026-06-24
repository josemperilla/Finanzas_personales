import sqlite3
from typing import Optional
from tools.db.connection import get_connection


def upsert_transaction(tx: dict, conn: sqlite3.Connection = None) -> bool:
    """Insert transaction, skip if ID already exists. Returns True if inserted."""
    if conn is None:
        conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM transactions WHERE id=?", (tx["id"],)
    ).fetchone()
    if existing:
        return False
    conn.execute(
        """INSERT INTO transactions
           (id, date, original_description, clean_merchant, amount_original,
            currency_original, amount_cop, fx_rate, transaction_type,
            category_id, category_source, source_bank, source_file, account_number)
           VALUES (:id,:date,:original_description,:clean_merchant,:amount_original,
                   :currency_original,:amount_cop,:fx_rate,:transaction_type,
                   :category_id,:category_source,:source_bank,:source_file,:account_number)""",
        tx,
    )
    return True


def update_transaction_category(tx_id: str, category_id: int, conn: sqlite3.Connection = None) -> None:
    if conn is None:
        conn = get_connection()
    conn.execute(
        "UPDATE transactions SET category_id=?, category_source='manual', updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (category_id, tx_id),
    )
    conn.commit()


def get_transactions(
    filters: Optional[dict] = None,
    conn: sqlite3.Connection = None,
) -> list[dict]:
    if conn is None:
        conn = get_connection()
    sql = """
        SELECT t.*, c.name_es AS category_name, c.icon AS category_icon, c.color AS category_color
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
    """
    params = []
    where_clauses = []

    if filters:
        if filters.get("month"):
            where_clauses.append("strftime('%Y-%m', t.date) = ?")
            params.append(filters["month"])
        if filters.get("category_id"):
            where_clauses.append("t.category_id = ?")
            params.append(filters["category_id"])
        if filters.get("source_bank"):
            where_clauses.append("t.source_bank = ?")
            params.append(filters["source_bank"])
        if filters.get("date_from"):
            where_clauses.append("t.date >= ?")
            params.append(filters["date_from"])
        if filters.get("date_to"):
            where_clauses.append("t.date <= ?")
            params.append(filters["date_to"])
        if filters.get("transaction_type"):
            where_clauses.append("t.transaction_type = ?")
            params.append(filters["transaction_type"])

    if where_clauses:
        sql += " WHERE " + " AND ".join(where_clauses)

    sql += " ORDER BY t.date DESC"
    rows = conn.execute(sql, params).fetchall()
    return [dict(r) for r in rows]


def get_categories(conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    rows = conn.execute("SELECT * FROM categories ORDER BY is_income, name_es").fetchall()
    return [dict(r) for r in rows]


def get_active_rules(bank: Optional[str] = None, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    sql = """
        SELECT r.*, c.name AS category_name
        FROM categorization_rules r
        JOIN categories c ON r.category_id = c.id
        WHERE r.is_active = 1
          AND (r.bank_scope IS NULL OR r.bank_scope = ?)
        ORDER BY r.priority ASC
    """
    rows = conn.execute(sql, (bank,)).fetchall()
    return [dict(r) for r in rows]


def upsert_rule(pattern: str, match_type: str, category_id: int, source: str,
                priority: int, bank_scope: Optional[str], created_from_tx: Optional[str],
                conn: sqlite3.Connection = None) -> int:
    if conn is None:
        conn = get_connection()
    existing = conn.execute(
        "SELECT id FROM categorization_rules WHERE pattern=? AND bank_scope IS ? AND source=?",
        (pattern, bank_scope, source),
    ).fetchone()
    if existing:
        conn.execute(
            "UPDATE categorization_rules SET category_id=?, priority=?, is_active=1 WHERE id=?",
            (category_id, priority, existing[0]),
        )
        conn.commit()
        return existing[0]
    cur = conn.execute(
        """INSERT INTO categorization_rules
           (pattern, match_type, category_id, bank_scope, priority, source, created_from_tx)
           VALUES (?,?,?,?,?,?,?)""",
        (pattern, match_type, category_id, bank_scope, priority, source, created_from_tx),
    )
    conn.commit()
    return cur.lastrowid


def log_ingest(entry: dict, conn: sqlite3.Connection = None) -> None:
    if conn is None:
        conn = get_connection()
    conn.execute(
        """INSERT OR REPLACE INTO ingest_log
           (filename, file_hash, bank, format, rows_extracted, rows_inserted, rows_skipped, status, error_message)
           VALUES (:filename,:file_hash,:bank,:format,:rows_extracted,:rows_inserted,:rows_skipped,:status,:error_message)""",
        entry,
    )
    conn.commit()


def file_already_ingested(file_hash: str, conn: sqlite3.Connection = None) -> bool:
    if conn is None:
        conn = get_connection()
    row = conn.execute(
        "SELECT id FROM ingest_log WHERE file_hash=? AND status='success'", (file_hash,)
    ).fetchone()
    return row is not None


def get_monthly_totals(months_back: int = 12, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    rows = conn.execute(
        """
        SELECT strftime('%Y-%m', date) AS month,
               SUM(CASE WHEN transaction_type='debit' THEN amount_cop ELSE 0 END) AS total_gastos,
               SUM(CASE WHEN transaction_type='credit' THEN amount_cop ELSE 0 END) AS total_ingresos,
               COUNT(*) AS tx_count
        FROM transactions
        WHERE date >= date('now', ? || ' months')
        GROUP BY month
        ORDER BY month ASC
        """,
        (f"-{months_back}",),
    ).fetchall()
    return [dict(r) for r in rows]


def get_category_breakdown(month: str, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    rows = conn.execute(
        """
        SELECT c.name_es AS category, c.icon, c.color,
               SUM(t.amount_cop) AS total_cop,
               COUNT(*) AS tx_count
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE strftime('%Y-%m', t.date) = ?
          AND t.transaction_type = 'debit'
        GROUP BY t.category_id
        ORDER BY total_cop DESC
        """,
        (month,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_top_merchants(months_back: int = 3, limit: int = 20, conn: sqlite3.Connection = None) -> list[dict]:
    if conn is None:
        conn = get_connection()
    rows = conn.execute(
        """
        SELECT clean_merchant, SUM(amount_cop) AS total_cop, COUNT(*) AS tx_count,
               MAX(date) AS last_seen
        FROM transactions
        WHERE transaction_type='debit'
          AND date >= date('now', ? || ' months')
          AND clean_merchant IS NOT NULL
        GROUP BY clean_merchant
        ORDER BY total_cop DESC
        LIMIT ?
        """,
        (f"-{months_back}", limit),
    ).fetchall()
    return [dict(r) for r in rows]
