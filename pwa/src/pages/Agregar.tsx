import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { saveTransaction, parseVoice, ManualTransaction } from '../lib/api';
import { CATEGORIES } from '../lib/config';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';

interface Props {
  onSaved: () => void;
}

type Mode = 'form' | 'voice';
type VoiceState = 'idle' | 'recording' | 'processing' | 'prefilled';

interface FormData {
  monto: string;
  comercio: string;
  banco: string;
  categoria: string;
  tipo: string;
  fecha: string;
}

const defaultForm: FormData = {
  monto: '', comercio: '', banco: 'Otro', categoria: '', tipo: 'Compra',
  fecha: new Date().toISOString().slice(0, 10),
};

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  height: 54, padding: '0 16px',
  background: '#fff',
  border: '1.5px solid var(--line)',
  borderRadius: 'var(--r-md)',
  color: 'var(--ink)', fontSize: 16,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  appearance: 'none' as const,
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block', marginBottom: 8,
  color: 'var(--ink-2)', fontSize: 13, fontWeight: 600,
  letterSpacing: '-0.01em',
};

export function Agregar({ onSaved }: Props) {
  const [mode, setMode] = useState<Mode>('form');
  const [form, setForm] = useState<FormData>(defaultForm);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const recognitionRef = useRef<any>(null);
  const [prefillGlow, setPrefillGlow] = useState(false);

  function focusStyle(el: HTMLInputElement | HTMLSelectElement) {
    el.style.borderColor = 'var(--blue-600)';
    el.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.12)';
  }
  function blurStyle(el: HTMLInputElement | HTMLSelectElement) {
    el.style.borderColor = 'var(--line)';
    el.style.boxShadow = 'none';
  }

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleMontoInput(raw: string) {
    setForm(f => ({ ...f, monto: raw.replace(/\D/g, '') }));
  }

  async function handleSubmit() {
    if (!form.monto || !form.comercio) {
      showToast('Monto y comercio son requeridos', false);
      return;
    }
    setSaving(true);
    try {
      const data: ManualTransaction = {
        banco: form.banco, tipo: form.tipo,
        monto: Number(form.monto), comercio: form.comercio,
        categoria: form.categoria || 'Otro', fecha: form.fecha,
      };
      await saveTransaction(data);
      setForm(defaultForm);
      showToast('Transacción guardada', true);
      onSaved();
    } catch {
      showToast('Error al guardar. Intenta de nuevo.', false);
    } finally {
      setSaving(false);
    }
  }

  function startVoice() {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) { showToast('Tu navegador no soporta entrada de voz', false); return; }
    const rec = new SpeechRecognitionCtor();
    rec.lang = 'es-CO'; rec.continuous = false; rec.interimResults = true;
    recognitionRef.current = rec;
    rec.onstart = () => setVoiceState('recording');
    rec.onresult = (e: any) => {
      setTranscript(Array.from(e.results as any[]).map((r: any) => r[0].transcript).join(''));
    };
    rec.onend = async () => {
      const t = transcript;
      if (!t.trim()) { setVoiceState('idle'); return; }
      setVoiceState('processing');
      try {
        const parsed = await parseVoice(t);
        setForm({
          monto: String(Math.round(parsed.monto || 0)),
          comercio: parsed.comercio || '', banco: parsed.banco || 'Otro',
          categoria: parsed.categoria || 'Otro', tipo: parsed.tipo || 'Compra',
          fecha: new Date().toISOString().slice(0, 10),
        });
        setMode('form'); setVoiceState('prefilled');
        setPrefillGlow(true); setTimeout(() => setPrefillGlow(false), 1500);
        setTranscript('');
      } catch {
        showToast('Error al analizar la voz. Intenta de nuevo.', false);
        setVoiceState('idle');
      }
    };
    rec.onerror = () => setVoiceState('idle');
    setTranscript(''); rec.start();
  }

  function stopVoice() { recognitionRef.current?.stop(); }

  return (
    <div style={{ padding: '0 20px 100px', fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ paddingTop: 'max(20px, env(safe-area-inset-top))', marginBottom: 22 }}>
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Nueva entrada
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
          Agregar
        </h1>
      </div>

      {/* Mode toggle */}
      <motion.div style={{
        display: 'flex', background: '#fff', border: '1.5px solid var(--line)',
        borderRadius: 'var(--r-lg)', padding: 3, marginBottom: 20,
      }}>
        {(['form', 'voice'] as Mode[]).map(m => (
          <motion.button key={m} whileTap={{ scale: 0.96 }} onClick={() => setMode(m)} style={{
            flex: 1, padding: '9px', borderRadius: 13, border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-body)',
            background: mode === m ? 'var(--blue-700)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--muted)',
            transition: 'all 0.15s ease',
          }}>
            {m === 'form' ? 'Formulario' : 'Voz'}
          </motion.button>
        ))}
      </motion.div>

      {/* FORM */}
      <AnimatePresence mode="wait">
      {mode === 'form' && (
        <motion.div
          key="form"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          exit={{ opacity: 0, y: -8 }}
          transition={quickEase}
          style={{ background: '#fff', borderRadius: 'var(--r-2xl)', padding: 20, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {/* Monto */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Monto (COP)</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
                color: form.monto ? 'var(--blue-600)' : 'var(--muted-2)',
                fontSize: 14, fontWeight: 600, pointerEvents: 'none',
              }}>$</span>
              <input
                type="text" inputMode="numeric" placeholder="0"
                value={form.monto ? Number(form.monto).toLocaleString('es-CO') : ''}
                onChange={e => handleMontoInput(e.target.value)}
                style={{
                  ...inputStyle, paddingLeft: 30,
                  fontFamily: 'var(--font-mono)', fontWeight: 600,
                  boxShadow: prefillGlow && form.monto ? '0 0 0 4px rgba(37,99,235,0.12)' : undefined,
                  borderColor: prefillGlow && form.monto ? 'var(--blue-600)' : undefined,
                }}
                onFocus={e => focusStyle(e.target)}
                onBlur={e => blurStyle(e.target)}
              />
            </div>
          </motion.div>

          {/* Comercio */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Comercio</label>
            <input type="text" placeholder="Nombre del lugar" value={form.comercio}
              onChange={e => setForm(f => ({ ...f, comercio: e.target.value }))}
              style={{
                ...inputStyle,
                boxShadow: prefillGlow && form.comercio ? '0 0 0 4px rgba(37,99,235,0.12)' : undefined,
                borderColor: prefillGlow && form.comercio ? 'var(--blue-600)' : undefined,
              }}
              onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}
            />
          </motion.div>

          {/* Banco */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Banco</label>
            <select value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))}
              style={inputStyle} onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}>
              {['Bogotá', 'Itaú', 'Otro'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </motion.div>

          {/* Categoría */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Categoría</label>
            <select value={form.categoria}
              onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
              style={{
                ...inputStyle,
                boxShadow: prefillGlow && form.categoria ? '0 0 0 4px rgba(37,99,235,0.12)' : undefined,
                borderColor: prefillGlow && form.categoria ? 'var(--blue-600)' : undefined,
              }}
              onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}>
              <option value="">Seleccionar...</option>
              {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </motion.div>

          {/* Tipo */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Tipo</label>
            <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
              style={inputStyle} onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}>
              {['Compra', 'Débito', 'Transferencia', 'Otro'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </motion.div>

          {/* Fecha */}
          <motion.div variants={riseItem} transition={quickEase}>
            <label style={labelStyle}>Fecha</label>
            <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
              style={{ ...inputStyle, colorScheme: 'light' }}
              onFocus={e => focusStyle(e.target)} onBlur={e => blurStyle(e.target)}
            />
          </motion.div>

          <motion.button variants={riseItem} transition={quickEase} whileTap={{ scale: saving ? 1 : 0.98 }} onClick={handleSubmit} disabled={saving} style={{
            width: '100%', height: 54, background: saving ? 'var(--blue-300)' : 'var(--blue-700)',
            border: 'none', borderRadius: 'var(--r-lg)', color: '#fff', fontSize: 16, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
            boxShadow: saving ? 'none' : 'var(--shadow-blue)',
            transition: 'all 0.15s ease', marginTop: 2,
          }}>
            {saving ? 'Guardando...' : 'Guardar transacción'}
          </motion.button>
        </motion.div>
      )}

      {/* VOICE */}
      {mode === 'voice' && (
        <motion.div
          key="voice"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={quickEase}
          style={{
          background: '#fff', borderRadius: 'var(--r-2xl)', padding: '44px 20px',
          boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
        }}>
          {voiceState === 'processing' ? (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: '2.5px solid var(--line)', borderTopColor: 'var(--blue-600)',
                animation: 'spin 0.9s linear infinite',
              }} />
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Analizando con IA...</p>
            </>
          ) : (
            <>
              <div style={{ position: 'relative' }}>
              {voiceState === 'recording' && [0, 1, 2].map(i => (
                <motion.span
                  key={i}
                  initial={{ scale: 0.85, opacity: 0.34 }}
                  animate={{ scale: 1.75, opacity: 0 }}
                  transition={{ duration: 1.25, repeat: Infinity, delay: i * 0.28, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    border: '1.5px solid #fca5a5', pointerEvents: 'none',
                  }}
                />
              ))}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onMouseDown={startVoice} onTouchStart={e => { e.preventDefault(); startVoice(); }}
                onMouseUp={stopVoice} onTouchEnd={e => { e.preventDefault(); stopVoice(); }}
                style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: voiceState === 'recording' ? '#fee2e2' : 'var(--blue-50)',
                  border: `1.5px solid ${voiceState === 'recording' ? '#fca5a5' : 'var(--blue-300)'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: voiceState === 'recording' ? 'pulse 1.2s ease-in-out infinite' : 'none',
                  transition: 'all 0.2s ease',
                }}>
                <MicIcon recording={voiceState === 'recording'} />
              </motion.button>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: 0 }}>
                {voiceState === 'recording' ? 'Escuchando...' : 'Mantén presionado para hablar'}
              </p>
              <AnimatePresence>
              {transcript && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={quickEase}
                  style={{
                  color: 'var(--ink-2)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', margin: 0,
                  background: 'var(--surface)', borderRadius: 12, padding: '10px 14px',
                  maxWidth: 280, lineHeight: 1.5, border: '1px solid var(--line)',
                }}>
                  "{transcript}"
                </motion.p>
              )}
              </AnimatePresence>
            </>
          )}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          transition={softSpring}
          style={{
          position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom))', left: 16, right: 16,
          padding: '13px 16px', borderRadius: 12,
          background: '#fff', border: `1px solid ${toast.ok ? '#86efac' : '#fca5a5'}`,
          color: toast.ok ? '#15803d' : '#b91c1c',
          fontSize: 13.5, fontWeight: 600, textAlign: 'center',
          zIndex: 300, animation: 'slideUp 0.2s ease',
          boxShadow: 'var(--shadow-float)',
        }}>
          {toast.msg}
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}

function MicIcon({ recording }: { recording: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke={recording ? '#b91c1c' : 'var(--blue-700)'}
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
