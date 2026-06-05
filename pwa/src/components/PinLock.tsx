import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validatePin } from '../lib/api';
import { softSpring, quickEase } from '../lib/motion';
import { getProfile, getUserNickname, getUserAvatar } from '../lib/profiles';

const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = [0, 0, 0, 0, 0, 30_000, 300_000, 1_800_000]; // 30s, 5m, 30m after 5/6/7+ fails

interface Props {
  userId: string;
  onUnlock: () => void;
  onSwitchProfile: () => void;
}

function lockoutKey(userId: string) { return `fm_pin_lockout_${userId}`; }

function getLockoutState(userId: string): { attempts: number; lockedUntil: number } {
  try {
    return JSON.parse(sessionStorage.getItem(lockoutKey(userId)) || '{"attempts":0,"lockedUntil":0}');
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}
function saveLockoutState(userId: string, s: { attempts: number; lockedUntil: number }) {
  sessionStorage.setItem(lockoutKey(userId), JSON.stringify(s));
}

export function PinLock({ userId, onUnlock, onSwitchProfile }: Props) {
  const profile = getProfile(userId);
  const displayName = getUserNickname(userId) || profile?.name || 'Finanzas';
  const avatarSrc = getUserAvatar(userId) || profile?.avatar || '/profile-avatar.jpg';
  const [digits, setDigits] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'validating' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('Contraseña incorrecta');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const digitsRef = useRef<string[]>([]);
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise lockout countdown on mount
  useEffect(() => {
    const state = getLockoutState(userId);
    const remaining = Math.max(0, state.lockedUntil - Date.now());
    if (remaining > 0) startLockCountdown(remaining);
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, [userId]);

  function startLockCountdown(ms: number) {
    setLockSecondsLeft(Math.ceil(ms / 1000));
    lockTimerRef.current = setInterval(() => {
      setLockSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(lockTimerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const handleDigit = useCallback((d: string) => {
    if (status !== 'idle' || lockSecondsLeft > 0) return;
    const cur = digitsRef.current;
    if (cur.length >= 4) return;
    const next = [...cur, d];
    digitsRef.current = next;
    setDigits(next);

    if (next.length === 4) {
      setStatus('validating');
      validatePin(next.join(''), userId).then(({ ok, error }) => {
        if (ok) {
          // Reset lockout on success
          saveLockoutState(userId, { attempts: 0, lockedUntil: 0 });
          setStatus('success');
          setTimeout(onUnlock, 520);
        } else {
          const prev = getLockoutState(userId);
          const attempts = prev.attempts + 1;
          const lockoutMs = LOCKOUT_MS[Math.min(attempts, LOCKOUT_MS.length - 1)];
          const lockedUntil = lockoutMs > 0 ? Date.now() + lockoutMs : 0;
          saveLockoutState(userId, { attempts, lockedUntil });

          setStatus('error');
          if (lockoutMs > 0) {
            const mins = Math.round(lockoutMs / 60_000);
            setErrorMsg(`Demasiados intentos. Bloqueado ${mins < 1 ? '30 segundos' : `${mins} minutos`}.`);
          } else {
            setErrorMsg(error || `PIN incorrecto (${attempts}/${MAX_ATTEMPTS})`);
          }
          setTimeout(() => {
            setStatus('idle');
            setDigits([]);
            digitsRef.current = [];
            if (lockedUntil > 0) startLockCountdown(lockedUntil - Date.now());
          }, 750);
        }
      }).catch((err: unknown) => {
        setStatus('error');
        setErrorMsg(err instanceof Error ? err.message : 'Error de conexión. Intenta de nuevo.');
        setTimeout(() => { setStatus('idle'); setDigits([]); digitsRef.current = []; }, 1000);
      });
    }
  }, [status, lockSecondsLeft, onUnlock]);

  const handleDelete = useCallback(() => {
    if (status !== 'idle' || lockSecondsLeft > 0) return;
    setDigits(prev => {
      const next = prev.slice(0, -1);
      digitsRef.current = next;
      return next;
    });
  }, [status, lockSecondsLeft]);

  const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];
  const isLocked = lockSecondsLeft > 0;

  const dotColor = status === 'success' ? '#22c55e'
    : status === 'error' ? '#ef4444'
    : isLocked ? '#94a3b8'
    : 'var(--blue-700)';

  return (
    <motion.div
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ y: '-100%', transition: { duration: 0.52, ease: [0.76, 0, 0.24, 1] } }}
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
        <div style={{
          width: 82, height: 82, borderRadius: '50%',
          margin: '0 auto 18px',
          background: avatarFailed ? 'var(--grad-brand)' : 'var(--card)',
          border: '3px solid #fff',
          boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--card)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28,
        }}>
          {avatarFailed ? (profile?.initial ?? userId.charAt(0).toUpperCase()) : (
            <img
              src={avatarSrc}
              alt={displayName}
              onError={() => setAvatarFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
            />
          )}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 5 }}>
          {displayName}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          {isLocked ? `Bloqueado — ${lockSecondsLeft}s` : 'Ingresa tu contraseña'}
        </div>
      </motion.div>

      {/* Dots + status */}
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
              style={{ width: 13, height: 13, borderRadius: '50%', border: '2.5px solid rgba(15,23,42,0.22)' }}
            />
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {status === 'validating' && (
            <motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }}
            />
          )}
          {status === 'error' && (
            <motion.span key="error" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ fontSize: 'var(--text-xs)', color: '#ef4444', fontFamily: 'var(--font-body)', textAlign: 'center', maxWidth: 220 }}>
              {errorMsg}
            </motion.span>
          )}
          {isLocked && status === 'idle' && (
            <motion.span key="locked" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', fontFamily: 'var(--font-body)' }}>
              Espera {lockSecondsLeft}s para intentar de nuevo
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Numpad */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...quickEase, delay: 0.18 }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: '100%', maxWidth: 300 }}
      >
        {rows.flat().map((key, idx) =>
          key === '' ? <div key={idx} /> : (
            <motion.button
              key={idx}
              whileTap={{ scale: isLocked || status !== 'idle' ? 1 : 0.88 }}
              onClick={() => key === '⌫' ? handleDelete() : handleDigit(key)}
              disabled={isLocked || status !== 'idle'}
              style={{
                height: 76, borderRadius: 9999,
                background: key === '⌫' ? 'transparent' : 'var(--card)',
                border: key === '⌫' ? 'none' : '1px solid rgba(15,23,42,0.06)',
                boxShadow: key === '⌫' ? 'none' : 'var(--shadow-card)',
                color: isLocked ? '#cbd5e1' : key === '⌫' ? 'var(--muted)' : 'var(--ink)',
                fontFamily: key === '⌫' ? 'var(--font-body)' : 'var(--font-display)',
                fontSize: key === '⌫' ? 22 : 28,
                fontWeight: key === '⌫' ? 400 : 600,
                cursor: isLocked || status !== 'idle' ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.02em',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {key}
            </motion.button>
          )
        )}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...quickEase, delay: 0.3 }}
        onClick={onSwitchProfile}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)',
          padding: '12px 16px', borderRadius: 8, minHeight: 'var(--touch-min)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Cambiar usuario
      </motion.button>
    </motion.div>
  );
}
