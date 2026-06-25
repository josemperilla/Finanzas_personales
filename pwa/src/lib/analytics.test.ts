import { describe, it, expect } from 'vitest';
import { getCategoryTotals, detectUnusualCategories, getCategoryComparison } from './analytics';
import { Transaction } from './api';

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth();

// Día 15 de un mes relativo al actual (offset 0 = mes actual, 1 = mes anterior, …).
const monthAgo = (offset: number) => new Date(Y, M - offset, 15, 12, 0, 0).toISOString();

function tx(partial: Partial<Transaction>): Transaction {
  return {
    Timestamp: monthAgo(0),
    Fecha: monthAgo(0),
    Banco: 'Bogotá',
    Tipo: 'Compra',
    'Monto (COP)': 0,
    Comercio: 'Tienda',
    'Tarjeta/Cuenta': 'Tarjeta Crédito 8645',
    Categoría: 'Mercado',
    ...partial,
  };
}

describe('getCategoryTotals', () => {
  it('suma gastos por categoría e ignora ingresos', () => {
    const txs = [
      tx({ Categoría: 'Mercado', 'Monto (COP)': 100000 }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 50000 }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 80000 }),
      tx({ Categoría: 'Ingreso', 'Monto (COP)': 999999 }),
    ];
    const totals = getCategoryTotals(txs);
    expect(totals['Mercado']).toBe(150000);
    expect(totals['Restaurantes']).toBe(80000);
    expect(totals['Ingreso']).toBeUndefined();
  });
});

describe('detectUnusualCategories', () => {
  it('marca una categoría cuyo gasto del mes supera 2× el promedio de 3 meses', () => {
    const txs = [
      // Histórico estable ~50k/mes en Restaurantes (3 meses previos)
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 50000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 50000, Fecha: monthAgo(2) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 50000, Fecha: monthAgo(3) }),
      // Mes actual: pico de 300k (> 2× 50k)
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 300000, Fecha: monthAgo(0) }),
      // Categoría normal: 60k actual vs 50k promedio → no inusual
      tx({ Categoría: 'Mercado', 'Monto (COP)': 50000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 50000, Fecha: monthAgo(2) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 60000, Fecha: monthAgo(0) }),
    ];
    const unusual = detectUnusualCategories(txs);
    expect(unusual.has('Restaurantes')).toBe(true);
    expect(unusual.has('Mercado')).toBe(false);
  });

  it('no marca nada con menos de 2 meses de historia', () => {
    const txs = [
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 50000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 500000, Fecha: monthAgo(0) }),
    ];
    expect(detectUnusualCategories(txs).size).toBe(0);
  });
});

describe('getCategoryComparison', () => {
  it('marca anomalía cuando el gasto crece más de 100% mes contra mes', () => {
    const txs = [
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 50000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 200000, Fecha: monthAgo(0) }),
    ];
    const rows = getCategoryComparison(txs);
    const rest = rows.find(r => r.category === 'Restaurantes')!;
    expect(rest.prev).toBe(50000);
    expect(rest.current).toBe(200000);
    expect(rest.delta).toBe(300);
    expect(rest.anomaly).toBe(true);
  });

  it('categoría nueva (prev=0) tiene delta=100 y NO es anomalía (umbral es estricto >100)', () => {
    const txs = [
      tx({ Categoría: 'Suscripciones', 'Monto (COP)': 30000, Fecha: monthAgo(0) }),
    ];
    const row = getCategoryComparison(txs).find(r => r.category === 'Suscripciones')!;
    expect(row.prev).toBe(0);
    expect(row.delta).toBe(100);
    expect(row.anomaly).toBe(false);
  });

  it('con monthsBack=3 usa el promedio de los 3 meses previos como baseline', () => {
    const txs = [
      tx({ Categoría: 'Mercado', 'Monto (COP)': 60000, Fecha: monthAgo(3) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 90000, Fecha: monthAgo(2) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 150000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 120000, Fecha: monthAgo(0) }),
    ];
    const row = getCategoryComparison(txs, 3).find(r => r.category === 'Mercado')!;
    // baseline = (60000 + 90000 + 150000) / 3 = 100000
    expect(row.prev).toBe(100000);
    expect(row.current).toBe(120000);
    expect(row.delta).toBe(20);
    expect(row.anomaly).toBe(false);
  });

  it('un mes anterior atípicamente bajo NO dispara falso positivo con baseline de 3 meses', () => {
    const txs = [
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 200000, Fecha: monthAgo(3) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 220000, Fecha: monthAgo(2) }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 30000,  Fecha: monthAgo(1) }), // mes bajo atípico
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 210000, Fecha: monthAgo(0) }),
    ];
    // monthsBack=1: baseline=30000 → delta=600% → falso positivo
    expect(getCategoryComparison(txs, 1).find(r => r.category === 'Restaurantes')!.anomaly).toBe(true);
    // monthsBack=3: baseline=(200000+220000+30000)/3=150000 → delta=40% → sin anomalía
    const row3 = getCategoryComparison(txs, 3).find(r => r.category === 'Restaurantes')!;
    expect(row3.prev).toBe(150000);
    expect(row3.anomaly).toBe(false);
  });
});
