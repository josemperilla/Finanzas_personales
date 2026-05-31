"""
Fingerprint-based duplicate detection.
Checks new transactions against the DB before inserting.
Also handles intra-batch duplicates (same SHA256 within one file).
"""

from dataclasses import dataclass
from tools.ingest.normalizer import Transaction
from tools.db.connection import get_connection


@dataclass
class DedupResult:
    new: list[Transaction]
    duplicates: list[Transaction]


def check_duplicates(
    transactions: list[Transaction],
    conn=None,
) -> DedupResult:
    """
    Split transactions into new vs. already-in-DB duplicates.
    Intra-batch collision IDs are already handled by normalize_batch()
    with numeric suffixes — so we only check against the DB here.
    """
    if conn is None:
        conn = get_connection()

    new_txs = []
    dupes = []

    for tx in transactions:
        existing = conn.execute(
            "SELECT id FROM transactions WHERE id=?", (tx.id,)
        ).fetchone()
        if existing:
            dupes.append(tx)
        else:
            new_txs.append(tx)

    return DedupResult(new=new_txs, duplicates=dupes)
