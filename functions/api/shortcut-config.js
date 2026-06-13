// Cloudflare Pages Function — Devuelve la configuración necesaria para el
// iOS Shortcut (webhook URL + WEBHOOK_SECRET) a un usuario autenticado.
// El secreto ya viaja al cliente dentro del shortcut instalado; este endpoint
// solo evita que el admin tenga que compartirlo manualmente.

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

  const token = typeof body.token === 'string' ? body.token : '';
  if (!token) return json({ ok: false, error: 'No autorizado' }, 401);

  const WEBHOOK_URL = env.WEBHOOK_URL || '';
  const SECRET = env.WEB_SECRET || env.WEBHOOK_SECRET || '';
  const SHORTCUT_SECRET = env.WEBHOOK_SECRET || env.WEB_SECRET || '';

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

  // El shortcut apunta al proxy de Cloudflare (/api/sms), no a GAS directamente.
  // Esto evita el doble-redirect de script.google.com que rompe la auth en Atajos.
  const host = new URL(request.url).origin;
  const shortcutUrl = `${host}/api/sms`;

  return json({ ok: true, webhookUrl: shortcutUrl, secret: SHORTCUT_SECRET });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
