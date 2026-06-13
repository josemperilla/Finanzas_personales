import { Transaction } from './api';
import { cleanMerchant } from './merchantCleaner';

export interface Subscription {
  comercio: string;
  montoMensual: number;
  periodoDias: number;
  ocurrencias: number;
  ultimaFecha: string;
  proximaEsperada: string;
  categoria: string;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr.replace(' ', 'T'));
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function toDateStr(raw: string): string {
  return raw.replace(' ', 'T').slice(0, 10);
}

export function detectSubscriptions(txs: Transaction[]): Subscription[] {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // 1. Group by cleaned merchant name, filter recent
  const byMerchant = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const comercio = cleanMerchant(tx.Comercio);
    if (!comercio) continue;
    const raw = (tx.Fecha || tx.Timestamp || '').replace(' ', 'T');
    const d = new Date(raw);
    if (isNaN(d.getTime()) || d < sixMonthsAgo) continue;
    const monto = Number(tx['Monto (COP)'] || 0);
    if (monto <= 0) continue;
    if (!byMerchant.has(comercio)) byMerchant.set(comercio, []);
    byMerchant.get(comercio)!.push(tx);
  }

  const results: Subscription[] = [];

  for (const [comercio, group] of byMerchant) {
    if (group.length < 2) continue;

    // Sort by date
    const sorted = group.slice().sort((a, b) => {
      const da = new Date((a.Fecha || a.Timestamp || '').replace(' ', 'T'));
      const db = new Date((b.Fecha || b.Timestamp || '').replace(' ', 'T'));
      return da.getTime() - db.getTime();
    });

    // 2. Compute intervals in days between consecutive transactions
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = new Date((sorted[i - 1].Fecha || sorted[i - 1].Timestamp || '').replace(' ', 'T'));
      const b = new Date((sorted[i].Fecha || sorted[i].Timestamp || '').replace(' ', 'T'));
      const days = (b.getTime() - a.getTime()) / 86_400_000;
      if (days > 0) intervals.push(days);
    }
    if (intervals.length === 0) continue;

    const med = median(intervals);
    const stdI = std(intervals);

    // 3. Interval must cluster around monthly (25–38d) or bi-monthly (55–75d)
    const isMonthly = med >= 25 && med <= 38;
    const isBiMonthly = med >= 55 && med <= 75;
    if (!isMonthly && !isBiMonthly) continue;

    // 4. Interval consistency: stdDev / median < 0.25
    if (med > 0 && stdI / med >= 0.25) continue;

    // 5. Amount consistency: coefficient of variation < 0.08
    const amounts = sorted.map(tx => Number(tx['Monto (COP)'] || 0)).filter(a => a > 0);
    if (amounts.length < 2) continue;
    const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (meanAmount <= 0) continue;
    const stdAmount = std(amounts);
    if (stdAmount / meanAmount >= 0.08) continue;

    // 6. Build result
    const ultima = sorted[sorted.length - 1];
    const ultimaFecha = toDateStr(ultima.Fecha || ultima.Timestamp || '');
    const periodoDias = isMonthly ? 30 : 60;
    const montoMensual = isMonthly ? meanAmount : meanAmount / 2;

    results.push({
      comercio,
      montoMensual: Math.round(montoMensual),
      periodoDias,
      ocurrencias: sorted.length,
      ultimaFecha,
      proximaEsperada: addDays(ultimaFecha, periodoDias),
      categoria: ultima.Categoría || 'Otro',
    });
  }

  return results.sort((a, b) => b.montoMensual - a.montoMensual);
}
