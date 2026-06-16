import { motion } from 'framer-motion';
import { staggerContainer, riseItem, quickEase } from '../lib/motion';
import { LevelHeroCard } from '../components/LevelHeroCard';
import { RachaCalendarCard } from '../components/RachaCalendarCard';
import { CirculosBienestar } from '../components/CirculosBienestar';
import { BadgeGallery } from '../components/BadgeGallery';
import { getGamification } from '../lib/gamification';
import { getRetos, computeProgress } from '../lib/retos';
import { getUserNickname, getProfile } from '../lib/profiles';
import type { Transaction } from '../lib/api';
import type { RetoProgress } from '../lib/retos';

interface Props {
  userId: string;
  transactions: Transaction[];
}

export function Progreso({ userId, transactions }: Props) {
  const state = getGamification(userId);
  const retosProgress: RetoProgress[] = getRetos(userId).map(r => computeProgress(r, transactions));
  const displayName = getUserNickname(userId) || getProfile(userId)?.name || userId;

  const monthTx = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 0', marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          margin: '10px 0 0',
        }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 26, color: 'var(--ink)', letterSpacing: '-0.01em',
          }}>
            Progreso
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: 999,
            background: 'var(--blue-soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 14, color: 'var(--blue)',
          }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{ padding: '0 16px' }}
      >
        {/* Ring hero — nivel + XP */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <LevelHeroCard userId={userId} />
        </motion.div>

        {/* Racha con calendario de 7 días */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <RachaCalendarCard userId={userId} />
        </motion.div>

        {/* Círculos de Bienestar */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 24,
            padding: '20px',
            boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 8px 22px rgba(16,18,28,.06)',
          }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: 15, color: 'var(--ink)', marginBottom: 16,
            }}>
              Círculos de Bienestar
            </div>
            <CirculosBienestar
              userId={userId}
              monthTx={monthTx}
              retosProgress={retosProgress}
            />
          </div>
        </motion.div>

        {/* Logros */}
        <motion.div variants={riseItem} transition={quickEase}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 24,
            padding: '20px',
            boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 8px 22px rgba(16,18,28,.06)',
          }}>
            <BadgeGallery userId={userId} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
