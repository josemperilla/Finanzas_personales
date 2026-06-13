// Cloudflare Pages Function — Proxy del iOS Shortcut hacia GAS.
// Elimina el doble-redirect de script.google.com que rompe "Obtener contenido de URL"
// en Mac/iOS Atajos. GAS verifica el _secret directamente (canal "shortcut").

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Cuerpo de solicitud inválido' }, 400);
  }

  const WEBHOOK_URL = env.WEBHOOK_URL || '';
  if (!WEBHOOK_URL) return json({ ok: false, error: 'WEBHOOK_URL no configurado' }, 500);

  // DEBUG TEMPORAL: devuelve lo que recibimos para diagnosticar Mac Atajos
  const secretRaw = body._secret;
  return json({
    debug: true,
    secretType:    typeof secretRaw,
    secretLength:  typeof secretRaw === 'string' ? secretRaw.length : null,
    secretFirst8:  typeof secretRaw === 'string' ? secretRaw.substring(0, 8) : null,
    secretLast8:   typeof secretRaw === 'string' ? secretRaw.slice(-8) : null,
    userIdReceived: body.userId,
    smsType:       typeof body.sms,
    bodyKeys:      Object.keys(body),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
