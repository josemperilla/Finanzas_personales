"""
Normalize raw transaction descriptions into clean merchant names.
Strips noise: terminal IDs, city suffixes, bank prefixes, date fragments.
"""

import re
from unidecode import unidecode


# Payment aggregator prefixes to strip (Bold, Vault, PayU variants)
# e.g. "BOLD*Cafe De Madeleine" → "Cafe De Madeleine"
_AGGREGATOR_PREFIX = re.compile(
    r"^(?:BOLD|VAULT|PYU|PAYU)\*\s*",
    re.IGNORECASE,
)

# Canonical overrides applied after stripping noise — checked before title-casing
_CANONICAL_OVERRIDES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"TIENDA\s+D1\b", re.IGNORECASE), "Tiendas D1"),
    (re.compile(r"TEMBICI",        re.IGNORECASE), "Tembici"),
]

# Patterns to remove from descriptions
_STRIP_PATTERNS = [
    re.compile(r"\bCOMPRA EN\b", re.IGNORECASE),
    re.compile(r"\bPAGO PSE\s+", re.IGNORECASE),
    re.compile(r"\bPAGO EN LINEA\s+", re.IGNORECASE),
    re.compile(r"\bPAGO EN LÍNEA\s+", re.IGNORECASE),
    re.compile(r"\b(BOGOTA|BOGOTÁ|BOG|COL|COLOMBIA)\s*$", re.IGNORECASE),
    re.compile(r"\s+\d{6,}\s*$"),           # terminal IDs at end
    re.compile(r"\s+\*\w{6,}\s*$"),         # asterisk codes at end
    re.compile(r"\s+#\w+\s*$"),             # hash codes at end
    re.compile(r"\s+\d{2}/\d{2}/\d{4}\s*$"),  # date fragments at end
    re.compile(r"\s{2,}", ),                 # collapse multiple spaces
    re.compile(r"^[*\-\s]+"),               # leading noise
    re.compile(r"[*\-\s]+$"),               # trailing noise
]

# City/location suffixes common in Colombian bank descriptions
_LOCATION_SUFFIXES = re.compile(
    r"\s+(BOGOTA|BOGOTÁ|MEDELLIN|MEDELLÍN|CALI|BARRANQUILLA|"
    r"CARTAGENA|BUCARAMANGA|PEREIRA|MANIZALES|IBAGUE|ARMENIA|"
    r"VILLAVICENCIO|BOG|MED|CLO|BAQ)\s*$",
    re.IGNORECASE,
)


def clean_merchant(raw_description: str, bank: str = "") -> str:
    """
    Return a clean merchant name from a raw transaction description.
    Max 60 characters, title-cased.
    """
    if not raw_description:
        return ""

    name = raw_description.strip()

    # Strip payment aggregator prefix (Bold*, Vault*, PayU*, etc.)
    name = _AGGREGATOR_PREFIX.sub("", name).strip()

    # Apply strip patterns
    for pattern in _STRIP_PATTERNS:
        name = pattern.sub(" ", name).strip()

    # Remove location suffix
    name = _LOCATION_SUFFIXES.sub("", name).strip()

    # Apply canonical overrides before title-casing
    for pattern, canonical in _CANONICAL_OVERRIDES:
        if pattern.search(name):
            return canonical

    # Normalize unicode (handle encoding issues from PDFs)
    # Only apply to non-ASCII mess; preserve normal Spanish chars
    if _has_encoding_artifacts(name):
        name = unidecode(name)

    # Title case and truncate
    name = name.title().strip()
    return name[:60]


def _has_encoding_artifacts(text: str) -> bool:
    """Detect CID codes or other PDF encoding artifacts."""
    return bool(re.search(r"\(cid:\d+\)|[\x00-\x08\x0b-\x1f\x7f-\x9f]", text))
