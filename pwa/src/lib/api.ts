import { WEBHOOK_URL, WEBHOOK_SECRET, normalizeCategory } from './config';

let _activeUserId: string | null = null;
let _token: string | null = null;
let _inflightFetch: Promise<Transaction[]> | null = null;

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

// Una transacción cuenta como capturada por SMS cuando su Fuente es 'sms' (o está
// vacía, que es el caso por defecto de las capturas SMS antiguas). Debe coincidir
// con la lógica de CoverturaMeter para que la prueba en vivo no derive del medidor.
export const isSmsTx = (tx: Transaction): boolean => {
  const f = (tx.Fuente || 'sms').toLowerCase();
  return f === 'sms' || f.startsWith('sms') || f === 'apple_pay' || f === 'google_pay';
};
export const countSmsTx = (txs: Transaction[]): number => txs.filter(isSmsTx).length;

export const INCOME_CATEGORY = 'Ingreso';
const INCOME_TIPOS = new Set(['Depósito', 'Abono', 'Consignación', 'Crédito', 'Ingreso', 'Nómina']);
export const isIncomeTx = (tx: Transaction): boolean =>
  tx.Categoría === INCOME_CATEGORY || INCOME_TIPOS.has(tx.Tipo || '');
export const isGasto = (tx: Transaction): boolean => !isIncomeTx(tx);

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

export function fetchTransactions(): Promise<Transaction[]> {
  assertWebhookUrl();
  if (_inflightFetch) return _inflightFetch;
  const uid = _activeUserId || localStorage.getItem('fm_profile');
  const extraParams: Record<string, string> = { action: 'transactions' };
  if (uid) extraParams.userId = uid;
  if (_token) extraParams.token = _token;
  _inflightFetch = fetch(secureUrl(WEBHOOK_URL, extraParams))
    .then(res => res.json())
    .then(json => {
      if (!json.ok) throw new Error(json.error || 'Error al cargar transacciones');
      return (json.data as Transaction[]).map(tx => ({
        ...tx,
        Categoría: normalizeCategory(tx.Categoría),
      }));
    })
    .finally(() => { _inflightFetch = null; });
  return _inflightFetch;
}

export interface SaveTransactionResult {
  budgetAlert?: { category: string; spent: number; budget: number; pct: number };
}

export async function saveTransaction(data: ManualTransaction): Promise<SaveTransactionResult> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'manual', ...data })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar');
  return { budgetAlert: json.budgetAlert };
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

// Timestamp (ms) del último SMS que el servidor recibió desde el iPhone del usuario,
// sin importar si se parseó o se vetó. Lo usa la prueba en vivo del onboarding para
// confirmar que la Automatización de iOS está disparando. Devuelve 0 si nunca llegó.
export async function getLastSmsSeen(): Promise<number> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'lastSmsSeen' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al consultar SMS');
  return typeof json.at === 'number' ? json.at : 0;
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

export async function listUsers(adminUserId: string): Promise<string[]> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'listUsers', userId: adminUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al listar usuarios');
  return json.data as string[];
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

export async function deleteUser(adminUserId: string, targetUserId: string, deleteData = true): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'deleteUser', userId: adminUserId, targetId: targetUserId, deleteData })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar usuario');
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

export interface UserStats {
  id: string;
  status: 'active' | 'disabled';
  txCount: number;
  lastActivity: string | null;
}

export interface UsersData {
  users: UserStats[];
  pendingInvites: {
    code: string;
    userId: string;
    displayName: string;
    expiresAt: string;
    expired: boolean;
  }[];
}

export async function listUsersData(adminUserId: string): Promise<UsersData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withAuth({ type: 'listUsersData', userId: adminUserId })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar datos de usuarios');
  return json.data as UsersData;
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

// ── Perfil cross-device ───────────────────────────────────────

export async function updateProfile(updates: {
  displayName?: string;
  avatar?: string;
  alertEmail?: string;
  alertThreshold?: number;
  weeklyDigest?: boolean;
}): Promise<void> {
  assertWebhookUrl();
  // GAS Script Properties has a 9 KB per-value limit; skip avatar sync if too large
  const safeUpdates: typeof updates = { ...updates };
  if (safeUpdates.avatar && safeUpdates.avatar.length > 8000) delete safeUpdates.avatar;
  if (Object.keys(safeUpdates).length === 0) return;
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'updateProfile', ...safeUpdates })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al actualizar perfil');
}

export async function getProfileFromServer(): Promise<{ displayName: string; avatar: string; alertEmail?: string; alertThreshold?: number; weeklyDigest?: boolean }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getProfile' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al obtener perfil');
  return json.data as { displayName: string; avatar: string; alertEmail?: string; alertThreshold?: number; weeklyDigest?: boolean };
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

export async function getShortcutConfig(): Promise<{ webhookUrl: string; secret: string }> {
  const token = getToken();
  if (!token) throw new Error('No autenticado');
  const res = await fetch('/api/shortcut-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error ?? 'Error al obtener configuración del shortcut');
  return { webhookUrl: data.webhookUrl as string, secret: data.secret as string };
}

// ── Tarjetas/Cuentas ──────────────────────────────────────────

export interface Card {
  id: string;
  banco: string;
  chasis: string;
  ultimos4: string;
  alias?: string;
  cupo?: number; // cupo total (límite de crédito) en COP — habilita el optimizador de productos
  createdAt: string;
}

export function fetchCards(): Promise<Card[]> {
  assertWebhookUrl();
  const uid = _activeUserId || localStorage.getItem('fm_profile');
  const extraParams: Record<string, string> = { action: 'cards' };
  if (uid) extraParams.userId = uid;
  if (_token) extraParams.token = _token;
  return fetch(secureUrl(WEBHOOK_URL, extraParams))
    .then(res => res.json())
    .then(json => {
      if (!json.ok) throw new Error(json.error || 'Error al cargar tarjetas');
      return json.data as Card[];
    });
}

export async function saveCard(card: Card): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'saveCard', card })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar tarjeta');
}

export async function deleteCard(id: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteCard', cardId: id })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar tarjeta');
}

export function extractLast4(tarjetaCuenta: string): string | null {
  const matches = String(tarjetaCuenta ?? '').match(/\d{4}/g);
  return matches ? matches[matches.length - 1] : null;
}

export function getUnknownCards(
  transactions: Transaction[],
  cards: Card[]
): Array<{ banco: string; ultimos4: string; tarjetaCuenta: string }> {
  const registered = new Set(cards.map(c => `${c.banco}|${c.ultimos4}`));
  const seen = new Set<string>();
  const unknown: Array<{ banco: string; ultimos4: string; tarjetaCuenta: string }> = [];
  for (const tx of transactions) {
    const raw = tx['Tarjeta/Cuenta'] || '';
    if (!raw) continue;
    const last4 = extractLast4(raw);
    if (!last4) continue;
    const key = `${tx.Banco}|${last4}`;
    if (!registered.has(key) && !seen.has(key)) {
      seen.add(key);
      unknown.push({ banco: tx.Banco, ultimos4: last4, tarjetaCuenta: raw });
    }
  }
  return unknown;
}

// ── Analytics (Cluster 1) ─────────────────────────────────────

export interface TopMerchant {
  comercio: string;
  total: number;
  count: number;
  avgTicket: number;
  categoria: string;
}

export interface CardAnalytics {
  card: string;
  banco: string;
  total: number;
  count: number;
  lastActivity: string;
  categories: Record<string, number>;
}

export interface HourlyHeatmap {
  [hour: string]: Record<string, number>; // hour 0-23 → { Dom, Lun, Mar, Mié, Jue, Vie, Sáb }
}

export interface Subscription {
  comercio: string;
  monthlyAvg: number;
  annualCost: number;
  lastSeen: string;
  occurrences: number;
  cancelUrl?: string;
}

export interface InflationSignal {
  detected: boolean;
  months: string[];
  totals: number[];
  growthRatePct: number | null;
  message: string | null;
}

export interface MultiYearMonth {
  month: string;
  total: number;
  byCategory: Record<string, number>;
}

export interface AnalyticsData {
  topMerchants: TopMerchant[];
  byCard: CardAnalytics[];
  hourlyHeatmap: HourlyHeatmap;
  temporalMap: Array<{ hour: number; dow: number; avgAmount: number; count: number; topCategory: string }>;
  subscriptions: Subscription[];
  inflationSignal: InflationSignal;
  multiYear: MultiYearMonth[];
}

export async function fetchAnalytics(months = 12): Promise<AnalyticsData> {
  assertWebhookUrl();
  const uid = _activeUserId || localStorage.getItem('fm_profile');
  const params: Record<string, string> = { action: 'analytics', months: String(months) };
  if (uid) params.userId = uid;
  if (_token) params.token = _token;
  const res = await fetch(secureUrl(WEBHOOK_URL, params));
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar analytics');
  return json as AnalyticsData;
}

// ── Fixed Calendar (Cluster 2) ────────────────────────────────

export interface FixedPayment {
  id?: string;
  nombre: string;
  monto: number;
  diaDelMes: number;
  categoria: string;
  activo?: boolean;
  tipo?: 'manual' | 'auto-detected' | 'utility';
}

export interface FixedPaymentStatus extends FixedPayment {
  id: string;
  tipo: 'manual' | 'auto-detected' | 'utility';
  status: 'pending' | 'paid' | 'overdue';
  payDate: string;
}

export interface FixedCalendarData {
  month: string;
  payments: FixedPaymentStatus[];
  totalExpected: number;
  totalPaid: number;
  totalPending: number;
  autoDetected: Subscription[];
}

export async function fetchFixedCalendar(month?: string): Promise<FixedCalendarData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getFixedCalendar', ...(month ? { month } : {}) })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar calendario');
  return json as FixedCalendarData;
}

export async function saveFixedPayment(payment: FixedPayment): Promise<string> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'saveFixedPayment', payment })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar pago fijo');
  return json.id as string;
}

export async function deleteFixedPayment(id: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteFixedPayment', id })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar pago fijo');
}

export async function autoDetectFixed(): Promise<Subscription[]> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'autoDetectFixed' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al detectar recurrentes');
  return (json.suggestions || []) as Subscription[];
}

// ── Rules Engine (Cluster 3) ──────────────────────────────────

export interface AutoRule {
  pattern: string;
  category: string;
  priority: number;
  createdAt: string;
}

export async function fetchRules(): Promise<AutoRule[]> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getRules' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar reglas');
  return (json.data || []) as AutoRule[];
}

export async function deleteRule(pattern: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteRule', pattern })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar regla');
}

// ── Category Budgets (Cluster 3) ──────────────────────────────

export interface CategoryBudgetStatus {
  budget: number;
  spent: number;
  pct: number;
}

export type CategoryBudgetsData = Record<string, CategoryBudgetStatus>;

export async function fetchCategoryBudgets(month?: string): Promise<CategoryBudgetsData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getCategoryBudgets', ...(month ? { month } : {}) })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar presupuestos');
  const { ok: _ok, ...data } = json;
  return data as CategoryBudgetsData;
}

export async function setCategoryBudget(month: string, category: string, amount: number): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'setCategoryBudget', month, category, amount })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar presupuesto');
}

export async function deleteCategoryBudget(month: string, category: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteCategoryBudget', month, category })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar presupuesto');
}

// ── Net Worth (Cluster 3) ─────────────────────────────────────

export interface NetWorthEntry {
  id?: string;
  tipo: 'asset' | 'debt';
  nombre: string;
  valor?: number;
  saldo?: number;
  tasaAnual?: number;
  cuotaMensual?: number;
  moneda?: string;
  fecha?: string;
}

export interface NetWorthData {
  assets: (NetWorthEntry & { id: string })[];
  debts: (NetWorthEntry & { id: string })[];
  netWorth: number;
  totalAssets: number;
  totalDebts: number;
  lastUpdated: string;
}

export async function fetchNetWorth(): Promise<NetWorthData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getNetWorth' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar net worth');
  return json as NetWorthData;
}

export async function saveNetWorthEntry(entry: NetWorthEntry): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'saveNetWorthEntry', ...entry })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar entrada');
}

export async function deleteNetWorthEntry(tipo: 'asset' | 'debt', id: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'deleteNetWorthEntry', tipo, id })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al eliminar entrada');
}

// ── Cashback Tracker (Cluster 3) ─────────────────────────────

export interface CashbackCard {
  banco: string;
  programa: string;
  puntos: number;
  valorEnCOP: number;
  tasaPuntosCOP: number;
}

export interface CashbackData {
  cards: Record<string, CashbackCard>;
  totalValueCOP: number;
}

export async function fetchCashback(): Promise<CashbackData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getCashback' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar cashback');
  return { cards: json.cards || {}, totalValueCOP: json.totalValueCOP || 0 };
}

export async function updateCashback(
  card: string, banco: string, programa: string,
  puntos: number, tasaPuntosCOP: number,
): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'updateCashback', card, banco, programa, puntos, tasaPuntosCOP })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al actualizar cashback');
}

// ── Mood Tracker (Cluster 4) ──────────────────────────────────

export interface MoodEntry {
  date: string;
  mood: number;
  note?: string;
  spentThatWeek?: number;
}

export interface MoodHistoryData {
  history: MoodEntry[];
  correlation: {
    lowMoodAvgSpend: number | null;
    highMoodAvgSpend: number | null;
    insight: string | null;
  };
}

export async function saveMood(mood: number, note?: string): Promise<void> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'saveMood', mood, ...(note ? { note } : {}) })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al guardar mood');
}

export async function fetchMoodHistory(): Promise<MoodHistoryData> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getMoodHistory' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al cargar historial de mood');
  return json as MoodHistoryData;
}

// ── AI Coach (Cluster 5) ──────────────────────────────────────

export interface HealthReport {
  periodo: string;
  resumenEjecutivo: string;
  seccion1_gastos: string;
  seccion2_tendencias: string;
  seccion3_recomendaciones: string[];
  proyeccion6meses: string;
  scoreGeneral: number;
  generadoEn: string;
}

export interface CoachInsight {
  insights: string[];
  suggestedReto?: {
    titulo: string;
    tipo: string;
    categorias: string[];
    objetivo: number;
    razon: string;
  };
}

export interface RetoSuggestion {
  titulo: string;
  tipo: string;
  categorias: string[];
  objetivo: number;
  razon: string;
}

export async function generateHealthReport(month?: string): Promise<HealthReport> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'generateHealthReport', ...(month ? { month } : {}) })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al generar reporte');
  return json.report as HealthReport;
}

export async function fetchSpendingCoach(months = 3): Promise<CoachInsight> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'spendingCoach', months })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al obtener coach');
  return json as CoachInsight;
}

export async function fetchRetoSuggestion(): Promise<RetoSuggestion | null> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'getRetoSuggestion' })),
  });
  const json = await res.json();
  if (!json.ok) return null;
  return json.suggestedReto as RetoSuggestion | null;
}

export async function analyzeMoodSpending(): Promise<{ insight: string }> {
  assertWebhookUrl();
  const res = await fetch(secureUrl(WEBHOOK_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(withUser({ type: 'analyzeMoodSpending' })),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Error al analizar mood');
  return { insight: json.insight || '' };
}
