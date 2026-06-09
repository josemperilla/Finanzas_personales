import { Transaction } from './api';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function txMonth(tx: Transaction): { year: number; month: number } {
  const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function getMonthTransactions(
  txs: Transaction[],
  year: number,
  month: number,
): Transaction[] {
  return txs.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
  });
}

export function getCategoryTotals(txs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of txs) {
    const cat = tx.Categoría || 'Otro';
    out[cat] = (out[cat] || 0) + Number(tx['Monto (COP)'] || 0);
  }
  return out;
}

// ── D2-3: Unusual spend detector ─────────────────────────────────────────────
// Returns Set of category names where current month spend > 2× average of the
// previous 3 months (only flags when there are at least 2 months of history).

export function detectUnusualCategories(txs: Transaction[]): Set<string> {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();

  const curTotals = getCategoryTotals(getMonthTransactions(txs, curYear, curMonth));

  // Collect totals for the 3 months prior
  const histTotals: Record<string, number[]> = {};
  let nonEmptyMonths = 0;
  for (let i = 1; i <= 3; i++) {
    const d = new Date(curYear, curMonth - i, 1);
    const histTxs = getMonthTransactions(txs, d.getFullYear(), d.getMonth());
    if (histTxs.length > 0) nonEmptyMonths++;
    const hist = getCategoryTotals(histTxs);
    for (const [cat, amt] of Object.entries(hist)) {
      if (!histTotals[cat]) histTotals[cat] = [];
      histTotals[cat].push(amt);
    }
  }

  if (nonEmptyMonths < 2) return new Set(); // not enough history

  const unusual = new Set<string>();
  for (const [cat, curAmt] of Object.entries(curTotals)) {
    if (curAmt <= 0) continue;
    const hist = histTotals[cat] || [];
    if (hist.length === 0) continue;
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
    if (avg > 0 && curAmt > 2 * avg) unusual.add(cat);
  }
  return unusual;
}

// ── D2-2: Month-over-month comparison ────────────────────────────────────────

export interface CategoryMonthDiff {
  category: string;
  prev: number;
  current: number;
  delta: number; // percentage change, e.g. 50 = +50%
  anomaly: boolean; // > 100% increase
}

export function getCategoryComparison(txs: Transaction[]): CategoryMonthDiff[] {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const prevDate = new Date(curYear, curMonth - 1, 1);

  const curTotals = getCategoryTotals(getMonthTransactions(txs, curYear, curMonth));
  const prevTotals = getCategoryTotals(getMonthTransactions(txs, prevDate.getFullYear(), prevDate.getMonth()));

  const allCats = new Set([...Object.keys(curTotals), ...Object.keys(prevTotals)]);
  const rows: CategoryMonthDiff[] = [];

  for (const cat of allCats) {
    const prev = prevTotals[cat] || 0;
    const current = curTotals[cat] || 0;
    if (prev === 0 && current === 0) continue;
    const delta = prev > 0 ? ((current - prev) / prev) * 100 : (current > 0 ? 100 : 0);
    rows.push({ category: cat, prev, current, delta, anomaly: delta > 100 });
  }

  return rows.sort((a, b) => b.current - a.current);
}

// ── D2-4: Weekday analysis ────────────────────────────────────────────────────
// Returns average spend per day of the week for the last 3 months.
// Day 0 = Monday, ..., 6 = Sunday (for display L-D).

export interface WeekdayAvg {
  dayIndex: number; // 0=Mon, 6=Sun
  label: string;
  avg: number;
  total: number;
  count: number;
}

export function getWeekdayAverages(txs: Transaction[], monthsBack = 3): WeekdayAvg[] {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);

  // Map JS getDay() (0=Sun,6=Sat) → our display index (0=Mon,6=Sun)
  const toDisplayIdx = (jsDay: number) => (jsDay === 0 ? 6 : jsDay - 1);
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  const totals = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  const weekTotals: Record<number, Record<number, number>> = {}; // weekIdx → displayDay → amount

  for (const tx of txs) {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    if (isNaN(d.getTime()) || d < cutoff) continue;
    const di = toDisplayIdx(d.getDay());
    // Group by ISO week number to average correctly across weeks
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - di); // Monday of this week
    const weekIdx = Math.floor(weekStart.getTime() / (7 * 24 * 3600 * 1000));
    if (!weekTotals[weekIdx]) weekTotals[weekIdx] = {};
    weekTotals[weekIdx][di] = (weekTotals[weekIdx][di] || 0) + Number(tx['Monto (COP)'] || 0);
  }

  // Aggregate across weeks
  for (const week of Object.values(weekTotals)) {
    for (const [di, amt] of Object.entries(week)) {
      totals[Number(di)] += amt;
      counts[Number(di)]++;
    }
  }

  return labels.map((label, i) => ({
    dayIndex: i,
    label,
    total: totals[i],
    count: counts[i],
    avg: counts[i] > 0 ? Math.round(totals[i] / counts[i]) : 0,
  }));
}
