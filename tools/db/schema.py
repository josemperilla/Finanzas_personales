import sqlite3
from tools.db.connection import get_connection

DDL = """
CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    name_es     TEXT NOT NULL,
    icon        TEXT DEFAULT '💳',
    color       TEXT DEFAULT '#808080',
    is_income   INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id                  TEXT PRIMARY KEY,
    date                DATE NOT NULL,
    original_description TEXT NOT NULL,
    clean_merchant      TEXT,
    amount_original     REAL NOT NULL,
    currency_original   TEXT NOT NULL DEFAULT 'COP',
    amount_cop          REAL,
    fx_rate             REAL DEFAULT 1.0,
    transaction_type    TEXT CHECK(transaction_type IN ('debit','credit')) DEFAULT 'debit',
    category_id         INTEGER REFERENCES categories(id),
    category_source     TEXT CHECK(category_source IN ('rule','claude','manual','none')) DEFAULT 'none',
    source_bank         TEXT NOT NULL,
    source_file         TEXT,
    account_number      TEXT,
    is_recurring        INTEGER DEFAULT 0,
    notes               TEXT,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_date     ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_bank     ON transactions(source_bank);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON transactions(clean_merchant);

CREATE TABLE IF NOT EXISTS categorization_rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern         TEXT NOT NULL,
    match_type      TEXT CHECK(match_type IN ('exact','contains','regex')) DEFAULT 'contains',
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    bank_scope      TEXT,
    priority        INTEGER DEFAULT 100,
    is_active       INTEGER DEFAULT 1,
    source          TEXT CHECK(source IN ('system','user','claude')) DEFAULT 'system',
    created_from_tx TEXT REFERENCES transactions(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_priority ON categorization_rules(priority, is_active);

CREATE TABLE IF NOT EXISTS fx_rates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            DATE NOT NULL,
    from_currency   TEXT NOT NULL,
    to_currency     TEXT NOT NULL DEFAULT 'COP',
    rate            REAL NOT NULL,
    source          TEXT DEFAULT 'api',
    fetched_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, from_currency, to_currency)
);

CREATE TABLE IF NOT EXISTS budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month       TEXT NOT NULL,
    amount_cop  REAL NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, month)
);

CREATE TABLE IF NOT EXISTS alerts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type      TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id),
    month           TEXT,
    message         TEXT NOT NULL,
    threshold       REAL,
    actual_value    REAL,
    is_dismissed    INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    role        TEXT CHECK(role IN ('user','assistant')) NOT NULL,
    content     TEXT NOT NULL,
    sql_query   TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingest_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT NOT NULL,
    file_hash       TEXT NOT NULL UNIQUE,
    bank            TEXT,
    format          TEXT,
    rows_extracted  INTEGER DEFAULT 0,
    rows_inserted   INTEGER DEFAULT 0,
    rows_skipped    INTEGER DEFAULT 0,
    status          TEXT CHECK(status IN ('success','partial','failed')),
    error_message   TEXT,
    ingested_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

CATEGORIES_SEED = [
    ("alimentacion",   "Alimentación",     "🛒", "#4CAF50", 0),
    ("restaurantes",   "Restaurantes",     "🍽️", "#FF9800", 0),
    ("delivery",       "Delivery",         "🛵", "#F44336", 0),
    ("transporte",     "Transporte",       "🚗", "#2196F3", 0),
    ("entretenimiento","Entretenimiento",  "🎬", "#9C27B0", 0),
    ("salud",          "Salud",            "💊", "#00BCD4", 0),
    ("suscripciones",  "Suscripciones",    "📱", "#3F51B5", 0),
    ("viajes",         "Viajes",           "✈️", "#009688", 0),
    ("educacion",      "Educación",        "📚", "#795548", 0),
    ("compras_online", "Compras Online",   "📦", "#FF5722", 0),
    ("servicios",      "Servicios",        "⚡", "#607D8B", 0),
    ("transferencias", "Transferencias",   "↔️", "#9E9E9E", 0),
    ("ingresos",       "Ingresos",         "💰", "#8BC34A", 1),
    ("otros",          "Otros",            "❓", "#BDBDBD", 0),
]

# (pattern, match_type, category_name, bank_scope, priority, source)
RULES_SEED = [
    # Ingresos — prioridad más alta
    ("NOMINA",              "contains", "ingresos",       None, 10, "system"),
    ("TRANSFERENCIA RECIBIDA","contains","ingresos",      None, 10, "system"),
    ("CONSIGNACION",        "contains", "ingresos",       None, 10, "system"),
    ("ABONO NOMINA",        "contains", "ingresos",       None, 10, "system"),

    # Delivery
    ("RAPPI TURBO",         "contains", "delivery",       None, 90,  "system"),
    ("RAPPI",               "contains", "delivery",       None, 100, "system"),
    ("UBER EATS",           "contains", "delivery",       None, 100, "system"),
    ("DOMICILIOS",          "contains", "delivery",       None, 100, "system"),
    ("IFOOD",               "contains", "delivery",       None, 100, "system"),

    # Suscripciones
    ("SPOTIFY",             "contains", "suscripciones",  None, 100, "system"),
    ("NETFLIX",             "contains", "suscripciones",  None, 100, "system"),
    ("AMAZON PRIME",        "contains", "suscripciones",  None, 90,  "system"),
    ("YOUTUBE",             "contains", "suscripciones",  None, 100, "system"),
    ("APPLE.COM/BILL",      "contains", "suscripciones",  None, 100, "system"),
    ("APPLE.COM",           "contains", "suscripciones",  None, 110, "system"),
    ("DISNEY",              "contains", "suscripciones",  None, 100, "system"),
    ("HBO",                 "contains", "suscripciones",  None, 100, "system"),
    ("PARAMOUNT",           "contains", "suscripciones",  None, 100, "system"),
    ("DEEZER",              "contains", "suscripciones",  None, 100, "system"),
    ("CRUNCHYROLL",         "contains", "suscripciones",  None, 100, "system"),
    ("DUOLINGO",            "contains", "suscripciones",  None, 100, "system"),

    # Transporte
    ("UBER",                "contains", "transporte",     None, 100, "system"),
    ("CABIFY",              "contains", "transporte",     None, 100, "system"),
    ("DIDI",                "contains", "transporte",     None, 100, "system"),
    ("BEAT",                "contains", "transporte",     None, 100, "system"),
    ("TERPEL",              "contains", "transporte",     None, 100, "system"),
    ("PRIMAX",              "contains", "transporte",     None, 100, "system"),
    ("BIOMAX",              "contains", "transporte",     None, 100, "system"),
    ("PEAJE",               "contains", "transporte",     None, 100, "system"),
    ("TRANSMILENIO",        "contains", "transporte",     None, 100, "system"),

    # Restaurantes
    ("MCDONALD",            "contains", "restaurantes",   None, 100, "system"),
    ("BURGER KING",         "contains", "restaurantes",   None, 100, "system"),
    ("SUBWAY",              "contains", "restaurantes",   None, 100, "system"),
    ("KFC",                 "contains", "restaurantes",   None, 100, "system"),
    ("WENDY",               "contains", "restaurantes",   None, 100, "system"),
    ("PAPA JOHNS",          "contains", "restaurantes",   None, 100, "system"),
    ("DOMINO",              "contains", "restaurantes",   None, 100, "system"),

    # Alimentación
    ("EXITO",               "contains", "alimentacion",   None, 100, "system"),
    ("CARULLA",             "contains", "alimentacion",   None, 100, "system"),
    ("OLIMPICA",            "contains", "alimentacion",   None, 100, "system"),
    ("D1",                  "exact",    "alimentacion",   None, 100, "system"),
    ("JUMBO",               "contains", "alimentacion",   None, 100, "system"),
    ("METRO",               "contains", "alimentacion",   None, 100, "system"),
    ("SURTIMAX",            "contains", "alimentacion",   None, 100, "system"),
    ("ARA",                 "contains", "alimentacion",   None, 110, "system"),

    # Salud
    ("FARMACIA",            "contains", "salud",          None, 100, "system"),
    ("DROGUERIA",           "contains", "salud",          None, 100, "system"),
    ("DROGAS",              "contains", "salud",          None, 100, "system"),
    ("CRUZ VERDE",          "contains", "salud",          None, 100, "system"),
    ("COLSUBSIDIO DROGUERIA","contains","salud",          None, 100, "system"),
    ("CLINICA",             "contains", "salud",          None, 100, "system"),
    ("HOSPITAL",            "contains", "salud",          None, 100, "system"),
    ("LABORATORIO",         "contains", "salud",          None, 100, "system"),
    ("CONSULTORIO",         "contains", "salud",          None, 100, "system"),

    # Servicios (utilities)
    ("EPM",                 "contains", "servicios",      None, 100, "system"),
    ("ENEL",                "contains", "servicios",      None, 100, "system"),
    ("CODENSA",             "contains", "servicios",      None, 100, "system"),
    ("ETB",                 "contains", "servicios",      None, 100, "system"),
    ("CLARO",               "contains", "servicios",      None, 100, "system"),
    ("MOVISTAR",            "contains", "servicios",      None, 100, "system"),
    ("TIGO",                "contains", "servicios",      None, 100, "system"),
    ("PAGO PSE",            "contains", "servicios",      None, 100, "system"),
    ("GAS NATURAL",         "contains", "servicios",      None, 100, "system"),
    ("ACUEDUCTO",           "contains", "servicios",      None, 100, "system"),

    # Compras online
    ("AMAZON",              "contains", "compras_online", None, 110, "system"),
    ("MERCADOLIBRE",        "contains", "compras_online", None, 100, "system"),
    ("FALABELLA",           "contains", "compras_online", None, 100, "system"),
    ("LINIO",               "contains", "compras_online", None, 100, "system"),
    ("SHEIN",               "contains", "compras_online", None, 100, "system"),
    ("ALIEXPRESS",          "contains", "compras_online", None, 100, "system"),

    # Viajes
    ("AVIANCA",             "contains", "viajes",         None, 100, "system"),
    ("LATAM",               "contains", "viajes",         None, 100, "system"),
    ("WINGO",               "contains", "viajes",         None, 100, "system"),
    ("DESPEGAR",            "contains", "viajes",         None, 100, "system"),
    ("BOOKING",             "contains", "viajes",         None, 100, "system"),
    ("AIRBNB",              "contains", "viajes",         None, 100, "system"),
    ("HOTEL",               "contains", "viajes",         None, 100, "system"),

    # Entretenimiento
    ("CINEMA",              "contains", "entretenimiento",None, 100, "system"),
    ("CINEMARK",            "contains", "entretenimiento",None, 100, "system"),
    ("CINE COLOMBIA",       "contains", "entretenimiento",None, 100, "system"),
    ("STEAM",               "contains", "entretenimiento",None, 100, "system"),
    ("PLAYSTATION",         "contains", "entretenimiento",None, 100, "system"),
    ("XBOX",                "contains", "entretenimiento",None, 100, "system"),

    # Transferencias
    ("TRANSFERENCIA",       "contains", "transferencias", None, 120, "system"),
    ("DAVIPLATA",           "contains", "transferencias", None, 100, "system"),
    ("NEQUI",               "contains", "transferencias", None, 100, "system"),
    ("BANCOLOMBIA",         "contains", "transferencias", None, 110, "system"),
]


def init_db(conn: sqlite3.Connection = None) -> None:
    if conn is None:
        conn = get_connection()

    for statement in DDL.strip().split(";"):
        stmt = statement.strip()
        if stmt:
            conn.execute(stmt)

    _seed_categories(conn)
    _seed_rules(conn)
    conn.commit()


def _seed_categories(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
    if count > 0:
        return
    conn.executemany(
        "INSERT OR IGNORE INTO categories (name, name_es, icon, color, is_income) VALUES (?,?,?,?,?)",
        CATEGORIES_SEED,
    )


def _seed_rules(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM categorization_rules").fetchone()[0]
    if count > 0:
        return
    for pattern, match_type, cat_name, bank_scope, priority, source in RULES_SEED:
        row = conn.execute("SELECT id FROM categories WHERE name=?", (cat_name,)).fetchone()
        if row:
            conn.execute(
                """INSERT OR IGNORE INTO categorization_rules
                   (pattern, match_type, category_id, bank_scope, priority, source)
                   VALUES (?,?,?,?,?,?)""",
                (pattern, match_type, row[0], bank_scope, priority, source),
            )


if __name__ == "__main__":
    init_db()
    print("Base de datos inicializada correctamente.")
