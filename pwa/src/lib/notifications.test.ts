import { describe, it, expect } from 'vitest';
import { buildVencimientoNotifs, fechaVencimiento, needsPermissionPrompt } from './notifications';
import type { FixedPaymentStatus } from './api';

function mk(over: Partial<FixedPaymentStatus>): FixedPaymentStatus {
  return {
    id: over.id ?? 'p1',
    nombre: over.nombre ?? 'Factura',
    monto: over.monto ?? 50000,
    diaDelMes: over.diaDelMes ?? 10,
    categoria: over.categoria ?? 'Hogar',
    tipo: over.tipo ?? 'utility',
    status: over.status ?? 'pending',
    payDate: over.payDate ?? '2026-07-10',
    ...over,
  } as FixedPaymentStatus;
}

const HOY = '2026-07-10'; // 10 jul 2026

describe('buildVencimientoNotifs', () => {
  it('ignora los pagos ya pagados', () => {
    const out = buildVencimientoNotifs([mk({ status: 'paid' })], { fechaRef: HOY });
    expect(out).toHaveLength(0);
  });

  it('ignora los pagos inactivos', () => {
    const out = buildVencimientoNotifs([mk({ activo: false })], { fechaRef: HOY });
    expect(out).toHaveLength(0);
  });

  it('marca como vencido cuando el backend lo dice', () => {
    const out = buildVencimientoNotifs([mk({ status: 'overdue' })], { fechaRef: HOY });
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('vencido');
  });

  it('marca como vencido cuando la fecha ya pasó aunque status sea pending', () => {
    const out = buildVencimientoNotifs(
      [mk({ status: 'pending', ultimaFechaVencimiento: '2026-07-01' })],
      { fechaRef: HOY },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('vencido');
  });

  it('marca como "hoy" cuando la fecha de vencimiento es hoy', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '2026-07-10' })],
      { fechaRef: HOY },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('hoy');
  });

  it('marca como "proximo" cuando vence dentro del horizonte', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '2026-07-12' })],
      { fechaRef: HOY, diasAnticipacion: 3 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('proximo');
  });

  it('no incluye nada si vence más allá del horizonte', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '2026-07-30' })],
      { fechaRef: HOY, diasAnticipacion: 3 },
    );
    expect(out).toHaveLength(0);
  });

  it('ordena por prioridad: vencido antes que hoy y próximo', () => {
    const out = buildVencimientoNotifs(
      [
        mk({ id: 'a', ultimaFechaVencimiento: '2026-07-12' }),            // próximo
        mk({ id: 'b', ultimaFechaVencimiento: '2026-07-10' }),            // hoy
        mk({ id: 'c', ultimaFechaVencimiento: '2026-07-01' }),            // vencido
      ],
      { fechaRef: HOY, diasAnticipacion: 3 },
    );
    expect(out.map(n => n.paymentId)).toEqual(['c', 'b', 'a']);
  });

  it('cae a payDate cuando no hay ultimaFechaVencimiento', () => {
    const p = mk({ payDate: '2026-07-10', ultimaFechaVencimiento: undefined });
    expect(fechaVencimiento(p)).toBe('2026-07-10');
    const out = buildVencimientoNotifs([p], { fechaRef: HOY });
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('hoy');
  });

  it('dedupKey combina paymentId y tipo', () => {
    const out = buildVencimientoNotifs(
      [mk({ id: 'x', status: 'overdue' })],
      { fechaRef: HOY },
    );
    expect(out[0].dedupKey).toBe('x:vencido');
  });

  it('acepta fechas en formato DD-MM-YYYY', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '10-07-2026' })],
      { fechaRef: HOY },
    );
    expect(out).toHaveLength(1);
    expect(out[0].tipo).toBe('hoy');
    expect(out[0].fecha).toBe('2026-07-10');
  });

  // ── Bug de overflow de día (regresión) ──
  it('trunca al último día del mes cuando payDate excede los días del mes (31 en feb)', () => {
    // 31 de febrero no existe → debe truncar a 28 (2026 no es bisiesto), no proyectar a marzo.
    // fechaRef cerca del 28 para que la fecha truncada caiga dentro del horizonte de 3 días.
    const out = buildVencimientoNotifs(
      [mk({ payDate: '31', ultimaFechaVencimiento: undefined })],
      { fechaRef: '2026-02-26', diasAnticipacion: 3 },
    );
    expect(out).toHaveLength(1);
    expect(out[0].fecha).toBe('2026-02-28'); // truncado, NO 2026-03-03 (el bug original)
    expect(out[0].tipo).toBe('proximo');
  });

  it('trunca día 29 en febrero de año no bisiesto', () => {
    const out = buildVencimientoNotifs(
      [mk({ payDate: '29', ultimaFechaVencimiento: undefined })],
      { fechaRef: '2026-02-26' },
    );
    expect(out[0].fecha).toBe('2026-02-28');
  });

  it('acepta día 29 en febrero de año bisiesto', () => {
    const out = buildVencimientoNotifs(
      [mk({ payDate: '29', ultimaFechaVencimiento: undefined })],
      { fechaRef: '2024-02-26' }, // 2024 es bisiesto
    );
    expect(out[0].fecha).toBe('2024-02-29');
  });

  it('trunca día 31 en abril (mes de 30 días)', () => {
    const out = buildVencimientoNotifs(
      [mk({ payDate: '31', ultimaFechaVencimiento: undefined })],
      { fechaRef: '2026-04-28', diasAnticipacion: 3 },
    );
    expect(out[0].fecha).toBe('2026-04-30'); // no 2026-05-01
  });

  it('acepta día del mes puro como string', () => {
    const out = buildVencimientoNotifs(
      [mk({ payDate: '12', ultimaFechaVencimiento: undefined })],
      { fechaRef: '2026-07-10', diasAnticipacion: 3 },
    );
    expect(out[0].fecha).toBe('2026-07-12');
    expect(out[0].tipo).toBe('proximo');
  });

  it('acepta fechas en formato DD/MM/YYYY', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '10/07/2026' })],
      { fechaRef: HOY },
    );
    expect(out).toHaveLength(1);
    expect(out[0].fecha).toBe('2026-07-10');
  });

  it('respeta el fechaRef string recibido (no usa el reloj del host)', () => {
    const out = buildVencimientoNotifs(
      [mk({ ultimaFechaVencimiento: '2026-07-10' })],
      { fechaRef: '2026-07-10' },
    );
    expect(out[0].tipo).toBe('hoy');
  });
});

// ── needsPermissionPrompt (toggle "Recordatorios de vencimiento" en Settings) ──
//
// Extraído de Settings.tsx: antes de activar el toggle, si el navegador soporta
// notificaciones y el permiso todavía no fue concedido, hay que pedirlo. Pura
// (recibe `permission` en vez de leer `Notification.permission`) para poder
// testear sin la Notification API real del navegador.
describe('needsPermissionPrompt', () => {
  it('no pide permiso al desactivar el toggle, sin importar el estado del permiso', () => {
    expect(needsPermissionPrompt(false, true, 'default')).toBe(false);
    expect(needsPermissionPrompt(false, true, 'denied')).toBe(false);
    expect(needsPermissionPrompt(false, true, undefined)).toBe(false);
  });

  it('no pide permiso si el navegador no soporta notificaciones', () => {
    expect(needsPermissionPrompt(true, false, undefined)).toBe(false);
  });

  it('no pide permiso si ya fue concedido', () => {
    expect(needsPermissionPrompt(true, true, 'granted')).toBe(false);
  });

  it('pide permiso al activar si está disponible y aún no fue concedido (default)', () => {
    expect(needsPermissionPrompt(true, true, 'default')).toBe(true);
  });

  it('pide permiso al activar incluso si fue denegado antes (deja reintentar)', () => {
    expect(needsPermissionPrompt(true, true, 'denied')).toBe(true);
  });
});
