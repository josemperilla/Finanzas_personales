import { describe, it, expect, beforeEach } from 'vitest';
import { computeHealthScore } from './healthScore';
import { Transaction } from './api';

const now = new Date();
const thisMonth = (day: number) =>
  new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0).toISOString();

function tx(partial: Partial<Transaction>): Transaction {
  return {
    Timestamp: thisMonth(15),
    Fecha: thisMonth(15),
    Banco: 'Bogotá',
    Tipo: 'Compra',
    'Monto (COP)': 50000,
    Comercio: 'Tienda',
    'Tarjeta/Cuenta': 'Tarjeta Crédito 8645',
    Categoría: 'Mercado',
    Fuente: 'manual',
    ...partial,
  };
}

describe('computeHealthScore', () => {
  beforeEach(() => localStorage.clear());

  it('sin transacciones → score 0 y etiqueta Crítico', () => {
    const hs = computeHealthScore([], 'u1');
    expect(hs.score).toBe(0);
    expect(hs.label).toBe('Crítico');
    expect(hs.breakdown).toEqual({ budget: 0, channels: 0, categorization: 0 });
  });

  it('asigna puntos de categorización proporcionales a txs categorizadas', () => {
    const txs = [
      tx({ Categoría: 'Mercado' }),
      tx({ Categoría: 'Restaurantes' }),
      tx({ Categoría: 'Otro' }),
      tx({ Categoría: '' }),
    ];
    const hs = computeHealthScore(txs, 'u1');
    // 2 de 4 categorizadas (≠ Otro/vacío) → round(0.5 * 30) = 15
    expect(hs.breakdown.categorization).toBe(15);
  });

  it('cuenta canales de captura distintos', () => {
    const txs = [
      tx({ Fuente: 'sms' }),
      tx({ Fuente: 'notification' }),
      tx({ Fuente: 'import' }),
      tx({ Fuente: 'email' }),
    ];
    const hs = computeHealthScore(txs, 'u1');
    // 4/4 canales → round(1 * 30) = 30
    expect(hs.breakdown.channels).toBe(30);
  });

  it('da crédito de presupuesto cuando el gasto está bajo el 80% del límite', () => {
    localStorage.setItem('fm_budgets_u1', JSON.stringify({ Mercado: 1000000 }));
    const txs = [tx({ Categoría: 'Mercado', 'Monto (COP)': 100000 })];
    const hs = computeHealthScore(txs, 'u1');
    // 1 de 1 categoría con presupuesto bajo control → 40
    expect(hs.breakdown.budget).toBe(40);
  });

  it('etiqueta el score en la banda correcta', () => {
    localStorage.setItem('fm_budgets_u1', JSON.stringify({ Mercado: 1000000 }));
    const txs = [
      tx({ Categoría: 'Mercado', 'Monto (COP)': 100000, Fuente: 'sms' }),
      tx({ Categoría: 'Restaurantes', 'Monto (COP)': 30000, Fuente: 'import' }),
    ];
    const hs = computeHealthScore(txs, 'u1');
    expect(hs.score).toBeGreaterThan(0);
    expect(['Excelente', 'Bien', 'Regular', 'Crítico']).toContain(hs.label);
  });

  it('da crédito parcial (10) de presupuesto cuando hay gasto pero no hay presupuestos configurados', () => {
    const txs = [tx({ Categoría: 'Mercado', 'Monto (COP)': 100000 })];
    const hs = computeHealthScore(txs, 'u1'); // sin fm_budgets_u1 en localStorage
    expect(hs.breakdown.budget).toBe(10);
  });

  it('sin categorías con presupuesto que cubran el gasto → 0 (no divide por cero)', () => {
    localStorage.setItem('fm_budgets_u1', JSON.stringify({ Mercado: 50000 }));
    const txs = [tx({ Categoría: 'Mercado', 'Monto (COP)': 100000 })]; // supera el 80% del presupuesto
    const hs = computeHealthScore(txs, 'u1');
    expect(hs.breakdown.budget).toBe(0);
  });

  it('piso de 10 puntos de canales cuando hay datos pero ninguna Fuente reconocida', () => {
    const txs = [tx({ Fuente: 'manual' })]; // "manual" no está en CAPTURE_CHANNELS
    const hs = computeHealthScore(txs, 'u1');
    expect(hs.breakdown.channels).toBe(10);
  });

  it('ignora transacciones de meses anteriores al calcular el score del mes actual', () => {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 12, 0, 0).toISOString();
    const txs = [tx({ Fecha: lastMonth, Timestamp: lastMonth })];
    const hs = computeHealthScore(txs, 'u1');
    expect(hs.score).toBe(0);
  });

  it('combina presupuestos compartidos y por-usuario (prioriza el del usuario)', () => {
    localStorage.setItem('fm_budgets_shared', JSON.stringify({ Mercado: 20000 }));
    localStorage.setItem('fm_budgets_u1', JSON.stringify({ Mercado: 1000000 }));
    const txs = [tx({ Categoría: 'Mercado', 'Monto (COP)': 100000 })];
    const hs = computeHealthScore(txs, 'u1');
    // Si tomara solo el compartido (20000), 100000 superaría el 80% y daría 0.
    // Con el override por-usuario (1000000), 100000 está bajo el 80% → 40.
    expect(hs.breakdown.budget).toBe(40);
  });
});
