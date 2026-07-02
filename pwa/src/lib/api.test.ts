import { describe, it, expect } from 'vitest';
import {
  isSmsTx,
  countSmsTx,
  isIncomeTx,
  isGasto,
  extractLast4,
  getUnknownCards,
  Transaction,
  Card,
} from './api';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    Timestamp: '2026-06-24 12:00:00',
    Fecha: '2026-06-24 12:00:00',
    Banco: 'Bogotá',
    Tipo: 'Compra',
    'Monto (COP)': 10000,
    Comercio: 'Tienda',
    'Tarjeta/Cuenta': 'Tarjeta Crédito 8645',
    Categoría: 'Mercado',
    ...partial,
  };
}

function card(partial: Partial<Card>): Card {
  return {
    id: 'c1',
    banco: 'Bogotá',
    chasis: 'Visa',
    ultimos4: '8645',
    createdAt: '2026-01-01',
    ...partial,
  };
}

describe('isSmsTx', () => {
  it('cuenta como SMS cuando Fuente es "sms" o está vacía (default legado)', () => {
    expect(isSmsTx(tx({ Fuente: 'sms' }))).toBe(true);
    expect(isSmsTx(tx({ Fuente: undefined }))).toBe(true);
    expect(isSmsTx(tx({ Fuente: '' }))).toBe(true);
  });

  it('cuenta variantes con prefijo "sms" (p.ej. "sms_notif")', () => {
    expect(isSmsTx(tx({ Fuente: 'sms_notif' }))).toBe(true);
  });

  it('cuenta apple_pay y google_pay como SMS', () => {
    expect(isSmsTx(tx({ Fuente: 'apple_pay' }))).toBe(true);
    expect(isSmsTx(tx({ Fuente: 'google_pay' }))).toBe(true);
  });

  it('no cuenta fuentes explícitamente distintas (manual, import, email)', () => {
    expect(isSmsTx(tx({ Fuente: 'manual' }))).toBe(false);
    expect(isSmsTx(tx({ Fuente: 'import' }))).toBe(false);
    expect(isSmsTx(tx({ Fuente: 'email' }))).toBe(false);
  });

  it('es case-insensitive', () => {
    expect(isSmsTx(tx({ Fuente: 'SMS' }))).toBe(true);
  });
});

describe('countSmsTx', () => {
  it('cuenta solo las transacciones capturadas por SMS', () => {
    const txs = [
      tx({ Fuente: 'sms' }),
      tx({ Fuente: 'manual' }),
      tx({ Fuente: 'import' }),
      tx({ Fuente: undefined }),
    ];
    expect(countSmsTx(txs)).toBe(2);
  });

  it('lista vacía → 0', () => {
    expect(countSmsTx([])).toBe(0);
  });
});

describe('isIncomeTx / isGasto', () => {
  it('una transacción es ingreso si Categoría es "Ingreso"', () => {
    expect(isIncomeTx(tx({ Categoría: 'Ingreso', Tipo: 'Compra' }))).toBe(true);
    expect(isGasto(tx({ Categoría: 'Ingreso', Tipo: 'Compra' }))).toBe(false);
  });

  it('una transacción es ingreso si Tipo está en la lista de tipos de ingreso', () => {
    for (const tipo of ['Depósito', 'Abono', 'Consignación', 'Crédito', 'Ingreso', 'Nómina']) {
      expect(isIncomeTx(tx({ Categoría: 'Mercado', Tipo: tipo }))).toBe(true);
    }
  });

  it('una compra normal es gasto', () => {
    expect(isIncomeTx(tx({ Categoría: 'Mercado', Tipo: 'Compra' }))).toBe(false);
    expect(isGasto(tx({ Categoría: 'Mercado', Tipo: 'Compra' }))).toBe(true);
  });

  it('isGasto es siempre la negación de isIncomeTx', () => {
    const t = tx({ Categoría: 'Restaurantes', Tipo: 'Débito' });
    expect(isGasto(t)).toBe(!isIncomeTx(t));
  });
});

describe('extractLast4', () => {
  it('extrae los últimos 4 dígitos del último grupo numérico', () => {
    expect(extractLast4('Tarjeta Crédito 8645')).toBe('8645');
    expect(extractLast4('Cuenta Ahorros **** 1234')).toBe('1234');
  });

  it('cuando hay varios grupos de dígitos, toma el último', () => {
    expect(extractLast4('Cuenta 2026 Tarjeta 5678')).toBe('5678');
  });

  it('devuelve null si no hay dígitos', () => {
    expect(extractLast4('Sin números')).toBeNull();
  });

  it('maneja valores nulos/indefinidos sin lanzar', () => {
    expect(extractLast4(null as unknown as string)).toBeNull();
    expect(extractLast4(undefined as unknown as string)).toBeNull();
  });
});

describe('getUnknownCards', () => {
  it('detecta tarjetas usadas en transacciones que no están registradas', () => {
    const txs = [
      tx({ Banco: 'Bogotá', 'Tarjeta/Cuenta': 'Tarjeta Crédito 8645' }),
      tx({ Banco: 'Davivienda', 'Tarjeta/Cuenta': 'Cuenta Ahorros 1234' }),
    ];
    const cards = [card({ banco: 'Bogotá', ultimos4: '8645' })];
    const unknown = getUnknownCards(txs, cards);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({ banco: 'Davivienda', ultimos4: '1234' });
  });

  it('no reporta tarjetas ya registradas', () => {
    const txs = [tx({ Banco: 'Bogotá', 'Tarjeta/Cuenta': 'Tarjeta 8645' })];
    const cards = [card({ banco: 'Bogotá', ultimos4: '8645' })];
    expect(getUnknownCards(txs, cards)).toHaveLength(0);
  });

  it('no duplica la misma tarjeta desconocida vista en varias transacciones', () => {
    const txs = [
      tx({ Banco: 'Bogotá', 'Tarjeta/Cuenta': 'Tarjeta 9999' }),
      tx({ Banco: 'Bogotá', 'Tarjeta/Cuenta': 'Tarjeta 9999' }),
    ];
    expect(getUnknownCards(txs, [])).toHaveLength(1);
  });

  it('ignora transacciones sin Tarjeta/Cuenta o sin dígitos reconocibles', () => {
    const txs = [
      tx({ 'Tarjeta/Cuenta': '' }),
      tx({ 'Tarjeta/Cuenta': 'Sin número' }),
    ];
    expect(getUnknownCards(txs, [])).toHaveLength(0);
  });

  it('mismo número de tarjeta en bancos distintos cuenta como tarjetas distintas', () => {
    const txs = [
      tx({ Banco: 'Bogotá', 'Tarjeta/Cuenta': 'Tarjeta 8645' }),
      tx({ Banco: 'Davivienda', 'Tarjeta/Cuenta': 'Tarjeta 8645' }),
    ];
    const cards = [card({ banco: 'Bogotá', ultimos4: '8645' })];
    const unknown = getUnknownCards(txs, cards);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].banco).toBe('Davivienda');
  });
});
