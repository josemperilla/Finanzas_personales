import { motion } from 'framer-motion';
import { riseItem, staggerContainer } from '../lib/motion';
import { BADGES, getGamification, getLevelProgress, NIVELES } from '../lib/gamification';
import { useCountUp } from '../lib/useCountUp';

interface Props {
  userId: string;
}

export function BadgeGallery({ userId }: Props) {
  const state = getGamification(userId);
  const { pct, xpToNext, nivelActual } = getLevelProgress(state);
  const nivelSig = NIVELES.find(n => n.nivel === state.nivel + 1);
  const animatedXP = useCountUp(state.xp);

  return (
    <div>
      {/* XP Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            {nivelActual.nombre} · Nivel {state.nivel}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {animatedXP} XP
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <motion.div
            animate={{ width: `${pct * 100}%` }}
            initial={{ width: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', background: 'var(--blue-600, #2563eb)', borderRadius: 8 }}
          />
        </div>
        {nivelSig ? (
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {xpToNext} XP para <strong>{nivelSig.nombre}</strong>
          </p>
        ) : (
          <p style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>
            👑 Nivel máximo alcanzado
          </p>
        )}
      </div>

      {/* Galería de badges */}
      <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Insignias
      </h4>
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}
      >
        {Object.entries(BADGES).map(([id, badge]) => {
          const unlocked = state.badges.includes(id);
          return (
            <motion.div
              key={id}
              variants={riseItem}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '12px 6px',
                background: unlocked ? 'var(--bg)' : 'var(--line)',
                borderRadius: 14,
                opacity: unlocked ? 1 : 0.55,
                transition: 'opacity 0.3s',
              }}
            >
              <span style={{ fontSize: 26, filter: unlocked ? 'none' : 'grayscale(1)' }}>
                {unlocked ? badge.emoji : '🔒'}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: unlocked ? 'var(--ink)' : 'var(--muted)',
                textAlign: 'center', lineHeight: 1.2,
              }}>
                {unlocked ? badge.nombre : badge.hint}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
