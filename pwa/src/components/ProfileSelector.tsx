import { useState } from 'react';
import { motion } from 'framer-motion';
import { PROFILES } from '../lib/profiles';

interface Props {
  onSelect: (userId: string) => void;
}

export function ProfileSelector({ onSelect }: Props) {
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  return (
    <motion.div
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'max(56px, env(safe-area-inset-top)) 32px max(48px, env(safe-area-inset-bottom))',
        gap: 40,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
          ¿Quién eres?
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--muted)' }}>
          Selecciona tu perfil para continuar
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {PROFILES.map(profile => {
          const avatarFailed = failedAvatars.has(profile.id);
          return (
            <motion.button
              key={profile.id}
              whileTap={{ scale: 0.94 }}
              onClick={() => onSelect(profile.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '20px 28px',
                borderRadius: 'var(--r-xl)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: avatarFailed ? 'var(--grad-brand)' : 'var(--card)',
                border: '3px solid #fff',
                boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--card)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32,
              }}>
                {avatarFailed ? profile.initial : (
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    onError={() => setFailedAvatars(prev => new Set([...prev, profile.id]))}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                  />
                )}
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                {profile.name}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
