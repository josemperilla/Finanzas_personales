import { motion } from 'framer-motion';
import { getGamification } from '../lib/gamification';
import { useEffect, useState } from 'react';

interface Props {
  userId: string;
}

const FLAME_PATH = 'M12 2.5c.4 2.7 2.2 4.3 3.7 5.8 1.6 1.6 2.8 3.4 2.8 5.6a6.5 6.5 0 0 1-13 0c0-1.1.3-2.1.9-3 .3 1.1 1.2 1.9 2.4 1.9 1.4 0 2.3-1 2.3-2.4 0-1-.5-1.8-1-2.7C11.2 6.1 11.1 4.2 12 2.5Z';

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

function getLast7Days() {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    result.push({
      date: d,
      label: DAY_LABELS[d.getDay()],
      key: d.toISOString().split('T')[0],
    });
  }
  return result;
}

export function RachaCalendarCard({ userId }: Props) {
  const [racha, setRacha] = useState(0);
  const [ultimoRegistro, setUltimoRegistro] = useState('');

  useEffect(() => {
    const state = getGamification(userId);
    setRacha(state.racha);
    setUltimoRegistro(state.ultimoRegistro);
  }, [userId]);

  const days = getLast7Days();
  const todayKey = new Date().toISOString().split('T')[0];

  function isDayActive(key: string): boolean {
    if (!ultimoRegistro) return false;
    const lastDate = new Date(ultimoRegistro);
    const checkDate = new Date(key);
    const diffMs = lastDate.getTime() - checkDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < racha;
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 24,
      padding: '18px 20px',
      boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 8px 22px rgba(16,18,28,.06)',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 15, flexShrink: 0,
          background: 'linear-gradient(150deg, var(--orange-2), var(--orange))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(234,88,12,.3)',
        }}>
          <svg width="22" height="24" viewBox="0 0 24 24" fill="#fff">
            <path d={FLAME_PATH} />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Racha actual</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', lineHeight: 1.1 }}>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{racha}</span> días
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Récord</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--ink-2)' }}>
            {Math.max(racha, 0)}
          </div>
        </div>
      </div>

      {/* 7-day calendar */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {days.map(({ key, label }) => {
          const active = isDayActive(key);
          const isToday = key === todayKey;
          const isTodayActive = isToday && active;

          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.04 }}
                style={{
                  width: 30, height: 30, borderRadius: 10,
                  background: isTodayActive
                    ? 'var(--orange)'
                    : active
                      ? 'var(--blue)'
                      : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isTodayActive ? '0 0 0 3px var(--orange-soft)' : 'none',
                }}
              >
                {isTodayActive && (
                  <svg width="15" height="16" viewBox="0 0 24 24" fill="#fff">
                    <path d={FLAME_PATH} />
                  </svg>
                )}
              </motion.div>
              <span style={{
                fontSize: 10,
                color: isTodayActive ? 'var(--orange)' : 'var(--muted)',
                fontWeight: isTodayActive ? 700 : 400,
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
