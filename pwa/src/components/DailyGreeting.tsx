import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase } from '../lib/motion';

interface Props {
  userId: string;
  racha: number;
  retoActivo: { titulo: string } | null;
}

function getMensaje(racha: number): string {
  if (racha === 0) return '¡Comienza tu racha hoy! Abre la app a diario.';
  if (racha < 7) return `🔥 ¡Día ${racha}! Vas bien, sigue así.`;
  if (racha < 30) return `🔥 ¡Día ${racha}! Solo ${30 - racha} días para "Mes de fuego".`;
  return `🌋 ¡Día ${racha} consecutivo! Eres imparable.`;
}

export function DailyGreeting({ userId, racha, retoActivo }: Props) {
  const hoy = new Date().toISOString().slice(0, 10);
  const storageKey = `fm_greeting_seen_${userId}`;
  const [visible, setVisible] = useState(() => localStorage.getItem(storageKey) !== hoy);

  const dismiss = () => {
    localStorage.setItem(storageKey, hoy);
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="daily-greeting"
          initial={{ y: -12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -12, opacity: 0 }}
          transition={quickEase}
          style={{
            background: 'var(--card)',
            borderRadius: 'var(--r-xl)',
            padding: '12px 14px',
            boxShadow: 'var(--shadow-card)',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 14,
                color: 'var(--ink)',
                lineHeight: 1.35,
              }}>
                {getMensaje(racha)}
              </div>
              {retoActivo && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  📋 Misión activa: {retoActivo.titulo}
                </div>
              )}
            </div>
            <button
              onClick={dismiss}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                fontSize: 18,
                padding: 0,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
