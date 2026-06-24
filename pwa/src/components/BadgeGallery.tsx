import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { riseItem, staggerContainer, quickEase, softSpring } from '../lib/motion';
import { BADGES, getGamification } from '../lib/gamification';

interface Props {
  userId: string;
}

const BADGE_GROUPS = [
  { label: 'Primeros pasos',       ids: ['primer-reto', 'primer-pdf', 'primera-meta', 'primer-sueno'] },
  { label: 'Racha de disciplina',  ids: ['racha-7', 'racha-30'] },
  { label: 'Retos y Sueños',       ids: ['reto-5', 'sueno-50', 'sueno-completo', 'cazador-suscripciones', 'presupuesto-perfecto'] },
  { label: 'Nivel de experiencia', ids: ['nivel-2', 'nivel-3', 'nivel-4', 'nivel-5'] },
  { label: 'Desafíos del mes',     ids: ['desafio-2026-01', 'desafio-2026-06', 'desafio-2026-07', 'desafio-2026-08', 'desafio-2026-11', 'desafio-2026-12'] },
];

const GRADIENT_MAP: Record<string, string> = {
  'primer-reto':           'linear-gradient(145deg, #60a5fa, #2563eb)',
  'primer-pdf':            'linear-gradient(145deg, #818cf8, #4f46e5)',
  'primera-meta':          'linear-gradient(145deg, #34d399, #059669)',
  'primer-sueno':          'linear-gradient(145deg, #38bdf8, #0ea5e9)',
  'racha-7':               'linear-gradient(145deg, #fb923c, #ea580c)',
  'racha-30':              'linear-gradient(145deg, #f97316, #c2410c)',
  'reto-5':                'linear-gradient(145deg, #a78bfa, #7c3aed)',
  'sueno-50':              'linear-gradient(145deg, #22d3ee, #0891b2)',
  'sueno-completo':        'linear-gradient(145deg, #fbbf24, #d97706)',
  'cazador-suscripciones': 'linear-gradient(145deg, #6b7280, #374151)',
  'presupuesto-perfecto':  'linear-gradient(145deg, #a3e635, #65a30d)',
  'nivel-2':               'linear-gradient(145deg, #4ade80, #16a34a)',
  'nivel-3':               'linear-gradient(145deg, #818cf8, #4f46e5)',
  'nivel-4':               'linear-gradient(145deg, #fb923c, #ea580c)',
  'nivel-5':               'linear-gradient(145deg, #fbbf24, #d97706)',
};

export function BadgeGallery({ userId }: Props) {
  const state = getGamification(userId);
  const total = Object.keys(BADGES).length;
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);

  const selectedData = selectedBadge ? BADGES[selectedBadge] : null;
  const isUnlockedSelected = selectedBadge ? state.badges.includes(selectedBadge) : false;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
          Logros
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
          {state.badges.length} / {total}
        </span>
      </div>

      {/* Grouped badge sections */}
      {BADGE_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            {group.label}
          </div>
          <motion.div
            variants={staggerContainer} initial="initial" animate="animate"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}
          >
            {group.ids.map(id => {
              const badge = BADGES[id];
              if (!badge) return null;
              const isUnlocked = state.badges.includes(id);
              const gradient = GRADIENT_MAP[id];

              return (
                <motion.button
                  key={id}
                  variants={riseItem}
                  transition={quickEase}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setSelectedBadge(id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 18,
                    background: isUnlocked && gradient ? gradient : 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isUnlocked ? '0 4px 12px rgba(0,0,0,0.18)' : 'none',
                    fontSize: isUnlocked ? 26 : 22,
                    opacity: isUnlocked ? 1 : 0.45,
                    transition: 'all 0.2s ease',
                  }}>
                    {badge.emoji}
                  </div>
                  <span style={{
                    fontSize: 9.5, color: isUnlocked ? 'var(--ink-2)' : 'var(--muted)',
                    textAlign: 'center', lineHeight: 1.25, maxWidth: 60,
                    fontWeight: isUnlocked ? 600 : 400,
                  }}>
                    {badge.nombre}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      ))}

      {/* Badge detail bottom sheet */}
      <AnimatePresence>
        {selectedBadge && selectedData && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setSelectedBadge(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 300 }}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={softSpring}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 301,
                background: 'var(--surface)',
                borderRadius: '24px 24px 0 0',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 999, background: 'var(--line)' }} />
              </div>

              <div style={{ padding: '16px 28px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
                {/* Big emoji */}
                <div style={{
                  width: 80, height: 80, borderRadius: 26,
                  background: isUnlockedSelected && GRADIENT_MAP[selectedBadge]
                    ? GRADIENT_MAP[selectedBadge]
                    : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 38,
                  boxShadow: isUnlockedSelected ? '0 8px 24px rgba(0,0,0,0.2)' : 'none',
                  opacity: isUnlockedSelected ? 1 : 0.55,
                }}>
                  {selectedData.emoji}
                </div>

                {/* Name */}
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>
                  {selectedData.nombre}
                </div>

                {/* Divider */}
                <div style={{ width: '100%', height: 1, background: 'var(--line)' }} />

                {/* How to earn */}
                <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 280 }}>
                  {selectedData.hint}
                </div>

                {/* Status pill */}
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 999,
                  background: isUnlockedSelected ? 'rgba(16,185,129,0.12)' : 'var(--surface-2)',
                  border: `1px solid ${isUnlockedSelected ? '#6ee7b7' : 'var(--line)'}`,
                  fontSize: 13, fontWeight: 600,
                  color: isUnlockedSelected ? '#059669' : 'var(--muted)',
                }}>
                  {isUnlockedSelected ? '✅ Ganada' : '🔒 Pendiente'}
                </div>
              </div>

              {/* Close button */}
              <div style={{ padding: '12px 20px 0' }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelectedBadge(null)}
                  style={{
                    width: '100%', height: 48, background: 'var(--line)', border: 'none',
                    borderRadius: 16, color: 'var(--ink-2)', fontSize: 15,
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Cerrar
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
