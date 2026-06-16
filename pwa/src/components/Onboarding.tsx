import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { setUserNickname, setUserAvatar, getUserAvatar } from '../lib/profiles';
import { resizeImageToAvatar } from '../lib/avatar';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { addSueno } from '../lib/suenos';
import { setMeta } from '../lib/meta';
import { awardBadge } from '../lib/gamification';

type Clase = 'hormiga' | 'administrador' | 'sonador';

const CLASES: { id: Clase; emoji: string; nombre: string; desc: string; color: string }[] = [
  { id: 'hormiga',       emoji: '🐜', nombre: 'La Hormiga Sabia',  desc: 'Ahorra poco a poco, cada grano cuenta', color: '#3b82f6' },
  { id: 'administrador', emoji: '📊', nombre: 'El Administrador',  desc: 'Control total, presupuesto exacto',      color: '#8b5cf6' },
  { id: 'sonador',       emoji: '✨', nombre: 'El Soñador',        desc: 'Metas grandes, sueños por cumplir',      color: '#f59e0b' },
];

const SUENOS_SUGERIDOS: Record<Clase, { emoji: string; nombre: string; monto: number }[]> = {
  hormiga: [
    { emoji: '🏠', nombre: 'Fondo de emergencias', monto: 3000000 },
    { emoji: '📱', nombre: 'Nuevo celular',         monto: 1500000 },
    { emoji: '✈️', nombre: 'Viaje nacional',        monto: 2000000 },
    { emoji: '🎓', nombre: 'Curso o carrera',       monto: 5000000 },
  ],
  administrador: [
    { emoji: '🏠', nombre: 'Prima o cuota apartamento', monto: 10000000 },
    { emoji: '🚗', nombre: 'Cuota inicial carro',        monto: 8000000 },
    { emoji: '💼', nombre: 'Capital propio negocio',     monto: 15000000 },
    { emoji: '🎓', nombre: 'Posgrado o maestría',        monto: 20000000 },
  ],
  sonador: [
    { emoji: '✈️', nombre: 'Viaje al exterior', monto: 8000000 },
    { emoji: '🏄', nombre: 'Año sabático',       monto: 30000000 },
    { emoji: '🏠', nombre: 'Casa propia',         monto: 50000000 },
    { emoji: '🌎', nombre: 'Nómada digital',      monto: 20000000 },
  ],
};

interface Props {
  userId: string;
  initialDisplayName?: string;
  onFinish: () => void;
}

type Step = 'clase' | 'profile' | 'sueno' | 'meta' | 'shortcut';
const STEPS: Step[] = ['clase', 'profile', 'sueno', 'meta', 'shortcut'];

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/57a54a9b81264b9eb74a676be144f858';
const IOS_AUTOMATION_STEPS = [
  'Abre Atajos → Automatización → + → Nueva Automatización → Mensaje',
  'En "contiene" escribe: $  —  deja "De" en "Cualquiera"',
  'Activa "Ejecutar inmediatamente" → desactiva "Preguntar antes de ejecutar"',
  'Toca Siguiente → selecciona el Shortcut recién instalado → Listo',
];

const primaryBtn: React.CSSProperties = {
  width: '100%', height: 50, borderRadius: 14, border: 'none',
  background: 'var(--blue-700)', color: '#fff',
  fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
};
const ghostBtn: React.CSSProperties = {
  width: '100%', height: 50, background: 'none', border: '1px solid var(--line)', borderRadius: 14,
  color: 'var(--muted)', fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'var(--font-body)',
};

export function Onboarding({ userId, initialDisplayName, onFinish }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('clase');
  const [clase, setClase] = useState<Clase | null>(null);
  const [name, setName] = useState(initialDisplayName || '');
  const [avatar, setAvatar] = useState<string | null>(() => getUserAvatar(userId));
  const [selectedSueno, setSelectedSueno] = useState<number | null>(null);
  const [metaInput, setMetaInput] = useState('');
  const [copied, setCopied] = useState(false);
  useOverlayA11y(true, undefined, containerRef);

  function copyUserId() {
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const claseInfo = clase ? CLASES.find(c => c.id === clase) : null;
  const claseColor = claseInfo?.color ?? 'var(--blue-600)';

  function next() {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
    else {
      localStorage.setItem(`fm_tutorial_seen_${userId}`, '1');
      onFinish();
    }
  }

  function saveClaseAndNext(c: Clase) {
    setClase(c);
    localStorage.setItem(`fm_clase_${userId}`, c);
    next();
  }

  function saveProfileAndNext() {
    const trimmed = name.trim();
    if (trimmed) setUserNickname(userId, trimmed);
    next();
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToAvatar(file);
      setAvatar(dataUrl);
      setUserAvatar(userId, dataUrl);
    } catch { /* imagen inválida — ignorar */ }
  }

  function saveSuenoAndNext() {
    if (selectedSueno !== null && clase) {
      const s = SUENOS_SUGERIDOS[clase][selectedSueno];
      const fechaObj = new Date();
      fechaObj.setFullYear(fechaObj.getFullYear() + 1);
      addSueno(userId, {
        nombre: s.nombre, emoji: s.emoji, monto: s.monto,
        fechaObjetivo: fechaObj.toISOString().split('T')[0],
        activo: true,
      });
      awardBadge(userId, 'primer-sueno');
    }
    next();
  }

  function saveMetaAndNext() {
    const monto = parseInt(metaInput.replace(/\D/g, ''), 10);
    if (monto > 0) setMeta(userId, { monto, activo: true });
    next();
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9996,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding: 'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Dots de progreso */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexShrink: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            width: i === stepIndex ? 22 : 8, height: 8, borderRadius: 4,
            background: i <= stepIndex ? claseColor : 'var(--line)',
            transition: 'all 0.25s ease',
          }} />
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        <AnimatePresence mode="wait">

          {/* ── Paso 1: Elige tu clase ── */}
          {step === 'clase' && (
            <motion.div key="clase" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>⚔️</div>
                <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                  Elige tu clase
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 260, margin: '0 auto' }}>
                  Define cómo vas a jugar con tu dinero
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                {CLASES.map(c => (
                  <motion.button key={c.id} whileTap={{ scale: 0.98 }} onClick={() => saveClaseAndNext(c.id)} style={{
                    border: `2px solid ${c.color}33`,
                    background: `${c.color}0e`,
                    borderRadius: 16, padding: '16px 18px',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ fontSize: 32, lineHeight: 1 }}>{c.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>{c.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.desc}</div>
                    </div>
                    <div style={{ color: c.color, fontSize: 20, fontWeight: 700 }}>›</div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Paso 2: Perfil (nombre + foto) ── */}
          {step === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                  ¿Cómo te llamas?
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 260, margin: '0 auto' }}>
                  {claseInfo ? `${claseInfo.nombre}, bienvenido` : 'Así te mostraremos en la app'}
                </div>
              </div>
              <label style={{ cursor: 'pointer' }}>
                <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
                <motion.div whileTap={{ scale: 0.96 }} style={{
                  width: 100, height: 100, borderRadius: '50%',
                  background: avatar ? 'var(--card)' : claseColor,
                  border: `4px solid ${claseColor}`,
                  boxShadow: `0 8px 28px ${claseColor}44`,
                  overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36,
                }}>
                  {avatar
                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : (name.trim().charAt(0).toUpperCase() || claseInfo?.emoji || '+')}
                </motion.div>
              </label>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                Toca para añadir una foto · opcional
              </div>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) saveProfileAndNext(); }}
                placeholder="Tu nombre"
                style={{
                  width: '100%', boxSizing: 'border-box', height: 52, padding: '0 16px',
                  border: `1.5px solid ${claseColor}66`, borderRadius: 14, background: 'var(--card)',
                  color: 'var(--ink)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)',
                  textAlign: 'center', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <motion.button whileTap={{ scale: 0.97 }} onClick={saveProfileAndNext}
                  disabled={!name.trim()}
                  style={{ ...primaryBtn, background: name.trim() ? claseColor : 'var(--line)', cursor: name.trim() ? 'pointer' : 'default' }}>
                  Continuar
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Paso 4: Primer Sueño ── */}
          {step === 'sueno' && clase && (
            <motion.div key="sueno" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🌟</div>
                <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                  ¿Cuál es tu primera misión?
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 260, margin: '0 auto' }}>
                  Elige un sueño para empezar a trabajar hacia él
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                {SUENOS_SUGERIDOS[clase].map((s, i) => (
                  <motion.button key={i} whileTap={{ scale: 0.98 }} onClick={() => setSelectedSueno(i)} style={{
                    border: `2px solid ${selectedSueno === i ? claseColor : 'var(--line)'}`,
                    background: selectedSueno === i ? `${claseColor}12` : 'var(--card)',
                    borderRadius: 14, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease',
                  }}>
                    <div style={{ fontSize: 26 }}>{s.emoji}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{s.nombre}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>Meta: ${s.monto.toLocaleString('es-CO')}</div>
                    </div>
                    {selectedSueno === i && <div style={{ color: claseColor, fontSize: 18, fontWeight: 700 }}>✓</div>}
                  </motion.button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <motion.button whileTap={{ scale: 0.97 }} onClick={saveSuenoAndNext}
                  disabled={selectedSueno === null}
                  style={{ ...primaryBtn, background: selectedSueno !== null ? claseColor : 'var(--line)', cursor: selectedSueno !== null ? 'pointer' : 'default' }}>
                  {selectedSueno !== null ? '¡Elegir este sueño! 🎯' : 'Selecciona uno'}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={ghostBtn}>
                  Omitir por ahora
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Paso 5: Meta mensual ── */}
          {step === 'meta' && (
            <motion.div key="meta" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>💰</div>
                <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                  ¿Cuánto puedes gastar este mes?
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 260, margin: '0 auto' }}>
                  Activa tus círculos de bienestar y te avisamos si te pasas del límite
                </div>
              </div>
              <div style={{ width: '100%' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Presupuesto mensual (COP)
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 16, fontWeight: 600, pointerEvents: 'none' }}>$</span>
                  <input
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    value={metaInput}
                    onChange={e => setMetaInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveMetaAndNext(); }}
                    placeholder="2000000"
                    style={{
                      width: '100%', boxSizing: 'border-box', height: 52, padding: '0 16px 0 36px',
                      border: `1.5px solid ${claseColor}66`, borderRadius: 14, background: 'var(--card)',
                      color: 'var(--ink)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)', outline: 'none',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {[1500000, 2500000, 4000000].map(v => (
                    <motion.button key={v} whileTap={{ scale: 0.96 }} onClick={() => setMetaInput(String(v))} style={{
                      flex: 1, height: 36, borderRadius: 10,
                      border: `1.5px solid ${metaInput === String(v) ? claseColor : 'var(--line)'}`,
                      background: metaInput === String(v) ? `${claseColor}12` : 'var(--card)',
                      color: metaInput === String(v) ? claseColor : 'var(--muted)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>
                      ${(v / 1000000).toFixed(1)}M
                    </motion.button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                <motion.button whileTap={{ scale: 0.97 }} onClick={saveMetaAndNext}
                  style={{ ...primaryBtn, background: metaInput ? claseColor : 'var(--line)', cursor: metaInput ? 'pointer' : 'default' }}>
                  Activar presupuesto 🎯
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={ghostBtn}>
                  Configurar después
                </motion.button>
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  Podrás cambiarlo cuando quieras desde ajustes.
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Paso 5: Shortcut iOS / canal Android ── */}
          {step === 'shortcut' && (
            <motion.div key="shortcut" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

              {IS_IOS ? (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>📱</div>
                    <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                      Activa el Shortcut
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
                      Cada SMS bancario llegará solo a la app — sin tocar nada.
                    </div>
                  </div>

                  {/* Install button */}
                  <motion.a
                    href={SHORTCUT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileTap={{ scale: 0.97 }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      width: '100%', height: 52, background: claseColor, borderRadius: 14,
                      textDecoration: 'none', color: '#fff',
                      fontSize: 'var(--text-base)', fontWeight: 700, fontFamily: 'var(--font-body)',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>⬇</span> Instalar Shortcut en iOS
                  </motion.a>

                  {/* Automation steps */}
                  <div style={{ width: '100%', background: 'var(--card)', borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                      Luego activa la automatización
                    </div>
                    <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {IOS_AUTOMATION_STEPS.map((paso, i) => (
                        <li key={i} style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{paso}</li>
                      ))}
                    </ol>
                  </div>

                  {/* userId copy */}
                  <div style={{ width: '100%', background: 'var(--blue-50, #eff6ff)', border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--blue-700, #1d4ed8)', marginBottom: 8 }}>
                      La primera vez te pide tu ID — aquí está:
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--blue-700, #1d4ed8)', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {userId}
                      </span>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={copyUserId}
                        style={{
                          flexShrink: 0, background: copied ? '#10b981' : 'var(--blue-600)',
                          border: 'none', borderRadius: 8, padding: '6px 12px',
                          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          fontFamily: 'var(--font-body)', transition: 'background 0.2s',
                        }}
                      >
                        {copied ? '✓ Copiado' : 'Copiar'}
                      </motion.button>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                      Solo lo pregunta una vez — queda guardado para siempre.
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={next}
                      style={{ ...primaryBtn, background: claseColor }}>
                      ¡Listo, ya lo instalé!
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={ghostBtn}>
                      Lo configuro después
                    </motion.button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>🔔</div>
                    <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', marginBottom: 8 }}>
                      Captura automática
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
                      En Android usamos notificaciones push. Descarga la app Finanzas Captura y configúrala desde Ajustes → Canales.
                    </div>
                  </div>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={next}
                    style={{ ...primaryBtn, background: claseColor, width: '100%' }}>
                    Entendido, continuar
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={ghostBtn}>
                    Lo configuro después
                  </motion.button>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
}
