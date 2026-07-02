import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getGamification } from '../lib/gamification';
import { useOverlayA11y } from '../lib/useOverlayA11y';

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  racha: number;
}

/**
 * Bottom sheet que explica la racha de forma proactiva y muestra el estado del
 * "día de gracia" (freeze). Hace que la racha sea algo que el usuario entiende
 * y controla, en lugar de una amenaza que aparece de noche.
 */
export function RachaSheet({ open, onClose, userId, racha }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useOverlayA11y(open, onClose, panelRef);

  const freezeDisponible = !getGamification(userId).streakFreezeUsado;
  const emoji = racha >= 30 ? '🌋' : racha >= 7 ? '🔥' : racha > 0 ? '🌱' : '🌱';

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 'var(--z-overlay)' }}
          />
          <motion.div
            ref={panelRef as React.RefObject<HTMLDivElement>}
            role="dialog"
            aria-modal="true"
            aria-label="Cómo funciona tu racha"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0,
              background: 'var(--card)', borderRadius: '24px 24px 0 0',
              padding: '8px 20px max(24px, env(safe-area-inset-bottom))',
              boxShadow: 'var(--shadow-float)', zIndex: 'var(--z-drawer, 9999)',
              maxWidth: 480, margin: '0 auto',
            }}
          >
            <div style={{ width: 40, height: 4, borderRadius: 999, background: 'var(--line)', margin: '8px auto 18px' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                background: racha > 0 ? 'var(--orange-soft)' : 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 26, lineHeight: 1 }}>{emoji}</span>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--ink)', lineHeight: 1 }}>
                  {racha} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>días</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>de constancia financiera</div>
              </div>
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)', margin: '0 0 18px' }}>
              Sumas un día a tu racha cada vez que cierras <b style={{ color: 'var(--ink)' }}>por debajo de tu presupuesto diario</b>.
              No se trata de no gastar, sino de gastar con intención.
            </p>

            {/* Día de gracia (freeze) */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: freezeDisponible ? 'var(--blue-50)' : 'var(--surface-2)',
              border: `1px solid ${freezeDisponible ? 'var(--blue-100)' : 'var(--line)'}`,
              borderRadius: 'var(--r-lg)', padding: '12px 14px', marginBottom: 16,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{freezeDisponible ? '❄️' : '🛡️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                  {freezeDisponible ? 'Tienes un día de gracia disponible' : 'Ya usaste tu día de gracia'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {freezeDisponible
                    ? 'Si un día te pasas del presupuesto, tu racha no se reinicia.'
                    : 'Se recarga cada lunes para que arranques la semana con margen.'}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '14px', borderRadius: 'var(--r-lg)',
                background: 'var(--grad-brand)', color: '#fff', border: 'none',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Entendido
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
