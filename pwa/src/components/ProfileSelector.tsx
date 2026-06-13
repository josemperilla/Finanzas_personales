import { useState } from 'react';
import { motion } from 'framer-motion';
import { Profile, getUserNickname, getUserAvatar } from '../lib/profiles';
import { staggerContainer, riseItem, quickEase } from '../lib/motion';

interface Props {
  onSelect: (userId: string) => void;
  onRedeemInvite: () => void;
  profiles: Profile[];
}

export function ProfileSelector({ onSelect, onRedeemInvite, profiles }: Props) {
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());

  const containerStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'var(--surface)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 'max(56px, env(safe-area-inset-top)) 32px max(48px, env(safe-area-inset-bottom))',
    gap: 40,
  };

  // Landing mínima: dispositivo sin perfiles conocidos. No se filtran nombres.
  if (profiles.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: '6%' }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        style={containerStyle}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
            Tus finanzas, claras
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)', maxWidth: 280 }}>
            Crea tu perfil con el código de invitación que te compartieron.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={onRedeemInvite}
            style={{ height: 50, borderRadius: 14, border: 'none', background: 'var(--blue-700)', color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Tengo una invitación
          </motion.button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.22 } }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={containerStyle}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 6 }}>
          ¿Quién eres?
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
          Selecciona tu perfil para continuar
        </div>
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {profiles.map(profile => {
          const customAvatar = getUserAvatar(profile.id);
          const displayName = getUserNickname(profile.id) || profile.name;
          const avatarSrc = customAvatar || profile.avatar;
          const avatarFailed = failedAvatars.has(profile.id);
          return (
            <motion.button
              key={profile.id}
              variants={riseItem}
              transition={quickEase}
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
                background: (!avatarSrc || avatarFailed) ? 'var(--grad-brand)' : 'var(--card)',
                border: '3px solid #fff',
                boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--card)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32,
              }}>
                {(!avatarSrc || avatarFailed) ? profile.initial : (
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    onError={() => setFailedAvatars(prev => new Set([...prev, profile.id]))}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                  />
                )}
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
                {displayName}
              </span>
            </motion.button>
          );
        })}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        onClick={onRedeemInvite}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)',
          padding: '12px 16px', borderRadius: 8,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        ¿No ves tu perfil? <span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Tengo invitación</span>
      </motion.button>
    </motion.div>
  );
}
