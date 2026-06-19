import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, isGasto } from '../lib/api';
import { getMeta, setMeta } from '../lib/meta';
import { useCountUp } from '../lib/useCountUp';
import { formatCOP } from '../lib/utils';
import { quickEase } from '../lib/motion';

interface Props {
  monthTx: Transaction[];
  userId: string;
}

function daysLeftInMonth(): number {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return last.getDate() - now.getDate() + 1;
}

function progressColor(pct: number): string {
  if (pct >= 1) return 'var(--danger, #dc2626)';
  if (pct >= 0.9) return 'var(--warning, #b45309)';
  if (pct >= 0.7) return '#f59e0b';
  return 'var(--success, #16a34a)';
}

export function MetaMensualWidget({ monthTx, userId }: Props) {
  const [meta, setMetaState] = useState(() => getMeta(userId));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState<'saved' | null>(null);

  const gastoActual = monthTx.filter(isGasto).reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
  const animatedGasto = useCountUp(gastoActual);
  const animatedMeta = useCountUp(meta.monto);

  const pct = meta.monto > 0 ? gastoActual / meta.monto : 0;
  const sobrante = meta.monto - gastoActual;
  const diasRestantes = daysLeftInMonth();
  const presupuestoDiario = diasRestantes > 0 ? sobrante / diasRestantes : sobrante;
  const animatedDiario = useCountUp(Math.abs(presupuestoDiario));

  const handleActivar = useCallback(() => {
    setDraft('');
    setEditing(true);
    setMetaState(m => ({ ...m, activo: true }));
  }, []);

  const saveDraft = useCallback(() => {
    const val = parseInt(draft.replace(/\D/g, ''), 10);
    if (!isNaN(val) && val > 0) {
      const next = { monto: val, activo: true };
      setMeta(userId, next);
      setMetaState(next);
      setToast('saved');
      setTimeout(() => setToast(null), 2000);
    }
    setEditing(false);
  }, [draft, userId]);

  if (!meta.activo) {
    return (
      <motion.div variants={{ hidden: {}, visible: {} }} style={{ marginBottom: 14 }}>
        <button
          onClick={handleActivar}
          style={{
            width: '100%', padding: '12px 16px',
            background: 'var(--card)', border: '1.5px dashed var(--line)',
            borderRadius: 'var(--r-2xl)', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 13.5, fontFamily: 'var(--font-body)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <span>🎯</span>
          <span>Definir meta mensual →</span>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div style={{ marginBottom: 14 }}>
      <div style={{
        background: 'var(--card)',
        borderRadius: 24,
        border: '1px solid var(--line)',
        padding: '14px 16px',
        boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🎯</span> Meta mensual
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { setDraft(String(meta.monto)); setEditing(e => !e); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 14, padding: '0 2px',
            }}
          >
            <motion.span
              animate={{ rotate: editing ? 45 : 0 }}
              transition={quickEase}
              style={{ display: 'inline-block' }}
            >
              ✎
            </motion.span>
          </motion.button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginBottom: 10 }}>
          <motion.div
            animate={{ width: `${Math.min(pct, 1) * 100}%` }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            style={{
              height: '100%', borderRadius: 999,
              background: progressColor(pct),
              transition: 'background-color 0.4s',
            }}
          />
        </div>

        {/* Amounts row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
            {formatCOP(animatedGasto)} gastados
          </span>
          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={quickEase}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>meta:</span>
                <input
                  autoFocus
                  type="number"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveDraft();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  onBlur={saveDraft}
                  style={{
                    width: 120, height: 40, fontSize: 16, padding: '0 8px',
                    border: '1.5px solid var(--blue-600)', borderRadius: 8,
                    background: 'var(--surface)', color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </motion.div>
            ) : (
              <motion.span
                key="label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--muted)' }}
              >
                de {formatCOP(animatedMeta)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Daily budget line */}
        <div style={{
          fontSize: 12.5,
          color: presupuestoDiario >= 0 ? 'var(--ink-2)' : 'var(--danger, #dc2626)',
          fontFamily: 'var(--font-body)',
        }}>
          {presupuestoDiario >= 0 ? (
            <>Te quedan <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatCOP(animatedDiario)}/día</strong> para mantenerte en meta</>
          ) : (
            <>Superaste la meta en <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger, #dc2626)' }}>{formatCOP(animatedDiario)}</strong></>
          )}
        </div>

        <AnimatePresence>
          {toast === 'saved' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              style={{ marginTop: 8, fontSize: 11.5, color: 'var(--success, #16a34a)' }}
            >
              Meta actualizada ✓
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
