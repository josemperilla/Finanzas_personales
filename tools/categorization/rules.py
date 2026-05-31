"""
Rules engine: load rules from DB and match against merchant descriptions.
"""

import re
import sqlite3
from typing import Optional
from tools.db.connection import get_connection
from tools.db.queries import get_active_rules, upsert_rule


def match_rule(description: str, rules: list[dict]) -> Optional[dict]:
    """
    Test rules in priority order (lowest number = highest priority).
    Returns first matching rule dict, or None.
    """
    desc_upper = description.upper()
    for rule in rules:
        pattern = rule["pattern"].upper()
        match_type = rule["match_type"]
        try:
            if match_type == "exact":
                if desc_upper == pattern:
                    return rule
            elif match_type == "contains":
                if pattern in desc_upper:
                    return rule
            elif match_type == "regex":
                if re.search(rule["pattern"], description, re.IGNORECASE):
                    return rule
        except re.error:
            continue
    return None


def create_rule_from_correction(
    merchant: str,
    category_id: int,
    tx_id: str,
    conn: sqlite3.Connection = None,
) -> int:
    """
    Called when user manually corrects a category.
    Creates a 'contains' rule for the merchant with source='user', priority=50.
    Returns rule ID.
    """
    if conn is None:
        conn = get_connection()
    rule_id = upsert_rule(
        pattern=merchant.upper(),
        match_type="contains",
        category_id=category_id,
        source="user",
        priority=50,
        bank_scope=None,
        created_from_tx=tx_id,
        conn=conn,
    )
    # Re-categorize existing transactions with this merchant
    conn.execute(
        """UPDATE transactions
           SET category_id=?, category_source='rule', updated_at=CURRENT_TIMESTAMP
           WHERE UPPER(clean_merchant) LIKE ? AND category_source != 'manual'""",
        (category_id, f"%{merchant.upper()}%"),
    )
    conn.commit()
    return rule_id
