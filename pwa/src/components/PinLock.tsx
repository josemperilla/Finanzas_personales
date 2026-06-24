import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validatePin } from '../lib/api';
import { softSpring, quickEase } from '../lib/motion';
import { getProfile, getUserNickname, getUserAvatar } from '../lib/profiles';
import {
  isBiometricSupported, hasBiometric, registerBiometric, authenticateBiometric,
} from '../lib/webauthn';

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

  // Biometría
  const bioSupported  = isBiometricSupported();
  const bioRegistered = hasBiometric(userId);
  const [bioLoading, setBioLoading]     = useState(false);
  const [showBioPrompt, setShowBioPrompt] = useState(false); // oferta de registro post-PIN

  // Initialise lockout countdown on mount
  useEffect(() => {
    const state = getLockoutState(userId);
    const remaining = Math.max(0, state.lockedUntil - Date.now());
    if (remaining > 0) startLockCountdown(remaining);
    return () => { if (lockTimerRef.current) clearInterval(lockTimerRef.current); };
  }, [userId]);

  // Auto-intento biométrico al abrir si hay credencial guardada
  useEffect(() => {
    if (!bioRegistered) return;
    handleBioAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBioAuth() {
    setBioLoading(true);
    const ok = await authenticateBiometric(userId);
    setBioLoading(false);
    if (ok) {
      saveLockoutState(userId, { attempts: 0, lockedUntil: 0 });
      setStatus('success');
      setTimeout(onUnlock, 520);
    }
  }

  async function activateBiometric() {
    const ok = await registerBiometric(userId);
    setShowBioPrompt(false);
    if (ok) onUnlock();
    else onUnlock(); // igual desbloqueamos aunque falle el registro
  }

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
          if (bioSupported && !bioRegistered) {
            setTimeout(() => setShowBioPrompt(true), 520);
          } else {
            setTimeout(onUnlock, 520);
          }
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
            setErrorMsg(error || `PIN incorrecto · te quedan ${MAX_ATTEMPTS - attempts} intento${MAX_ATTEMPTS - attempts !== 1 ? 's' : ''}`);
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

  const dotColor = status === 'success' ? 'var(--good)'
    : status === 'error' ? '#ef4444'
    : isLocked ? 'var(--muted)'
    : 'var(--blue-600)';

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
        style={{ textAlign: 'center', width: '100%' }}
      >
        {/* Brand logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 36 }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="8" cy="11" r="8" fill="var(--blue-600)" />
            <circle cx="14" cy="11" r="8" fill="var(--orange)" fillOpacity="0.85" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Gestor
          </span>
        </div>

        <div style={{
          width: 82, height: 82, borderRadius: '50%',
          margin: '0 auto 18px',
          background: avatarFailed ? 'var(--blue-100)' : 'var(--card)',
          border: '3px solid var(--line)',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--blue-600)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28,
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
          Hola, {displayName}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          {isLocked ? `Bloqueado — ${lockSecondsLeft}s` : 'Ingresa tu PIN para continuar'}
        </div>
      </motion.div>

      {/* Dots + status */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <motion.div
          animate={status === 'error'
            ? { x: [-14, 14, -10, 10, -5, 5, 0], transition: { duration: 0.46, ease: 'easeOut' } }
            : { x: 0 }
          }
          style={{ display: 'flex', gap: 22 }}
        >
          {[0,1,2,3].map(i => (
            <motion.div
              key={i}
              animate={{
                scale: digits.length > i ? 1.12 : 1,
                backgroundColor: digits.length > i ? dotColor : 'var(--line)',
                borderColor: digits.length > i ? dotColor : 'var(--line)',
              }}
              transition={softSpring}
              style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--line)' }}
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
              style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontFamily: 'var(--font-body)' }}>
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
                height: 72, borderRadius: 9999,
                background: key === '⌫' ? 'transparent' : 'var(--card)',
                border: key === '⌫' ? 'none' : '1.5px solid var(--line)',
                boxShadow: key === '⌫' ? 'none' : 'var(--shadow-card)',
                color: isLocked ? 'var(--muted)' : key === '⌫' ? 'var(--muted)' : 'var(--ink)',
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

      {/* Biometric button — shown if credential registered */}
      {bioRegistered && !bioLoading && status === 'idle' && !isLocked && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...quickEase, delay: 0.25 }}
          whileTap={{ scale: 0.9 }}
          onClick={handleBioAuth}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--card)', border: '1.5px solid var(--line)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 26,
            WebkitTapHighlightColor: 'transparent',
          }}
          title="Usar Face ID / Huella"
        >
          {/iPhone|iPad|Mac/.test(navigator.userAgent) ? '🔐' : '👆'}
        </motion.button>
      )}
      {bioLoading && (
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }} />
      )}

      {/* Biometric registration prompt — shown after first successful PIN */}
      <AnimatePresence>
        {showBioPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={softSpring}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'var(--card)', borderRadius: '20px 20px 0 0',
              padding: '24px 24px max(24px, env(safe-area-inset-bottom))',
              boxShadow: '0 -4px 32px rgba(15,23,42,0.16)',
              display: 'flex', flexDirection: 'column', gap: 14, zIndex: 10000,
            }}
          >
            <div style={{ textAlign: 'center', fontSize: 40 }}>
              {/iPhone|iPad|Mac/.test(navigator.userAgent) ? '🔐' : '👆'}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--ink)', marginBottom: 6 }}>
                Activar Face ID / Huella
              </div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
                La próxima vez entrarás sin necesidad de escribir tu PIN.
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={activateBiometric}
              style={{
                height: 52, background: 'var(--grad-orange)', border: 'none', boxShadow: '0 8px 20px rgba(234,88,12,.35)',
                borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Activar
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setShowBioPrompt(false); onUnlock(); }}
              style={{
                height: 44, background: 'none', border: 'none',
                borderRadius: 14, color: 'var(--muted)', fontSize: 'var(--text-sm)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Ahora no
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

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
