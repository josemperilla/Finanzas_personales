import { WEBHOOK_URL, WEBHOOK_SECRET } from './config';

let _activeUserId: string | null = null;

export function setActiveUser(id: string | null) {
  _activeUserId = id;
}

function assertWebhookUrl() {
  if (!WEBHOOK_URL) {
    throw new Error('Falta configurar WEBHOOK_URL en el servidor');
  }
}

// Appends _secret to URL params (Apps Script can't read custom headers,
// so the secret travels as a query param).
function secureUrl(base: string, extraParams?: Record<string, string>): string {
  const sep = base.includes('?') ? '&' : '?';
  const params = new URLSearchParams();
  if (WEBHOOK_SECRET) params.set('_secret', WEBHOOK_SECRET);
  if (extraParams) Object.entries(extraParams).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  return qs ? `${base}${sep}${qs}` : base;
}

function withUser(body: Record<string, unknown>): Record<string, unknown> {
  return _activeUserId ? { ...body, userId: _activeUserId } : body;
}

export interface Transaction {
  Timestamp: string;
  Fecha: string;
  Banco: string;
  Tipo: string;
  'Monto (COP)': number;
  Comercio: string;
  'Tarjeta/Cuenta': string;
  Categoría: string;
  Nota?: string;
  SMS_Original?: string;
  Fuente?: string; // "sms" | "notification" | "email" | "manual"
}

export interface ManualTransaction {
  banco: string;
  tipo: string;
  monto: number;
  comercio: string;
  tarjeta?: string;
  categoria: string;
  fecha?: string;
  nota?: string;
}

export interface VoiceParsed {
  monto: number;
  comercio: string;
  categoria: string;
  banco: string;
  tipo: string;
}

export async function fetchTransactions(): Promise<Transaction[]> {
  assertWebhookUrl();
  const uid = _activeUserId || localStorage.getItem('fm_profile');
  const extraParams: Record<string, string> = { action: 'transactions' };
  if (uid) extraParams.userId = uid;
  const res = await fetch(secureUrl(WEBHOOK_URL, extraParams));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar transacciones');
  return json.data as Transaction[];
}

export async function saveTransaction(data: ManualTransaction): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'manual', ...data })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar');
}

export async function parseVoice(text: string): Promise<VoiceParsed> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'voice', text })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al parsear voz');
  return json.data as VoiceParsed;
}

export async function updateCategory(timestamp: string, categoria: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'updateCategory', timestamp, categoria })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al actualizar categoría');
}

export async function validatePin(pin: string, userId?: string): Promise<{ ok: boolean; error?: string }> {
  assertWebhookUrl();
  const uid = userId || _activeUserId || localStorage.getItem('fm_profile');
  const body: Record<string, unknown> = { type: 'validatePin', pin };
  if (uid) body.userId = uid;
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: json.ok === true, error: json.error };
}

export async function deleteTransaction(timestamp: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteTransaction', timestamp })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar transacción');
}

export async function updateTransaction(timestamp: string, data: Partial<ManualTransaction>): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'updateTransaction', timestamp, ...data })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al actualizar transacción');
}

export async function changePin(currentPin: string, newPin: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'changePin', currentPin, newPin })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cambiar PIN');
}

export async function importTransactions(
  rows: ManualTransaction[],
  onProgress: (done: number, total: number) => void,
  delayMs = 300,
): Promise<{ ok: number; errors: number }> {
  assertWebhookUrl();
  let ok = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i++) {
    try {
      await saveTransaction(rows[i]);
      ok++;
    } catch {
      errors++;
    }
    onProgress(i + 1, rows.length);
    if (delayMs > 0 && i < rows.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return { ok, errors };
}

export async function askChat(question: string, context: object): Promise<string> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'chat', question, context })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al consultar el asistente');
  return json.data.answer as string;
}

// ── Onboarding & user registry ───────────────────────────────
// These degrade gracefully: if the webhook hasn't been redeployed with the
// new endpoints yet, they resolve to a safe "feature off" value instead of
// throwing, so the live jose/dani experience is never affected.

export interface ProfileInfo {
  id: string;
  name: string;
  avatar: string;
}

// Returns null on any failure or if the endpoint isn't deployed yet,
// so callers keep their static profile list.
export async function fetchProfiles(): Promise<ProfileInfo[] | null> {
  try {
    if (!WEBHOOK_URL) return null;
    const res = await fetch(secureUrl(WEBHOOK_URL, { action: 'profiles' }));
    const json = await res.json();
    if (!json.ok || !Array.isArray(json.data)) return null;
    return json.data as ProfileInfo[];
  } catch {
    return null;
  }
}

export interface InviteValidation {
  valid: boolean;
  suggestedName?: string;
  reason?: string; // 'unavailable' when the backend endpoint isn't deployed
}

export async function validateInvite(token: string): Promise<InviteValidation> {
  try {
    if (!WEBHOOK_URL) return { valid: false, reason: 'unavailable' };
    const res = await fetch(secureUrl(WEBHOOK_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'validateInvite', token }),
    });
    const json = await res.json();
    if (json.ok && json.data && typeof json.data.valid === 'boolean') {
      return json.data as InviteValidation;
    }
    return { valid: false, reason: 'unavailable' };
  } catch {
    return { valid: false, reason: 'unavailable' };
  }
}

export async function redeemInvite(params: {
  token: string;
  userId: string;
  displayName: string;
  pin: string;
  avatar?: string;
}): Promise<{ userId: string; name: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'redeemInvite', ...params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'No se pudo crear el usuario');
  return json.data as { userId: string; name: string };
}

export async function adminCreateInvite(
  adminPin: string,
  suggestedName: string,
): Promise<{ token: string; expiresAt: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'adminCreateInvite', userId: 'jose', adminPin, suggestedName }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'No se pudo generar la invitación');
  return json.data as { token: string; expiresAt: string };
}
