import { WEBHOOK_URL, WEBHOOK_SECRET } from './config';

let _activeUserId: string | null = null;

export function setActiveUser(id: string | null) {
  _activeUserId = id;
}

// ── Session token management ──────────────────────────────────
// Stored in sessionStorage (dies when the browser tab closes, matching the
// 12h server-side TTL). Falls back to legacy userId-only mode gracefully.

function _sessionKey(userId: string) { return `fm_session_${userId}`; }

export function setSessionToken(userId: string, token: string) {
  try { sessionStorage.setItem(_sessionKey(userId), token); } catch { /* noop */ }
}

export function getSessionToken(userId?: string | null): string | null {
  const uid = userId ?? _activeUserId;
  if (!uid) return null;
  try { return sessionStorage.getItem(_sessionKey(uid)); } catch { return null; }
}

export function clearSessionToken(userId?: string | null) {
  const uid = userId ?? _activeUserId;
  if (!uid) return;
  try { sessionStorage.removeItem(_sessionKey(uid)); } catch { /* noop */ }
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

// Auth payload: session token takes priority; falls back to userId for legacy backends.
function withUser(body: Record<string, unknown>): Record<string, unknown> {
  const token = getSessionToken();
  if (token) return { ...body, sessionToken: token };
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
  const extraParams: Record<string, string> = { action: 'transactions' };
  const token = getSessionToken();
  if (token) {
    extraParams.sessionToken = token;
  } else {
    const uid = _activeUserId || localStorage.getItem('fm_profile');
    if (uid) extraParams.userId = uid;
  }
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
  if (json.ok && json.sessionToken && uid) {
    setSessionToken(uid, json.sessionToken);
  }
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
    // Cache so getProfile() can resolve registry users (name/avatar) on the
    // PIN screen and in Settings without an async call.
    try { localStorage.setItem('fm_profiles_cache', JSON.stringify(json.data)); } catch { /* noop */ }
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
  suggestedName: string,
  adminPin?: string,
): Promise<{ token: string; expiresAt: string }> {
  assertWebhookUrl();
  const token = getSessionToken();
  const body: Record<string, unknown> = { type: 'adminCreateInvite', suggestedName };
  if (token) {
    body.sessionToken = token;
  } else {
    // Legacy: re-enter admin PIN when no session
    body.userId   = 'jose';
    body.adminPin = adminPin ?? '';
  }
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'No se pudo generar la invitación');
  return json.data as { token: string; expiresAt: string };
}

// ── Admin: user management ────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  status: 'active' | 'disabled' | 'deleted';
  createdAt: string;
  txCount: number;
  lastActivity: string | null;
}

export interface AdminInvite {
  token: string;
  status: string;
  suggestedName: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

export interface AdminListData {
  users: AdminUser[];
  pendingInvites: AdminInvite[];
}

export async function adminListUsers(): Promise<AdminListData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'adminListUsers' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al listar usuarios');
  return json.data as AdminListData;
}

async function adminUserAction(type: string, targetUserId: string, extra?: Record<string, unknown>): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type, targetUserId, ...extra })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error en operación admin');
}

export const adminDisableUser  = (id: string) => adminUserAction('adminDisableUser', id);
export const adminEnableUser   = (id: string) => adminUserAction('adminEnableUser', id);
export const adminDeleteUser   = (id: string, deleteData: boolean) => adminUserAction('adminDeleteUser', id, { deleteData });
export const adminRevokeInvite = (token: string) => adminUserAction('adminRevokeInvite', '', { inviteToken: token });

// ── Profile editing ───────────────────────────────────────────

export async function updateProfile(updates: { displayName?: string; avatar?: string }): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'updateProfile', ...updates })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al actualizar perfil');
  // Bust the local profile cache so changes show immediately.
  try { localStorage.removeItem('fm_profiles_cache'); } catch { /* noop */ }
}
