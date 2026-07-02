import { describe, it, expect } from 'vitest';
import { detectSubscriptions } from './subscriptions';
import { Transaction } from './api';

const now = new Date();
// Fecha N días atrás como YYYY-MM-DD HH:MM:SS
const daysAgo = (n: number) => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10) + ' 10:00:00';
};

function tx(partial: Partial<Transaction>): Transaction {
  return {
    Timestamp: daysAgo(0),
    Fecha: daysAgo(0),
    Banco: 'Bogotá',
    Tipo: 'Compra',
    'Monto (COP)': 0,
    Comercio: 'Netflix',
    'Tarjeta/Cuenta': 'Tarjeta Crédito 8645',
    Categoría: 'Suscripciones',
    ...partial,
  };
}

describe('detectSubscriptions', () => {
  it('detecta un cargo mensual recurrente de monto estable', () => {
    const txs = [
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(90) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(30) }),
    ];
    const subs = detectSubscriptions(txs);
    expect(subs).toHaveLength(1);
    expect(subs[0].comercio.toLowerCase()).toContain('netflix');
    expect(subs[0].periodoDias).toBe(30);
    expect(subs[0].montoMensual).toBe(38900);
    expect(subs[0].ocurrencias).toBe(3);
  });

  it('ignora comercios con una sola ocurrencia', () => {
    const txs = [tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(30) })];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('ignora montos muy variables (no es suscripción)', () => {
    const txs = [
      tx({ Comercio: 'Tienda', 'Monto (COP)': 10000, Fecha: daysAgo(90) }),
      tx({ Comercio: 'Tienda', 'Monto (COP)': 90000, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Tienda', 'Monto (COP)': 50000, Fecha: daysAgo(30) }),
    ];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('ignora intervalos irregulares (no periódicos)', () => {
    const txs = [
      tx({ Comercio: 'Random', 'Monto (COP)': 20000, Fecha: daysAgo(95) }),
      tx({ Comercio: 'Random', 'Monto (COP)': 20000, Fecha: daysAgo(80) }),
      tx({ Comercio: 'Random', 'Monto (COP)': 20000, Fecha: daysAgo(5) }),
    ];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('ignora montos no positivos', () => {
    const txs = [
      tx({ Comercio: 'Netflix', 'Monto (COP)': 0, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 0, Fecha: daysAgo(30) }),
    ];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('detecta cargos bimestrales (55-75 días) con monto mensual = monto/2', () => {
    const txs = [
      tx({ Comercio: 'Seguro', 'Monto (COP)': 200000, Fecha: daysAgo(120) }),
      tx({ Comercio: 'Seguro', 'Monto (COP)': 200000, Fecha: daysAgo(60) }),
    ];
    const subs = detectSubscriptions(txs);
    expect(subs).toHaveLength(1);
    expect(subs[0].periodoDias).toBe(60);
    expect(subs[0].montoMensual).toBe(100000);
  });

  it('ignora transacciones de hace más de 6 meses', () => {
    const txs = [
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(400) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(370) }),
    ];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('ignora comercios sin nombre reconocible tras limpiar (cleanMerchant vacío)', () => {
    const txs = [
      tx({ Comercio: 'MERCADO PAGO', 'Monto (COP)': 38900, Fecha: daysAgo(60) }),
      tx({ Comercio: 'MERCADO PAGO', 'Monto (COP)': 38900, Fecha: daysAgo(30) }),
    ];
    expect(detectSubscriptions(txs)).toHaveLength(0);
  });

  it('devuelve varias suscripciones ordenadas por monto mensual descendente', () => {
    const txs = [
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(90) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(30) }),
      tx({ Comercio: 'Spotify', 'Monto (COP)': 19900, Fecha: daysAgo(90) }),
      tx({ Comercio: 'Spotify', 'Monto (COP)': 19900, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Spotify', 'Monto (COP)': 19900, Fecha: daysAgo(30) }),
    ];
    const subs = detectSubscriptions(txs);
    expect(subs).toHaveLength(2);
    expect(subs[0].comercio).toBe('Netflix');
    expect(subs[1].comercio).toBe('Spotify');
  });

  it('calcula la próxima fecha esperada sumando el período a la última ocurrencia', () => {
    const txs = [
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(60) }),
      tx({ Comercio: 'Netflix', 'Monto (COP)': 38900, Fecha: daysAgo(30) }),
    ];
    const sub = detectSubscriptions(txs)[0];
    const ultima = new Date(sub.ultimaFecha);
    const proxima = new Date(sub.proximaEsperada);
    const diffDays = Math.round((proxima.getTime() - ultima.getTime()) / 86_400_000);
    expect(diffDays).toBe(30);
  });
});
