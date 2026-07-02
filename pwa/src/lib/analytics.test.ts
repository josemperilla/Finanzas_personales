import { describe, it, expect } from 'vitest';
import {
  getCategoryTotals,
  detectUnusualCategories,
  getCategoryComparison,
  getMonthTransactions,
  txMonth,
  getWeekdayAverages,
} from './analytics';
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

  it('agrupa como "Otro" las transacciones sin categoría', () => {
    const txs = [tx({ Categoría: '', 'Monto (COP)': 15000 })];
    expect(getCategoryTotals(txs)['Otro']).toBe(15000);
  });

  it('lista vacía → objeto vacío', () => {
    expect(getCategoryTotals([])).toEqual({});
  });
});

describe('txMonth', () => {
  it('extrae año y mes de Fecha', () => {
    const { year, month } = txMonth(tx({ Fecha: '2026-03-15T10:00:00' }));
    expect(year).toBe(2026);
    expect(month).toBe(2); // 0-indexed: marzo = 2
  });

  it('usa Timestamp si Fecha está vacía', () => {
    const { year, month } = txMonth(tx({ Fecha: '', Timestamp: '2025-11-01T00:00:00' }));
    expect(year).toBe(2025);
    expect(month).toBe(10);
  });
});

describe('getMonthTransactions', () => {
  it('filtra solo las transacciones del año/mes pedido', () => {
    const txs = [
      tx({ Fecha: '2026-01-05T10:00:00' }),
      tx({ Fecha: '2026-02-05T10:00:00' }),
      tx({ Fecha: '2026-01-20T10:00:00' }),
    ];
    expect(getMonthTransactions(txs, 2026, 0)).toHaveLength(2);
    expect(getMonthTransactions(txs, 2026, 1)).toHaveLength(1);
  });

  it('descarta fechas inválidas o vacías sin lanzar', () => {
    const txs = [tx({ Fecha: '', Timestamp: '' }), tx({ Fecha: 'no-es-una-fecha' })];
    expect(getMonthTransactions(txs, 2026, 0)).toHaveLength(0);
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

  it('lista vacía no lanza y no marca nada', () => {
    expect(detectUnusualCategories([]).size).toBe(0);
  });

  it('no marca una categoría con gasto actual 0 aunque tenga historial', () => {
    const txs = [
      tx({ Categoría: 'Viajes', 'Monto (COP)': 100000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Viajes', 'Monto (COP)': 100000, Fecha: monthAgo(2) }),
      // sin transacciones de Viajes en el mes actual → curAmt es 0/ausente
      tx({ Categoría: 'Mercado', 'Monto (COP)': 10000, Fecha: monthAgo(0) }),
    ];
    expect(detectUnusualCategories(txs).has('Viajes')).toBe(false);
  });

  it('categoría nueva sin historial previo no se marca (aunque el gasto actual sea alto)', () => {
    const txs = [
      tx({ Categoría: 'Software', 'Monto (COP)': 400000, Fecha: monthAgo(0) }),
      // solo para satisfacer el mínimo de 2 meses de historia en OTRA categoría
      tx({ Categoría: 'Mercado', 'Monto (COP)': 50000, Fecha: monthAgo(1) }),
      tx({ Categoría: 'Mercado', 'Monto (COP)': 50000, Fecha: monthAgo(2) }),
    ];
    expect(detectUnusualCategories(txs).has('Software')).toBe(false);
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

  it('categoría que desapareció (current=0, prev>0) se reporta con delta -100', () => {
    const txs = [tx({ Categoría: 'Viajes', 'Monto (COP)': 500000, Fecha: monthAgo(1) })];
    const row = getCategoryComparison(txs).find(r => r.category === 'Viajes')!;
    expect(row.current).toBe(0);
    expect(row.prev).toBe(500000);
    expect(row.delta).toBe(-100);
    expect(row.anomaly).toBe(false);
  });

  it('lista vacía → sin filas', () => {
    expect(getCategoryComparison([])).toEqual([]);
  });
});

describe('getWeekdayAverages', () => {
  it('lista vacía → 7 días, todos en 0', () => {
    const avgs = getWeekdayAverages([]);
    expect(avgs).toHaveLength(7);
    expect(avgs.every(d => d.avg === 0 && d.total === 0 && d.count === 0)).toBe(true);
    expect(avgs.map(d => d.label)).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
  });

  it('ignora ingresos y solo promedia gastos', () => {
    // Un jueves cualquiera del mes actual.
    const thursday = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
    while (thursday.getDay() !== 4) thursday.setDate(thursday.getDate() + 1);
    const iso = thursday.toISOString();
    const txs = [
      tx({ Categoría: 'Mercado', 'Monto (COP)': 40000, Fecha: iso }),
      tx({ Categoría: 'Ingreso', 'Monto (COP)': 999999, Fecha: iso }),
    ];
    const avgs = getWeekdayAverages(txs);
    const jueves = avgs.find(d => d.dayIndex === 3)!; // 0=L..3=J
    expect(jueves.total).toBe(40000);
    expect(jueves.count).toBe(1);
  });

  it('excluye transacciones anteriores al corte de monthsBack', () => {
    const old = new Date(now.getFullYear(), now.getMonth() - 5, 1, 12, 0, 0).toISOString();
    const txs = [tx({ Categoría: 'Mercado', 'Monto (COP)': 40000, Fecha: old })];
    const avgs = getWeekdayAverages(txs, 3); // solo últimos 3 meses
    expect(avgs.every(d => d.total === 0)).toBe(true);
  });
});
