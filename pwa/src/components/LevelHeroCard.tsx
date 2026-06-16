import { motion } from 'framer-motion';
import { getGamification, getLevelProgress, NIVELES } from '../lib/gamification';
import { useCountUp } from '../lib/useCountUp';
import { quickEase } from '../lib/motion';

interface Props {
  userId: string;
}

export function LevelHeroCard({ userId }: Props) {
  const state = getGamification(userId);
  const { pct, xpToNext, nivelActual } = getLevelProgress(state);
  const nivelSig = NIVELES.find(n => n.nivel === state.nivel + 1);
  const animatedXP = useCountUp(state.xp);
  const xpMax = nivelSig ? nivelSig.xpMin : state.xp;
  const xpMin = nivelActual.xpMin;
  const xpCurrent = state.xp;

  const dashFill = Math.round(pct * 100);
  const dashEmpty = 100 - dashFill;

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 24,
      padding: '24px 20px 22px',
      boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)',
    }}>
      {/* Ring */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 176, height: 176 }}>
          <svg viewBox="0 0 36 36" style={{ width: 176, height: 176 }}>
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="3" />
            <motion.circle
              cx="18" cy="18" r="15.9155"
              fill="none"
              stroke="var(--blue)"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeDasharray={`${dashFill} ${dashEmpty}`}
              transform="rotate(-90 18 18)"
              initial={{ strokeDasharray: '0 100' }}
              animate={{ strokeDasharray: `${dashFill} ${dashEmpty}` }}
              transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
            <div style={{
              width: 50, height: 50, borderRadius: 16,
              background: 'linear-gradient(145deg, var(--blue-2), var(--blue))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(37,99,235,.3)',
            }}>
              <div style={{
                width: 18, height: 18, border: '2.5px solid #fff',
                borderRadius: 5, transform: 'rotate(45deg)',
              }} />
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '.14em', color: 'var(--muted)',
              textTransform: 'uppercase',
            }}>
              Nivel {state.nivel}
            </div>
          </div>
        </div>
      </div>

      {/* Level name + XP */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 26, color: 'var(--ink)', lineHeight: 1, marginBottom: 8,
        }}>
          {nivelActual.nombre}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 13,
          color: 'var(--ink-2)', fontWeight: 600, marginBottom: 4,
        }}>
          {animatedXP} / {xpMax} XP
        </div>
        {nivelSig ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            faltan{' '}
            <motion.b
              key={xpToNext}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={quickEase}
              style={{ color: 'var(--blue)' }}
            >
              {xpToNext} XP
            </motion.b>
            {' '}para subir a {nivelSig.nombre}
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: 'var(--orange)', fontWeight: 600 }}>
            Nivel máximo alcanzado
          </div>
        )}
      </div>
    </div>
  );
}
