"""
Normalize merchant names to canonical brand names.

Maps variations like "Rappi Colombia*Dl", "Dlo*Rappi", "Rappi*Turbo"
to a single canonical name "Rappi".

Used at display time (not stored in DB) to group merchants in filters/charts.
"""

import re

# (regex_pattern, canonical_name)
BRAND_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"rappi",              re.I), "Rappi"),
    (re.compile(r"\buber\b",           re.I), "Uber"),
    (re.compile(r"\bdidi\b",           re.I), "DiDi"),
    (re.compile(r"amazon",             re.I), "Amazon"),
    (re.compile(r"mercado\s*pago|compra\s+mercado\s*pago", re.I), "Mercado Pago"),
    (re.compile(r"mercado\s*libre",    re.I), "MercadoLibre"),
    (re.compile(r"apple\.com",         re.I), "Apple"),
    (re.compile(r"netflix",            re.I), "Netflix"),
    (re.compile(r"spotify",            re.I), "Spotify"),
    (re.compile(r"airbnb",             re.I), "Airbnb"),
    (re.compile(r"booking\.com",       re.I), "Booking.com"),
    (re.compile(r"latam",              re.I), "LATAM Airlines"),
    (re.compile(r"avianca",            re.I), "Avianca"),
    (re.compile(r"taxis\s*libres",     re.I), "Taxis Libres"),
    (re.compile(r"cabify",             re.I), "Cabify"),
    (re.compile(r"temu",               re.I), "Temu"),
    (re.compile(r"falabella",          re.I), "Falabella"),
    (re.compile(r"shein",              re.I), "SHEIN"),
    (re.compile(r"farmatodo",          re.I), "Farmatodo"),
    (re.compile(r"carulla",            re.I), "Carulla"),
    (re.compile(r"\bexito\b|éxito",    re.I), "Éxito"),
    (re.compile(r"cine\s*colombia|cinecolombia", re.I), "Cine Colombia"),
    (re.compile(r"\bcine\b",           re.I), "Cine"),
    (re.compile(r"adidas",             re.I), "Adidas"),
    (re.compile(r"tienda\s+d1\b",      re.I), "Tiendas D1"),
    (re.compile(r"tembici",            re.I), "Tembici"),
    (re.compile(r"club\s*los\s*lagartos", re.I), "Club Los Lagartos"),
    (re.compile(r"osaki",              re.I), "Osaki"),
    (re.compile(r"new\s*york\s*times", re.I), "New York Times"),
    (re.compile(r"youtube",            re.I), "YouTube"),
    (re.compile(r"google",             re.I), "Google"),
    (re.compile(r"despegar",           re.I), "Despegar"),
]


def normalize_brand(merchant: str) -> str:
    """Return canonical brand name if matched, otherwise return merchant as-is."""
    if not merchant:
        return merchant
    for pattern, canonical in BRAND_RULES:
        if pattern.search(merchant):
            return canonical
    return merchant


def get_brand_group(merchant: str) -> str:
    """Same as normalize_brand — alias for clarity."""
    return normalize_brand(merchant)


def build_brand_filter_list(merchants: list[str]) -> list[str]:
    """
    Given a list of distinct merchant names, return a sorted deduplicated list
    of canonical brand names for use in filter dropdowns.
    """
    brands = set()
    for m in merchants:
        brands.add(normalize_brand(m))
    return sorted(brands)
