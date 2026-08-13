import { describe, it, expect } from 'vitest';
import { productKey, dedupCards, missingPersonalProducts } from './personalProducts';
import type { Card } from './api';

const card = (over: Partial<Card> = {}): Card => ({
  id: 'id',
  banco: 'Banco de Bogotá',
  chasis: 'Black',
  ultimos4: '8439',
  createdAt: '',
  ...over,
});

describe('productKey — colapsa variantes de banco al mismo plástico', () => {
  it('"Itaú" y "Banco de Bogotá" con el mismo plástico dan la misma clave', () => {
    expect(productKey(card({ banco: 'Itaú' }))).toBe(productKey(card({ banco: 'Banco de Bogotá' })));
  });
  it('"Bogotá" colapsa en "Banco de Bogotá"', () => {
    expect(productKey(card({ banco: 'Bogotá' }))).toBe(productKey(card({ banco: 'Banco de Bogotá' })));
  });
  it('"AV Villas" y "Ave Villas" colapsan', () => {
    expect(productKey(card({ banco: 'AV Villas', ultimos4: '3403' })))
      .toBe(productKey(card({ banco: 'Ave Villas', ultimos4: '3403' })));
  });
});

describe('dedupCards', () => {
  it('colapsa duplicados por banco|ultimos4 y prefiere la entrada con alias', () => {
    const cards = [
      card({ id: 'a', banco: 'Itaú' }),                       // sin alias
      card({ id: 'b', banco: 'Banco de Bogotá', alias: 'Itaú Black' }),
    ];
    const out = dedupCards(cards);
    expect(out).toHaveLength(1);
    expect(out[0].alias).toBe('Itaú Black');
  });
  it('deja intactas tarjetas con plástico distinto', () => {
    const cards = [card({ ultimos4: '8439' }), card({ ultimos4: '8645' })];
    expect(dedupCards(cards)).toHaveLength(2);
  });
});

describe('missingPersonalProducts — no re-siembra duplicados', () => {
  it('no falta el default 8439 si ya existe una tarjeta Itaú|8439 (mismo plástico)', () => {
    // Regresión del bug: como productKey normaliza, el default
    // jose-itau-black-8439 (Banco de Bogotá|8439) ya está "presente" aunque la
    // tarjeta registrada diga "Itaú", así que no se vuelve a sembrar.
    const existing = [card({ id: 'x', banco: 'Itaú' })];
    const missing = missingPersonalProducts('jose', existing);
    expect(missing.find(p => p.ultimos4 === '8439')).toBeUndefined();
  });
});
