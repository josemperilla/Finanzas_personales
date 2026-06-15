import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Profile, getUserNickname, getUserAvatar } from '../lib/profiles';
import { quickEase } from '../lib/motion';

interface Props {
  onSelect: (userId: string) => void;
  onLoginWithCredentials: (userId: string, pin: string) => Promise<'ok' | 'invalid' | 'error'>;
  onRedeemInvite: () => void;
  profiles: Profile[];
}

export function ProfileSelector({ onSelect, onLoginWithCredentials, onRedeemInvite, profiles }: Props) {
  const lastProfile = profiles.length > 0 ? profiles[profiles.length - 1] : null;
  const [view, setView] = useState<'known' | 'form'>(lastProfile ? 'known' : 'form');

  const [loginId, setLoginId] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const containerStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'var(--surface)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 'max(56px, env(safe-area-inset-top)) 32px max(48px, env(safe-area-inset-bottom))',
  };

  async function handleFormSubmit() {
    const id = loginId.trim().toLowerCase();
    const pin = loginPin.trim();
    if (!id || pin.length < 4) return;
    setError(null);
    setLoading(true);
    const result = await onLoginWithCredentials(id, pin);
    setLoading(false);
    if (result === 'invalid') setError('Usuario o contraseña incorrectos.');
    if (result === 'error') setError('Sin conexión. Intenta de nuevo.');
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 52, padding: '0 16px',
    border: `1.5px solid ${error ? '#ef4444' : 'var(--line)'}`, borderRadius: 14,
    background: 'var(--card)', color: 'var(--ink)',
    fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)',
    outline: 'none', transition: 'border-color 0.15s',
  };

  const primaryBtn: React.CSSProperties = {
    height: 52, borderRadius: 14, border: 'none',
    background: 'var(--blue-700)', color: '#fff',
    fontSize: 'var(--text-base)', fontWeight: 600,
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    width: '100%', opacity: loading ? 0.7 : 1,
    transition: 'opacity 0.15s',
  };

  const ghostBtn: React.CSSProperties = {
    height: 50, borderRadius: 14,
    border: '1.5px solid var(--line)', background: 'none',
    color: 'var(--ink)', fontSize: 'var(--text-base)', fontWeight: 500,
    cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%',
  };

  const linkBtn: React.CSSProperties = {
    height: 44, background: 'none', border: 'none',
    color: 'var(--muted)', fontSize: 'var(--text-sm)',
    cursor: 'pointer', fontFamily: 'var(--font-body)',
    textAlign: 'center' as const,
  };

  if (lastProfile && view === 'known') {
    const customAvatar = getUserAvatar(lastProfile.id);
    const displayName = getUserNickname(lastProfile.id) || lastProfile.name;
    const avatarSrc = customAvatar || lastProfile.avatar;

    return (
      <motion.div
        key="known"
        initial={{ opacity: 0, y: '6%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={containerStyle}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, width: '100%', maxWidth: 300 }}>
          {/* Avatar */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...quickEase, delay: 0.05 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
          >
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: (!avatarSrc || avatarFailed) ? 'var(--grad-brand)' : 'var(--card)',
              border: '3px solid var(--card)',
              boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36,
            }}>
              {(!avatarSrc || avatarFailed) ? lastProfile.initial : (
                <img
                  src={avatarSrc}
                  alt={displayName}
                  onError={() => setAvatarFailed(true)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                />
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
              {displayName}
            </div>
          </motion.div>

          {/* Botones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelect(lastProfile.id)}
              style={primaryBtn}
            >
              Continuar
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setView('form'); setError(null); }}
              style={ghostBtn}
            >
              Otro usuario
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onRedeemInvite}
              style={linkBtn}
            >
              <span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Crear usuario</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="form"
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={containerStyle}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%', maxWidth: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            Inicia sesión
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
            Escribe tu usuario y contraseña
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key="fields"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={quickEase}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <input
              autoFocus
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={loginId}
              onChange={e => { setLoginId(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleFormSubmit(); }}
              placeholder="Usuario"
              style={inputStyle}
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={loginPin}
              onChange={e => { setLoginPin(e.target.value.replace(/\D/g, '')); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') handleFormSubmit(); }}
              placeholder="Contraseña (4 dígitos)"
              style={inputStyle}
            />

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ fontSize: 13, color: '#ef4444', textAlign: 'center', padding: '2px 0' }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              whileTap={{ scale: loginId.trim() && loginPin.length >= 4 ? 0.97 : 1 }}
              onClick={handleFormSubmit}
              disabled={!loginId.trim() || loginPin.length < 4 || loading}
              style={{ ...primaryBtn, background: loginId.trim() && loginPin.length >= 4 ? 'var(--blue-700)' : 'var(--blue-300)', marginTop: 4 }}
            >
              {loading ? 'Verificando…' : 'Entrar'}
            </motion.button>

            {lastProfile && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { setView('known'); setError(null); setLoginId(''); setLoginPin(''); }}
                style={linkBtn}
              >
                ← Volver
              </motion.button>
            )}

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onRedeemInvite}
              style={linkBtn}
            >
              ¿Eres nuevo? <span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Crear usuario</span>
            </motion.button>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
