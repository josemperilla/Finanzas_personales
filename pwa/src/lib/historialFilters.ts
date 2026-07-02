import { Transaction } from './api';
import { normalizeCategory } from './config';

export function matchesCategoryFilter(tx: Transaction, activeFilter: string): boolean {
  if (activeFilter === 'Todas') return true;
  if (activeFilter === 'Sin categorizar') return !tx.Categoría || tx.Categoría.trim() === '';
  return normalizeCategory(tx.Categoría || '').trim() === normalizeCategory(activeFilter).trim();
}
