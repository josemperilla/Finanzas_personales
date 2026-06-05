import { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { formatCOP } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { useCountUp } from '../lib/useCountUp';
import { quickEase, riseItem, staggerContainer } from '../lib/motion';
import { getBudgets, setBudget, clearBudget } from '../lib/budgets';
import { CategorySheet } from '../components/CategorySheet';


interface Props {
  transactions: Transaction[];
  loading: boolean;
  userId: string;
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

const BANKS = ['Todos', 'Bogotá', 'Itaú', 'Otro'];

function getMonthKey(dateStr: string): string {
  return (dateStr || '').slice(0, 7);
}

function shortLabel(key: string): string {
  if (!key) return '';
  const [y, m] = key.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${months[parseInt(m) - 1]}. ${y.slice(2)}`;
}

function computeStats(txs: Transaction[], bank: string): MonthStats[] {
  const filtered = bank === 'Todos' ? txs : txs.filter(tx => {
    if (bank === 'Otro') return tx.Banco !== 'Bogotá' && tx.Banco !== 'Itaú';
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
      const topMerchants = [...merchantEntries].sort((a, b) => b.amount - a.amount).slice(0, 5);
      const topByCount   = [...merchantEntries].sort((a, b) => b.count - a.count).slice(0, 5);

      return { key, label: shortLabel(key), total, count, byCategory: byCat, topMerchants, topByCount };
    });
}

// Animated COP amount — uses countup hook inside a component so it can be used in map()
function AnimatedAmount({ value, size = 15 }: { value: number; size?: number }) {
  const animated = useCountUp(value);
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: size, color: 'var(--ink)' }}>
      {formatCOP(animated)}
    </span>
  );
}

export function Analisis({ transactions, loading, userId }: Props) {
  const [activeBank, setActiveBank] = useState('Todos');
  const [compareMode, setCompareMode] = useState(false);
  const [merchantView, setMerchantView] = useState<'amount' | 'count'>('amount');

  const allStats = useMemo(() => computeStats(transactions, activeBank), [transactions, activeBank]);
  const last6 = allStats.slice(-6);

  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [compareIdx, setCompareIdx] = useState<number>(-1);
  const [budgets, setBudgetsState] = useState<Record<string, number>>(() => getBudgets(userId));
  const [editingBudget, setEditingBudget] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState('');
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const displayIdx = selectedIdx >= 0 && selectedIdx < last6.length
    ? selectedIdx
    : last6.length - 1;

  const displayStats = last6[displayIdx];
  const compareStats = compareMode && compareIdx >= 0 && compareIdx < last6.length
    ? last6[compareIdx] : null;

  const maxBar = Math.max(...last6.map(s => s.total), 1);

  if (loading) {
    return (
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 100px', fontFamily: 'var(--font-body)' }}>
        <p style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 2px' }}>Estadísticas</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 24px', letterSpacing: '-0.02em' }}>Análisis</h1>
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
        <p style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 2px' }}>Estadísticas</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 24px', letterSpacing: '-0.02em' }}>Análisis</h1>
        <FriendlyEmptyState
          title="Aún no hay análisis"
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
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Estadísticas</p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: '0 0 14px', letterSpacing: '-0.02em' }}>Análisis</h1>

        {/* Bank filter chips — sliding indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {BANKS.map(b => {
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
                    layoutId="analisis-bank-chip-bg"
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
              const auto = displayIdx > 0
                ? displayIdx - 1
                : last6.length > 1 ? last6.length - 1 : -1;
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

        {/* Compare banner — visible when both months selected */}
        <AnimatePresence>
          {compareMode && displayStats && compareStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={quickEase}
              style={{
                overflow: 'hidden', marginTop: 10,
                padding: '8px 14px', borderRadius: 999,
                background: 'linear-gradient(to right, var(--blue-50), var(--orange-50))',
                border: '1.5px solid var(--line)',
                fontSize: 12.5, fontWeight: 500, color: 'var(--ink-2)',
                textAlign: 'center',
              }}
            >
              Comparando{' '}
              <span style={{ fontWeight: 700, color: 'var(--blue-700)' }}>{displayStats.label}</span>
              {' '}con{' '}
              <span style={{ fontWeight: 700, color: 'var(--orange-600)' }}>{compareStats.label}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px' }}>
        {/* Compare month selector — shown above chart so it's easy to find */}
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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {last6.map((s, i) => {
              const isSelected = i === displayIdx;
              const isCompare = compareMode && i === compareIdx;
              const heightPct = (s.total / maxBar) * 100;
              return (
                <motion.div key={s.key} whileTap={{ scale: 0.96 }} onClick={() => {
                  if (compareMode && i !== displayIdx) {
                    setCompareIdx(i);
                  } else {
                    setSelectedIdx(i);
                    if (compareMode) setCompareIdx(-1);
                  }
                }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <motion.div
                    initial={{ height: '4%' }}
                    animate={{ height: `${Math.max(heightPct, 4)}%` }}
                    transition={{ ...quickEase, delay: i * 0.035 }}
                    style={{
                      width: '100%', borderRadius: '6px 6px 0 0',
                      background: isSelected ? 'var(--grad-accent)' : isCompare ? 'rgba(249,115,22,0.35)' : 'var(--line)',
                      transition: 'all 0.2s ease', minHeight: 4,
                    }}
                  />
                  <span style={{ fontSize: 9.5, color: isSelected ? 'var(--blue-700)' : 'var(--muted-2)', fontWeight: isSelected ? 700 : 400, whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Chart legend — shows when comparing */}
        <AnimatePresence>
          {compareMode && displayStats && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={quickEase}
              style={{ overflow: 'hidden', display: 'flex', gap: 16, justifyContent: 'center', padding: '4px 0 10px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--blue-600)', flexShrink: 0 }} />
                {displayStats.label}
              </div>
              {compareStats && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(249,115,22,0.7)', flexShrink: 0 }} />
                  {compareStats.label}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* KPI cards with animated amounts */}
        {displayStats && (
          <>
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
                  : <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>—</span>
                }
                {compareStats && compareStats.count > 0 && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>vs {formatCOP(compareStats.total / compareStats.count)}</div>}
              </motion.div>

              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 14px 12px', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Categoría top</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{displayStats.byCategory[0]?.name || '—'}</div>
                {compareStats && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{compareStats.byCategory[0]?.name || '—'}</div>}
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
                    <motion.div
                      key={name}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => setDrillCategory(name)}
                      style={{ marginBottom: 12, cursor: 'pointer' }}
                    >
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
                      {/* Budget editor */}
                      <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                        {editingBudget === name ? (
                          <input
                            autoFocus
                            type="number"
                            value={budgetDraft}
                            onChange={e => setBudgetDraft(e.target.value)}
                            onBlur={() => {
                              const val = parseInt(budgetDraft, 10);
                              if (!isNaN(val) && val > 0) { setBudget(userId, name, val); } else { clearBudget(userId, name); }
                              setBudgetsState(getBudgets(userId));
                              setEditingBudget(null);
                            }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            placeholder="Presupuesto mensual"
                            style={{
                              width: 140, fontSize: 11.5, padding: '3px 8px',
                              border: '1.5px solid var(--blue-600)', borderRadius: 8,
                              background: 'var(--surface)', color: 'var(--ink)',
                              fontFamily: 'var(--font-body)', outline: 'none',
                            }}
                          />
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); setEditingBudget(name); setBudgetDraft(budgets[name] ? String(budgets[name]) : ''); }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              fontSize: 10.5, color: budgets[name] ? 'var(--blue-700)' : 'var(--muted)',
                              padding: 0, fontFamily: 'var(--font-body)',
                            }}
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

            {/* Top merchants — animated reorder */}
            {displayStats.topMerchants.length > 0 && (
              <motion.div variants={riseItem} transition={quickEase} style={{ background: 'var(--card)', borderRadius: 'var(--r-2xl)', padding: '18px 16px 8px', boxShadow: 'var(--shadow-card)' }}>
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

                {/* Rows with layout reorder animation */}
                <AnimatePresence mode="popLayout">
                  {activeList.map(({ name, amount, count }, i) => {
                    const compareList = compareStats
                      ? (merchantView === 'amount' ? compareStats.topMerchants : compareStats.topByCount)
                      : null;
                    const cm = compareList?.find(m => m.name === name);
                    return (
                      <motion.div
                        key={name}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
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
                              {merchantView === 'amount'
                                ? `${count} transacción${count !== 1 ? 'es' : ''}`
                                : formatCOP(amount)}
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
          </>
        )}
      </motion.div>

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
