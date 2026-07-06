import { render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PagosProximosCard } from './PagosProximosCard';
import type { FixedPaymentStatus } from '../lib/api';

// Los helpers de fecha (getNext7Days/nextOccurrenceKey/dayLabel) son privados a este
// archivo — no hay precedente en components/ de exportar helpers puros junto al
// componente (VencimientosUrgentes y BottomNav tampoco lo hacen), así que se ejercitan
// indirectamente vía render + fake timers, igual que esos otros suites.
function mk(over: Partial<FixedPaymentStatus>): FixedPaymentStatus {
  return {
    id: over.id ?? 'p1',
    nombre: over.nombre ?? 'Netflix',
    monto: over.monto ?? 38900,
    diaDelMes: over.diaDelMes ?? 10,
    categoria: over.categoria ?? 'Suscripciones',
    tipo: over.tipo ?? 'auto-detected',
    status: over.status ?? 'pending',
    payDate: over.payDate ?? '2026-07-10',
    ...over,
  } as FixedPaymentStatus;
}

const USER = 'u1';

function setTz(userId: string, tz: string) {
  localStorage.setItem(`fm_timezone_${userId}`, tz);
}

// Todas las horas del sistema se fijan con sufijo Z (instante UTC explícito) para que
// las aserciones no dependan de la TZ del host que corre el test.
describe('PagosProximosCard', () => {
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('no renderiza nada si no hay pagos', () => {
    const { container } = render(<PagosProximosCard userId={USER} payments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza nada si todos los pagos caen fuera de la ventana de 7 días', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T17:00:00Z')); // 2026-07-10 mediodía Bogotá
    setTz(USER, 'America/Bogota');
    // día 20 del mes está a 10 días de hoy (10 jul) → fuera de la ventana de 7 días
    const { container } = render(
      <PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 20 })]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  describe('día de mes normal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T17:00:00Z')); // 2026-07-10 mediodía Bogotá
      setTz(USER, 'America/Bogota');
    });

    it('ubica un pago dentro de la ventana de 7 días en su fecha correcta', () => {
      // día 13 del mes, dentro de la ventana (hoy=10, ventana hasta 16)
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 13, nombre: 'Spotify' })]} />);
      expect(screen.getByText('Spotify')).toBeInTheDocument();
      expect(screen.getByText(/^13 Jul ·/)).toBeInTheDocument();
    });

    it('incluye el último día de la ventana (hoy + 6) pero excluye hoy + 7', () => {
      // hoy=10, ventana=[10..16]. día 16 debe entrar, día 17 no.
      render(
        <PagosProximosCard
          userId={USER}
          payments={[
            mk({ id: 'dentro', diaDelMes: 16, nombre: 'DentroVentana' }),
            mk({ id: 'fuera', diaDelMes: 17, nombre: 'FueraVentana' }),
          ]}
        />
      );
      expect(screen.getByText('DentroVentana')).toBeInTheDocument();
      expect(screen.queryByText('FueraVentana')).not.toBeInTheDocument();
    });
  });

  describe('boundary Hoy/Mañana', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10T17:00:00Z')); // 2026-07-10 mediodía Bogotá
      setTz(USER, 'America/Bogota');
    });

    it('etiqueta como "Hoy" un pago cuyo día del mes es el de hoy', () => {
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 10, nombre: 'PagoHoy' })]} />);
      expect(screen.getByText('PagoHoy')).toBeInTheDocument();
      expect(screen.getByText(/^Hoy ·/)).toBeInTheDocument();
    });

    it('etiqueta como "Mañana" un pago cuyo día del mes es el de mañana', () => {
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 11, nombre: 'PagoManana' })]} />);
      expect(screen.getByText('PagoManana')).toBeInTheDocument();
      expect(screen.getByText(/^Mañana ·/)).toBeInTheDocument();
    });

    it('no confunde un pago de "hoy" con el mes siguiente', () => {
      // Regresión: nextOccurrenceKey comparaba "este" (medianoche) contra hoyBase
      // (mediodía) y trataba el pago de HOY como si ya hubiera pasado, saltando
      // incorrectamente al mes siguiente (con lo que desaparecía de la ventana de 7 días).
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 10, nombre: 'PagoHoy' })]} />);
      expect(screen.getByText('PagoHoy')).toBeInTheDocument();
    });
  });

  describe('month-end clamping', () => {
    it('clampea diaDelMes=31 al 28 de febrero en año no bisiesto', () => {
      vi.useFakeTimers();
      // 2026-02-25 mediodía Bogotá → ventana incluye el 28 (fin de la ventana: 3 mar)
      vi.setSystemTime(new Date('2026-02-25T17:00:00Z'));
      setTz(USER, 'America/Bogota');
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 31, nombre: 'PagoFinDeMes' })]} />);
      expect(screen.getByText('PagoFinDeMes')).toBeInTheDocument();
      expect(screen.getByText(/^28 Feb ·/)).toBeInTheDocument();
    });

    it('clampea diaDelMes=31 al 30 de abril (mes de 30 días) en vez de desbordar a mayo', () => {
      vi.useFakeTimers();
      // 2026-04-25 mediodía Bogotá → ventana [25 abr .. 1 may]
      vi.setSystemTime(new Date('2026-04-25T17:00:00Z'));
      setTz(USER, 'America/Bogota');
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 31, nombre: 'PagoAbril' })]} />);
      expect(screen.getByText('PagoAbril')).toBeInTheDocument();
      // Debe clampear a 30 Abr, NUNCA desbordar a "1 May" (bug clásico de
      // new Date(year, mes, 31) en un mes de 30 días).
      expect(screen.getByText(/^30 Abr ·/)).toBeInTheDocument();
      expect(screen.queryByText(/May/)).not.toBeInTheDocument();
    });

    it('un día 31 dentro de un mes de 31 días no se clampea (no cambia)', () => {
      vi.useFakeTimers();
      // 2026-01-29 mediodía Bogotá: enero tiene 31 días, así que diaDelMes=31 no
      // requiere clamping y debe ocurrir el 31 de enero mismo (dentro de la ventana).
      vi.setSystemTime(new Date('2026-01-29T17:00:00Z'));
      setTz(USER, 'America/Bogota');
      render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 31, nombre: 'PagoEnero31' })]} />);
      expect(screen.getByText('PagoEnero31')).toBeInTheDocument();
      expect(screen.getByText(/^31 Ene ·/)).toBeInTheDocument();
    });
  });

  describe('corrección de timezone', () => {
    it('el mismo instante produce "Hoy" u "Mañana" distinto según la TZ del usuario', () => {
      vi.useFakeTimers();
      // 2026-07-10T23:30:00Z → en Bogotá (UTC-5) son las 18:30 del 10 jul (aún 10 jul);
      // en Madrid (UTC+2 en julio, CEST) es la 01:30 del 11 jul (ya 11 jul).
      vi.setSystemTime(new Date('2026-07-10T23:30:00Z'));

      setTz('u-bogota', 'America/Bogota');
      setTz('u-madrid', 'Europe/Madrid');

      // Mismo diaDelMes=11 para ambos usuarios:
      // - Bogotá (hoy=10 jul): el 11 jul es MAÑANA.
      // - Madrid (hoy=11 jul): el 11 jul es HOY.
      const { rerender } = render(
        <PagosProximosCard userId="u-bogota" payments={[mk({ diaDelMes: 11, nombre: 'Pago' })]} />
      );
      expect(screen.getByText(/^Mañana ·/)).toBeInTheDocument();

      rerender(<PagosProximosCard userId="u-madrid" payments={[mk({ diaDelMes: 11, nombre: 'Pago' })]} />);
      expect(screen.getByText(/^Hoy ·/)).toBeInTheDocument();
    });
  });

  it('llama a onGoPagosFijos al hacer clic en "Ver todos"', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T17:00:00Z'));
    setTz(USER, 'America/Bogota');
    const onGoPagosFijos = vi.fn();
    render(
      <PagosProximosCard
        userId={USER}
        payments={[mk({ diaDelMes: 10 })]}
        onGoPagosFijos={onGoPagosFijos}
      />
    );
    screen.getByRole('button', { name: 'Ver pagos fijos' }).click();
    expect(onGoPagosFijos).toHaveBeenCalledTimes(1);
  });

  it('no renderiza el botón "Ver todos" si no se pasa onGoPagosFijos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T17:00:00Z'));
    setTz(USER, 'America/Bogota');
    render(<PagosProximosCard userId={USER} payments={[mk({ diaDelMes: 10 })]} />);
    expect(screen.queryByRole('button', { name: 'Ver pagos fijos' })).not.toBeInTheDocument();
  });

  it('suma el conteo de pagos del día en el indicador cuando hay más de uno', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T17:00:00Z'));
    setTz(USER, 'America/Bogota');
    render(
      <PagosProximosCard
        userId={USER}
        payments={[
          mk({ id: 'a', diaDelMes: 10, nombre: 'Uno' }),
          mk({ id: 'b', diaDelMes: 10, nombre: 'Dos' }),
        ]}
      />
    );
    expect(screen.getByText('Uno')).toBeInTheDocument();
    expect(screen.getByText('Dos')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
