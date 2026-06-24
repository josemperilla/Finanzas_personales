import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { setupPin } from '../lib/api';
import { quickEase, softSpring } from '../lib/motion';
import { getProfile } from '../lib/profiles';

interface Props {
  userId: string;
  inviteCode?: string;
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

export function SetupPin({ userId, inviteCode, onComplete, onSwitchProfile }: Props) {
  const profile = getProfile(userId);
  const [step, setStep]       = useState<Step>('enter');
  const [first, setFirst]     = useState('');
  const [digits, setDigits]   = useState('');
  const [status, setStatus]   = useState<'idle'|'saving'|'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  function handleDigit(key: string) {
    if (status !== 'idle') return;
    if (key === '⌫') { setDigits(d => d.slice(0, -1)); return; }
    if (digits.length >= 4) return;
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
      await setupPin(userId, d, inviteCode);
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
      {/* Step indicator — progress bar + counter */}
      <div style={{ width: '100%', maxWidth: 300, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
          <motion.div
            animate={{ width: step === 'enter' ? '50%' : '100%' }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', background: 'var(--blue)', borderRadius: 999 }}
          />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--muted)', flexShrink: 0 }}>
          {step === 'enter' ? '1/2' : '2/2'}
        </span>
      </div>

      {/* Icon + título */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 24,
          background: 'var(--blue-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 23, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          {step === 'enter' ? 'Crear PIN' : 'Confirmar PIN'}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: status === 'error' ? '#ef4444' : 'var(--muted)', textAlign: 'center', maxWidth: 260 }}>
          {status === 'error'
            ? 'Los PIN no coinciden, intentá de nuevo'
            : step === 'enter'
              ? 'Elige 4 dígitos para proteger tu cuenta'
              : 'Repetí el PIN para confirmarlo'}
        </div>
      </div>

      {/* Dots */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <motion.div
          animate={status === 'error'
            ? { x: [-12,12,-8,8,-4,4,0], transition: { duration: 0.44, ease: 'easeOut' } }
            : { x: 0 }}
          style={{ display: 'flex', gap: 22 }}
        >
          {[0,1,2,3].map(i => (
            <motion.div
              key={i}
              animate={{
                scale: digits.length > i ? 1.12 : 1,
                backgroundColor: digits.length > i ? dotColor : 'var(--surface-2)',
                borderColor: digits.length > i ? dotColor : 'var(--line)',
              }}
              transition={softSpring}
              style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--line)' }}
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
                height: 72, borderRadius: 9999,
                background: key === '⌫' ? 'transparent' : 'var(--surface-2)',
                border: 'none',
                boxShadow: 'none',
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
