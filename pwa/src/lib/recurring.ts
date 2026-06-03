import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';

export interface RecurringItem {
  comercio: string;
  monthlyAmount: number;
  months: number;
  lastDate: string;
  categoria: string;
  isSubscription: boolean;   // monto casi fijo (CV < 15%)
  missedRecentMonth: boolean; // no cobrado en el último mes ni en el anterior
}

export function detectRecurring(transactions: Transaction[]): RecurringItem[] {
  const map: Record<string, {
    months: Set<string>;
    amounts: number[];
    lastDate: string;
    categoria: string;
  }> = {};

  for (const tx of transactions) {
    const name = cleanMerchant(tx.Comercio) || tx.Comercio;
    if (!name || name.length < 2) continue;
    const monthKey = (tx.Fecha || tx.Timestamp || '').slice(0, 7);
    if (!monthKey || monthKey.length < 7) continue;

    if (!map[name]) map[name] = { months: new Set(), amounts: [], lastDate: '', categoria: '' };
    const entry = map[name];
    entry.months.add(monthKey);
    entry.amounts.push(Number(tx['Monto (COP)'] || 0));
    const dateStr = tx.Fecha || tx.Timestamp || '';
    if (dateStr > entry.lastDate) {
      entry.lastDate = dateStr;
      entry.categoria = tx.Categoría || '';
    }
  }

  const now = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const currentMonth = fmt(now);
  const prevMonth    = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));

  const result: RecurringItem[] = [];

  for (const [comercio, data] of Object.entries(map)) {
    if (data.months.size < 2) continue;

    const amounts = data.amounts.filter(a => a > 0);
    if (amounts.length === 0) continue;

    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + Math.pow(a - avg, 2), 0) / amounts.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;

    result.push({
      comercio,
      monthlyAmount: Math.round(avg),
      months: data.months.size,
      lastDate: data.lastDate,
      categoria: data.categoria,
      isSubscription: cv < 0.15,
      missedRecentMonth: !data.months.has(currentMonth) && !data.months.has(prevMonth),
    });
  }

  return result.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
