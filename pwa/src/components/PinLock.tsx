import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { softSpring, quickEase } from '../lib/motion';

const PIN = '2810';

interface Props {
  onUnlock: () => void;
}

export function PinLock({ onUnlock }: Props) {
  const [digits, setDigits] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [avatarFailed, setAvatarFailed] = useState(false);

  const handleDigit = useCallback((d: string) => {
    if (status !== 'idle') return;
    if (digits.length >= 4) return;
    const next = [...digits, d];
    setDigits(next);
    if (next.length === 4) {
      if (next.join('') === PIN) {
        setStatus('success');
        setTimeout(onUnlock, 520);
      } else {
        setStatus('error');
        setTimeout(() => { setStatus('idle'); setDigits([]); }, 750);
      }
    }
  }, [digits, status, onUnlock]);

  const handleDelete = useCallback(() => {
    if (status !== 'idle') return;
    setDigits(d => d.slice(0, -1));
  }, [status]);

  const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];

  const dotColor = status === 'success' ? '#22c55e' : status === 'error' ? '#ef4444' : 'var(--blue-700)';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        padding: 'max(56px, env(safe-area-inset-top)) 32px max(48px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Avatar + title */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...quickEase, delay: 0.12 }}
        style={{ textAlign: 'center' }}
      >
        {/* Profile photo */}
        <div style={{
          width: 82, height: 82, borderRadius: '50%',
          margin: '0 auto 18px',
          background: avatarFailed ? 'var(--grad-brand)' : '#fff',
          border: '3px solid #fff',
          boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28,
        }}>
          {avatarFailed ? 'J' : (
            <img
              src="/profile-avatar.jpg"
              alt="Perfil"
              onError={() => setAvatarFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          )}
        </div>

        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 5,
        }}>
          Finanzas
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: 'var(--muted)',
        }}>
          Ingresa tu contraseña
        </div>
      </motion.div>

      {/* Dots + error */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <motion.div
          animate={status === 'error'
            ? { x: [-14, 14, -10, 10, -5, 5, 0], transition: { duration: 0.46, ease: 'easeOut' } }
            : { x: 0 }
          }
          style={{ display: 'flex', gap: 20 }}
        >
          {[0,1,2,3].map(i => (
            <motion.div
              key={i}
              animate={{
                scale: digits.length > i ? 1.18 : 1,
                backgroundColor: digits.length > i ? dotColor : 'rgba(0,0,0,0)',
                borderColor: digits.length > i ? dotColor : 'rgba(15,23,42,0.22)',
              }}
              transition={softSpring}
              style={{
                width: 13, height: 13, borderRadius: '50%',
                border: '2.5px solid rgba(15,23,42,0.22)',
              }}
            />
          ))}
        </motion.div>

        <AnimatePresence>
          {status === 'error' && (
            <motion.span
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={quickEase}
              style={{ fontSize: 13, color: '#ef4444', fontFamily: 'var(--font-body)' }}
            >
              Contraseña incorrecta
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Numpad */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...quickEase, delay: 0.18 }}
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14, width: '100%', maxWidth: 300,
        }}
      >
        {rows.flat().map((key, idx) =>
          key === '' ? <div key={idx} /> : (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.88 }}
              onClick={() => key === '⌫' ? handleDelete() : handleDigit(key)}
              style={{
                height: 76, borderRadius: 9999,
                background: key === '⌫' ? 'transparent' : '#fff',
                border: key === '⌫' ? 'none' : '1px solid rgba(15,23,42,0.06)',
                boxShadow: key === '⌫' ? 'none' : 'var(--shadow-card)',
                color: key === '⌫' ? 'var(--muted)' : 'var(--ink)',
                fontFamily: key === '⌫' ? 'var(--font-body)' : 'var(--font-display)',
                fontSize: key === '⌫' ? 22 : 28,
                fontWeight: key === '⌫' ? 400 : 600,
                cursor: 'pointer', letterSpacing: '-0.02em',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {key}
            </motion.button>
          )
        )}
      </motion.div>
    </motion.div>
  );
}
