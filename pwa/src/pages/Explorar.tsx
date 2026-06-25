import { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, fetchAnalytics, AnalyticsData, fetchCards, Card } from '../lib/api';
import { HAS_WEBHOOK_URL } from '../lib/config';
import { formatCOP } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { Icon } from '../components/ui/icons';
import { useCountUp } from '../lib/useCountUp';
import { quickEase, riseItem, staggerContainer } from '../lib/motion';
import { getBudgets, setBudget, clearBudget, getSharedBudgets, setSharedBudget, clearSharedBudget } from '../lib/budgets';
import { CategorySheet } from '../components/CategorySheet';
import { WeekdayChart } from '../components/WeekdayChart';
import { CategoryComparison } from '../components/CategoryComparison';
import { SubscripcionesWidget } from '../components/SubscripcionesWidget';
import { WeeklyCashFlow } from '../components/WeeklyCashFlow';
import { computeHealthScore } from '../lib/healthScore';

interface Props {
  transactions: Transaction[];
  loading: boolean;
  userId: string;
  onViewHistorial?: () => void;
  onOpenChat?: () => void;
}

interface MonthStats {
  key: string;
  label: string;
  total: number;
  count: number;
  byCategory: { name: string; color: string; amount: number }[];
  topMerchants: { name: string; amount: number; count: number }[];
  topByCount: { name: string; amount: number; count: number }[];
}

// Construye los chips de banco dinámicamente: unión de los bancos presentes en las
// transacciones + los de los productos/tarjetas registradas, ordenados por gasto.
// "Otro" solo aparece si hay transacciones con Banco vacío/desconocido.
function buildBankList(txs: Transaction[], cards: Card[]): string[] {
  const spend: Record<string, number> = {};
  let hasBlank = false;
  for (const tx of txs) {
    if (!tx.Banco) { hasBlank = true; continue; }
    spend[tx.Banco] = (spend[tx.Banco] || 0) + Number(tx['Monto (COP)'] || 0);
  }
  const set = new Set<string>(Object.keys(spend));
  for (const c of cards) if (c.banco) set.add(c.banco);
  const sorted = [...set].sort((a, b) => (spend[b] || 0) - (spend[a] || 0) || a.localeCompare(b));
  return ['Todos', ...sorted, ...(hasBlank ? ['Otro'] : [])];
}

function getMonthKey(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n.toFixed(0)}`;
}

function shortLabel(key: string): string {
  if (!key) return '';
  const [y, m] = key.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${months[parseInt(m) - 1]}. ${y.slice(2)}`;
}

function computeStats(txs: Transaction[], bank: string): MonthStats[] {
  const filtered = bank === 'Todos' ? txs : txs.filter(tx => {
    if (bank === 'Otro') return !tx.Banco;
    return tx.Banco === bank;
  });

  const byMonth: Record<string, Transaction[]> = {};
  for (const tx of filtered) {
    const key = getMonthKey(tx.Fecha || tx.Timestamp);
    if (!key) continue;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(tx);
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, monthTxs]) => {
      const total = monthTxs.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
      const count = monthTxs.length;

      const byCat = CATEGORIES.map(cat => ({
        name: cat.name, color: getCategoryColor(cat.name),
        amount: monthTxs.filter(tx => tx.Categoría === cat.name)
          .reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0),
      })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

      const merchantMap: Record<string, { amount: number; count: number }> = {};
      for (const tx of monthTxs) {
        const name = cleanMerchant(tx.Comercio) || tx.Tipo;
        if (!merchantMap[name]) merchantMap[name] = { amount: 0, count: 0 };
        merchantMap[name].amount += Number(tx['Monto (COP)'] || 0);
        merchantMap[name].count += 1;
      }
      const merchantEntries = Object.entries(merchantMap).map(([name, v]) => ({ name, ...v }));
      const topMerchants = [...merchantEntries].sort((a, b) => b.amount - a.amount).slice(0, 10);
      const topByCount   = [...merchantEntries].sort((a, b) => b.count - a.count).slice(0, 10);

      return { key, label: shortLabel(key), total, count, byCategory: byCat, topMerchants, topByCount };
    });
}

function AnimatedAmount({ value, size = 15 }: { value: number; size?: number }) {
  const animated = useCountUp(value);
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: size, color: 'var(--ink)' }}>
      {formatCOP(animated)}
    </span>
  );
}

const HEALTH_COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
const HEALTH_LABELS = ['Crítico', 'Regular', 'Bien', 'Excelente'];

export function Explorar({ transactions, loading, userId, onViewHistorial, onOpenChat }: Props) {
  const [activeBank, setActiveBank] = useState('Todos');
  const [compareMode, setCompareMode] = useState(false);
  const [merchantView, setMerchantView] = useState<'amount' | 'count'>('amount');
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsDismissedInflation, setAnalyticsDismissedInflation] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);

  useEffect(() => {
    if (!HAS_WEBHOOK_URL || !userId) return;
    fetchAnalytics(12).then(setAnalytics).catch(() => { /* silencioso: no romper la UI */ });
    fetchCards().then(setCards).catch(() => { /* silencioso: chips caen a solo-transacciones */ });
  }, [userId]);

  const bankList = useMemo(() => buildBankList(transactions, cards), [transactions, cards]);
  const allStats = useMemo(() => computeStats(transactions, activeBank), [transactions, activeBank]);
  const last6 = allStats.slice(-6);

  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [compareIdx, setCompareIdx] = useState<number>(-1);
  const [budgets, setBudgetsState] = useState<Record<string, number>>(() => getBudgets(userId));
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [sharedBudgets, setSharedBudgetsState] = useState<Record<string, number>>(() => getSharedBudgets());
  const [editingShared, setEditingShared] = useState<string | null>(null);
  const [sharedDraft, setSharedDraft] = useState('');
  const [addingShared, setAddingShared] = useState(false);
  const [newSharedCat, setNewSharedCat] = useState('');
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const displayIdx = selectedIdx >= 0 && selectedIdx < last6.length
    ? selectedIdx
    : last6.length - 1;

  const displayStats = last6[displayIdx];
  const compareStats = compareMode && compareIdx >= 0 && compareIdx < last6.length
    ? last6[compareIdx] : null;

  const maxBar = Math.max(...last6.map(s => s.total), 1);

  const healthScore = useMemo(() => computeHealthScore(transactions, userId), [transactions, userId]);
  const healthLevel = healthScore.score >= 80 ? 3 : healthScore.score >= 60 ? 2 : healthScore.score >= 40 ? 1 : 0;
  const healthColor = HEALTH_COLORS[healthLevel];
  const healthLabel = HEALTH_LABELS[healthLevel];

  const monthTxCurrent = useMemo(() => {
    const now = new Date();
    return transactions.filter(tx => {
      const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [transactions]);

  if (loading) {
    return (
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 100px', fontFamily: 'var(--font-body)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 2px' }}>Análisis</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 24px', letterSpacing: '-0.02em' }}>Insights</h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              height: 78, borderRadius: 'var(--r-xl)',
              background: 'linear-gradient(90deg, var(--line) 25%, #e2e8f0 50%, var(--line) 75%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.8s ease-in-out infinite',
            }} />
          ))}
        </div>
      </div>
    );
  }

  if (last6.length === 0) {
    return (
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 100px', fontFamily: 'var(--font-body)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 2px' }}>Análisis</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 24px', letterSpacing: '-0.02em' }}>Insights</h1>
        <FriendlyEmptyState
          title="Aún no hay datos para explorar"
          message="Con unas cuantas transacciones podré mostrar tendencias, categorías top y comercios frecuentes."
        />
      </div>
    );
  }

  const activeList = displayStats
    ? (merchantView === 'amount' ? displayStats.topMerchants : displayStats.topByCount)
    : [];

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 0', marginBottom: 16 }}>
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Análisis</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 14px', letterSpacing: '-0.02em' }}>Insights</h1>

        {/* Bank filter chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {bankList.map(b => {
            const active = b === activeBank;
            return (
              <motion.button
                key={b}
                whileTap={{ scale: 0.94 }}
                onClick={() => setActiveBank(b)}
                style={{
                  position: 'relative',
                  flexShrink: 0, padding: '5px 14px', borderRadius: 999,
                  border: `1.5px solid ${active ? 'transparent' : 'var(--line)'}`,
                  background: 'transparent',
                  color: active ? 'var(--blue-700)' : 'var(--ink-2)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                }}
              >
                {active && (
                  <motion.span
                    layoutId="explorar-bank-chip-bg"
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      background: 'var(--blue-50)',
                      border: '1.5px solid var(--blue-600)',
                    }}
                  />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{b}</span>
              </motion.button>
            );
          })}
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => {
            if (compareMode) {
              setCompareMode(false);
              setCompareIdx(-1);
            } else {
              const auto = displayIdx > 0 ? displayIdx - 1 : last6.length > 1 ? last6.length - 1 : -1;
              setCompareIdx(auto);
              setCompareMode(true);
            }
          }} style={{
            flexShrink: 0, padding: '5px 14px', borderRadius: 999,
            border: `1.5px solid ${compareMode ? 'var(--orange-500)' : 'var(--line)'}`,
            background: compareMode ? 'var(--orange-50)' : 'var(--card)',
            color: compareMode ? 'var(--orange-600)' : 'var(--ink-2)',
            fontSize: 13, fontWeight: compareMode ? 600 : 400,
            cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
          }}>Comparar</motion.button>
        </div>
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px' }}>

        {/* Health Score — primero para dar contexto */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowHealthDetail(v => !v)}
            style={{
              width: '100%', background: 'var(--card)', borderRadius: 'var(--r-xl)',
              padding: '14px 16px', boxShadow: 'var(--shadow-card)',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 14,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: `${healthColor}18`,
              border: `3px solid ${healthColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: healthColor }}>
                {healthScore.score}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 2 }}>
                Salud financiera: {healthLabel}
              </div>
              <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                <motion.div
                  animate={{ width: `${healthScore.score}%` }}
                  initial={{ width: 0 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', borderRadius: 999, background: healthColor }}
                />
              </div>
            </div>
            <span style={{ fontSize: 16, color: 'var(--muted)' }}>{showHealthDetail ? '▲' : '▼'}</span>
          </motion.button>

          <AnimatePresence>
            {showHealthDetail && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={quickEase}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ background: 'var(--card)', borderRadius: '0 0 var(--r-xl) var(--r-xl)', padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--ink)' }}>Cómo se calcula:</strong> presupuestos bajo control (40%), diversidad de canales (30%), % de transacciones categorizadas (30%).
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Weekly cash flow */}
        {monthTxCurrent.length > 0 && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <WeeklyCashFlow transactions={monthTxCurrent} />
          </motion.div>
        )}

        {/* Inflation Signal Banner */}
        <AnimatePresence>
          {analytics?.inflationSignal?.detected && !analyticsDismissedInflation && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={quickEase}
              style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', borderRadius: 'var(--r-xl)', padding: '14px 16px', marginBottom: 14, boxShadow: '0 2px 12px rgba(245,158,11,0.18)', border: '1px solid #fbbf24' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 3 }}>
                    Alerta: tu gasto sube cada mes
                  </div>
                  <div style={{ fontSize: 12, color: '#78350f', lineHeight: 1.5 }}>
                    {analytics.inflationSignal.message}
                  </div>
                  {analytics.inflationSignal.totals.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, overflowX: 'auto' }}>
                      {analytics.inflationSignal.months.map((m, i) => (
                        <div key={m} style={{ textAlign: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: '#92400e', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                            {formatCOP(analytics.inflationSignal.totals[i] || 0)}
                          </div>
                          <div style={{ fontSize: 9.5, color: '#b45309' }}>{m.slice(5)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setAnalyticsDismissedInflation(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#b45309', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Compare selector */}
        <AnimatePresence>
          {compareMode && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={quickEase}
              style={{ overflow: 'hidden', background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '12px 16px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}
            >
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                Comparar <span style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{displayStats?.label}</span> con:
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {last6.map((s, i) => i !== displayIdx && (
                  <motion.button key={s.key} whileTap={{ scale: 0.94 }} onClick={() => setCompareIdx(i)} style={{
                    padding: '4px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                    border: `1.5px solid ${compareIdx === i ? 'var(--orange-500)' : 'var(--line)'}`,
                    background: compareIdx === i ? 'var(--orange-50)' : 'var(--card)',
                    color: compareIdx === i ? 'var(--orange-600)' : 'var(--ink-2)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}>
                    {s.label}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bar chart */}
        <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 12px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>Últimos {last6.length} meses</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
            {last6.map((s, i) => {
              const isSelected = i === displayIdx;
              const isCompare = compareMode && i === compareIdx;
              const barH = maxBar > 0 ? Math.round(Math.max((s.total / maxBar) * 120, s.total > 0 ? 5 : 0)) : 0;
              return (
                <motion.div key={s.key} whileTap={{ scale: 0.96 }} onClick={() => {
                  if (compareMode && i !== displayIdx) setCompareIdx(i);
                  else { setSelectedIdx(i); if (compareMode) setCompareIdx(-1); }
                }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                  <span style={{
                    fontSize: 8.5, fontFamily: 'var(--font-mono)',
                    color: isSelected ? 'var(--blue-700)' : 'var(--muted)',
                    fontWeight: isSelected ? 700 : 400, whiteSpace: 'nowrap',
                    marginBottom: 4, opacity: s.total > 0 ? 1 : 0,
                  }}>
                    {formatCompact(s.total)}
                  </span>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: barH }}
                    transition={{ ...quickEase, delay: i * 0.035 }}
                    style={{
                      width: '100%', borderRadius: '6px 6px 0 0',
                      background: isSelected ? 'var(--grad-accent)' : isCompare ? 'rgba(249,115,22,0.5)' : 'var(--blue-100)',
                    }}
                  />
                  <span style={{ fontSize: 9.5, color: isSelected ? 'var(--blue-700)' : 'var(--muted-2)', fontWeight: isSelected ? 700 : 400, whiteSpace: 'nowrap', paddingTop: 5 }}>
                    {s.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {displayStats && (
          <>
            {/* KPI cards */}
            <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 14px 12px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Total gastado</div>
                <AnimatedAmount value={displayStats.total} />
                {compareStats && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>vs {formatCOP(compareStats.total)}</div>}
              </motion.div>
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 14px 12px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Transacciones</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{displayStats.count}</div>
                {compareStats && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>vs {compareStats.count}</div>}
              </motion.div>
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 14px 12px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Ticket promedio</div>
                {displayStats.count > 0
                  ? <AnimatedAmount value={Math.round(displayStats.total / displayStats.count)} />
                  : <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>—</span>}
              </motion.div>
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 14px 12px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Categoría top</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{displayStats.byCategory[0]?.name || '—'}</div>
              </motion.div>
            </motion.div>

            {/* Category breakdown */}
            {displayStats.byCategory.length > 0 && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 10px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 14 }}>Categorías</div>
                {displayStats.byCategory.map(({ name, color, amount }) => {
                  const barPct = displayStats.total > 0 ? (amount / displayStats.total) * 100 : 0;
                  const compareAmount = compareStats?.byCategory.find(c => c.name === name)?.amount;
                  return (
                    <motion.div key={name} whileTap={{ scale: 0.985 }} onClick={() => setDrillCategory(name)} style={{ marginBottom: 12, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>{name}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{barPct.toFixed(0)}%</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{formatCOP(amount)}</span>
                          {compareAmount != null && (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--muted)', display: 'block' }}>
                              vs {formatCOP(compareAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${barPct}%` }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', borderRadius: 999, background: color }} />
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                        {editingBudget === name ? (
                          <input
                            autoFocus type="number" value={budgetDraft}
                            onChange={e => setBudgetDraft(e.target.value)}
                            onBlur={() => {
                              const val = parseInt(budgetDraft, 10);
                              if (!isNaN(val) && val > 0) { setBudget(userId, name, val); } else { clearBudget(userId, name); }
                              setBudgetsState(getBudgets(userId));
                              setEditingBudget(null);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Presupuesto mensual"
                            style={{ width: 140, fontSize: 11.5, padding: '3px 8px', border: '1.5px solid var(--blue-600)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)', outline: 'none' }}
                          />
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingBudget(name); setBudgetDraft(budgets[name] ? String(budgets[name]) : ''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: budgets[name] ? 'var(--blue-700)' : 'var(--muted)', padding: 0, fontFamily: 'var(--font-body)' }}
                          >
                            {budgets[name] ? `✏ ${formatCOP(budgets[name])}` : '+ Presupuesto'}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}

            <SubscripcionesWidget transactions={transactions} />

            {/* Live subscriptions from backend */}
            {analytics && analytics.subscriptions.length > 0 && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 8px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 14 }}>
                  Suscripciones detectadas
                </div>
                {analytics.subscriptions.map((s, i) => (
                  <div key={s.comercio} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.comercio}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {formatCOP(s.monthlyAvg)}/mes · {formatCOP(s.annualCost)}/año · {s.occurrences} cobros
                      </div>
                    </div>
                    {s.cancelUrl && (
                      <a href={s.cancelUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: 'var(--blue-700)', fontWeight: 600, textDecoration: 'none', padding: '4px 10px', border: '1px solid var(--blue-300)', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        Cancelar
                      </a>
                    )}
                  </div>
                ))}
              </motion.div>
            )}

            {/* Top merchants */}
            {displayStats.topMerchants.length > 0 && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 8px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                    Top comercios — {displayStats.label}
                  </div>
                  <div style={{ display: 'flex', border: '1.5px solid var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                    {(['amount', 'count'] as const).map(v => (
                      <button key={v} onClick={() => setMerchantView(v)} style={{
                        padding: '4px 10px', border: 'none', cursor: 'pointer',
                        background: merchantView === v ? 'var(--blue-600)' : 'transparent',
                        color: merchantView === v ? '#fff' : 'var(--ink-2)',
                        fontSize: 11.5, fontWeight: merchantView === v ? 600 : 400,
                        fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                        transition: 'background 0.15s ease, color 0.15s ease',
                      }}>
                        {v === 'amount' ? 'Monto' : 'Transacciones'}
                      </button>
                    ))}
                  </div>
                </div>
                <AnimatePresence mode="popLayout">
                  {activeList.map(({ name, amount, count }, i) => {
                    const compareList = compareStats ? (merchantView === 'amount' ? compareStats.topMerchants : compareStats.topByCount) : null;
                    const cm = compareList?.find(m => m.name === name);
                    return (
                      <motion.div
                        key={name} layout
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ ...quickEase, delay: i * 0.03 }}
                        style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--blue-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--blue-700)', flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                              {merchantView === 'amount' ? `${count} transacción${count !== 1 ? 'es' : ''}` : formatCOP(amount)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--ink)', fontWeight: 600 }}>
                              {merchantView === 'amount' ? formatCOP(amount) : `${count} tx`}
                            </span>
                            {cm && (
                              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                vs {merchantView === 'amount' ? formatCOP(cm.amount) : `${cm.count} tx`}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            )}

            {/* By-Card breakdown from backend */}
            {analytics && analytics.byCard.length > 0 && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 8px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 14 }}>
                  Por tarjeta (12 meses)
                </div>
                {analytics.byCard.map((c, i) => {
                  const topCats = Object.entries(c.categories).sort(([,a],[,b]) => b - a).slice(0, 2);
                  return (
                    <div key={c.card} style={{ borderTop: i > 0 ? '1px solid var(--line)' : 'none', padding: '12px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.banco} ···{c.card.slice(-4)}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{c.count} tx · última: {c.lastActivity?.slice(0,10)}</div>
                          {topCats.length > 0 && (
                            <div style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 3 }}>
                              {topCats.map(([cat, amt]) => `${cat} ${formatCOP(amt)}`).join(' · ')}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{formatCOP(c.total)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}

            {/* Presupuesto del hogar */}
            {(Object.keys(sharedBudgets).length > 0 || addingShared) && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 14px', boxShadow: 'var(--shadow-card)', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 14 }}>
                  Presupuesto del hogar
                </div>
                {Object.entries(sharedBudgets).map(([cat, limit]) => {
                  const spent = displayStats.byCategory.find(c => c.name === cat)?.amount ?? 0;
                  const pct = Math.min(spent / limit, 1);
                  const over = spent > limit;
                  const barColor = over ? '#ef4444' : pct > 0.8 ? '#f59e0b' : 'var(--blue-600)';
                  return (
                    <div key={cat} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{cat}</span>
                        <span style={{ fontSize: 11.5, color: over ? '#ef4444' : 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                          {formatCOP(spent)} / {formatCOP(limit)}
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct * 100, 100)}%` }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} style={{ height: '100%', borderRadius: 999, background: barColor }} />
                      </div>
                      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                        {editingShared === cat ? (
                          <input autoFocus type="number" value={sharedDraft}
                            onChange={e => setSharedDraft(e.target.value)}
                            onBlur={() => {
                              const val = parseInt(sharedDraft, 10);
                              if (!isNaN(val) && val > 0) { setSharedBudget(cat, val); } else { clearSharedBudget(cat); }
                              setSharedBudgetsState(getSharedBudgets());
                              setEditingShared(null);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Límite mensual"
                            style={{ width: 140, fontSize: 11.5, padding: '3px 8px', border: '1.5px solid var(--blue-600)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)', outline: 'none' }}
                          />
                        ) : (
                          <button onClick={() => { setEditingShared(cat); setSharedDraft(String(limit)); }}
                            style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 10.5, color: 'var(--blue-700)', fontFamily: 'var(--font-body)' }}>
                            ✏ {formatCOP(limit)}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {addingShared ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <input autoFocus type="text" value={newSharedCat} onChange={e => setNewSharedCat(e.target.value)}
                      placeholder="Categoría"
                      style={{ flex: 1, height: 34, padding: '0 10px', border: '1.5px solid var(--blue-600)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
                    <input type="number" value={sharedDraft} onChange={e => setSharedDraft(e.target.value)} placeholder="Límite"
                      style={{ width: 100, height: 34, padding: '0 10px', border: '1.5px solid var(--blue-600)', borderRadius: 8, background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
                    <button onClick={() => {
                      const val = parseInt(sharedDraft, 10);
                      if (newSharedCat.trim() && !isNaN(val) && val > 0) { setSharedBudget(newSharedCat.trim(), val); setSharedBudgetsState(getSharedBudgets()); }
                      setAddingShared(false); setNewSharedCat(''); setSharedDraft('');
                    }} style={{ height: 34, padding: '0 12px', background: 'var(--blue-700)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>OK</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingShared(true)} style={{ marginTop: 4, background: 'none', border: '1px dashed var(--line)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)', width: '100%' }}>
                    + Agregar categoría
                  </button>
                )}
              </motion.div>
            )}
            {Object.keys(sharedBudgets).length === 0 && !addingShared && (
              <motion.button variants={riseItem} transition={quickEase} onClick={() => setAddingShared(true)}
                style={{ background: 'none', border: '1.5px dashed var(--line)', borderRadius: 'var(--r-2xl)', padding: '14px 16px', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-body)', width: '100%', textAlign: 'left', marginBottom: 14 }}>
                + Crear presupuesto del hogar
              </motion.button>
            )}
          </>
        )}

        {/* Comparativa mes a mes */}
        {!loading && (
          <motion.div variants={riseItem} style={{ margin: '0 0 16px', background: 'var(--card)', borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            <CategoryComparison transactions={transactions} />
          </motion.div>
        )}

        {/* Por día de semana */}
        {!loading && (
          <motion.div variants={riseItem} style={{ margin: '0 0 16px', background: 'var(--card)', borderRadius: 'var(--r-xl)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
            <WeekdayChart transactions={transactions} />
          </motion.div>
        )}

        {/* Hourly Heatmap from backend */}
        {analytics && Object.keys(analytics.hourlyHeatmap).length > 0 && (() => {
          const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
          const SLOTS = [
            { label: 'Madrugada', hours: [0,1,2,3,4,5] },
            { label: 'Mañana',    hours: [6,7,8,9,10,11] },
            { label: 'Tarde',     hours: [12,13,14,15,16,17] },
            { label: 'Noche',     hours: [18,19,20,21,22,23] },
          ];
          const hm = analytics.hourlyHeatmap;
          // slot×day totals
          const cells: number[][] = SLOTS.map(s =>
            DAYS.map(d => s.hours.reduce((sum, h) => sum + ((hm[String(h)] || {})[d] || 0), 0))
          );
          const maxCell = Math.max(...cells.flat(), 1);
          return (
            <motion.div variants={riseItem} style={{ margin: '0 0 16px', background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', overflow: 'hidden', padding: '18px 16px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 14 }}>
                Cuándo gastas más
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '72px repeat(7, 1fr)', gap: 3 }}>
                <div />
                {DAYS.map(d => (
                  <div key={d} style={{ fontSize: 9.5, color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{d}</div>
                ))}
                {SLOTS.map((slot, si) => (
                  <>
                    <div key={slot.label} style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center', lineHeight: 1.2 }}>{slot.label}</div>
                    {DAYS.map((d, di) => {
                      const val = cells[si][di];
                      const intensity = val / maxCell;
                      const alpha = Math.round(intensity * 0.85 * 255).toString(16).padStart(2,'0');
                      return (
                        <div key={d}
                          title={`${slot.label} ${d}: ${formatCOP(val)}`}
                          style={{
                            height: 28, borderRadius: 6,
                            background: val > 0 ? `#6366f1${alpha}` : 'var(--line)',
                            transition: 'background 0.2s',
                          }}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Menos</span>
                {[0.1, 0.35, 0.6, 0.85].map(a => (
                  <div key={a} style={{ width: 16, height: 10, borderRadius: 3, background: `rgba(99,102,241,${a})` }} />
                ))}
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>Más</span>
              </div>
            </motion.div>
          );
        })()}

        {/* Link al historial completo */}
        {onViewHistorial && (
          <motion.button
            variants={riseItem}
            whileTap={{ scale: 0.98 }}
            onClick={onViewHistorial}
            style={{
              width: '100%', padding: '14px 16px', marginBottom: 14,
              background: 'var(--card)', border: '1.5px solid var(--line)',
              borderRadius: 'var(--r-xl)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Ver historial completo</span>
            <span style={{ fontSize: 18, color: 'var(--muted)' }}>›</span>
          </motion.button>
        )}
      </motion.div>

      {onOpenChat && (
        <div style={{
          position: 'sticky', left: 0, right: 0,
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          margin: '4px 0 0', padding: '12px 20px',
          background: 'color-mix(in srgb, var(--surface) 90%, transparent)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--line)',
          display: 'flex', gap: 10, alignItems: 'center',
        }}>
          <input
            readOnly
            placeholder="Pregunta sobre tu dinero…"
            onFocus={e => { e.target.blur(); onOpenChat(); }}
            onClick={onOpenChat}
            style={{
              flex: 1, border: '1px solid var(--line)', background: 'var(--card)',
              borderRadius: 'var(--r-pill)', padding: '11px 16px',
              fontSize: 14, color: 'var(--ink)', fontFamily: 'var(--font-body)',
              outline: 'none', cursor: 'pointer',
            }}
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenChat}
            aria-label="Abrir asistente"
            style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
              background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer',
              display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-blue)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon name="send" size={18} />
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {drillCategory && (
          <CategorySheet
            category={drillCategory}
            transactions={transactions}
            onClose={() => setDrillCategory(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
