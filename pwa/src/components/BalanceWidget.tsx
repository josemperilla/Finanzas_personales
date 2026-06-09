import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { CATEGORIES, getCategoryColor } from '../lib/config';
import { getRetos, computeProgress } from '../lib/retos';
import { RetoWidget } from './RetoWidget';

interface Props {
  transactions: Transaction[];
  userId: string;
  onAdd: () => void;
  onClose: () => void;
}

const fmt = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CO');

function monthBounds(offset = 0) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + offset;
  const start = new Date(y, m, 1);
  const end   = new Date(y, m + 1, 0, 23, 59, 59);
  return { start, end };
}

function daysInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

export function BalanceWidget({ transactions, userId, onAdd, onClose }: Props) {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth();
  const daysLeft = totalDays - dayOfMonth;
  const arcPct = dayOfMonth / totalDays;

  const { thisTotal, prevTotal, topCats, retos } = useMemo(() => {
    const { start: s0, end: e0 } = monthBounds(0);
    const { start: s1, end: e1 } = monthBounds(-1);

    const thisTxs = transactions.filter(tx => {
      const d = new Date(tx.Fecha || tx.Timestamp);
      return d >= s0 && d <= e0 && Number(tx['Monto (COP)']) > 0;
    });
    const prevTxs = transactions.filter(tx => {
      const d = new Date(tx.Fecha || tx.Timestamp);
      return d >= s1 && d <= e1 && Number(tx['Monto (COP)']) > 0;
    });

    const thisTotal = thisTxs.reduce((s, tx) => s + Number(tx['Monto (COP)']), 0);
    const prevTotal = prevTxs.reduce((s, tx) => s + Number(tx['Monto (COP)']), 0);

    const byCategory: Record<string, number> = {};
    for (const tx of thisTxs) {
      const cat = tx.Categoría || 'Otro';
      byCategory[cat] = (byCategory[cat] ?? 0) + Number(tx['Monto (COP)']);
    }
    const topCats = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const retosRaw = getRetos(userId);
    const retos = retosRaw
      .map(r => computeProgress(r, transactions))
      .filter(p => p.diasRestantes > 0 || !p.completed)
      .slice(0, 2);

    return { thisTotal, prevTotal, topCats, retos };
  }, [transactions, userId]);

  const delta = prevTotal > 0 ? ((thisTotal - prevTotal) / prevTotal) * 100 : null;
  const maxCat = topCats[0]?.[1] ?? 1;

  const CIRC = 125.66; // 2π×20
  const arcDash = arcPct * CIRC;

  const monthName = now.toLocaleString('es-CO', { month: 'long' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'var(--surface)',
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '56px 24px 8px' }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', textTransform: 'capitalize' }}>
          {monthName} {now.getFullYear()}
        </span>
        <button
          onClick={onClose}
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--line)', cursor: 'pointer', fontSize: 14, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '0 24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Total */}
        <div>
          <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontSize: 24, fontWeight: 600, verticalAlign: 'super', opacity: 0.5 }}>$</span>
            {Math.round(thisTotal).toLocaleString('es-CO')}
          </div>
          {delta !== null && (
            <div style={{ marginTop: 10 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                background: delta > 0 ? 'var(--red-bg, #fef2f2)' : 'var(--green-bg, #f0fdf4)',
                color: delta > 0 ? '#ef4444' : '#16a34a',
              }}>
                {delta > 0 ? '↑' : '↓'} {Math.abs(Math.round(delta))}% vs mes anterior
              </span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--line)' }} />

        {/* Top categorías */}
        {topCats.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Top categorías
            </div>
            {topCats.map(([cat, amount]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: getCategoryColor(cat), flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{cat}</span>
                <div style={{ width: 72, height: 4, background: 'var(--line)', borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ height: '100%', width: `${(amount / maxCat) * 100}%`, background: getCategoryColor(cat), borderRadius: 999 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', width: 80, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(amount)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Días restantes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
          <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="26" cy="26" r="20" stroke="var(--line)" strokeWidth="4.5" fill="none" />
              <circle cx="26" cy="26" r="20" stroke="#3b82f6" strokeWidth="4.5" fill="none"
                strokeDasharray={`${arcDash.toFixed(1)} ${CIRC}`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>
              {Math.round(arcPct * 100)}%
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Días restantes</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}>{daysLeft} días</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>de {totalDays} en {monthName}</div>
          </div>
        </div>

        {/* Retos activos */}
        {retos.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
              Mis retos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {retos.map(p => (
                <RetoWidget key={p.reto.id} progress={p} />
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onAdd}
          style={{
            width: '100%', height: 52, borderRadius: 16, border: 'none',
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'linear-gradient(135deg, var(--blue-700) 0%, var(--blue-800, #1d4ed8) 100%)',
            color: '#fff',
            boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
            fontFamily: 'var(--font-body)',
            marginTop: 4, marginBottom: 24,
          }}
        >
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 300, lineHeight: 1 }}>+</span>
          Agregar gasto
        </motion.button>
      </div>
    </motion.div>
  );
}
