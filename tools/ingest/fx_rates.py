"""
Historical FX rate fetching with SQLite cache.
Primary: exchangerate.host (free historical API)
Fallback: use most recent available rate.

For COP→COP always returns 1.0.
Routes exotic pairs through USD: HUF→USD→COP, TRY→USD→COP, etc.
"""

import os
import requests
from datetime import date, timedelta
from typing import Optional
from tools.db.connection import get_connection


_SUPPORTED_DIRECT = {"USD", "EUR", "GBP", "CAD", "MXN"}
_ROUTABLE_THROUGH_USD = {"HUF", "TRY", "ALL", "BRL", "ARS", "CLP", "PEN", "CRC"}

_API_BASE = "https://api.exchangerate.host/historical"
_API_KEY_HEADER = {}  # exchangerate.host free tier needs no key


def get_rate(tx_date: date, from_currency: str, to_currency: str = "COP") -> float:
    """
    Return exchange rate from_currency → to_currency on tx_date.
    Caches results in fx_rates table.
    """
    from_currency = from_currency.upper().strip()
    to_currency = to_currency.upper().strip()

    if from_currency == to_currency:
        return 1.0

    conn = get_connection()

    # 1. Check cache
    cached = _lookup_cache(conn, tx_date, from_currency, to_currency)
    if cached is not None:
        return cached

    # 2. Fetch from API
    rate = _fetch_rate(tx_date, from_currency, to_currency)
    if rate is not None:
        _store_cache(conn, tx_date, from_currency, to_currency, rate)
        conn.commit()
        return rate

    # 3. Fallback: try most recent cached rate within 7 days
    fallback = _fallback_rate(conn, tx_date, from_currency, to_currency)
    return fallback if fallback is not None else 1.0


def convert_to_cop(amount: float, currency: str, tx_date: date) -> tuple[float, float]:
    """
    Convert amount in currency to COP.
    Returns (amount_cop, fx_rate_used).
    """
    if currency == "COP":
        return amount, 1.0
    rate = get_rate(tx_date, currency, "COP")
    return round(amount * rate, 2), rate


# ------------------------------------------------------------------ #
# Internal helpers                                                     #
# ------------------------------------------------------------------ #

def _lookup_cache(conn, tx_date: date, from_c: str, to_c: str) -> Optional[float]:
    row = conn.execute(
        "SELECT rate FROM fx_rates WHERE date=? AND from_currency=? AND to_currency=?",
        (tx_date.isoformat(), from_c, to_c),
    ).fetchone()
    return row[0] if row else None


def _store_cache(conn, tx_date: date, from_c: str, to_c: str, rate: float) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO fx_rates (date, from_currency, to_currency, rate, source)
           VALUES (?,?,?,?,?)""",
        (tx_date.isoformat(), from_c, to_c, rate, "exchangerate.host"),
    )


def _fallback_rate(conn, tx_date: date, from_c: str, to_c: str) -> Optional[float]:
    """Return most recent cached rate within 7 days prior."""
    start = (tx_date - timedelta(days=7)).isoformat()
    row = conn.execute(
        """SELECT rate FROM fx_rates
           WHERE from_currency=? AND to_currency=? AND date <= ? AND date >= ?
           ORDER BY date DESC LIMIT 1""",
        (from_c, to_c, tx_date.isoformat(), start),
    ).fetchone()
    return row[0] if row else None


def _fetch_rate(tx_date: date, from_c: str, to_c: str) -> Optional[float]:
    """
    Fetch historical rate from exchangerate.host.
    Routes pairs not directly available through USD.
    """
    # Try direct pair first
    rate = _api_call(tx_date, from_c, to_c)
    if rate:
        return rate

    # Route through USD for exotic currencies
    if from_c in _ROUTABLE_THROUGH_USD or to_c in _ROUTABLE_THROUGH_USD:
        rate_to_usd = _api_call(tx_date, from_c, "USD")
        rate_usd_to_target = _api_call(tx_date, "USD", to_c)
        if rate_to_usd and rate_usd_to_target:
            return round(rate_to_usd * rate_usd_to_target, 6)

    return None


def _api_call(tx_date: date, from_c: str, to_c: str) -> Optional[float]:
    """Call exchangerate.host historical endpoint."""
    try:
        url = f"https://api.exchangerate.host/{tx_date.isoformat()}"
        params = {
            "base": from_c,
            "symbols": to_c,
            "places": 6,
        }
        resp = requests.get(url, params=params, timeout=8)
        if resp.status_code != 200:
            return None
        data = resp.json()
        rates = data.get("rates", {})
        return rates.get(to_c)
    except Exception:
        return None
