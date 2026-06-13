import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';
import { getGamification } from '../lib/gamification';
import { useEffect, useState } from 'react';

interface Props {
  userId: string;
  onPress?: () => void;
}

export function RachaDisplay({ userId, onPress }: Props) {
  const [racha, setRacha] = useState(0);

  useEffect(() => {
    const state = getGamification(userId);
    setRacha(state.racha);
  }, [userId]);

  const scale = racha === 0 ? 0.8 : racha >= 30 ? 1.3 : racha >= 7 ? 1.1 : 1.0;

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onPress}
      style={{
        background: 'none', border: 'none', padding: 0,
        cursor: onPress ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}
      aria-label={`Racha: ${racha} días consecutivos`}
    >
      <motion.div
        animate={{ scale, rotate: racha >= 7 ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ ...softSpring, rotate: { duration: 0.5, ease: 'easeInOut' } }}
        style={{ fontSize: racha >= 7 ? 28 : 24, lineHeight: 1, filter: racha === 0 ? 'grayscale(1) opacity(0.4)' : 'none' }}
      >
        🔥
      </motion.div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <motion.span
          key={racha}
          initial={{ scale: 1.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={softSpring}
          style={{ fontSize: 16, fontWeight: 800, color: racha > 0 ? 'var(--ink)' : 'var(--muted)', lineHeight: 1.1 }}
        >
          {racha}
        </motion.span>
        <span style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {racha === 1 ? 'día' : 'días'}
        </span>
      </div>
    </motion.button>
  );
}
