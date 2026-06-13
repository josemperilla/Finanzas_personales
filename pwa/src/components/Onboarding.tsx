import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { setUserNickname, setUserAvatar, getUserAvatar } from '../lib/profiles';
import { resizeImageToAvatar } from '../lib/avatar';
import { ImportarExtracto } from './ImportarExtracto';
import { TutorialCanales } from './TutorialCanales';
import { useOverlayA11y } from '../lib/useOverlayA11y';

interface Props {
  userId: string;
  initialDisplayName?: string;
  onFinish: () => void;
}

type Step = 'name' | 'photo' | 'import' | 'tutorial';
const STEPS: Step[] = ['name', 'photo', 'import', 'tutorial'];

const primaryBtn: React.CSSProperties = {
  height: 50, borderRadius: 14, border: 'none', background: 'var(--blue-700)',
  color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
};
const ghostBtn: React.CSSProperties = {
  height: 50, background: 'none', border: '1px solid var(--line)', borderRadius: 14,
  color: 'var(--muted)', fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'var(--font-body)',
};

export function Onboarding({ userId, initialDisplayName, onFinish }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(initialDisplayName || '');
  const [avatar, setAvatar] = useState<string | null>(() => getUserAvatar(userId));
  useOverlayA11y(true, undefined, containerRef);

  function next() {
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
    else onFinish();
  }

  function saveNameAndNext() {
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

  // Pasos que reutilizan overlays existentes (pantalla completa propia).
  if (step === 'import') {
    return <ImportarExtracto userId={userId} onClose={next} />;
  }
  if (step === 'tutorial') {
    return <TutorialCanales userId={userId} onClose={onFinish} />;
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
        alignItems: 'center', justifyContent: 'center',
        gap: 28,
        padding: 'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Progreso */}
      <div style={{ display: 'flex', gap: 8 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{
            width: i === stepIndex ? 22 : 8, height: 8, borderRadius: 4,
            background: i <= stepIndex ? 'var(--blue-600)' : 'var(--line)',
            transition: 'all 0.25s ease',
          }} />
        ))}
      </div>

      {step === 'name' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 48 }}>👋</div>
            <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
              ¿Cómo te llamas?
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)', textAlign: 'center', maxWidth: 280 }}>
              Así te mostraremos en la app. Puedes cambiarlo luego en Ajustes.
            </div>
          </div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveNameAndNext(); }}
            placeholder="Tu nombre"
            style={{
              width: '100%', maxWidth: 300, boxSizing: 'border-box', height: 52, padding: '0 16px',
              border: '1.5px solid var(--line)', borderRadius: 14, background: 'var(--card)',
              color: 'var(--ink)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)',
              textAlign: 'center', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
            <motion.button whileTap={{ scale: 0.97 }} onClick={saveNameAndNext} style={primaryBtn}>
              Continuar
            </motion.button>
          </div>
        </>
      )}

      {step === 'photo' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div id="onboarding-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
              Tu foto de perfil
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)', textAlign: 'center', maxWidth: 280 }}>
              Opcional. Le da un toque personal a tu cuenta.
            </div>
          </div>
          <label style={{ cursor: 'pointer' }}>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: avatar ? 'var(--card)' : 'var(--grad-brand)',
              border: '3px solid #fff', boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
              overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40,
            }}>
              {avatar
                ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : (name.trim().charAt(0).toUpperCase() || '+')}
            </div>
          </label>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--blue-700)', fontWeight: 600 }}>
            Toca el círculo para subir una foto
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
            <motion.button whileTap={{ scale: 0.97 }} onClick={next} style={primaryBtn}>
              {avatar ? 'Continuar' : 'Omitir'}
            </motion.button>
          </div>
        </>
      )}
    </motion.div>
  );
}
