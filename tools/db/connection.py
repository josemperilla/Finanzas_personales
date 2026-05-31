import sqlite3
import threading
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_local = threading.local()


def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with WAL mode enabled."""
    if not hasattr(_local, "conn") or _local.conn is None:
        db_path = os.getenv("DB_PATH", "data/finance.db")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return _local.conn


def close_connection():
    if hasattr(_local, "conn") and _local.conn is not None:
        _local.conn.close()
        _local.conn = None
