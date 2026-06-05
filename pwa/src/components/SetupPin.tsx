import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { setupPin } from '../lib/api';
import { quickEase, softSpring } from '../lib/motion';
import { getProfile } from '../lib/profiles';

interface Props {
  userId: string;
  onComplete: () => void;
  onSwitchProfile: () => void;
}

const rows = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['', '0','⌫'],
];

type Step = 'enter' | 'confirm';

export function SetupPin({ userId, onComplete, onSwitchProfile }: Props) {
  const profile = getProfile(userId);
  const [step, setStep]       = useState<Step>('enter');
  const [first, setFirst]     = useState('');
  const [digits, setDigits]   = useState('');
  const [status, setStatus]   = useState<'idle'|'saving'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function handleDigit(key: string) {
    if (status !== 'idle') return;
    if (key === '⌫') { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 6) return;
    const next = digits + key;
    setDigits(next);
    if (next.length >= 4) tryAdvance(next);
  }

  async function tryAdvance(d: string) {
    if (d.length < 4) return;

    if (step === 'enter') {
      setFirst(d);
      setDigits('');
      setStep('confirm');
      return;
    }

    // confirm step
    if (d !== first) {
      setStatus('error');
      setErrorMsg('Los PINs no coinciden. Intenta de nuevo.');
      setTimeout(() => {
        setStatus('idle');
        setErrorMsg('');
        setFirst('');
        setDigits('');
        setStep('enter');
      }, 1400);
      return;
    }

    setStatus('saving');
    try {
      await setupPin(userId, d);
      onComplete();
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Error al guardar PIN');
      setTimeout(() => { setStatus('idle'); setErrorMsg(''); setDigits(''); }, 1600);
    }
  }

  const dotColor = status === 'error' ? '#ef4444' : 'var(--blue-600)';

  return (
    <motion.div
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 32,
        padding: 'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Avatar + nombre */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'var(--grad-brand)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--card)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28,
        }}>
          {profile?.initial ?? userId.charAt(0).toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
          Hola, {profile?.name ?? userId}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)', textAlign: 'center', maxWidth: 260 }}>
          {step === 'enter'
            ? 'Crea un PIN de 4 a 6 dígitos para proteger tu cuenta'
            : 'Ingresa el PIN otra vez para confirmarlo'}
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <motion.div
          animate={status === 'error'
            ? { x: [-12,12,-8,8,-4,4,0], transition: { duration: 0.44, ease: 'easeOut' } }
            : { x: 0 }}
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
              style={{ width: 13, height: 13, borderRadius: '50%', border: '2.5px solid rgba(15,23,42,0.22)' }}
            />
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {status === 'saving' && (
            <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }}
            />
          )}
          {status === 'error' && (
            <motion.span key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ fontSize: 'var(--text-xs)', color: '#ef4444', fontFamily: 'var(--font-body)', textAlign: 'center', maxWidth: 220 }}>
              {errorMsg}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: '100%', maxWidth: 300 }}>
        {rows.flat().map((key, idx) =>
          key === '' ? <div key={idx} /> : (
            <motion.button
              key={idx}
              whileTap={{ scale: status !== 'idle' ? 1 : 0.88 }}
              onClick={() => handleDigit(key)}
              disabled={status !== 'idle'}
              style={{
                height: 76, borderRadius: 9999,
                background: key === '⌫' ? 'transparent' : 'var(--card)',
                border: key === '⌫' ? 'none' : '1px solid rgba(15,23,42,0.06)',
                boxShadow: key === '⌫' ? 'none' : 'var(--shadow-card)',
                color: key === '⌫' ? 'var(--muted)' : 'var(--ink)',
                fontFamily: key === '⌫' ? 'var(--font-body)' : 'var(--font-display)',
                fontSize: key === '⌫' ? 22 : 28,
                fontWeight: key === '⌫' ? 400 : 600,
                cursor: status !== 'idle' ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.02em',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {key}
            </motion.button>
          )
        )}
      </div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...quickEase, delay: 0.2 }}
        onClick={onSwitchProfile}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)',
          padding: '12px 16px', borderRadius: 8, minHeight: 'var(--touch-min)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Volver
      </motion.button>
    </motion.div>
  );
}
