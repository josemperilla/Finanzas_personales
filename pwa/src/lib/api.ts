import { WEBHOOK_URL, WEBHOOK_SECRET, normalizeCategory } from './config';

let _activeUserId: string | null = null;
let _token: string | null = null;

export function setActiveUser(id: string | null) {
  _activeUserId = id;
  _token = id ? localStorage.getItem(`fm_token_${id}`) : null;
}

// Guarda el token de sesión emitido por el backend tras validar/crear el PIN.
// Vive en localStorage para sobrevivir reinicios de la PWA (desbloqueo biométrico).
function storeToken(userId: string, token?: string) {
  if (!token) return;
  localStorage.setItem(`fm_token_${userId}`, token);
  if (userId === _activeUserId) _token = token;
}

// Añade el token de sesión al cuerpo de una petición autenticada.
function withAuth(body: Record<string, unknown>): Record<string, unknown> {
  return _token ? { ...body, token: _token } : body;
}

// Expone el token de sesión activo para llamadas que no pasan por este módulo
// (p. ej. el endpoint /api/ocr de Cloudflare, que lo valida contra el webhook).
export function getToken(): string | null {
  return _token;
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
  const withId = _activeUserId ? { ...body, userId: _activeUserId } : body;
  return withAuth(withId);
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
  if (_token) extraParams.token = _token;
  const res = await fetch(secureUrl(WEBHOOK_URL, extraParams));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar transacciones');
  return (json.data as Transaction[]).map(tx => ({
    ...tx,
    Categoría: normalizeCategory(tx.Categoría),
  }));
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
  if (json.ok === true && uid) storeToken(uid, json.token);
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

// ── Gestión de usuarios ───────────────────────────────────────

export interface UserInfo {
  id: string;
  status: 'active' | 'disabled';
  hasPin: boolean;
  txCount: number;
  lastActivity: string | null;
}

export async function listUsers(adminUserId: string): Promise<UserInfo[]> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'listUsers', userId: adminUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al listar usuarios');
  return json.data as UserInfo[];
}

export async function createUser(
  adminUserId: string,
  newUserId: string,
  displayName: string,
  initialPin: string,
): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'createUser', userId: adminUserId, newUserId, displayName, initialPin })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al crear usuario');
}

export async function deleteUser(adminUserId: string, targetUserId: string, deleteData = false): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'deleteUser', userId: adminUserId, targetId: targetUserId, deleteData })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar usuario');
}

export async function disableUser(adminUserId: string, targetUserId: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'disableUser', userId: adminUserId, targetId: targetUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al deshabilitar usuario');
}

export async function enableUser(adminUserId: string, targetUserId: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'enableUser', userId: adminUserId, targetId: targetUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al habilitar usuario');
}

export async function resetUserPin(adminUserId: string, targetUserId: string, newPin: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'resetPin', userId: adminUserId, targetId: targetUserId, newPin })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al resetear PIN');
}

export async function hasPin(userId: string): Promise<boolean> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'hasPin', userId }),
  });
  const json = await res.json();
  return json.ok && json.exists === true;
}

export async function setupPin(userId: string, pin: string, code?: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'setupPin', userId, pin, ...(code ? { code } : {}) }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al configurar PIN');
  storeToken(userId, json.token);
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

export async function generateEmergencyPin(
  adminUserId: string,
  targetUserId: string,
): Promise<{ code: string; expiresAt: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'generateEmergencyPin', userId: adminUserId, targetId: targetUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error generando PIN de emergencia');
  return { code: json.code as string, expiresAt: json.expiresAt as string };
}

// ── Invitaciones de un solo uso ───────────────────────────────

export interface Invite {
  code: string;
  userId: string;
  displayName: string;
  expiresAt: string;
}

export async function createInvite(
  adminUserId: string,
  displayName: string,
  newUserId?: string,
): Promise<{ code: string; userId: string; displayName: string; expiresAt: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'createInvite', userId: adminUserId, displayName, ...(newUserId ? { newUserId } : {}) })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al crear invitación');
  return { code: json.code as string, userId: json.userId as string, displayName: json.displayName as string, expiresAt: json.expiresAt as string };
}

export async function listInvites(adminUserId: string): Promise<Invite[]> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'listInvites', userId: adminUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al listar invitaciones');
  return json.data as Invite[];
}

export async function revokeInvite(adminUserId: string, code: string): Promise<{ userDeleted: boolean }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'revokeInvite', userId: adminUserId, code })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al revocar invitación');
  return { userDeleted: json.userDeleted === true };
}

export async function redeemInvite(code: string): Promise<{ userId: string; displayName: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ type: 'redeemInvite', code }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Código inválido o expirado');
  return { userId: json.userId as string, displayName: json.displayName as string };
}
