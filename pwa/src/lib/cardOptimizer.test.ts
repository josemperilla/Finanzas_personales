import { describe, it, expect } from 'vitest';
import { attributeSpend, computeExencion, computeCupo } from './cardOptimizer';
import { Card, Transaction } from './api';

const now = new Date();
const Y = now.getFullYear();
const M = now.getMonth();
const inMonth = (day: number) => new Date(Y, M, day, 12, 0, 0).toISOString();

const platinum: Card = {
  id: 'c1', banco: 'Bogotá', chasis: 'Platinum', ultimos4: '8645', createdAt: inMonth(1),
};

function tx(partial: Partial<Transaction>): Transaction {
  return {
    Timestamp: inMonth(15),
    Fecha: inMonth(15),
    Banco: 'Bogotá',
    Tipo: 'Compra',
    'Monto (COP)': 0,
    Comercio: 'Tienda',
    'Tarjeta/Cuenta': 'Tarjeta Crédito 8645',
    Categoría: 'Compras',
    ...partial,
  };
}

describe('attributeSpend', () => {
  it('atribuye el gasto del mes a la tarjeta por banco + últimos 4', () => {
    const txs = [tx({ 'Monto (COP)': 800000 }), tx({ 'Monto (COP)': 800000 })];
    const map = attributeSpend(txs, [platinum], Y, M);
    expect(map.get('c1')).toEqual({ gastoPeriodo: 1600000, numCompras: 2 });
  });

  it('ignora ingresos y transacciones de otros meses', () => {
    const txs = [
      tx({ 'Monto (COP)': 500000, Categoría: 'Ingreso' }),       // ingreso → excluido
      tx({ 'Monto (COP)': 500000, Fecha: new Date(Y - 1, M, 15).toISOString() }), // otro año
      tx({ 'Monto (COP)': 300000 }),                              // sí cuenta
    ];
    const map = attributeSpend(txs, [platinum], Y, M);
    expect(map.get('c1')).toEqual({ gastoPeriodo: 300000, numCompras: 1 });
  });

  it('no atribuye si los últimos 4 no coinciden', () => {
    const txs = [tx({ 'Monto (COP)': 900000, 'Tarjeta/Cuenta': 'Tarjeta Crédito 1111' })];
    const map = attributeSpend(txs, [platinum], Y, M);
    expect(map.get('c1')).toEqual({ gastoPeriodo: 0, numCompras: 0 });
  });
});

describe('computeExencion', () => {
  it('marca la cuota exonerada cuando el gasto alcanza el umbral (tipo monto)', () => {
    const status = computeExencion(platinum, { gastoPeriodo: 1600000, numCompras: 2 });
    expect(status?.exenta).toBe(true);
    expect(status?.faltante).toBe(0);
  });

  it('reporta cuánto falta cuando aún no se alcanza el umbral', () => {
    const status = computeExencion(platinum, { gastoPeriodo: 800000, numCompras: 1 });
    expect(status?.exenta).toBe(false);
    expect(status?.faltante).toBe(700000); // 1.5M - 800k
    expect(status?.progreso).toBeCloseTo(0.533, 2);
  });

  it('devuelve null para chasis que no es tarjeta de crédito conocida', () => {
    const debito: Card = { ...platinum, chasis: 'Débito' };
    expect(computeExencion(debito, { gastoPeriodo: 0, numCompras: 0 })).toBeNull();
  });
});

describe('computeCupo', () => {
  it('calcula el uso del cupo a partir del gasto del mes', () => {
    const card: Card = { ...platinum, cupo: 5000000 };
    const status = computeCupo(card, { gastoPeriodo: 1600000, numCompras: 2 });
    expect(status?.pct).toBeCloseTo(0.32, 2);
    expect(status?.disponible).toBe(3400000);
  });

  it('devuelve null si no hay cupo registrado', () => {
    expect(computeCupo(platinum, { gastoPeriodo: 100000, numCompras: 1 })).toBeNull();
  });
});
