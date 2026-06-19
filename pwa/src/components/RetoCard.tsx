import { memo } from 'react';
import { motion } from 'framer-motion';
import { RetoProgress } from '../lib/retos';
import { formatCOP } from '../lib/utils';
import { getCategoryColor } from '../lib/config';
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

function TargetChips({ reto }: { reto: RetoProgress['reto'] }) {
  const cats  = reto.categorias?.length ? reto.categorias : (reto.categoria ? [reto.categoria] : []);
  const mercs = reto.comercios ?? [];
  const all   = [
    ...cats.map(c  => ({ label: c,  type: 'cat'  as const })),
    ...mercs.map(m => ({ label: m,  type: 'merc' as const })),
  ];

  if (all.length === 0) {
    return (
      <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
        Todos los gastos
      </span>
    );
  }

  const visible  = all.slice(0, 3);
  const overflow = all.length - 3;

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map(({ label, type }) => {
        const color = type === 'cat' ? getCategoryColor(label) : '#64748b';
        return (
          <span
            key={`${type}-${label}`}
            style={{
              fontSize: 11, padding: '1px 7px', borderRadius: 999,
              background: `${color}18`, color,
              fontWeight: 600,
            }}
          >
            {type === 'merc' && '🏪 '}{label}
          </span>
        );
      })}
      {overflow > 0 && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>y {overflow} más</span>
      )}
    </div>
  );
}

export const RetoCard = memo(function RetoCard({ progress, onDelete }: Props) {
  const { reto, current, pct, failed, completed, diasRestantes } = progress;

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

  const headerBg = completed
    ? 'linear-gradient(100deg, #15803d 0%, #16a34a 100%)'
    : failed
      ? 'linear-gradient(100deg, #b91c1c 0%, #dc2626 100%)'
      : 'linear-gradient(100deg, var(--blue) 0%, #1d4fd0 100%)';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={quickEase}
      style={{
        position: 'relative',
        borderRadius: 20,
        border: '1px solid var(--line)',
        overflow: 'hidden',
      }}
    >
      {completed && <Confetti />}

      {/* Blue gradient header */}
      <div style={{ background: headerBg, padding: '16px 18px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: reto.tipo !== 'no_spend' ? 12 : 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 600, marginBottom: 3 }}>
              {TIPO_LABEL[reto.tipo]}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {reto.titulo}
            </div>
            <div style={{ marginTop: 4 }}><TargetChips reto={reto} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: '#fff' }}>
              {diasRestantes === 0 ? 'Hoy' : `${diasRestantes}d`}
            </span>
            <button
              onClick={onDelete}
              style={{ background: 'rgba(255,255,255,.18)', border: 'none', cursor: 'pointer', fontSize: 14, color: '#fff', width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Progress bar in header */}
        {reto.tipo !== 'no_spend' && (
          <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct * 100, 100)}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: '100%', borderRadius: 999, background: 'var(--orange-2)' }}
            />
          </div>
        )}
      </div>

      {/* Surface footer */}
      <div style={{ background: 'var(--card)', padding: '14px 18px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: reto.tipo !== 'no_spend' ? 0 : 0 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Progreso</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: statusText }}>
            {goalLabel}
          </span>
        </div>
        <div style={{ fontSize: 11, color: completed ? 'var(--good)' : failed ? '#ef4444' : 'var(--muted)', marginTop: 4 }}>
          {completed ? '✓ Completado' : failed ? '✗ Límite superado' : diasRestantes === 0 ? 'Termina hoy' : `${diasRestantes} día${diasRestantes !== 1 ? 's' : ''} restante${diasRestantes !== 1 ? 's' : ''}`}
        </div>
      </div>
    </motion.div>
  );
});
