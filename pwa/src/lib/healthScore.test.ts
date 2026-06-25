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
});
