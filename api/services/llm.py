"""Integración con Claude para parseo de voz y chat financiero.

El input del usuario se aísla siempre en el rol `user` (nunca se concatena al
system prompt) para evitar inyección de prompts.
"""
import json

from api.settings import get_settings

_VOICE_SYSTEM = """Eres un parser de gastos. El usuario describe una compra en lenguaje natural.
Extrae y responde SOLO un objeto JSON válido con estas claves exactas:
{"monto": number, "comercio": string, "categoria": string, "banco": string, "tipo": string}
- monto: número en pesos colombianos (sin símbolos ni separadores).
- comercio: nombre del lugar/comercio.
- categoria: una de [Alimentación, Restaurantes, Delivery, Transporte, Entretenimiento, Salud, Suscripciones, Viajes, Educación, Compras Online, Servicios, Transferencias, Ingresos, Otros].
- banco: el banco mencionado o "Otro".
- tipo: "Compra", "Débito", "Transferencia" u "Otro".
Responde únicamente con el JSON, sin texto adicional."""

_CHAT_SYSTEM = """Eres un asistente financiero personal para un usuario colombiano.
Responde en español, conciso pero completo, citando números exactos en COP con formato $X,XXX,XXX.
Usa únicamente los datos del contexto. Si falta información, dilo claramente.

CONTEXTO FINANCIERO:
{context}"""


def _client():
    s = get_settings()
    if not s.anthropic_api_key:
        return None, s
    import anthropic

    return anthropic.Anthropic(api_key=s.anthropic_api_key), s


def parse_voice(text: str) -> dict:
    client, s = _client()
    if client is None:
        raise RuntimeError("ANTHROPIC_API_KEY no configurada")
    resp = client.messages.create(
        model=s.chat_model,
        max_tokens=300,
        system=_VOICE_SYSTEM,
        messages=[{"role": "user", "content": text[:500]}],
    )
    raw = resp.content[0].text.strip()
    # Tolerar bloques de código markdown
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw[raw.find("{"):]
    return json.loads(raw)


def chat(question: str, context: str) -> str:
    client, s = _client()
    if client is None:
        raise RuntimeError("ANTHROPIC_API_KEY no configurada")
    resp = client.messages.create(
        model=s.chat_model,
        max_tokens=1500,
        system=_CHAT_SYSTEM.format(context=context),
        messages=[{"role": "user", "content": question[:1000]}],
    )
    return resp.content[0].text
