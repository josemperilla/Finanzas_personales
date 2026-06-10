import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateInvite, redeemInvite } from '../lib/api';
import { softSpring, quickEase, pageVariants } from '../lib/motion';

interface Props {
  token: string;
  onComplete: (userId: string) => void;
  onCancel: () => void;
}

type Phase = 'checking' | 'invalid' | 'name' | 'pin' | 'photo' | 'tutorial';

// Build a safe userId slug from a free-text name: lowercase, strip accents,
// keep [a-z0-9], ensure it starts with a letter, cap at 20 chars.
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const trimmed = base.replace(/^[^a-z]+/, '');
  return trimmed.slice(0, 20);
}

const USER_ID_RE = /^[a-z][a-z0-9]{1,19}$/;

const TUTORIAL_CARDS = [
  { icon: '＋', title: 'Registra tus gastos', body: 'Toca el botón + para agregar un movimiento en segundos, o dícталo por voz.' },
  { icon: '📄', title: 'Importa tus extractos', body: 'Sube el CSV o PDF de tu banco desde Ajustes y se categoriza solo.' },
  { icon: '💬', title: 'Pregúntale al asistente', body: '¿Cuánto gasté en comida este mes? El chat te responde con tus datos.' },
];

export function Onboarding({ token, onComplete, onCancel }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [invalidReason, setInvalidReason] = useState<string>('');

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const [pin, setPin] = useState('');
  const [avatar, setAvatar] = useState<string>('');
  const [tutorialIdx, setTutorialIdx] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Validate the invite on mount ──
  useEffect(() => {
    let active = true;
    validateInvite(token).then(res => {
      if (!active) return;
      if (res.valid) {
        if (res.suggestedName) { setName(res.suggestedName); setSlug(slugify(res.suggestedName)); }
        setPhase('name');
      } else {
        setInvalidReason(res.reason || 'invalid');
        setPhase('invalid');
      }
    });
    return () => { active = false; };
  }, [token]);

  // Keep the slug in sync with the name until the user edits it manually.
  const handleNameChange = (v: string) => {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  };

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { userId } = await redeemInvite({ token, userId: slug, displayName: name.trim() || slug, pin, avatar: avatar || undefined });
      // Persist the new session so the app lands logged-in.
      localStorage.setItem('fm_profile', userId);
      sessionStorage.setItem(`fm_unlocked_${userId}`, '1');
      // Drop ?invite from the URL so a refresh doesn't re-trigger onboarding.
      try { window.history.replaceState({}, '', window.location.pathname); } catch { /* noop */ }
      setSubmitting(false);
      setPhase('tutorial');
    } catch (err) {
      setSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : 'No se pudo crear tu cuenta');
    }
  }, [token, slug, name, pin, avatar]);

  const finishedUserId = slug;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(56px, env(safe-area-inset-top)) 28px max(40px, env(safe-area-inset-bottom))',
        fontFamily: 'var(--font-body)', overflowY: 'auto',
      }}
    >
      <AnimatePresence mode="wait">
        {phase === 'checking' && (
          <motion.div key="checking" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }} />
            <span style={{ color: 'var(--muted)', fontSize: 14 }}>Verificando tu invitación…</span>
          </motion.div>
        )}

        {phase === 'invalid' && (
          <motion.div key="invalid" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 44 }}>{invalidReason === 'unavailable' ? '🛠️' : '🔗'}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>
              {invalidReason === 'unavailable' ? 'Invitaciones aún no activas' : 'Invitación no válida'}
            </div>
            <p style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 280, margin: 0, lineHeight: 1.5 }}>
              {invalidReason === 'unavailable'
                ? 'El administrador aún no ha activado las invitaciones en el servidor. Inténtalo más tarde.'
                : invalidReason === 'expired'
                ? 'Esta invitación expiró. Pídele al administrador un nuevo enlace.'
                : invalidReason === 'redeemed'
                ? 'Esta invitación ya se usó. Pídele al administrador un nuevo enlace.'
                : 'No pudimos validar este enlace. Pídele al administrador un nuevo enlace.'}
            </p>
            <button onClick={onCancel} style={primaryBtn}>Volver al inicio</button>
          </motion.div>
        )}

        {phase === 'name' && (
          <motion.div key="name" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, maxWidth: 420, width: '100%', margin: '0 auto' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: 'var(--ink)', letterSpacing: '-0.02em', marginBottom: 8 }}>
                Te damos la bienvenida 👋
              </div>
              <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
                Vamos a crear tu perfil de finanzas. Empecemos por tu nombre.
              </p>
            </div>

            <div>
              <label style={fieldLabel}>Tu nombre</label>
              <input
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="Ej. Carlos"
                autoFocus
                style={textInput}
              />
            </div>

            <div>
              <label style={fieldLabel}>Tu usuario</label>
              <input
                value={slug}
                onChange={e => { setSlugEdited(true); setSlug(slugify(e.target.value)); }}
                placeholder="carlos"
                style={{ ...textInput, fontFamily: 'var(--font-mono)' }}
              />
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 2px 0' }}>
                Minúsculas, sin espacios. Así identificamos tus datos.
              </p>
            </div>

            <button
              disabled={!USER_ID_RE.test(slug)}
              onClick={() => setPhase('pin')}
              style={{ ...primaryBtn, opacity: USER_ID_RE.test(slug) ? 1 : 0.5, cursor: USER_ID_RE.test(slug) ? 'pointer' : 'not-allowed' }}
            >
              Continuar
            </button>
          </motion.div>
        )}

        {phase === 'pin' && (
          <PinSetup key="pin" onBack={() => setPhase('name')} onDone={(p) => { setPin(p); setPhase('photo'); }} />
        )}

        {phase === 'photo' && (
          <PhotoStep key="photo" avatar={avatar} submitting={submitting} error={submitError}
            onAvatar={setAvatar} onContinue={handleSubmit} onBack={() => setPhase('pin')} />
        )}

        {phase === 'tutorial' && (
          <motion.div key="tutorial" variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28, maxWidth: 420, width: '100%', margin: '0 auto' }}>
            <AnimatePresence mode="wait">
              <motion.div key={tutorialIdx} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={quickEase}
                style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 88, height: 88, borderRadius: '28px', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, boxShadow: '0 10px 30px rgba(15,23,42,0.16)' }}>
                  {TUTORIAL_CARDS[tutorialIdx].icon}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)' }}>
                  {TUTORIAL_CARDS[tutorialIdx].title}
                </div>
                <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0, lineHeight: 1.5, maxWidth: 300 }}>
                  {TUTORIAL_CARDS[tutorialIdx].body}
                </p>
              </motion.div>
            </AnimatePresence>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {TUTORIAL_CARDS.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === tutorialIdx ? 'var(--blue-600)' : 'var(--line)', transition: 'background 0.2s' }} />
              ))}
            </div>

            <button
              onClick={() => {
                if (tutorialIdx < TUTORIAL_CARDS.length - 1) setTutorialIdx(i => i + 1);
                else onComplete(finishedUserId);
              }}
              style={primaryBtn}
            >
              {tutorialIdx < TUTORIAL_CARDS.length - 1 ? 'Siguiente' : 'Empezar a usar la app'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── PIN setup sub-step (enter + confirm) ─────────────────────
function PinSetup({ onBack, onDone }: {
  onBack: () => void;
  onDone: (pin: string) => void;
}) {
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [digits, setDigits] = useState<string[]>([]);
  const [mismatch, setMismatch] = useState(false);
  const digitsRef = useRef<string[]>([]);

  const reset = () => { digitsRef.current = []; setDigits([]); };

  const handleDigit = (d: string) => {
    const cur = digitsRef.current;
    if (cur.length >= 4) return;
    const next = [...cur, d];
    digitsRef.current = next;
    setDigits(next);
    setMismatch(false);

    if (next.length === 4) {
      const pin = next.join('');
      if (stage === 'enter') {
        setFirst(pin);
        setTimeout(() => { setStage('confirm'); reset(); }, 180);
      } else {
        if (pin === first) {
          onDone(pin);
        } else {
          setMismatch(true);
          setTimeout(() => { setStage('enter'); setFirst(''); reset(); }, 700);
        }
      }
    }
  };

  const handleDelete = () => {
    const next = digitsRef.current.slice(0, -1);
    digitsRef.current = next;
    setDigits(next);
  };

  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['', '0', '⌫']];
  const title = stage === 'enter' ? 'Crea tu PIN' : 'Confirma tu PIN';
  const subtitle = mismatch ? 'No coincide, intenta de nuevo'
    : stage === 'enter' ? 'Lo usarás cada vez que entres' : 'Escríbelo otra vez';

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', maxWidth: 360, width: '100%', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 14, color: mismatch ? '#ef4444' : 'var(--muted)' }}>{subtitle}</div>
      </div>

      <motion.div animate={mismatch ? { x: [-12, 12, -8, 8, -4, 4, 0], transition: { duration: 0.45 } } : { x: 0 }} style={{ display: 'flex', gap: 20 }}>
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} animate={{ scale: digits.length > i ? 1.15 : 1, backgroundColor: digits.length > i ? 'var(--blue-700)' : 'rgba(0,0,0,0)', borderColor: digits.length > i ? 'var(--blue-700)' : 'rgba(15,23,42,0.22)' }} transition={softSpring}
            style={{ width: 13, height: 13, borderRadius: '50%', border: '2.5px solid rgba(15,23,42,0.22)' }} />
        ))}
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, width: '100%', maxWidth: 300 }}>
        {rows.flat().map((key, idx) => key === '' ? <div key={idx} /> : (
          <motion.button key={idx} whileTap={{ scale: 0.88 }}
            onClick={() => key === '⌫' ? handleDelete() : handleDigit(key)}
            style={{
              height: 72, borderRadius: 9999,
              background: key === '⌫' ? 'transparent' : 'var(--card)',
              border: key === '⌫' ? 'none' : '1px solid rgba(15,23,42,0.06)',
              boxShadow: key === '⌫' ? 'none' : 'var(--shadow-card)',
              color: key === '⌫' ? 'var(--muted)' : 'var(--ink)',
              fontFamily: key === '⌫' ? 'var(--font-body)' : 'var(--font-display)',
              fontSize: key === '⌫' ? 22 : 28, fontWeight: key === '⌫' ? 400 : 600,
              cursor: 'pointer', letterSpacing: '-0.02em',
              WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
            }}>
            {key}
          </motion.button>
        ))}
      </div>

      <button onClick={onBack} style={textBtn}>‹ Atrás</button>
    </motion.div>
  );
}

// ── Optional photo sub-step ──────────────────────────────────
function PhotoStep({ avatar, submitting, error, onAvatar, onContinue, onBack }: {
  avatar: string;
  submitting: boolean;
  error: string | null;
  onAvatar: (dataUrl: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Center-crop to a 200x200 square thumbnail, JPEG 0.6 → ~8-15KB base64.
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        onAvatar(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit" transition={quickEase}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 24, maxWidth: 420, width: '100%', margin: '0 auto', textAlign: 'center' }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', marginBottom: 8 }}>Agrega una foto</div>
        <p style={{ fontSize: 15, color: 'var(--muted)', margin: 0 }}>Opcional — para personalizar tu perfil.</p>
      </div>

      <button onClick={() => inputRef.current?.click()} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: avatar ? 'transparent' : 'var(--grad-brand)',
          border: '3px solid #fff', boxShadow: '0 8px 28px rgba(15,23,42,0.16)',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 40,
        }}>
          {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '📷'}
        </div>
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {error && <p style={{ color: '#ef4444', fontSize: 13.5, margin: 0, maxWidth: 300 }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300 }}>
        <button onClick={() => inputRef.current?.click()} disabled={submitting} style={secondaryBtn}>
          {avatar ? 'Cambiar foto' : 'Subir foto'}
        </button>
        <button onClick={onContinue} disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Creando tu cuenta…' : avatar ? 'Continuar' : 'Omitir por ahora'}
        </button>
        <button onClick={onBack} disabled={submitting} style={textBtn}>‹ Atrás</button>
      </div>
    </motion.div>
  );
}

// ── Shared styles ────────────────────────────────────────────
const primaryBtn: React.CSSProperties = {
  height: 52, borderRadius: 14, border: 'none', background: 'var(--blue-700)',
  color: '#fff', fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-body)',
  cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent',
};
const secondaryBtn: React.CSSProperties = {
  height: 52, borderRadius: 14, border: '1.5px solid var(--line)', background: 'var(--card)',
  color: 'var(--ink)', fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-body)',
  cursor: 'pointer', width: '100%', WebkitTapHighlightColor: 'transparent',
};
const textBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--muted)', fontSize: 14,
  fontFamily: 'var(--font-body)', cursor: 'pointer', padding: '12px 16px',
};
const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 12.5, color: 'var(--muted)', marginBottom: 6, marginLeft: 2,
};
const textInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 50, padding: '0 14px',
  border: '1.5px solid var(--line)', borderRadius: 12, background: 'var(--card)',
  color: 'var(--ink)', fontSize: 16, fontFamily: 'var(--font-body)', outline: 'none',
};
