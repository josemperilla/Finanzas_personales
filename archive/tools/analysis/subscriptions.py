"""
Detect recurring/subscription transactions.
Algorithm:
  - Group by clean_merchant
  - Keep merchants that appear in ≥2 different months
  - Check amount stability (stddev < 20% of mean)
  - Mark as is_recurring=1 in DB
"""

import sqlite3
from tools.db.connection import get_connection


def detect_and_mark_recurring(conn: sqlite3.Connection = None) -> list[dict]:
    """Detect recurring transactions, mark them in DB, return summary list."""
    if conn is None:
        conn = get_connection()

    rows = conn.execute(
        """
        SELECT clean_merchant,
               COUNT(DISTINCT strftime('%Y-%m', date)) AS months_seen,
               COUNT(*) AS total_txs,
               AVG(amount_cop) AS avg_amount,
               MIN(amount_cop) AS min_amount,
               MAX(amount_cop) AS max_amount
        FROM transactions
        WHERE transaction_type='debit' AND clean_merchant IS NOT NULL
        GROUP BY clean_merchant
        HAVING months_seen >= 2
        ORDER BY months_seen DESC, total_txs DESC
        """
    ).fetchall()

    recurring = []
    for row in rows:
        merchant = row["clean_merchant"]
        avg = row["avg_amount"] or 0
        min_a = row["min_amount"] or 0
        max_a = row["max_amount"] or 0

        # Amount stability check: range should be < 30% of average
        if avg > 0 and (max_a - min_a) / avg < 0.30:
            # Mark in DB
            conn.execute(
                "UPDATE transactions SET is_recurring=1 WHERE clean_merchant=?",
                (merchant,),
            )
            recurring.append({
                "merchant": merchant,
                "months_seen": row["months_seen"],
                "total_txs": row["total_txs"],
                "avg_amount": round(avg, 0),
            })

    conn.commit()
    return recurring


def get_recurring_subscriptions(conn: sqlite3.Connection = None) -> list[dict]:
    """Return list of merchants marked as recurring."""
    if conn is None:
        conn = get_connection()
    rows = conn.execute(
        """
        SELECT clean_merchant,
               COUNT(DISTINCT strftime('%Y-%m', date)) AS months_seen,
               AVG(amount_cop) AS avg_amount,
               MAX(date) AS last_seen
        FROM transactions
        WHERE is_recurring=1 AND transaction_type='debit'
        GROUP BY clean_merchant
        ORDER BY avg_amount DESC
        """
    ).fetchall()
    return [dict(r) for r in rows]
