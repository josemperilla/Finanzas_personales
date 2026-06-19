import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { setUserNickname, setUserAvatar, getUserAvatar } from '../lib/profiles';
import { resizeImageToAvatar } from '../lib/avatar';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { addSueno } from '../lib/suenos';
import { setMeta } from '../lib/meta';
import { awardBadge } from '../lib/gamification';
import { setBudget } from '../lib/budgets';

type Clase = 'hormiga' | 'administrador' | 'sonador';

const PREGUNTAS_PERFIL = [
  {
    titulo: 'Control de gasto',
    pregunta: '¿Qué haces cuando ves algo que quieres pero no planeabas comprar?',
    opciones: [
      { label: 'Lo compro si me alcanza', emoji: '💳', score: 0 },
      { label: 'Lo pienso unos días antes', emoji: '⏳', score: 1 },
      { label: 'Solo si cabe en mi presupuesto', emoji: '📊', score: 2 },
      { label: 'Casi nunca compro no planeado', emoji: '🛡️', score: 3 },
    ],
  },
  {
    titulo: 'Manejo de excedentes',
    pregunta: 'Si te dan $500.000 extra este mes, ¿qué haces?',
    opciones: [
      { label: 'Me doy un gusto pendiente', emoji: '🎉', score: 0 },
      { label: 'Lo guardo por si acaso', emoji: '🐷', score: 1 },
      { label: 'Lo pongo en una meta específica', emoji: '🎯', score: 2 },
      { label: 'Lo invierto o en un CDT', emoji: '📈', score: 3 },
    ],
  },
  {
    titulo: 'Puntualidad de pagos',
    pregunta: '¿Cómo manejas tus pagos fijos (arriendo, servicios, cuotas)?',
    opciones: [
      { label: 'A veces se me pasan', emoji: '😅', score: 0 },
      { label: 'Los pago cuando recuerdo', emoji: '📱', score: 1 },
      { label: 'Casi siempre a tiempo', emoji: '✅', score: 2 },
      { label: 'Todo automatizado, nunca fallo', emoji: '🤖', score: 3 },
    ],
  },
];

const CATEGORIAS_PROBLEMA = [
  { id: 'Domicilios', emoji: '🍕' },
  { id: 'Restaurantes', emoji: '🍽️' },
  { id: 'Compras', emoji: '🛍️' },
  { id: 'Entretenimiento', emoji: '🎮' },
  { id: 'Café', emoji: '☕' },
  { id: 'Transporte', emoji: '🚕' },
  { id: 'Ropa', emoji: '👔' },
  { id: 'Suscripciones', emoji: '📱' },
];

const PRESUPUESTOS_SUGERIDOS: Record<Clase, Record<string, number>> = {
  hormiga:       { Domicilios: 260_000, Restaurantes: 300_000, Compras: 200_000, Entretenimiento: 100_000, Café: 80_000, Transporte: 200_000, Ropa: 150_000, Suscripciones: 100_000 },
  administrador: { Domicilios: 400_000, Restaurantes: 500_000, Compras: 350_000, Entretenimiento: 200_000, Café: 130_000, Transporte: 320_000, Ropa: 250_000, Suscripciones: 150_000 },
  sonador:       { Domicilios: 180_000, Restaurantes: 220_000, Compras: 150_000, Entretenimiento: 80_000,  Café: 60_000,  Transporte: 160_000, Ropa: 100_000, Suscripciones: 80_000 },
};

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

type Step = 'perfil' | 'profile' | 'sueno' | 'meta' | 'shortcut';
const STEPS: Step[] = ['perfil', 'profile', 'sueno', 'meta', 'shortcut'];

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/57a54a9b81264b9eb74a676be144f858';
const IOS_AUTOMATION_STEPS = [
  'Abre Atajos → Automatización → + → Nueva Automatización → Mensaje',
  'En "contiene" escribe: $  —  deja "De" en "Cualquiera"',
  'Activa "Ejecutar inmediatamente" → desactiva "Preguntar antes de ejecutar"',
  'Toca Siguiente → selecciona el Shortcut recién instalado → Listo',
];

const primaryBtn: React.CSSProperties = {
  width: '100%', height: 52, borderRadius: 16, border: 'none',
  background: 'var(--grad-orange)', color: '#fff',
  fontSize: 'var(--text-base)', fontWeight: 700, cursor: 'pointer',
  fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
  boxShadow: '0 8px 20px rgba(234,88,12,.35)',
};
const ghostBtn: React.CSSProperties = {
  width: '100%', height: 50, background: 'none', border: '1px solid var(--line)', borderRadius: 14,
  color: 'var(--muted)', fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'var(--font-body)',
};

export function Onboarding({ userId, initialDisplayName, onFinish }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('perfil');
  const [clase, setClase] = useState<Clase | null>(null);
  const [perfilSubStep, setPerfilSubStep] = useState(0); // 0-2: preguntas, 3: categorías
  const [perfilRespuestas, setPerfilRespuestas] = useState<number[]>([]);
  const [categoriasProblema, setCategoriasProblema] = useState<string[]>([]);
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

  const CLASE_COLORS: Record<Clase, string> = { hormiga: '#3b82f6', administrador: '#8b5cf6', sonador: '#f59e0b' };
  const CLASE_EMOJIS: Record<Clase, string> = { hormiga: '🐜', administrador: '📊', sonador: '✨' };
  const claseColor = clase ? CLASE_COLORS[clase] : '#3b82f6';

  function next() {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
    else {
      localStorage.setItem(`fm_tutorial_seen_${userId}`, '1');
      onFinish();
    }
  }

  function handlePerfilRespuesta(score: number) {
    const newRespuestas = [...perfilRespuestas, score];
    setPerfilRespuestas(newRespuestas);
    if (perfilSubStep < 2) {
      setPerfilSubStep(perfilSubStep + 1);
    } else {
      setPerfilSubStep(3); // → categorías problema
    }
  }

  function toggleCategoriaProblema(cat: string) {
    setCategoriasProblema(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  function savePerfilAndNext() {
    const score = perfilRespuestas.reduce((a, b) => a + b, 0);
    const claseAsignada: Clase = score <= 3 ? 'hormiga' : score <= 6 ? 'administrador' : 'sonador';
    setClase(claseAsignada);
    localStorage.setItem(`fm_clase_${userId}`, claseAsignada);
    localStorage.setItem(`fm_perfil_score_${userId}`, JSON.stringify({ score, respuestas: perfilRespuestas }));
    localStorage.setItem(`fm_categorias_problema_${userId}`, JSON.stringify(categoriasProblema));
    const presupuestos = PRESUPUESTOS_SUGERIDOS[claseAsignada];
    for (const cat of categoriasProblema) {
      if (presupuestos[cat]) setBudget(userId, cat, presupuestos[cat]);
    }
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
      {/* Logo mark */}
      <div style={{
        width: 64, height: 64, borderRadius: 22,
        background: 'var(--grad-orange)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(234,88,12,.35)',
        fontSize: 28, marginBottom: 8, flexShrink: 0,
      }}>
        💰
      </div>

      {/* Dots de progreso */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexShrink: 0 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            width: i === stepIndex ? 24 : 8, height: 8, borderRadius: 999,
            background: i <= stepIndex ? (i === stepIndex ? 'var(--blue)' : 'var(--blue-soft)') : 'var(--line)',
            transition: 'all 0.25s ease',
          }} />
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        <AnimatePresence mode="wait">

          {/* ── Paso 1: Cuestionario de perfil financiero ── */}
          {step === 'perfil' && (
            <motion.div key={`perfil-${perfilSubStep}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>

              {perfilSubStep < 3 ? (
                // Preguntas de escenario (1-3)
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
                      {perfilSubStep + 1} / 3 · {PREGUNTAS_PERFIL[perfilSubStep].titulo}
                    </div>
                    <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', lineHeight: 1.3 }}>
                      {PREGUNTAS_PERFIL[perfilSubStep].pregunta}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                    {PREGUNTAS_PERFIL[perfilSubStep].opciones.map(op => (
                      <motion.button
                        key={op.score}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handlePerfilRespuesta(op.score)}
                        style={{
                          border: '1.5px solid var(--line)', background: 'var(--card)',
                          borderRadius: 14, padding: '14px 16px',
                          display: 'flex', alignItems: 'center', gap: 12,
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{op.emoji}</div>
                        <div style={{ fontSize: 14, color: 'var(--ink)', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>{op.label}</div>
                      </motion.button>
                    ))}
                  </div>
                </>
              ) : (
                // Categorías problema (multi-select)
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 10 }}>🎯</div>
                    <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', marginBottom: 8 }}>
                      ¿En qué áreas quieres mejorar?
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 280, margin: '0 auto' }}>
                      Selecciona las categorías donde más gastas (opcional)
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%' }}>
                    {CATEGORIAS_PROBLEMA.map(c => {
                      const selected = categoriasProblema.includes(c.id);
                      return (
                        <motion.button
                          key={c.id}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleCategoriaProblema(c.id)}
                          style={{
                            border: `2px solid ${selected ? 'var(--blue)' : 'var(--line)'}`,
                            background: selected ? 'var(--blue-50, #eff6ff)' : 'var(--card)',
                            borderRadius: 14, padding: '12px 14px',
                            display: 'flex', alignItems: 'center', gap: 10,
                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                          }}
                        >
                          <span style={{ fontSize: 22 }}>{c.emoji}</span>
                          <span style={{ fontSize: 13, fontWeight: selected ? 700 : 400, color: selected ? 'var(--blue)' : 'var(--ink)', fontFamily: 'var(--font-body)' }}>
                            {c.id}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={savePerfilAndNext} style={primaryBtn}>
                      {categoriasProblema.length > 0
                        ? `Continuar con ${categoriasProblema.length} área${categoriasProblema.length !== 1 ? 's' : ''} →`
                        : 'Continuar →'}
                    </motion.button>
                  </div>
                </>
              )}
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
                  {'Así te mostraremos en la app'}
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
                    : (name.trim().charAt(0).toUpperCase() || (clase ? CLASE_EMOJIS[clase] : '+'))}
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
