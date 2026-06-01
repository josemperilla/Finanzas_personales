import { motion } from 'framer-motion';
import { quickEase } from '../../lib/motion';

interface Props {
  message: string;
  onRetry?: () => void;
}

export function ConnectionNotice({ message, onRetry }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={quickEase}
      style={{
        margin: '0 16px 14px',
        padding: '12px 14px',
        borderRadius: 14,
        background: '#fff7ed',
        border: '1px solid var(--orange-100)',
        color: 'var(--orange-600)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: '#fed7aa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        flexShrink: 0,
      }}>
        !
      </span>
      <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.35, fontWeight: 600 }}>{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            border: 'none',
            background: 'rgba(234,88,12,0.1)',
            color: 'var(--orange-600)',
            borderRadius: 999,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      )}
    </motion.div>
  );
}
