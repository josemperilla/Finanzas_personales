// Cloudflare Pages Function — Devuelve la configuración necesaria para el
// iOS Shortcut (webhook URL + WEBHOOK_SECRET) a un usuario autenticado.
// El secreto ya viaja al cliente dentro del shortcut instalado; este endpoint
// solo evita que el admin tenga que compartirlo manualmente.

import { assertSession } from './_auth.js';

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
  const session = await assertSession(env, token);
  if (!session.ok) {
    return json({ ok: false, error: session.error }, session.status);
  }

  const SHORTCUT_SECRET = env.WEBHOOK_SECRET || env.WEB_SECRET || '';

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
