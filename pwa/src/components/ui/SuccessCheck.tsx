import { motion } from 'framer-motion';
import { softSpring } from '../../lib/motion';

export function SuccessCheck({ size = 22 }: { size?: number }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      initial={{ scale: 0.65, opacity: 0, rotate: -8 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={softSpring}
      style={{ display: 'block' }}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="10"
        fill="rgba(255,255,255,0.18)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
      <motion.path
        d="M7 12.4l3.1 3.1L17.4 8"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.32, delay: 0.12, ease: 'easeOut' }}
      />
    </motion.svg>
  );
}
