"""
Claude API fallback classifier for transactions that couldn't be matched by rules.
Sends batches of up to 50 merchant names per API call.
Returns category names matching input order.
"""

import json
import os
import logging
from typing import Optional
import anthropic
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_BATCH_SIZE = 50
_MODEL = "claude-sonnet-4-6"

_SYSTEM_PROMPT = """Eres un clasificador de transacciones financieras para un usuario colombiano.

Categorías disponibles (usa EXACTAMENTE estos nombres):
- alimentacion: Supermercados, tiendas de comida, verduras, carnes, abarrotes
- restaurantes: Restaurantes, cafés, bares, comida de mesa
- delivery: Domicilios, pedidos por app (Rappi, Uber Eats, iFood)
- transporte: Taxis, Uber, Cabify, gasolina, peajes, transporte público
- entretenimiento: Cine, conciertos, videojuegos, eventos, parques
- salud: Farmacias, droguerías, médicos, laboratorios, clínicas
- suscripciones: Servicios mensuales recurrentes (streaming, apps, cloud)
- viajes: Aerolíneas, hoteles, agencias, transporte interurbano
- educacion: Cursos, libros, universidades, colegios, capacitaciones
- compras_online: Amazon, MercadoLibre, Shein, AliExpress, tiendas web
- servicios: Utilities (luz, agua, gas, internet, telefonía), impuestos
- transferencias: Transferencias entre cuentas, Nequi, Daviplata
- ingresos: Nómina, consignaciones, abonos recibidos
- otros: Todo lo que no encaje en las categorías anteriores

Contexto colombiano importante:
- Éxito, Carulla, Jumbo, D1, Ara, Surtimax → alimentacion
- PAGO PSE → servicios (pago de facturas online)
- GMF CUATRO POR MIL → servicios (impuesto bancario)
- Nequi, Daviplata → transferencias
- Clinica, EPS, IPS → salud

Responde ÚNICAMENTE con un array JSON del mismo tamaño que el input.
Cada elemento debe ser exactamente uno de los nombres de categoría listados.
Sin explicaciones. Sin texto adicional."""


def classify_batch(merchants: list[str], categories: list[str] = None) -> list[str]:
    """
    Classify a list of merchant names using Claude API.
    Returns list of category names (same length as input).
    Falls back to 'otros' on any error.
    """
    if not merchants:
        return []

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning("ANTHROPIC_API_KEY not set — defaulting all to 'otros'")
        return ["otros"] * len(merchants)

    client = anthropic.Anthropic(api_key=api_key)
    results = []

    for i in range(0, len(merchants), _BATCH_SIZE):
        batch = merchants[i: i + _BATCH_SIZE]
        batch_results = _call_claude(client, batch)
        results.extend(batch_results)

    return results


def _call_claude(client: anthropic.Anthropic, merchants: list[str]) -> list[str]:
    """Send one batch to Claude and parse the JSON response."""
    try:
        user_msg = f"Clasifica estos comercios:\n{json.dumps(merchants, ensure_ascii=False)}"
        response = client.messages.create(
            model=_MODEL,
            max_tokens=512,
            temperature=0,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        text = response.content[0].text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) == len(merchants):
            return [str(c).strip() for c in parsed]
    except Exception as e:
        logger.error(f"Claude classifier error: {e}")
    return ["otros"] * len(merchants)
