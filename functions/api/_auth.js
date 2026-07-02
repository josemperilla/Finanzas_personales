// Cloudflare Pages Function — helper compartido de autenticación.
// Valida un token de sesión contra el webhook de Apps Script (GAS), que es el
// único que conoce los tokens vigentes (viven en su CacheService).
//
// Prefijo `_` para que Cloudflare Pages NO trate este archivo como una ruta
// (ver https://developers.cloudflare.com/pages/functions/routing/).
//
// Usado por ocr.js, extract-pdf.js y shortcut-config.js — antes cada uno
// duplicaba este mismo bloque de ~25 líneas.

// Valida el token contra GAS. Devuelve { ok: true } o { ok: false, status, error }
// listo para pasar directo a la respuesta JSON del endpoint que lo llama.
export async function assertSession(env, token) {
  if (!token || typeof token !== 'string') {
    return { ok: false, status: 401, error: 'No autorizado' };
  }

  const WEBHOOK_URL = env.WEBHOOK_URL || '';
  if (!WEBHOOK_URL) {
    return { ok: false, status: 500, error: 'WEBHOOK_URL no configurado' };
  }
  const SECRET = env.WEB_SECRET || env.WEBHOOK_SECRET || '';

  try {
    const authRes = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'validateToken', token, _secret: SECRET }),
    });
    const authData = await authRes.json().catch(() => ({}));
    if (!authData || !authData.ok) {
      return { ok: false, status: 401, error: 'No autorizado' };
    }
  } catch {
    return { ok: false, status: 502, error: 'No se pudo verificar la sesión' };
  }

  return { ok: true };
}
