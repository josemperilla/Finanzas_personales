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

  const gasPayload = {
    userId:    typeof body.userId === 'string' ? body.userId.toLowerCase().trim() : '',
    sms:       typeof body.sms === 'string' ? body.sms : '',
    bank:      typeof body.bank === 'string' ? body.bank : '',
    timestamp: typeof body.timestamp === 'string' ? body.timestamp : '',
    _secret:   typeof body._secret === 'string' ? body._secret : '',
  };

  try {
    const gasRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gasPayload),
    });
    const data = await gasRes.json().catch(() => ({}));
    return json(data);
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
