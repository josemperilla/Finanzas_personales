import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';

export interface RecurringItem {
  comercio: string;
  monthlyAmount: number;
  occurrences: number;
  lastDate: string;
  categoria: string;
}

// Conservative detection: same monto (±5%) appearing ≥2 times
// with ≥25 days between each consecutive occurrence and within the last 3 months.
export function detectRecurring(transactions: Transaction[]): RecurringItem[] {
  const map: Record<string, { date: Date; amount: number; categoria: string }[]> = {};

  for (const tx of transactions) {
    const name = cleanMerchant(tx.Comercio) || tx.Comercio;
    if (!name || name.length < 2) continue;
    const amount = Number(tx['Monto (COP)'] || 0);
    if (amount <= 0) continue;
    const dateStr = tx.Fecha || tx.Timestamp || '';
    const date = new Date(dateStr.replace(' ', 'T'));
    if (isNaN(date.getTime())) continue;

    if (!map[name]) map[name] = [];
    map[name].push({ date, amount, categoria: tx.Categoría || '' });
  }

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const result: RecurringItem[] = [];

  for (const [comercio, entries] of Object.entries(map)) {
    if (entries.length < 2) continue;

    // Sort by date ascending
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

    // Find consecutive pairs with same amount (±5%) and ≥25 days apart
    let matchingPairs = 0;
    let totalAmount = 0;
    let lastDate = '';
    let categoria = '';

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const daysDiff = (curr.date.getTime() - prev.date.getTime()) / 86_400_000;
      const avgAmt = (prev.amount + curr.amount) / 2;
      const amtDiff = Math.abs(prev.amount - curr.amount) / avgAmt;

      if (daysDiff >= 25 && amtDiff < 0.05) {
        matchingPairs++;
        totalAmount += curr.amount;
        if (curr.date.toISOString() > lastDate) {
          lastDate = curr.date.toISOString();
          categoria = curr.categoria;
        }
      }
    }

    if (matchingPairs < 1) continue;

    // Must have occurred within the last 3 months
    const mostRecent = sorted[sorted.length - 1].date;
    if (mostRecent < threeMonthsAgo) continue;

    result.push({
      comercio,
      monthlyAmount: Math.round(totalAmount / matchingPairs),
      occurrences: matchingPairs + 1,
      lastDate: lastDate || sorted[sorted.length - 1].date.toISOString(),
      categoria,
    });
  }

  return result.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
