import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';
import { getGamification } from '../lib/gamification';
import { useEffect, useState } from 'react';

interface Props {
  userId: string;
  onPress?: () => void;
  gamificationKey?: number;
}

export function RachaDisplay({ userId, onPress, gamificationKey }: Props) {
  const [racha, setRacha] = useState(0);

  useEffect(() => {
    const state = getGamification(userId);
    setRacha(state.racha);
  }, [userId, gamificationKey]);

  const scale = racha === 0 ? 0.8 : racha >= 30 ? 1.3 : racha >= 7 ? 1.1 : 1.0;

  const isActive = racha > 0;

  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onPress}
      style={{
        background: isActive ? 'var(--orange-soft)' : 'var(--surface-2)',
        border: isActive ? '1px solid rgba(234,88,12,.18)' : '1px solid var(--line)',
        borderRadius: 999,
        padding: '6px 12px 6px 8px',
        cursor: onPress ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: 5,
        WebkitTapHighlightColor: 'transparent',
      }}
      aria-label={`Racha: ${racha} días consecutivos`}
    >
      <motion.span
        animate={{ scale, rotate: racha >= 7 ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ ...softSpring, rotate: { duration: 0.5, ease: 'easeInOut' } }}
        style={{ fontSize: 16, lineHeight: 1, filter: !isActive ? 'grayscale(1) opacity(0.4)' : 'none', display: 'block' }}
      >
        🔥
      </motion.span>
      <motion.span
        key={racha}
        initial={{ scale: 1.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={softSpring}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: isActive ? 'var(--orange)' : 'var(--muted)', letterSpacing: '-0.01em', lineHeight: 1 }}
      >
        {racha}
      </motion.span>
    </motion.button>
  );
}
