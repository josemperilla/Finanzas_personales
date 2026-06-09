import { motion } from 'framer-motion';
import { RetoProgress } from '../lib/retos';
import { formatCOP } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { quickEase } from '../lib/motion';

interface Props {
  progress: RetoProgress;
  onDelete: () => void;
}

const TIPO_LABEL: Record<string, string> = {
  budget_limit:    'Límite de gasto',
  frequency_limit: 'Límite de frecuencia',
  no_spend:        'Sin gastos',
};

// CSS confetti (same approach as MonthRecapModal)
function Confetti() {
  const pieces = Array.from({ length: 20 }, (_, i) => i);
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444'];
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', borderRadius: 'var(--r-xl)' }}>
      {pieces.map(i => (
        <motion.div
          key={i}
          initial={{ y: -10, x: `${(i / pieces.length) * 100}%`, opacity: 1, rotate: 0 }}
          animate={{ y: 80, opacity: 0, rotate: 360 * (i % 2 === 0 ? 1 : -1) }}
          transition={{ duration: 1.2 + (i % 4) * 0.15, delay: i * 0.04, ease: 'easeIn' }}
          style={{
            position: 'absolute', top: 0,
            width: 6, height: 6,
            borderRadius: i % 3 === 0 ? '50%' : 2,
            background: colors[i % colors.length],
          }}
        />
      ))}
    </div>
  );
}

export function RetoCard({ progress, onDelete }: Props) {
  const { reto, current, pct, failed, completed, diasRestantes } = progress;

  const catColor = reto.categoria ? getCategoryColor(reto.categoria) : 'var(--blue-700)';
  const catExists = CATEGORIES.some(c => c.name === reto.categoria);

  const barColor = failed
    ? '#ef4444'
    : pct > 0.8
      ? '#f59e0b'
      : 'var(--blue-700)';

  const statusBg   = completed ? '#f0fdf4' : failed ? '#fef2f2' : 'var(--surface)';
  const statusText = completed ? '#16a34a' : failed  ? '#ef4444'  : 'var(--muted)';

  const goalLabel = reto.tipo === 'frequency_limit'
    ? `${Math.round(current)} / ${reto.objetivo} tx`
    : reto.tipo === 'no_spend'
      ? current > 0 ? formatCOP(current) : 'Sin gastos ✓'
      : `${formatCOP(Math.round(current))} / ${formatCOP(reto.objetivo)}`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={quickEase}
      style={{
        position: 'relative',
        background: statusBg,
        borderRadius: 'var(--r-xl)',
        padding: '14px 14px 12px',
        border: `1.5px solid ${completed ? '#bbf7d0' : failed ? '#fecaca' : 'var(--line)'}`,
        overflow: 'hidden',
      }}
    >
      {completed && <Confetti />}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {reto.titulo}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{TIPO_LABEL[reto.tipo]}</span>
            {reto.categoria && catExists && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: `${catColor}18`, color: catColor, fontWeight: 600 }}>
                {reto.categoria}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* Progress bar (hidden for no_spend if not failed) */}
      {reto.tipo !== 'no_spend' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: '100%', borderRadius: 999, background: barColor }}
            />
          </div>
        </div>
      )}

      {/* Footer row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: statusText }}>
          {goalLabel}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {completed
            ? '✓ Completado'
            : failed
              ? '✗ Límite superado'
              : diasRestantes === 0
                ? 'Hoy termina'
                : `${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''}`}
        </span>
      </div>
    </motion.div>
  );
}
