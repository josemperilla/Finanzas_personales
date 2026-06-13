import { motion } from 'framer-motion';
import { getGamification } from '../lib/gamification';
import { useEffect, useState } from 'react';

interface Props {
  userId: string;
}

function getLast7Days(): { date: Date; label: string; key: string }[] {
  const result = [];
  const DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({
      date: d,
      label: DAYS[d.getDay()],
      key: d.toISOString().split('T')[0],
    });
  }
  return result;
}

export function RachaCalendarCard({ userId }: Props) {
  const [racha, setRacha] = useState(0);
  const [ultimoRegistro, setUltimoRegistro] = useState('');
  const [freezeDisponible, setFreezeDisponible] = useState(false);

  useEffect(() => {
    const state = getGamification(userId);
    setRacha(state.racha);
    setUltimoRegistro(state.ultimoRegistro);
    setFreezeDisponible(!state.streakFreezeUsado);
  }, [userId]);

  const days = getLast7Days();
  const todayKey = new Date().toISOString().split('T')[0];

  // Mark days as "active" based on racha count working backwards from lastReg
  function isDayActive(key: string): boolean {
    if (!ultimoRegistro) return false;
    const lastDate = new Date(ultimoRegistro);
    const checkDate = new Date(key);
    const diffMs = lastDate.getTime() - checkDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < racha;
  }

  const isOnStreak = racha > 0 && ultimoRegistro === todayKey;

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: 'var(--r-2xl)',
      padding: '18px 16px',
      boxShadow: 'var(--shadow-card)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
            Racha diaria
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
            {racha === 0
              ? 'Registra hoy para comenzar'
              : isOnStreak
                ? '¡Sigue así!'
                : 'Registra hoy para mantenerla'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <motion.div
            animate={{ scale: racha >= 7 ? [1, 1.15, 1] : 1 }}
            transition={{ duration: 0.5, repeat: racha >= 7 ? Infinity : 0, repeatDelay: 2 }}
            style={{ fontSize: racha >= 7 ? 28 : 24, lineHeight: 1, filter: racha === 0 ? 'grayscale(1) opacity(0.4)' : 'none' }}
          >
            🔥
          </motion.div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: racha > 0 ? 'var(--ink)' : 'var(--muted)', lineHeight: 1, fontFamily: 'var(--font-display)' }}>
              {racha}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {racha === 1 ? 'día' : 'días'}
            </div>
          </div>
        </div>
      </div>

      {/* 7-day mini calendar */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', marginBottom: 12 }}>
        {days.map(({ key, label }) => {
          const active = isDayActive(key);
          const isToday = key === todayKey;
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
              <span style={{ fontSize: 10, color: isToday ? 'var(--blue-700)' : 'var(--muted)', fontWeight: isToday ? 700 : 400 }}>
                {label}
              </span>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.05 }}
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: active ? 'var(--blue-700)' : (isToday ? 'var(--blue-50)' : 'var(--line)'),
                  border: isToday && !active ? '1.5px solid var(--blue-300)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {active && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>

      {/* Streak freeze indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10,
        background: freezeDisponible ? 'rgba(59,130,246,0.07)' : 'var(--line)',
      }}>
        <span style={{ fontSize: 16 }}>{freezeDisponible ? '🛡️' : '⚪'}</span>
        <span style={{ fontSize: 12, color: freezeDisponible ? 'var(--blue-700)' : 'var(--muted)', fontWeight: freezeDisponible ? 600 : 400 }}>
          {freezeDisponible
            ? 'Freeze disponible — te protege 1 día sin racha'
            : 'Freeze usado esta semana — recarga el lunes'}
        </span>
      </div>
    </div>
  );
}
