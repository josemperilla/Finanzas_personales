import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { formatCOP } from '../lib/utils';
import { getCategoryColor } from '../lib/config';
import { softSpring } from '../lib/motion';

interface Props {
  transactions: Transaction[];
  userId: string;
  onClose: () => void;
}

interface RecapData {
  monthLabel: string;
  total: number;
  prevTotal: number;
  delta: number | null;
  topCategories: { name: string; amount: number; color: string }[];
}

function buildRecap(transactions: Transaction[]): RecapData {
  const now = new Date();
  // Previous month
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth();

  // Month before previous (for delta)
  const prev2Date = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prev2Year = prev2Date.getFullYear();
  const prev2Month = prev2Date.getMonth();

  const prevTxs = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  });

  const prev2Txs = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d.getFullYear() === prev2Year && d.getMonth() === prev2Month;
  });

  const total = prevTxs.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
  const prev2Total = prev2Txs.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
  const delta = prev2Total > 0 ? ((total - prev2Total) / prev2Total) * 100 : null;

  const catTotals: Record<string, number> = {};
  for (const tx of prevTxs) {
    const cat = tx.Categoría || 'Otro';
    catTotals[cat] = (catTotals[cat] || 0) + Number(tx['Monto (COP)'] || 0);
  }

  const topCategories = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({ name, amount, color: getCategoryColor(name) }));

  const monthLabel = prevDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  return { monthLabel, total, prevTotal: prev2Total, delta, topCategories };
}

// Tiny CSS confetti pieces rendered as divs
function Confetti() {
  const colors = ['#1d4ed8', '#f97316', '#15803d', '#be185d', '#6d28d9', '#eab308'];
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    left: `${(i * 37) % 100}%`,
    delay: `${(i * 0.11) % 1.2}s`,
    duration: `${1.0 + (i * 0.07) % 0.8}s`,
    size: 6 + (i % 4) * 2,
    rotate: (i * 47) % 360,
  }));

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(130px) rotate(720deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: p.left,
            top: 0,
            width: p.size,
            height: p.size * 0.5,
            background: p.color,
            borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

export function MonthRecapModal({ transactions, userId, onClose }: Props) {
  const recap = useRef(buildRecap(transactions)).current;
  const hasData = recap.total > 0;

  // Auto-dismiss after 12 s if user ignores it
  useEffect(() => {
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [onClose]);

  if (!hasData) { onClose(); return null; }

  const monthCapitalized = recap.monthLabel.charAt(0).toUpperCase() + recap.monthLabel.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 400, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={softSpring}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          background: 'var(--card)',
          borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0',
          padding: '24px 22px 44px',
          width: '100%',
          overflow: 'hidden',
        }}
      >
        <Confetti />

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20, position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🎉</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>
            Resumen de {monthCapitalized}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>
            Nuevo mes, nueva meta
          </div>
        </div>

        {/* Total */}
        <div style={{
          background: 'var(--surface)', borderRadius: 'var(--r-xl)',
          padding: '14px 18px', marginBottom: 16, textAlign: 'center',
          position: 'relative', zIndex: 1,
        }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Total gastado
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 24, color: 'var(--ink)' }}>
            {formatCOP(recap.total)}
          </div>
          {recap.delta !== null && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 6, padding: '3px 10px', borderRadius: 999,
              background: recap.delta <= 0 ? '#dcfce7' : '#fee2e2',
              color: recap.delta <= 0 ? '#15803d' : '#b91c1c',
              fontSize: 12, fontWeight: 600,
            }}>
              {recap.delta <= 0 ? '↓' : '↑'} {Math.abs(recap.delta).toFixed(0)}% vs mes anterior
            </div>
          )}
        </div>

        {/* Top categories */}
        {recap.topCategories.length > 0 && (
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Top categorías
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recap.topCategories.map((cat, i) => {
                const pct = recap.total > 0 ? (cat.amount / recap.total) * 100 : 0;
                return (
                  <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', width: 16 }}>
                      {i + 1}
                    </span>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{cat.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
                      {pct.toFixed(0)}%
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--ink)', width: 80, textAlign: 'right' }}>
                      {formatCOP(cat.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onClose}
          style={{
            marginTop: 22, width: '100%', padding: '13px 0',
            background: 'var(--blue-700)', color: 'white',
            border: 'none', borderRadius: 'var(--r-xl)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
            cursor: 'pointer', position: 'relative', zIndex: 1,
          }}
        >
          ¡A por este mes!
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
