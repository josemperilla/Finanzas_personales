import { motion } from 'framer-motion';
import { getGamification, getLevelProgress, NIVELES } from '../lib/gamification';
import { useCountUp } from '../lib/useCountUp';
import { getUserNickname, getUserAvatar, getProfile } from '../lib/profiles';
import { useState } from 'react';

interface Props {
  userId: string;
}

const LEVEL_GRADIENTS: Record<number, string> = {
  1: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 60%, #2563eb 100%)',
  2: 'linear-gradient(135deg, #14532d 0%, #15803d 60%, #16a34a 100%)',
  3: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 60%, #7c3aed 100%)',
  4: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 60%, #ea580c 100%)',
  5: 'linear-gradient(135deg, #78350f 0%, #b45309 40%, #d97706 70%, #f59e0b 100%)',
};

const LEVEL_EMOJIS: Record<number, string> = {
  1: '🐜', 2: '🌱', 3: '📊', 4: '💹', 5: '👑',
};

export function LevelHeroCard({ userId }: Props) {
  const state = getGamification(userId);
  const { pct, xpToNext, nivelActual } = getLevelProgress(state);
  const nivelSig = NIVELES.find(n => n.nivel === state.nivel + 1);
  const animatedXP = useCountUp(state.xp);

  const profile  = getProfile(userId);
  const customAvatar = getUserAvatar(userId);
  const displayName = getUserNickname(userId) || profile?.name || userId;
  const avatarSrc = customAvatar || profile?.avatar;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const gradient = LEVEL_GRADIENTS[state.nivel] ?? LEVEL_GRADIENTS[1];
  const emoji = LEVEL_EMOJIS[state.nivel] ?? '🐜';

  return (
    <div style={{
      background: gradient,
      borderRadius: 24,
      padding: '24px 20px 20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', top: -30, right: -30,
        width: 140, height: 140, borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)',
      }} />
      <div style={{
        position: 'absolute', bottom: -20, left: -20,
        width: 100, height: 100, borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
      }} />

      {/* Avatar + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, position: 'relative' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.35)',
          overflow: 'hidden', flexShrink: 0,
          background: 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {avatarSrc && !avatarFailed ? (
            <img
              src={avatarSrc} alt={displayName}
              onError={() => setAvatarFailed(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{ fontSize: 22, color: '#fff', fontWeight: 800, fontFamily: 'var(--font-display)' }}>
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-body)' }}>
            Hola, {displayName.split(' ')[0]}
          </div>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>
            {emoji} {nivelActual.nombre}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
            Nivel {state.nivel}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
            {animatedXP}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>XP total</div>
        </div>
      </div>

      {/* XP bar */}
      <div>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.18)', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
          <motion.div
            animate={{ width: `${pct * 100}%` }}
            initial={{ width: 0 }}
            transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
            style={{ height: '100%', background: 'var(--orange-2)', borderRadius: 8 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {nivelSig ? (
            <>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                {xpToNext} XP para {nivelSig.nombre}
              </span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                {Math.round(pct * 100)}%
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>
              👑 Nivel máximo alcanzado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
