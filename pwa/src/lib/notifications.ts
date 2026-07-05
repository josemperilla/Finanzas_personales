// Recordatorios locales de vencimiento de facturas (Notification API del navegador).
//
// Limitación declarada: las notificaciones solo se disparan al abrir/estar abierta la
// app — NO es push en segundo plano. El push real requeriría email (MailApp + APP_ALERT_EMAIL,
// ya existe en el backend) o un servidor web-push con VAPID. Aquí cubrimos el caso local.
//
// `buildVencimientoNotifs` es pura (testeable): dada la lista de facturas y una fecha de
// referencia, devuelve las notificaciones pendientes sin tocar el DOM ni localStorage.
// El efecto en Home.tsx se encarga del dedup (fm_notif_seen_<userId>_<key>) y de lanzar.

import type { FixedPaymentStatus } from './api';
import { formatCOP, todayInTZ } from './utils';
import { getUserTimezone } from './profiles';

export type NotifTipo = 'vencido' | 'hoy' | 'proximo';

// Horizontes de anticipación compartidos por los dos consumidores de esta clasificación:
// la notificación push del navegador (más margen, se lanza una vez al abrir la app) y la
// banda superior del Home (solo destaca lo realmente inminente: hoy/mañana).
export const NOTIF_HORIZON_DAYS = 3;
export const BANNER_HORIZON_DAYS = 1;

export interface VencimientoNotif {
  paymentId: string;
  nombre: string;
  monto: number;
  tipo: NotifTipo;
  fecha: string;      // YYYY-MM-DD de vencimiento
  dedupKey: string;   // clave única para el dedup por día
}

/** Fecha de vencimiento efectiva de un pago: la consultada si existe, si no el día del mes. */
export function fechaVencimiento(p: FixedPaymentStatus): string {
  return p.ultimaFechaVencimiento || p.payDate;
}

/**
 * Devuelve las notificaciones de vencimiento que corresponden para una lista de facturas.
 * Pura: no lee/escribe localStorage ni lanza nada. El llamador hace el dedup + envío.
 *
 * Reglas:
 *  - Se ignora todo pago con `status === 'paid'` o inactivo.
 *  - `overdue` (ya vencido según el backend) → tipo 'vencido'.
 *  - Vence hoy (fechaRef) → tipo 'hoy'.
 *  - Vence dentro de `diasAnticipacion` días (default 3) → tipo 'proximo'.
 *  - `dedupKey` = `${paymentId}:${tipo}` (estable por día; el llamador le añade la fecha).
 *
 * `fechaRef` va en `YYYY-MM-DD` (TZ America/Bogota vía todayInTZ). Trabajamos con strings
 * para no caer en bugs de TZ del host (ver utils.ts:todayInTZ).
 */
export function buildVencimientoNotifs(
  payments: FixedPaymentStatus[],
  opts: { fechaRef?: string; diasAnticipacion?: number } = {},
): VencimientoNotif[] {
  const fechaRef = opts.fechaRef ?? todayInTZ();
  const diasAnticipacion = opts.diasAnticipacion ?? NOTIF_HORIZON_DAYS;
  const horizonteKey = addDaysYMD(fechaRef, diasAnticipacion);

  const out: VencimientoNotif[] = [];
  for (const p of payments) {
    if (p.status === 'paid') continue;
    if (p.activo === false) continue;

    const venc = fechaVencimiento(p);
    const fecha = normalizarYMD(venc, fechaRef);
    if (!fecha) continue;

    let tipo: NotifTipo | null = null;
    if (p.status === 'overdue' || fecha < fechaRef) tipo = 'vencido';
    else if (fecha === fechaRef) tipo = 'hoy';
    else if (fecha <= horizonteKey) tipo = 'proximo';
    if (!tipo) continue;

    out.push({
      paymentId: p.id,
      nombre: p.nombre,
      monto: p.ultimoMonto ?? p.monto ?? 0,
      tipo,
      fecha,
      dedupKey: `${p.id}:${tipo}`,
    });
  }
  // Prioridad: vencido > hoy > próximo. Dentro de cada tipo, por fecha ascendente.
  const peso: Record<NotifTipo, number> = { vencido: 0, hoy: 1, proximo: 2 };
  out.sort((a, b) => peso[a.tipo] - peso[b.tipo] || a.fecha.localeCompare(b.fecha));
  return out;
}

// ── Helpers de fecha (strings YYYY-MM-DD, TZ America/Bogota vía todayInTZ) ──

/** Suma `dias` a un YYYY-MM-DD devolviendo otro YYYY-MM-DD (sin mutar el input). */
function addDaysYMD(ymd: string, dias: number): string {
  // parsear a mediodía para evitar DST/overflow cerca de medianoche
  const d = new Date(ymd + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Devuelve el último día del mes (28-31) para año/mes dados (mes 1-12). */
function diasDelMes(year: number, mes: number): number {
  // new Date(year, mes, 0) → día 0 = último día del mes anterior = último día de `mes`
  return new Date(year, mes, 0).getDate();
}

/**
 * Normaliza un valor de fecha a `YYYY-MM-DD`. Acepta:
 *  - `YYYY-MM-DD` / `YYYY/MM/DD`
 *  - `DD-MM-YYYY` / `DD/MM/YYYY`
 *  - ISO completo (toma solo la parte de fecha)
 *
 * Si el string trae solo día del mes (1-31) — fallback que el backend usa cuando solo
 * tiene `payDate` como día — se resuelve contra el mes/año de `fechaRef`. Si el día excede
 * los días del mes (ej. 31 en febrero), se **trunca al último día válido del mes** en vez
 * de proyectarlo al mes siguiente (que era el bug: `new Date(2025, 1, 31)` → 3 de marzo).
 */
function normalizarYMD(v: string, fechaRef: string): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Fallback: día del mes puro (1-31). Resolver contra el mes de fechaRef.
  const dia = Number(s);
  if (dia >= 1 && dia <= 31) {
    const [yearStr, mesStr] = fechaRef.split('-');
    const year = Number(yearStr);
    const mes = Number(mesStr); // 1-12
    const max = diasDelMes(year, mes);
    const diaEfectivo = Math.min(dia, max);
    return `${year}-${String(mes).padStart(2, '0')}-${String(diaEfectivo).padStart(2, '0')}`;
  }
  return null;
}

// ── Dedup en localStorage (patrón fm_ existente) ───────────────────────

function dedupStorageKey(userId: string, notif: VencimientoNotif): string {
  const hoy = todayInTZ(getUserTimezone(userId));
  return `fm_notif_seen_${userId}_${notif.dedupKey}_${hoy}`;
}

/** Marca una notificación como ya mostrada hoy (para no repetir). */
export function marcarNotifVista(userId: string, notif: VencimientoNotif): void {
  try { localStorage.setItem(dedupStorageKey(userId, notif), '1'); } catch { /* localStorage ausente */ }
}

/** ¿Ya se mostró esta notificación hoy? */
export function notifYaVista(userId: string, notif: VencimientoNotif): boolean {
  try { return localStorage.getItem(dedupStorageKey(userId, notif)) === '1'; }
  catch { return false; }
}

// ── Preferencia del usuario (toggle en Settings) ───────────────────────

/** ¿El usuario activó los recordatorios de vencimiento? Default: activado. */
export function getNotifEnabled(userId: string): boolean {
  try {
    const v = localStorage.getItem(`fm_notif_enabled_${userId}`);
    return v === null ? true : v === '1';
  } catch { return true; }
}

export function setNotifEnabled(userId: string, on: boolean): void {
  try { localStorage.setItem(`fm_notif_enabled_${userId}`, on ? '1' : '0'); } catch { /* noop */ }
}

// ── Envío (side effects: Notification API) ─────────────────────────────

export function notifsDisponibles(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * ¿Hay que pedir permiso del navegador antes de activar el toggle de recordatorios
 * en Settings? Pura: no lee `Notification.permission` directamente (el llamador la
 * pasa) para poder testear sin depender de la Notification API real.
 *
 * Solo aplica al ACTIVAR (`enabling=true`) — desactivar el toggle nunca requiere
 * permiso. Si el navegador no soporta notificaciones o el permiso ya fue concedido,
 * tampoco hace falta preguntar.
 */
export function needsPermissionPrompt(
  enabling: boolean,
  available: boolean,
  permission: NotificationPermission | undefined,
): boolean {
  return enabling && available && permission !== 'granted';
}

/** Pide permiso de notificaciones si no fue concedido ni denegado. */
export async function requestNotifPermission(): Promise<NotificationPermission> {
  if (!notifsDisponibles()) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try { return await Notification.requestPermission(); }
  catch { return Notification.permission; }
}

function titulo(tipo: NotifTipo): string {
  if (tipo === 'vencido') return '⚠️ Factura vencida';
  if (tipo === 'hoy') return '⛔ Vence hoy';
  return '📅 Factura por vencer';
}

function cuerpo(n: VencimientoNotif): string {
  const monto = n.monto > 0 ? ` · ${formatCOP(n.monto)}` : '';
  return `${n.nombre}${monto}`;
}

/**
 * Lanza las notificaciones dadas (side effect). Marca cada una como vista al lanzarla.
 * No lanza si el permiso no fue concedido o si Notification no existe.
 */
export function lanzarNotifs(userId: string, notifs: VencimientoNotif[]): void {
  if (!notifsDisponibles() || Notification.permission !== 'granted') return;
  for (const n of notifs) {
    if (notifYaVista(userId, n)) continue;
    try {
      new Notification(titulo(n.tipo), { body: cuerpo(n), tag: n.dedupKey });
      marcarNotifVista(userId, n);
    } catch { /* navegador restringe; ignore */ }
  }
}
