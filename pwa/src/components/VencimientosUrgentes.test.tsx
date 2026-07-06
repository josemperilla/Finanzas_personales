import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { VencimientosUrgentes } from './VencimientosUrgentes';
import type { FixedPaymentStatus } from '../lib/api';

// `VencimientosUrgentes` reusa `buildVencimientoNotifs` (ya cubierto exhaustivamente en
// notifications.test.ts) para clasificar vencido/hoy/próximo. Estos tests cubren la lógica
// propia del componente que no está en esa suite: el early-return a null, el cálculo de
// total/conteo, la distinción visual vencido-vs-no-vencido, y el wiring del callback "Ver".
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

const HOY = '2026-07-10T12:00:00';

describe('VencimientosUrgentes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(HOY));
  });
  afterEach(() => vi.useRealTimers());

  it('no renderiza nada si no hay pagos urgentes', () => {
    const { container } = render(
      <VencimientosUrgentes userId="u1" payments={[mk({ ultimaFechaVencimiento: '2026-07-30' })]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('no renderiza nada con lista de pagos vacía', () => {
    const { container } = render(<VencimientosUrgentes userId="u1" payments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('destaca "Pagos vencidos" cuando hay al menos un vencido', () => {
    render(
      <VencimientosUrgentes
        userId="u1"
        payments={[mk({ id: 'a', status: 'overdue' }), mk({ id: 'b', ultimaFechaVencimiento: '2026-07-10' })]}
      />
    );
    expect(screen.getByText('Pagos vencidos')).toBeInTheDocument();
    expect(screen.getByText('2 pagos · $100.000')).toBeInTheDocument();
  });

  it('muestra "Vencen pronto" (sin acento de urgencia) si nada está vencido', () => {
    render(<VencimientosUrgentes userId="u1" payments={[mk({ ultimaFechaVencimiento: '2026-07-10' })]} />);
    expect(screen.getByText('Vencen pronto')).toBeInTheDocument();
    expect(screen.queryByText('Pagos vencidos')).not.toBeInTheDocument();
  });

  it('usa singular "pago" cuando hay exactamente uno', () => {
    render(<VencimientosUrgentes userId="u1" payments={[mk({ ultimaFechaVencimiento: '2026-07-10', monto: 20000 })]} />);
    expect(screen.getByText('1 pago · $20.000')).toBeInTheDocument();
  });

  it('suma ultimoMonto sobre monto cuando ambos existen', () => {
    render(
      <VencimientosUrgentes
        userId="u1"
        payments={[mk({ ultimaFechaVencimiento: '2026-07-10', monto: 20000, ultimoMonto: 35000 })]}
      />
    );
    expect(screen.getByText('1 pago · $35.000')).toBeInTheDocument();
  });

  it('llama a onGoFacturas al hacer clic en "Ver"', () => {
    const onGoFacturas = vi.fn();
    render(
      <VencimientosUrgentes
        userId="u1"
        payments={[mk({ ultimaFechaVencimiento: '2026-07-10' })]}
        onGoFacturas={onGoFacturas}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver facturas' }));
    expect(onGoFacturas).toHaveBeenCalledTimes(1);
  });

  it('no renderiza el botón "Ver" si no se pasa onGoFacturas', () => {
    render(<VencimientosUrgentes userId="u1" payments={[mk({ ultimaFechaVencimiento: '2026-07-10' })]} />);
    expect(screen.queryByRole('button', { name: 'Ver facturas' })).not.toBeInTheDocument();
  });

  it('ignora pagos pagados o inactivos al decidir si mostrar la banda', () => {
    const { container } = render(
      <VencimientosUrgentes
        userId="u1"
        payments={[
          mk({ id: 'a', status: 'paid', ultimaFechaVencimiento: '2026-07-10' }),
          mk({ id: 'b', activo: false, status: 'overdue' }),
        ]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
