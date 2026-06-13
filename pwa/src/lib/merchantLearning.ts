import { Transaction } from './api';

export interface LearnedMapping {
  rawMerchant: string;
  canonicalName: string;
  categoria: string;
  updatedAt: string;
}

function storageKey(userId: string) { return `fm_learned_${userId}`; }

export function getLearnedMappings(userId: string): LearnedMapping[] {
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) || '[]'); }
  catch { return []; }
}

export function addLearnedMapping(userId: string, mapping: LearnedMapping): void {
  const existing = getLearnedMappings(userId);
  const idx = existing.findIndex(m => m.rawMerchant === mapping.rawMerchant);
  if (idx >= 0) {
    existing[idx] = mapping;
  } else {
    existing.push(mapping);
  }
  localStorage.setItem(storageKey(userId), JSON.stringify(existing));
}

export function removeLearnedMapping(userId: string, rawMerchant: string): void {
  const filtered = getLearnedMappings(userId).filter(m => m.rawMerchant !== rawMerchant);
  localStorage.setItem(storageKey(userId), JSON.stringify(filtered));
}

export function clearLearnedMappings(userId: string): void {
  localStorage.removeItem(storageKey(userId));
}

export function applyLearnings(txs: Transaction[], userId: string): Transaction[] {
  const mappings = getLearnedMappings(userId);
  if (mappings.length === 0) return txs;
  const index = new Map(mappings.map(m => [m.rawMerchant, m]));
  return txs.map(tx => {
    const m = tx.Comercio ? index.get(tx.Comercio) : undefined;
    if (!m) return tx;
    return {
      ...tx,
      Comercio: m.canonicalName || tx.Comercio,
      Categoría: m.categoria,
    };
  });
}
