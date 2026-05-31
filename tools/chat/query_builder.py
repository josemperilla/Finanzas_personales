"""
Convert natural language questions to SQL using Claude,
with safety validation before execution.
"""

import re
import os
import anthropic
from dataclasses import dataclass
from dotenv import load_dotenv
from tools.chat.context_builder import SCHEMA_DDL

load_dotenv()

_ALLOWED_TABLES = {"transactions", "categories", "budgets", "fx_rates", "alerts"}
_FORBIDDEN = re.compile(
    r"\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|ATTACH|PRAGMA|EXEC|EXECUTE)\b",
    re.IGNORECASE,
)

_SQL_SYSTEM = f"""Eres un experto en SQL que traduce preguntas en español a consultas SQLite.

ESQUEMA DE LA BASE DE DATOS:
{SCHEMA_DDL}

REGLAS:
1. Genera ÚNICAMENTE consultas SELECT. Nunca INSERT, UPDATE, DELETE, DROP, etc.
2. Usa alias legibles en español para las columnas del resultado.
3. Para montos, usa amount_cop (valores en COP).
4. Para meses, usa strftime('%Y-%m', date).
5. Para categorías, haz JOIN con la tabla categories y usa name_es para mostrar el nombre.
6. Limita resultados a 50 filas máximo usando LIMIT, a menos que se pida todo.
7. Responde con un JSON con dos campos:
   - "sql": la consulta SQL lista para ejecutar
   - "explanation": una frase corta explicando qué hace la consulta

Ejemplo de respuesta:
{{"sql": "SELECT ... FROM ...", "explanation": "Suma gastos en restaurantes de marzo 2025"}}
"""


@dataclass
class SQLQueryResult:
    sql: str
    explanation: str
    is_safe: bool
    error: str = ""


def nl_to_sql(question: str) -> SQLQueryResult:
    """Translate a natural language question to a validated SQL query."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return SQLQueryResult(sql="", explanation="", is_safe=False,
                              error="ANTHROPIC_API_KEY no configurada.")

    client = anthropic.Anthropic(api_key=api_key)

    try:
        import json
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=512,
            temperature=0,
            system=_SQL_SYSTEM,
            messages=[{"role": "user", "content": question}],
        )
        text = response.content[0].text.strip()
        # Strip markdown fences
        if "```" in text:
            text = re.sub(r"```(?:json)?", "", text).strip()

        parsed = json.loads(text)
        sql = parsed.get("sql", "").strip()
        explanation = parsed.get("explanation", "")

        is_safe, err = validate_sql(sql)
        return SQLQueryResult(sql=sql, explanation=explanation, is_safe=is_safe, error=err)

    except Exception as e:
        return SQLQueryResult(sql="", explanation="", is_safe=False,
                              error=f"Error generando SQL: {e}")


def validate_sql(sql: str) -> tuple[bool, str]:
    """Safety validation for generated SQL."""
    if not sql:
        return False, "SQL vacío."
    sql_upper = sql.upper().strip()
    if not sql_upper.startswith("SELECT"):
        return False, "Solo se permiten consultas SELECT."
    if _FORBIDDEN.search(sql):
        return False, "La consulta contiene operaciones no permitidas."
    # Check table references
    tables_used = set(re.findall(r"FROM\s+(\w+)|JOIN\s+(\w+)", sql, re.IGNORECASE))
    for pair in tables_used:
        for t in pair:
            if t and t.lower() not in _ALLOWED_TABLES:
                return False, f"Tabla no permitida: {t}"
    if len(sql) > 2000:
        return False, "Consulta demasiado larga."
    return True, ""
