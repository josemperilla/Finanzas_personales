import type { Card } from './api';
import { normalizeBankName } from './banks';

export const JOSE_DEFAULT_PRODUCTS: Card[] = [
  {
    id: 'jose-itau-black-8439',
    // Banco de Bogotá compró a Itaú: el plástico es el mismo, el banco cambió.
    // `productKey` es `banco|ultimos4`, así que este nombre TIENE que coincidir
    // con el que webhook.gs escribe en la hoja (BANCO_BOGOTA) o el producto
    // aparece duplicado en la PWA.
    banco: 'Banco de Bogotá',
    chasis: 'Black',
    ultimos4: '8439',
    alias: 'Itaú Black',
    createdAt: '2026-07-02T00:00:00.000Z',
  },
  {
    id: 'jose-avvillas-signature-3403',
    banco: 'AV Villas',
    chasis: 'Signature',
    ultimos4: '3403',
    alias: 'AV Villas Lifemiles',
    createdAt: '2026-07-02T00:00:00.000Z',
  },
  {
    id: 'jose-bogota-signature-8645',
    banco: 'Banco de Bogotá',
    chasis: 'Signature',
    ultimos4: '8645',
    alias: 'LATAM Pass',
    createdAt: '2026-07-02T00:00:00.000Z',
  },
  {
    id: 'jose-itau-ahorros-8448',
    banco: 'Banco de Bogotá',
    chasis: 'Cuenta de Ahorros',
    ultimos4: '8448',
    alias: 'Cuenta de Ahorros',
    createdAt: '2026-07-02T00:00:00.000Z',
  },
];

// Clave canónica de un producto: banco normalizado (con aliases, ver
// `normalizeBankName`) + últimos 4. Es la identidad de un plástico: dos
// entradas con la misma clave son el mismo producto. Antes solo quitaba
// tildes/minúsculas, así que "Itaú|8439" y "Banco de Bogotá|8439" se tomaban
// como distintos y el plástico se duplicaba en la PWA.
export function productKey(card: Pick<Card, 'banco' | 'ultimos4'>): string {
  return `${normalizeBankName(card.banco) ?? ''}|${card.ultimos4}`;
}

// Red de seguridad: colapsa tarjetas duplicadas por `productKey`, prefiriendo
// la entrada con alias (más metadata). Evita que un duplicado en
// cards_<userId> (p. ej. por drift histórico) se pinte dos veces.
export function dedupCards(cards: Card[]): Card[] {
  const byKey = new Map<string, Card>();
  for (const c of cards) {
    const key = productKey(c);
    const prev = byKey.get(key);
    if (!prev || (!prev.alias && c.alias)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

export function missingPersonalProducts(userId: string, cards: Card[]): Card[] {
  if (userId.toLowerCase() !== 'jose') return [];
  const existingKeys = new Set(cards.map(productKey));
  return JOSE_DEFAULT_PRODUCTS.filter(card => !existingKeys.has(productKey(card)));
}
