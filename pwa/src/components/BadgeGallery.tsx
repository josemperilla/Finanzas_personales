import { motion } from 'framer-motion';
import { riseItem, staggerContainer, quickEase } from '../lib/motion';
import { BADGES, getGamification } from '../lib/gamification';

interface Props {
  userId: string;
}

const FLAME_PATH = 'M12 2.5c.4 2.7 2.2 4.3 3.7 5.8 1.6 1.6 2.8 3.4 2.8 5.6a6.5 6.5 0 0 1-13 0c0-1.1.3-2.1.9-3 .3 1.1 1.2 1.9 2.4 1.9 1.4 0 2.3-1 2.3-2.4 0-1-.5-1.8-1-2.7C11.2 6.1 11.1 4.2 12 2.5Z';

const BADGE_VISUAL: Record<string, { gradient: string; shadow: string; icon: React.ReactNode }> = {
  'primer-gasto': {
    gradient: 'linear-gradient(145deg, var(--blue-2), var(--blue))',
    shadow: '0 5px 12px rgba(37,99,235,.25)',
    icon: <div style={{ width: 16, height: 16, border: '2.4px solid #fff', borderRadius: 4, transform: 'rotate(45deg)' }} />,
  },
  'racha-7': {
    gradient: 'linear-gradient(145deg, var(--orange-2), var(--orange))',
    shadow: '0 5px 12px rgba(234,88,12,.25)',
    icon: <svg width="20" height="22" viewBox="0 0 24 24" fill="#fff"><path d={FLAME_PATH} /></svg>,
  },
  'racha-30': {
    gradient: 'linear-gradient(145deg, var(--orange), #c2410c)',
    shadow: '0 5px 12px rgba(234,88,12,.3)',
    icon: <svg width="20" height="22" viewBox="0 0 24 24" fill="#fff"><path d={FLAME_PATH} /></svg>,
  },
  'nivel-2': {
    gradient: 'linear-gradient(145deg, #4f9df6, var(--blue-2))',
    shadow: '0 5px 12px rgba(59,130,246,.22)',
    icon: <div style={{ width: 17, height: 17, border: '2.6px solid #fff', borderRadius: '50%' }} />,
  },
  'nivel-3': {
    gradient: 'linear-gradient(145deg, #6366f1, #4f46e5)',
    shadow: '0 5px 12px rgba(99,102,241,.25)',
    icon: <div style={{ width: 16, height: 16, border: '2.4px solid #fff', borderRadius: 4, transform: 'rotate(45deg)' }} />,
  },
  'nivel-4': {
    gradient: 'linear-gradient(145deg, var(--orange-2), var(--orange))',
    shadow: '0 5px 12px rgba(234,88,12,.25)',
    icon: <div style={{ width: 17, height: 17, border: '2.6px solid #fff', borderRadius: '50%' }} />,
  },
  'nivel-5': {
    gradient: 'linear-gradient(145deg, #f59e0b, #d97706)',
    shadow: '0 5px 12px rgba(245,158,11,.3)',
    icon: <div style={{ width: 16, height: 16, border: '2.4px solid #fff', borderRadius: 4, transform: 'rotate(45deg)' }} />,
  },
};

const LOCKED_ICON = (
  <div style={{ width: 14, height: 11, border: '2.2px solid var(--muted)', borderRadius: '3px 3px 3px 3px', borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
);

export function BadgeGallery({ userId }: Props) {
  const state = getGamification(userId);
  const total = Object.keys(BADGES).length;
  const unlocked = state.badges.length;

  const entries = Object.entries(BADGES).slice(0, 5);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
          Logros
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
          {unlocked} / {total}
        </span>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        {entries.map(([id, badge]) => {
          const isUnlocked = state.badges.includes(id);
          const visual = BADGE_VISUAL[id];

          return (
            <motion.div
              key={id}
              variants={riseItem}
              transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: isUnlocked && visual ? visual.gradient : 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: isUnlocked && visual ? visual.shadow : 'none',
              }}>
                {isUnlocked
                  ? (visual?.icon ?? <div style={{ width: 16, height: 16, border: '2.4px solid #fff', borderRadius: 4, transform: 'rotate(45deg)' }} />)
                  : LOCKED_ICON
                }
              </div>
              <span style={{
                fontSize: 9.5,
                color: isUnlocked ? 'var(--ink-2)' : 'var(--muted)',
                textAlign: 'center', lineHeight: 1.2, maxWidth: 52,
              }}>
                {isUnlocked ? badge.nombre : badge.hint.split(' ').slice(0, 3).join(' ')}
              </span>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
