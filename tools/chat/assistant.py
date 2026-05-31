"""
ChatAssistant: manages conversation with Claude.
Strategy: inject a rich pre-computed context snapshot so Claude can answer
most questions directly. Use NL→SQL only as a supplement for specific queries.
"""

import os
import anthropic
from dotenv import load_dotenv
from tools.db.connection import get_connection
from tools.chat.context_builder import build_context_snapshot, execute_safe_query, SCHEMA_DDL
from tools.chat.query_builder import nl_to_sql

load_dotenv()

_CHAT_MODEL = "claude-haiku-4-5-20251001"
_MAX_HISTORY = 20  # rolling window of turns


class ChatAssistant:
    def __init__(self, conn=None):
        self.conn = conn or get_connection()
        api_key = os.getenv("ANTHROPIC_API_KEY")
        self.client = anthropic.Anthropic(api_key=api_key) if api_key else None
        self.history: list[dict] = []

    def _build_system_prompt(self) -> str:
        # Rebuild snapshot on each call so it reflects latest data
        snapshot = build_context_snapshot(self.conn)
        return f"""Eres un asistente financiero personal para un usuario colombiano.
Tienes acceso a todos los datos financieros del usuario y debes responder en español.

---
{snapshot}
---

INSTRUCCIONES:
- Usa los datos del contexto anterior para responder. Cita números exactos.
- Si la pregunta requiere datos más específicos que no están en el contexto (ej: filtrar por un mes concreto, un comercio específico), se te proporcionará una consulta SQL adicional con los datos.
- Responde siempre en español, de forma concisa pero completa.
- Usa formato markdown (tablas, listas) cuando sea útil.
- Los montos siempre en COP con formato $X,XXX,XXX.
- Si el usuario pregunta por suscripciones o pagos recurrentes, usa la sección "Suscripciones y pagos recurrentes detectados" del contexto.
- Si no tienes información suficiente, dilo claramente.

ESQUEMA DE BASE DE DATOS (para referencia):
{SCHEMA_DDL}
"""

    def chat(self, user_message: str) -> dict:
        """
        Process a user message and return {answer, sql_used, explanation}.
        """
        if not self.client:
            return {
                "answer": "❌ No hay API key de Anthropic configurada. Agrega `ANTHROPIC_API_KEY` en el archivo `.env`.",
                "sql_used": None,
                "explanation": None,
            }

        # Try to generate supplemental SQL for data-specific queries
        sql_result = nl_to_sql(user_message)
        query_context = ""
        sql_used = None
        explanation = None

        if sql_result.is_safe and sql_result.sql:
            query_data = execute_safe_query(sql_result.sql, self.conn)
            # Only inject if we got real data (not just errors or empty)
            if query_data and "Error" not in query_data and "no devolvió" not in query_data:
                query_context = (
                    f"\n\n[Datos adicionales de la base de datos para esta consulta — "
                    f"{sql_result.explanation}:\n{query_data}]"
                )
            sql_used = sql_result.sql
            explanation = sql_result.explanation

        # Build user message with optional SQL context appended
        message_with_context = user_message
        if query_context:
            message_with_context = user_message + query_context

        self.history.append({"role": "user", "content": message_with_context})

        # Trim history to rolling window
        if len(self.history) > _MAX_HISTORY:
            self.history = self.history[-_MAX_HISTORY:]

        try:
            response = self.client.messages.create(
                model=_CHAT_MODEL,
                max_tokens=1500,
                system=self._build_system_prompt(),
                messages=self.history,
            )
            answer = response.content[0].text

            self.history.append({"role": "assistant", "content": answer})

            # Persist to DB (store original message without injected context)
            self.conn.execute(
                "INSERT INTO chat_messages (role, content, sql_query) VALUES (?,?,?)",
                ("user", user_message, None),
            )
            self.conn.execute(
                "INSERT INTO chat_messages (role, content, sql_query) VALUES (?,?,?)",
                ("assistant", answer, sql_used),
            )
            self.conn.commit()

            return {"answer": answer, "sql_used": sql_used, "explanation": explanation}

        except Exception as e:
            return {
                "answer": f"❌ Error al procesar tu mensaje: {e}",
                "sql_used": sql_used,
                "explanation": explanation,
            }
