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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(160deg, #0f172a 0%, #1a3055 55%, #0f172a 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-between',
        padding: 'max(56px, env(safe-area-inset-top)) 32px max(48px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Icon + title */}
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...quickEase, delay: 0.12 }}
        style={{ textAlign: 'center' }}
      >
        <div style={{
          width: 68, height: 68, borderRadius: 20,
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          boxShadow: '0 12px 36px rgba(59,130,246,0.35)',
          margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 34,
        }}>
          💳
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 22, color: '#fff', letterSpacing: '-0.01em', marginBottom: 5,
        }}>
          Finanzas
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 14,
          color: 'rgba(255,255,255,0.48)',
        }}>
          Ingresa tu contraseña
        </div>
      </motion.div>

      {/* Dots + error message */}
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
                backgroundColor:
                  status === 'success' ? '#22c55e' :
                  status === 'error' ? '#ef4444' :
                  digits.length > i ? '#fff' : 'rgba(255,255,255,0)',
                borderColor:
                  status === 'error' ? '#ef4444' :
                  status === 'success' ? '#22c55e' :
                  digits.length > i ? '#fff' : 'rgba(255,255,255,0.32)',
              }}
              transition={softSpring}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                border: '2.5px solid rgba(255,255,255,0.32)',
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
              whileTap={{ scale: 0.87, opacity: 0.65 }}
              onClick={() => key === '⌫' ? handleDelete() : handleDigit(key)}
              style={{
                height: 78, borderRadius: 9999,
                background: key === '⌫' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                border: '1.5px solid rgba(255,255,255,0.1)',
                color: '#fff',
                fontFamily: key === '⌫' ? 'var(--font-body)' : 'var(--font-display)',
                fontSize: key === '⌫' ? 22 : 30,
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
