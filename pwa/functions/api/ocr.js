// Cloudflare Pages Function — Extrae transacciones de una imagen de extracto bancario
// usando Claude Vision (Anthropic API).
// Requiere: ANTHROPIC_API_KEY en las variables de entorno de Cloudflare Pages.

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';

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

  const { image, mediaType } = body;
  if (!image || typeof image !== 'string') {
    return json({ ok: false, error: 'Se requiere el campo "image" en base64' }, 400);
  }

  const imageMediaType = mediaType || 'image/jpeg';

  const claudeBody = {
    model: 'claude-opus-4-8',
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
