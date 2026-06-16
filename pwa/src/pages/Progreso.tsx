import { motion } from 'framer-motion';
import { staggerContainer, riseItem, quickEase } from '../lib/motion';
import { LevelHeroCard } from '../components/LevelHeroCard';
import { RachaCalendarCard } from '../components/RachaCalendarCard';
import { CirculosBienestar } from '../components/CirculosBienestar';
import { BadgeGallery } from '../components/BadgeGallery';
import { getGamification } from '../lib/gamification';
import { getRetos, computeProgress } from '../lib/retos';
import type { Transaction } from '../lib/api';
import type { RetoProgress } from '../lib/retos';

interface Props {
  userId: string;
  transactions: Transaction[];
}

export function Progreso({ userId, transactions }: Props) {
  const state = getGamification(userId);
  const retosProgress: RetoProgress[] = getRetos(userId).map(r => computeProgress(r, transactions));
  const retosCompletados = retosProgress.filter(p => p.completed).length;
  const rachaMax = state.racha;

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: 100 }}>
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 0', marginBottom: 20 }}>
        <p style={{ margin: '0 0 3px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-body)' }}>
          Mi aventura
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          Progreso
        </h1>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{ padding: '0 16px' }}
      >
        {/* Hero card con nivel y XP */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <LevelHeroCard userId={userId} />
        </motion.div>

        {/* Racha con mini-calendario */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <RachaCalendarCard userId={userId} />
        </motion.div>

        {/* Círculos de bienestar expandidos */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <div style={{
            background: 'var(--card)', borderRadius: 24, border: '1px solid var(--line)',
            padding: '18px 16px', boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 16 }}>
              Hábitos de esta semana
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <CirculosBienestar
                userId={userId}
                monthTx={transactions.filter(tx => {
                  const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                })}
                retosProgress={retosProgress}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { label: 'Presupuesto', color: '#ef4444', desc: 'Dentro del límite diario' },
                { label: 'Reto', color: '#22c55e', desc: 'Completar reto activo' },
                { label: 'Registro', color: '#3b82f6', desc: '3 visitas esta semana' },
              ].map(c => (
                <div key={c.label} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, margin: '0 auto 4px' }} />
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.3 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Estadísticas mini */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Retos ✓', value: retosCompletados },
              { label: 'Racha 🔥', value: `${rachaMax}d` },
              { label: 'XP 🏅', value: state.xp },
            ].map(stat => (
              <div key={stat.label} style={{
                background: 'var(--card)', borderRadius: 'var(--r-xl)',
                padding: '14px 10px', boxShadow: 'var(--shadow-card)',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1, marginBottom: 4 }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Galería de badges */}
        <motion.div variants={riseItem} transition={quickEase}>
          <div style={{
            background: 'var(--card)', borderRadius: 24, border: '1px solid var(--line)',
            padding: '18px 16px', boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)',
          }}>
            <BadgeGallery userId={userId} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
