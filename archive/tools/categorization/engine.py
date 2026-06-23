"""
Categorization pipeline:
1. Load all active rules from DB (one query)
2. Match each transaction against rules
3. Unmatched → batch to Claude classifier
4. Apply results to Transaction objects in-place
"""

import sqlite3
from tools.db.connection import get_connection
from tools.db.queries import get_active_rules, get_categories
from tools.categorization.rules import match_rule


def categorize_batch(transactions: list, conn: sqlite3.Connection = None) -> None:
    """
    Categorize a list of Transaction objects in-place.
    Modifies tx.category_id and tx.category_source.
    """
    if not transactions:
        return
    if conn is None:
        conn = get_connection()

    rules = get_active_rules(conn=conn)
    categories = {c["name"]: c["id"] for c in get_categories(conn=conn)}

    unmatched = []
    unmatched_indices = []

    for i, tx in enumerate(transactions):
        # Use clean_merchant if available, otherwise original_description
        search_text = tx.clean_merchant or tx.original_description
        rule = match_rule(search_text, rules)
        if rule:
            tx.category_id = rule["category_id"]
            tx.category_source = "rule"
        else:
            unmatched.append(search_text)
            unmatched_indices.append(i)

    if not unmatched:
        return

    # Claude fallback for unmatched
    try:
        from tools.categorization.claude_classifier import classify_batch
        claude_results = classify_batch(unmatched)
        for idx, category_name in zip(unmatched_indices, claude_results):
            cat_id = categories.get(category_name, categories.get("otros"))
            transactions[idx].category_id = cat_id
            transactions[idx].category_source = "claude" if category_name != "otros" else "none"
    except Exception as e:
        # Claude unavailable — assign 'otros'
        otros_id = categories.get("otros")
        for idx in unmatched_indices:
            transactions[idx].category_id = otros_id
            transactions[idx].category_source = "none"


def recategorize_all(conn: sqlite3.Connection = None) -> int:
    """
    Re-run categorization on all non-manual transactions.
    Returns count of updated transactions.
    """
    if conn is None:
        conn = get_connection()

    rows = conn.execute(
        "SELECT id, clean_merchant, original_description FROM transactions WHERE category_source != 'manual'"
    ).fetchall()
    if not rows:
        return 0

    rules = get_active_rules(conn=conn)
    categories = {c["name"]: c["id"] for c in get_categories(conn=conn)}
    updated = 0

    for row in rows:
        tx_id, merchant, desc = row
        search_text = merchant or desc
        rule = match_rule(search_text, rules)
        if rule:
            conn.execute(
                "UPDATE transactions SET category_id=?, category_source='rule', updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (rule["category_id"], tx_id),
            )
            updated += 1

    conn.commit()
    return updated
