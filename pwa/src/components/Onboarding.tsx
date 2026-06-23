import { useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { setUserNickname, setUserAvatar } from '../lib/profiles';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { setMeta } from '../lib/meta';
import { formatCOP } from '../lib/utils';
import { Icon, type IconName } from './ui/icons';

interface Props {
  userId: string;
  initialDisplayName?: string;
  onFinish: () => void;
}

const STEPS = ['bienvenida', 'nombre', 'meta', 'captura', 'pin', 'invitacion', 'listo'] as const;
type Step = (typeof STEPS)[number];

const AVATARS: IconName[] = ['user', 'sparkles', 'leaf', 'coffee', 'heart', 'plane'];

const META_CHIPS = [1_200_000, 1_800_000, 2_500_000];

interface Canal {
  id: string;
  icon: IconName;
  titulo: string;
  sub: string;
}
const CANALES: Canal[] = [
  { id: 'sms', icon: 'smartphone', titulo: 'Notificaciones SMS', sub: 'Detectamos gastos de mensajes' },
  { id: 'voz', icon: 'mic', titulo: 'Por voz', sub: 'Dices el gasto, lo parseamos' },
  { id: 'foto', icon: 'file', titulo: 'Foto de extracto', sub: 'Importamos el PDF' },
  { id: 'manual', icon: 'code', titulo: 'Manual', sub: 'Lo escribes tú' },
];

const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

// ── estilos compartidos ──────────────────────────────────────────
const kickerStyle: React.CSSProperties = {
  fontSize: 'var(--text-2xs)', letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--muted)', fontWeight: 700, marginBottom: 10,
};
const headingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 500,
  lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 10, color: 'var(--ink)',
};
const paraStyle: React.CSSProperties = {
  fontSize: 'var(--text-base)', color: 'var(--muted)', marginBottom: 24,
  maxWidth: '30ch', lineHeight: 1.5,
};
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)',
  background: 'var(--card)', borderRadius: 'var(--r-md)', padding: 15,
  fontSize: 'var(--text-base)', color: 'var(--ink)', outline: 'none',
  fontFamily: 'var(--font-body)',
};
const blockBtn: React.CSSProperties = {
  width: '100%', background: 'var(--blue)', color: '#fff', fontWeight: 600,
  padding: 15, borderRadius: 'var(--r-pill)', fontSize: 'var(--text-base)',
  marginTop: 8, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
};

export function Onboarding({ userId, initialDisplayName, onFinish }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>('bienvenida');
  const stepIndex = STEPS.indexOf(step);

  const [name, setName] = useState(initialDisplayName || '');
  const [avatar, setAvatar] = useState<IconName>('user');
  const [meta, setMetaValue] = useState<number>(1_800_000);
  const [canales, setCanales] = useState<string[]>(['sms', 'voz', 'foto']);
  const [pin, setPin] = useState('');
  const [invite, setInvite] = useState('');

  useOverlayA11y(true, undefined, containerRef);

  function persist() {
    const trimmed = name.trim();
    if (trimmed) setUserNickname(userId, trimmed);
    // El avatar es el nombre de un ícono Lucide (string).
    setUserAvatar(userId, avatar);
    if (meta > 0) setMeta(userId, { monto: meta, activo: true });
    try {
      localStorage.setItem(`fm_canales_${userId}`, JSON.stringify(canales));
    } catch { /* localStorage no disponible — ignorar */ }
  }

  function finish() {
    persist();
    localStorage.setItem(`fm_tutorial_seen_${userId}`, '1');
    onFinish();
  }

  function next() {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
    else finish();
  }
  function back() {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  }
  function skip() {
    // saltar al último paso (Listo)
    setStep('listo');
  }

  function toggleCanal(id: string) {
    setCanales(prev => (prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]));
  }

  function pressPin(k: string) {
    if (k === '') return;
    if (k === 'del') { setPin(p => p.slice(0, -1)); return; }
    setPin(p => (p.length < 6 ? p + k : p));
  }

  const pinDotCount = Math.max(4, Math.min(6, pin.length || 4));

  // transición con leve drift (rotateY + translate), respeta reduced motion
  const variants = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 28, rotateY: 6 },
        animate: { opacity: 1, x: 0, rotateY: 0 },
        exit: { opacity: 0, x: -28, rotateY: -6 },
      };
  const transition = { duration: reduced ? 0.18 : 0.4, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9996,
        background: 'color-mix(in srgb, var(--surface) 86%, transparent)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(40px, env(safe-area-inset-top)) 26px max(30px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Barras de progreso */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            height: 4, flex: 1, borderRadius: 'var(--r-pill)',
            background: i <= stepIndex ? 'var(--blue)' : 'var(--line)',
            transition: 'background 0.25s ease',
          }} />
        ))}
      </div>

      {/* Cuerpo del paso */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        width: '100%', maxWidth: 360, margin: '0 auto', perspective: 1000,
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={variants.initial}
            animate={variants.animate}
            exit={variants.exit}
            transition={transition}
            style={{ display: 'flex', flexDirection: 'column' }}
          >
            {/* ── 0 · Bienvenida ── */}
            {step === 'bienvenida' && (
              <>
                <div style={kickerStyle}>Bienvenida</div>
                <div id="onboarding-title" style={headingStyle}>Corriente</div>
                <div style={paraStyle}>
                  Tu dinero, en calma. Sin maraña de gráficos ni presión — solo lo que necesitas
                  saber, cuando lo necesitas.
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={blockBtn}>
                  Empezar <Icon name="arrow-right" size={18} />
                </motion.button>
              </>
            )}

            {/* ── 1 · ¿Cómo te llamas? ── */}
            {step === 'nombre' && (
              <>
                <div style={kickerStyle}>Paso 1 de 6 · Tú</div>
                <div id="onboarding-title" style={headingStyle}>¿Cómo te llamas?</div>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') next(); }}
                  placeholder="Tu nombre"
                  style={inputStyle}
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: '14px 0 8px', fontWeight: 600 }}>
                  Elige un avatar
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {AVATARS.map(name => {
                    const sel = avatar === name;
                    return (
                      <motion.button
                        key={name}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setAvatar(name)}
                        aria-pressed={sel}
                        style={{
                          aspectRatio: '1', borderRadius: 'var(--r-md)',
                          border: `1px solid ${sel ? 'var(--blue)' : 'var(--line)'}`,
                          background: sel ? 'var(--blue-soft)' : 'var(--card)',
                          display: 'grid', placeItems: 'center',
                          color: sel ? 'var(--blue)' : 'var(--muted)',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <Icon name={name} size={24} />
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 2 · Meta mensual ── */}
            {step === 'meta' && (
              <>
                <div style={kickerStyle}>Paso 2 de 6 · Meta</div>
                <div id="onboarding-title" style={headingStyle}>¿Cuánto quieres gastar al mes?</div>
                <div style={paraStyle}>Una guía, no una jaula. Puedes cambiarla cuando quieras.</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500,
                  letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 14,
                }}>
                  {formatCOP(meta)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                  {META_CHIPS.map(v => {
                    const sel = meta === v;
                    return (
                      <motion.button
                        key={v}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setMetaValue(v)}
                        style={{
                          height: 40, borderRadius: 'var(--r-md)',
                          border: `1px solid ${sel ? 'var(--blue)' : 'var(--line)'}`,
                          background: sel ? 'var(--blue-soft)' : 'var(--card)',
                          color: sel ? 'var(--blue)' : 'var(--muted)',
                          fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-body)', transition: 'all 0.15s',
                        }}
                      >
                        ${(v / 1_000_000).toFixed(1)}M
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 3 · ¿Cómo capturas tus gastos? ── */}
            {step === 'captura' && (
              <>
                <div style={kickerStyle}>Paso 3 de 6 · Captura</div>
                <div id="onboarding-title" style={headingStyle}>¿Cómo capturas tus gastos?</div>
                <div style={paraStyle}>
                  Elige los canales que quieres activar. Puedes añadir otros después.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {CANALES.map(c => {
                    const sel = canales.includes(c.id);
                    return (
                      <motion.button
                        key={c.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => toggleCanal(c.id)}
                        aria-pressed={sel}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: 14, width: '100%',
                          border: `1px solid ${sel ? 'var(--blue)' : 'var(--line)'}`,
                          borderRadius: 'var(--r-md)',
                          background: sel ? 'var(--blue-soft)' : 'var(--card)',
                          textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <span style={{
                          width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                          background: 'var(--surface)', display: 'grid', placeItems: 'center',
                          color: 'var(--blue)',
                        }}>
                          <Icon name={c.icon} size={18} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>{c.titulo}</span>
                          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--muted)' }}>{c.sub}</span>
                        </span>
                        <span style={{ marginLeft: 'auto', color: 'var(--blue)', opacity: sel ? 1 : 0, transition: 'opacity 0.15s' }}>
                          <Icon name="check" size={20} />
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── 4 · Crea tu PIN (visual; el PIN real ya se creó en SetupPin) ── */}
            {step === 'pin' && (
              <>
                <div style={kickerStyle}>Paso 4 de 6 · Seguridad</div>
                <div id="onboarding-title" style={headingStyle}>Tu PIN está listo</div>
                <div style={paraStyle}>Ya creaste tu PIN de 4 dígitos para entrar a la app.</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '18px 0' }}>
                  {Array.from({ length: pinDotCount }).map((_, i) => (
                    <div key={i} style={{
                      width: 12, height: 12, borderRadius: '50%',
                      border: '1.5px solid var(--blue)',
                      background: i < pin.length ? 'var(--blue)' : 'transparent',
                    }} />
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 6 }}>
                  {PIN_KEYS.map((k, idx) =>
                    k === '' ? <div key={idx} /> : (
                      <motion.button
                        key={idx}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => pressPin(k)}
                        aria-label={k === 'del' ? 'Borrar' : k}
                        style={{
                          height: 54, borderRadius: 'var(--r-md)', border: '1px solid var(--line)',
                          background: 'var(--card)', color: 'var(--ink)',
                          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600,
                          cursor: 'pointer', display: 'grid', placeItems: 'center',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >
                        {k === 'del'
                          ? <Icon name="x" size={20} />
                          : k}
                      </motion.button>
                    )
                  )}
                </div>
              </>
            )}

            {/* ── 5 · ¿Tienes código de invitación? ── */}
            {step === 'invitacion' && (
              <>
                <div style={kickerStyle}>Paso 5 de 6 · Invitación</div>
                <div id="onboarding-title" style={headingStyle}>¿Tienes código de invitación?</div>
                <div style={paraStyle}>
                  Si te invitaron, ingrésalo. Si no, lo saltas — puedes empezar igual.
                </div>
                <input
                  type="text"
                  value={invite}
                  onChange={e => setInvite(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter') next(); }}
                  placeholder="Código (opcional)"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ ...inputStyle, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'var(--font-mono)' }}
                />
              </>
            )}

            {/* ── 6 · Listo ── */}
            {step === 'listo' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <div style={kickerStyle}>Listo</div>
                <div id="onboarding-title" style={{ ...headingStyle, display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                  Todo en orden
                  <span style={{ color: 'var(--blue)' }}><Icon name="check" size={30} /></span>
                </div>
                <div style={paraStyle}>
                  Tu cuenta está lista. El dinero fluye — y ahora lo ves en calma.
                </div>
                <motion.button whileTap={{ scale: 0.97 }} onClick={finish} style={blockBtn}>
                  Registrar mi primer movimiento <Icon name="arrow-right" size={18} />
                </motion.button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pie: Atrás · Saltar · Continuar */}
      {step !== 'listo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {stepIndex > 0 && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={back}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', fontSize: 'var(--text-sm)', fontWeight: 600,
                fontFamily: 'var(--font-body)', padding: '8px 4px',
              }}
            >
              Atrás
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={skip}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 'var(--text-sm)', fontWeight: 600,
              fontFamily: 'var(--font-body)', padding: '8px 4px',
            }}
          >
            {stepIndex >= 4 ? 'Saltar paso' : 'Saltar'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={next}
            style={{
              marginLeft: 'auto', background: 'var(--blue)', color: '#fff', fontWeight: 600,
              padding: '13px 26px', borderRadius: 'var(--r-pill)', fontSize: 'var(--text-base)',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)',
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}
          >
            Continuar <Icon name="arrow-right" size={18} />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
