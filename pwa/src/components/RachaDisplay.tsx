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
      aria-label={`Días bajo presupuesto diario: ${racha} días`}
    >
      <motion.span
        animate={{ scale, rotate: racha >= 7 ? [0, -5, 5, -3, 3, 0] : 0 }}
        transition={{ ...softSpring, rotate: { duration: 0.5, ease: 'easeInOut' } }}
        style={{ lineHeight: 1, opacity: !isActive ? 0.35 : 1, display: 'flex', alignItems: 'center' }}
      >
        <svg width="15" height="16" viewBox="0 0 24 24" fill={isActive ? 'var(--orange)' : 'var(--muted)'}>
          <path d="M12 2.5c.4 2.7 2.2 4.3 3.7 5.8 1.6 1.6 2.8 3.4 2.8 5.6a6.5 6.5 0 0 1-13 0c0-1.1.3-2.1.9-3 .3 1.1 1.2 1.9 2.4 1.9 1.4 0 2.3-1 2.3-2.4 0-1-.5-1.8-1-2.7C11.2 6.1 11.1 4.2 12 2.5Z" />
        </svg>
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
