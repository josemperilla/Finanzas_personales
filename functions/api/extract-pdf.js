// Cloudflare Pages Function — Extrae transacciones de un extracto bancario en PDF
// usando Claude con soporte nativo de documentos (claude-sonnet-4-6).
// Requiere: ANTHROPIC_API_KEY y WEBHOOK_URL en las variables de entorno de Cloudflare Pages.

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MAX_PDF_B64_LENGTH = 14 * 1024 * 1024; // ~10 MB binarios en base64

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  const API_KEY = env.ANTHROPIC_API_KEY || '';
  if (!API_KEY) {
    return json({ ok: false, error: 'ANTHROPIC_API_KEY no configurado en Cloudflare.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo de solicitud inválido' }, 400);
  }

  // Autenticación: token de sesión validado contra el webhook GAS.
  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return json({ ok: false, error: 'No autorizado' }, 401);

  const WEBHOOK_URL = env.WEBHOOK_URL || '';
  const SECRET = env.WEB_SECRET || env.WEBHOOK_SECRET || '';
  if (!WEBHOOK_URL) return json({ ok: false, error: 'WEBHOOK_URL no configurado' }, 500);

  try {
    const authRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'validateToken', token, _secret: SECRET }),
    });
    const authData = await authRes.json().catch(() => ({}));
    if (!authData?.ok) return json({ ok: false, error: 'No autorizado' }, 401);
  } catch {
    return json({ ok: false, error: 'No se pudo verificar la sesión' }, 502);
  }

  const { pdf, bank } = body;
  if (!pdf || typeof pdf !== 'string') {
    return json({ ok: false, error: 'Se requiere el campo "pdf" en base64' }, 400);
  }
  if (pdf.length > MAX_PDF_B64_LENGTH) {
    return json({ ok: false, error: 'El PDF es demasiado grande (máx. 10 MB)' }, 413);
  }

  const bankHint = typeof bank === 'string' && bank !== 'otro' ? ` El extracto es de ${bank}.` : '';

  const claudeBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdf },
          },
          {
            type: 'text',
            text: `Extrae todas las transacciones de débito (gastos, compras, retiros, transferencias enviadas) de este extracto bancario colombiano.${bankHint}
Devuelve SOLO un JSON array con este formato exacto, sin ningún texto adicional:
[{"monto": number, "comercio": "string", "fecha": "YYYY-MM-DD", "tipo": "Compra", "banco": "string"}]

Reglas:
- monto: número entero en COP (sin puntos ni comas), siempre positivo
- comercio: nombre del establecimiento o descripción corta del movimiento (máx. 45 chars)
- fecha: formato YYYY-MM-DD; si solo aparece día/mes, usa el año del extracto
- tipo: "Compra" para gastos en establecimiento, "Retiro" para cajeros, "Transferencia" para transferencias
- banco: Bancolombia | Bogotá | Davivienda | Itaú | Otro (detecta del encabezado del extracto)
- Excluye: abonos, pagos recibidos, consignaciones, pagos de tarjeta, cuotas de manejo, seguros, GMF
- Si no hay transacciones, devuelve []`,
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
        'anthropic-beta': 'pdfs-2024-09-25',
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
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      transactions = JSON.parse(clean);
    } catch {
      return json({ ok: false, error: 'Claude devolvió un formato inesperado', raw: text }, 502);
    }

    if (!Array.isArray(transactions)) {
      return json({ ok: false, error: 'Respuesta inesperada de Claude', raw: text }, 502);
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
