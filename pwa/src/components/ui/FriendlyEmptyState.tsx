import { motion } from 'framer-motion';
import { quickEase, softSpring } from '../../lib/motion';

interface Props {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function FriendlyEmptyState({ title, message, actionLabel, onAction }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={quickEase}
      style={{
        background: '#fff',
        borderRadius: 'var(--r-2xl)',
        boxShadow: 'var(--shadow-card)',
        padding: '26px 20px',
        textAlign: 'center',
        color: 'var(--muted)',
      }}
    >
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          width: 48,
          height: 48,
          borderRadius: 16,
          margin: '0 auto 14px',
          background: 'var(--blue-50)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--blue-700)',
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 22,
        }}
      >
        +
      </motion.div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)', fontSize: 16, marginBottom: 6 }}>
        {title}
      </div>
      <p style={{ margin: '0 auto', maxWidth: 260, fontSize: 13, lineHeight: 1.45 }}>{message}</p>
      {actionLabel && onAction && (
        <motion.button
          whileTap={{ scale: 0.96 }}
          transition={softSpring}
          onClick={onAction}
          style={{
            marginTop: 16,
            border: 'none',
            borderRadius: 13,
            background: 'var(--blue-700)',
            color: '#fff',
            padding: '11px 16px',
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            boxShadow: 'var(--shadow-blue)',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </motion.button>
      )}
    </motion.div>
  );
}
