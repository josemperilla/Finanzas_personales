import { Transaction } from './api';
import { getBudgets, getSharedBudgets } from './budgets';
import { getMonthTransactions, getCategoryTotals } from './analytics';

export interface HealthBreakdown {
  budget: number;   // 0–40
  channels: number; // 0–30
  categorization: number; // 0–30
}

export interface HealthScore {
  score: number; // 0–100
  breakdown: HealthBreakdown;
  label: 'Excelente' | 'Bien' | 'Regular' | 'Crítico';
  color: string;
}

// channels: ids of capture sources seen this month (sms, notification, email, import, manual, voice, pdf)
// Active channels = distinct Fuente values present in current month transactions.
const CAPTURE_CHANNELS = ['sms', 'notification', 'email', 'import'];
const MAX_CHANNELS = CAPTURE_CHANNELS.length;

export function computeHealthScore(txs: Transaction[], userId: string): HealthScore {
  const now = new Date();
  const monthTxs = getMonthTransactions(txs, now.getFullYear(), now.getMonth());

  // ── Categorization (0–30) ──────────────────────────────────────────────
  const total = monthTxs.length;
  const categorized = monthTxs.filter(tx => tx.Categoría && tx.Categoría !== 'Otro').length;
  const categorizationScore = total > 0 ? Math.round((categorized / total) * 30) : 0;

  // ── Channels (0–30) ────────────────────────────────────────────────────
  const activeSources = new Set(monthTxs.map(tx => (tx.Fuente || '').toLowerCase()));
  const activeChannels = CAPTURE_CHANNELS.filter(ch => activeSources.has(ch)).length;
  // Also count any tx at all (manual counts as at least some engagement)
  const hasAnyData = monthTxs.length > 0;
  const channelScore = hasAnyData
    ? Math.max(10, Math.round((activeChannels / MAX_CHANNELS) * 30))
    : 0;

  // ── Budget (0–40) ──────────────────────────────────────────────────────
  const budgets = { ...getSharedBudgets(), ...getBudgets(userId) };
  const catTotals = getCategoryTotals(monthTxs);
  const categoriesWithSpend = Object.keys(catTotals).filter(c => catTotals[c] > 0);
  const categoriesWithBudget = categoriesWithSpend.filter(c => (budgets[c] || 0) > 0);
  const underBudget = categoriesWithBudget.filter(c => catTotals[c] < (budgets[c] || 0) * 0.8);

  let budgetScore = 0;
  if (categoriesWithSpend.length === 0) {
    budgetScore = 0;
  } else if (categoriesWithBudget.length === 0) {
    // No budgets configured at all — partial credit for having data
    budgetScore = 10;
  } else {
    budgetScore = Math.round((underBudget.length / categoriesWithBudget.length) * 40);
  }

  const score = budgetScore + channelScore + categorizationScore;

  let label: HealthScore['label'];
  let color: string;
  if (score >= 80) { label = 'Excelente'; color = '#16a34a'; }
  else if (score >= 60) { label = 'Bien'; color = '#2563eb'; }
  else if (score >= 40) { label = 'Regular'; color = '#d97706'; }
  else { label = 'Crítico'; color = '#dc2626'; }

  return {
    score,
    breakdown: { budget: budgetScore, channels: channelScore, categorization: categorizationScore },
    label,
    color,
  };
}
