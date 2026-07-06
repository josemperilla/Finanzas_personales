// Cloudflare Pages Function — Extrae transacciones de una imagen de extracto bancario
// usando Claude Vision (Anthropic API).
// Requiere: ANTHROPIC_API_KEY en las variables de entorno de Cloudflare Pages.

import { assertSession } from './_auth.js';
import { CLAUDE_API } from './_constants.js';

// Tipos de imagen aceptados por Claude Vision (y por nosotros).
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
// Tope del base64 de la imagen (~7.3 MB binarios). Evita abusar de la API de Anthropic.
const MAX_IMAGE_B64_LENGTH = 10 * 1024 * 1024;

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const API_KEY = env.ANTHROPIC_API_KEY || '';
  if (!API_KEY) {
    return json({ ok: false, error: 'ANTHROPIC_API_KEY no configurado en Cloudflare. Agrégala en Pages → Settings → Environment Variables.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo de solicitud inválido' }, 400);
  }

  // Autenticación: solo usuarios con un token de sesión válido pueden gastar la
  // API de Anthropic. El token se valida contra el webhook (Apps Script), que es
  // el único que conoce los tokens (viven en su CacheService).
  const token = typeof body.token === 'string' ? body.token : '';
  const session = await assertSession(env, token);
  if (!session.ok) {
    return json({ ok: false, error: session.error }, session.status);
  }

  const { image, mediaType } = body;
  if (!image || typeof image !== 'string') {
    return json({ ok: false, error: 'Se requiere el campo "image" en base64' }, 400);
  }
  if (image.length > MAX_IMAGE_B64_LENGTH) {
    return json({ ok: false, error: 'La imagen es demasiado grande' }, 413);
  }

  const imageMediaType = ALLOWED_MEDIA_TYPES.includes(mediaType) ? mediaType : 'image/jpeg';

  const claudeBody = {
    // OCR de recibo = dato estructurado simple: Haiku lee igual de bien que Opus y cuesta ~25x menos.
    // (Si la precisión bajara en recibos complejos, subir a 'claude-sonnet-4-6' sigue siendo ~10x más barato que Opus.)
    // Modelo configurable vía env (ver docs/CONVENTIONS.md: "el modelo va en env"); fallback al valor actual.
    model: env.CLAUDE_OCR_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: imageMediaType, data: image },
          },
          {
            type: 'text',
            text: `Extrae todas las transacciones de débito (gastos, retiros, compras) de este extracto bancario colombiano.
Devuelve SOLO un JSON array con este formato exacto, sin ningún texto adicional:
[{"monto": number, "comercio": "string", "fecha": "YYYY-MM-DD", "tipo": "Compra", "banco": "Otro"}]

Reglas:
- monto: número entero en COP (sin puntos ni comas)
- comercio: nombre del establecimiento o descripción del movimiento (máximo 40 chars)
- fecha: formato YYYY-MM-DD; si no hay año visible usa el año actual
- tipo: siempre "Compra" para gastos, "Retiro" para retiros en efectivo, "Transferencia" para transferencias
- banco: Bancolombia | Bogotá | Davivienda | Itaú | Otro
- Excluye abonos, pagos recibidos y consignaciones (solo gastos)
- Si no hay transacciones claras, devuelve []
`,
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    });

    if (!res.ok) {
      const errText = await res.text();
      return json({ ok: false, error: `Anthropic API error ${res.status}: ${errText}` }, 502);
    }

    const result = await res.json();
    const text = result.content?.[0]?.text ?? '[]';

    let transactions;
    try {
      // Strip markdown code fences if present
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      transactions = JSON.parse(clean);
    } catch {
      return json({ ok: false, error: 'Claude devolvió un formato inesperado', raw: text }, 502);
    }

    return json({ ok: true, transactions });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
