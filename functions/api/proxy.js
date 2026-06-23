// Cloudflare Pages Function — proxies all PWA requests to Apps Script.
// WEBHOOK_URL and the secret live only in Cloudflare env vars (server-side).
// The PWA never holds the secret; it calls /api/proxy instead.
//
// Prefer WEB_SECRET for the authenticated web channel. WEBHOOK_SECRET remains
// as a compatibility fallback while existing deployments are migrated.
export async function onRequest(context) {
  const { request, env } = context;
  const WEBHOOK_URL    = env.WEBHOOK_URL    || '';
  const WEBHOOK_SECRET = env.WEB_SECRET || env.WEBHOOK_SECRET || '';

  if (!WEBHOOK_URL) {
    // Preview mode: return mock responses so the UI is navigable without a backend.
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const action = url.searchParams.get('action');
      if (action === 'transactions') return json({ ok: true, data: [] });
      return json({ ok: true, data: [] });
    }

    let payload = {};
    try { payload = JSON.parse(await request.text()); } catch (_) {}
    const type = payload.type;

    if (type === 'validatePin' || type === 'setupPin')
      return json({ ok: true, token: 'preview-mode' });
    if (type === 'hasPin')
      return json({ ok: true, exists: true });
    if (type === 'listUsers' || type === 'listUsersData')
      return json({ ok: true, data: [] });
    if (type === 'getProfile')
      return json({ ok: true, data: { displayName: 'Preview', avatar: '' } });
    if (type === 'chat')
      return json({ ok: true, data: { answer: '(modo preview — sin backend)' } });

    return json({ ok: true, data: [] });
  }

  const jsonRelay = (res, text) => {
    try { JSON.parse(text); } catch (_) {
      return new Response(
        JSON.stringify({ ok: false, error: 'El servidor devolvió una respuesta inválida. Verifica la URL del webhook.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    if (request.method === 'GET') {
      const incoming = new URL(request.url);
      const target   = new URL(WEBHOOK_URL);
      incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      if (WEBHOOK_SECRET) target.searchParams.set('_secret', WEBHOOK_SECRET);

      const res = await fetch(target.toString());
      return jsonRelay(res, await res.text());
    }

    if (request.method === 'POST') {
      let payload = {};
      try { payload = JSON.parse(await request.text()); } catch (_) {}
      if (WEBHOOK_SECRET) payload._secret = WEBHOOK_SECRET;

      const res = await fetch(WEBHOOK_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload),
      });
      return jsonRelay(res, await res.text());
    }

    return new Response('Method Not Allowed', { status: 405 });
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
