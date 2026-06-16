import { useState, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { saveTransaction, parseVoice, ManualTransaction, Transaction } from '../lib/api';
import { CATEGORIES } from '../lib/config';
import { getBudgets } from '../lib/budgets';
import { cleanMerchant } from '../lib/merchantCleaner';
import { SuccessCheck } from '../components/ui/SuccessCheck';
import { quickEase, softSpring } from '../lib/motion';
import { getUserTimezone } from '../lib/profiles';
import { todayInTZ } from '../lib/utils';
import { detectUnusualCategories } from '../lib/analytics';
import { QrScanner, QrResult } from '../components/QrScanner';

interface Props {
  onSaved: () => void | Promise<void>;
  transactions: Transaction[];
  userId: string;
}

type VoiceState = 'idle' | 'recording' | 'processing' | 'prefilled';
type SaveState  = 'idle' | 'saving' | 'success';

interface FormData {
  monto:     string;
  comercio:  string;
  banco:     string;
  categoria: string;
  tipo:      string;
  fecha:     string;
  nota:      string;
}

const BANKS = ['Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Otro'] as const;
const NUMPAD_ROWS = [['1','2','3'],['4','5','6'],['7','8','9'],['000','0','⌫']] as const;

function makeDefaultForm(userId: string): FormData {
  return {
    monto: '', comercio: '', nota: '',
    banco: localStorage.getItem('fm_default_bank') || 'Otro',
    categoria: '', tipo: 'Compra',
    fecha: todayInTZ(getUserTimezone(userId)),
  };
}

export function Agregar({ onSaved, transactions, userId }: Props) {
  const [form, setForm]             = useState<FormData>(() => makeDefaultForm(userId));
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [saveState, setSaveState]   = useState<SaveState>('idle');
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [budgetAlert, setBudgetAlert] = useState<{ cat: string; pct: number } | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSugg, setShowSugg]       = useState(false);
  const suggRef = useRef<boolean>(false);
  const [dupePending, setDupePending] = useState<ManualTransaction | null>(null);
  const [unusualAlert, setUnusualAlert] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  type SpeechRecognitionInstance = {
    lang: string; continuous: boolean; interimResults: boolean;
    start(): void; stop(): void;
    onstart: (() => void) | null;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onend: (() => void | Promise<void>) | null;
    onerror: (() => void) | null;
  };
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [prefillGlow, setPrefillGlow] = useState(false);

  const knownMerchants = useMemo(() => {
    const map: Record<string, { banco: string; categoria: string; count: number }> = {};
    for (const tx of transactions) {
      const name = cleanMerchant(tx.Comercio);
      if (!name || name.length < 2) continue;
      const prev = map[name];
      if (!prev) {
        map[name] = { banco: tx.Banco || '', categoria: tx.Categoría || '', count: 1 };
      } else {
        prev.count++;
      }
    }
    return map;
  }, [transactions]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleKey(key: string) {
    if (key === '⌫') {
      setForm(f => ({ ...f, monto: f.monto.slice(0, -1) }));
      return;
    }
    setForm(f => {
      const next = f.monto + key;
      if (Number(next) > 100_000_000) return f;
      return { ...f, monto: next };
    });
  }

  function handleComercioChange(value: string) {
    setForm(f => ({ ...f, comercio: value }));
    if (value.length >= 1) {
      const lower = value.toLowerCase();
      const matches = Object.keys(knownMerchants)
        .filter(m => m.toLowerCase().includes(lower) && m.toLowerCase() !== lower)
        .slice(0, 5);
      setSuggestions(matches);
      setShowSugg(matches.length > 0);
    } else {
      setSuggestions([]);
      setShowSugg(false);
    }
  }

  function selectSuggestion(name: string) {
    const info = knownMerchants[name];
    setForm(f => ({
      ...f,
      comercio:  name,
      banco:     info?.banco    || f.banco,
      categoria: info?.categoria || f.categoria,
    }));
    setSuggestions([]);
    setShowSugg(false);
  }

  function checkUnusualAlert(cat: string) {
    const unusual = detectUnusualCategories(transactions);
    if (unusual.has(cat)) setUnusualAlert(cat);
  }

  function checkBudgetAlert(cat: string, monto: number) {
    const budgets = getBudgets(userId);
    const budget  = budgets[cat];
    if (!budget || budget <= 0) return;
    const now = new Date();
    const monthTotal = transactions
      .filter(tx => {
        const d = new Date(tx.Fecha || tx.Timestamp);
        return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && tx.Categoría === cat;
      })
      .reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
    const pct = (monthTotal + monto) / budget;
    if (pct >= 0.8) setBudgetAlert({ cat, pct });
  }

  function hasDuplicate(monto: number, categoria: string): boolean {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return transactions.some(tx => {
      const ts = new Date(tx.Timestamp || tx.Fecha).getTime();
      if (isNaN(ts) || ts < fiveMinAgo) return false;
      const txMonto = Number(tx['Monto (COP)'] || 0);
      return Math.abs(txMonto - monto) / Math.max(monto, 1) < 0.05 && tx.Categoría === categoria;
    });
  }

  async function saveData(data: ManualTransaction) {
    setSaveState('saving');
    let succeeded = false;
    try {
      await saveTransaction(data);
      setForm(makeDefaultForm(userId));
      succeeded = true;
      setSaveState('success');
      showToast('Transacción guardada', true);
      checkBudgetAlert(data.categoria, data.monto);
      checkUnusualAlert(data.categoria);
      await new Promise(resolve => window.setTimeout(resolve, 650));
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error al guardar. Intenta de nuevo.', false);
      setSaveState('idle');
    } finally {
      if (!succeeded) setSaveState('idle');
    }
  }

  async function handleSubmit() {
    if (saveState !== 'idle') return;
    if (!form.monto || !form.comercio) { showToast('Monto y comercio son requeridos', false); return; }
    const data: ManualTransaction = {
      banco: form.banco, tipo: form.tipo,
      monto: Number(form.monto), comercio: form.comercio,
      categoria: form.categoria || 'Otro', fecha: form.fecha,
      ...(form.nota.trim() && { nota: form.nota.trim() }),
    };
    if (hasDuplicate(data.monto, data.categoria)) {
      setDupePending(data);
      return;
    }
    await saveData(data);
  }

  function startVoice() {
    type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;
    const Ctor: SpeechRecognitionCtor | undefined =
      (window as unknown as Record<string, unknown>)['SpeechRecognition'] as SpeechRecognitionCtor
      ?? (window as unknown as Record<string, unknown>)['webkitSpeechRecognition'] as SpeechRecognitionCtor;
    if (!Ctor) { showToast('Tu navegador no soporta entrada de voz', false); return; }
    const rec = new Ctor();
    rec.lang = 'es-CO'; rec.continuous = false; rec.interimResults = true;
    recognitionRef.current = rec;
    rec.onstart = () => setVoiceState('recording');
    rec.onresult = (e) => setTranscript(Array.from(e.results).map(r => r[0].transcript).join(''));
    rec.onend = async () => {
      const t = transcript;
      if (!t.trim()) { setVoiceState('idle'); return; }
      const autoSubmitTriggers = ['guardar', 'confirma', 'confirmar', 'listo', 'graba', 'grabar'];
      const shouldAutoSave = autoSubmitTriggers.some(w => t.toLowerCase().includes(w));
      setVoiceState('processing');
      try {
        const parsed = await parseVoice(t);
        const newForm = {
          monto:     String(Math.round(parsed.monto || 0)),
          comercio:  parsed.comercio || '',
          banco:     parsed.banco || 'Otro',
          categoria: parsed.categoria || 'Otro',
          tipo:      parsed.tipo || 'Compra',
          fecha:     todayInTZ(getUserTimezone(userId)),
          nota:      '',
        };
        setTranscript('');
        if (shouldAutoSave && newForm.monto && newForm.monto !== '0' && newForm.comercio) {
          const data: ManualTransaction = {
            banco: newForm.banco, tipo: newForm.tipo,
            monto: Number(newForm.monto), comercio: newForm.comercio,
            categoria: newForm.categoria || 'Otro', fecha: newForm.fecha,
          };
          showToast('Guardando automáticamente...', true);
          await saveData(data);
          setVoiceState('idle');
        } else {
          setForm(newForm);
          setVoiceState('prefilled');
          setPrefillGlow(true);
          setTimeout(() => { setPrefillGlow(false); setVoiceState('idle'); }, 1800);
        }
      } catch {
        showToast('Error al analizar la voz. Intenta de nuevo.', false);
        setVoiceState('idle');
      }
    };
    rec.onerror = () => setVoiceState('idle');
    setTranscript('');
    rec.start();
  }

  function stopVoice() { recognitionRef.current?.stop(); }

  function prefillFromQr(result: QrResult) {
    setShowQr(false);
    setForm(f => ({
      ...f,
      monto:    result.amount ? String(result.amount) : f.monto,
      fecha:    result.date ?? f.fecha,
      comercio: result.merchant ?? f.comercio,
    }));
    setPrefillGlow(true);
    setTimeout(() => setPrefillGlow(false), 1500);
  }

  const displayAmount = form.monto ? Number(form.monto).toLocaleString('es-CO') : '0';
  const isVoiceActive = voiceState === 'recording' || voiceState === 'processing';

  return (
    <div style={{ paddingBottom: 110, fontFamily: 'var(--font-body)' }}>

      {/* Header */}
      <div style={{
        paddingTop: 'max(20px, env(safe-area-inset-top))',
        padding: 'max(20px, env(safe-area-inset-top)) 20px 0',
        marginBottom: 6,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Nueva entrada
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
            Agregar
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
          {/* QR */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowQr(true)}
            title="Escanear QR DIAN"
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'var(--card)', border: '1.5px solid var(--line)',
              boxShadow: 'var(--shadow-card)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width="19" height="19" viewBox="0 0 19 19" fill="none" stroke="currentColor" strokeWidth="0" aria-hidden="true">
              <rect x="1" y="1" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="3" y="3" width="3" height="3" rx="0.4" fill="currentColor"/>
              <rect x="11" y="1" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="13" y="3" width="3" height="3" rx="0.4" fill="currentColor"/>
              <rect x="1" y="11" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="3" y="13" width="3" height="3" rx="0.4" fill="currentColor"/>
              <rect x="11" y="11" width="2.5" height="2.5" rx="0.4" fill="currentColor"/>
              <rect x="15.5" y="11" width="2.5" height="2.5" rx="0.4" fill="currentColor"/>
              <rect x="11" y="15.5" width="2.5" height="2.5" rx="0.4" fill="currentColor"/>
              <rect x="15.5" y="15.5" width="2.5" height="2.5" rx="0.4" fill="currentColor"/>
            </svg>
          </motion.button>
          {/* Mic */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onMouseDown={startVoice}
            onTouchStart={e => { e.preventDefault(); startVoice(); }}
            onMouseUp={stopVoice}
            onTouchEnd={e => { e.preventDefault(); stopVoice(); }}
            title="Entrada de voz"
            style={{
              width: 40, height: 40, borderRadius: 12,
              background: isVoiceActive ? '#fee2e2' : 'var(--card)',
              border: `1.5px solid ${isVoiceActive ? '#fca5a5' : 'var(--line)'}`,
              boxShadow: 'var(--shadow-card)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
              animation: voiceState === 'recording' ? 'pulse 1.2s ease-in-out infinite' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <MicIcon recording={voiceState === 'recording'} />
          </motion.button>
        </div>
      </div>

      {/* Voice processing overlay */}
      <AnimatePresence>
        {voiceState === 'processing' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={quickEase}
            style={{
              margin: '8px 20px', padding: '12px 16px',
              background: 'var(--blue-soft)', borderRadius: 14,
              border: '1.5px solid var(--blue-2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--blue)', animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 600 }}>Analizando con IA...</span>
          </motion.div>
        )}
        {transcript && voiceState === 'recording' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={quickEase}
            style={{
              margin: '4px 20px', padding: '8px 12px',
              background: 'var(--card)', borderRadius: 10,
              border: '1px solid var(--line)',
              fontSize: 12, color: 'var(--ink-2)', fontStyle: 'italic',
            }}
          >
            "{transcript}"
          </motion.div>
        )}
      </AnimatePresence>

      {/* Amount display */}
      <div style={{ textAlign: 'center', padding: '10px 20px 8px' }}>
        <motion.div
          animate={{ scale: prefillGlow ? 1.04 : 1, color: prefillGlow ? 'var(--blue)' : 'var(--ink)' }}
          transition={softSpring}
          style={{
            fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 46,
            letterSpacing: '-0.03em', lineHeight: 1,
            color: form.monto ? 'var(--ink)' : 'var(--muted)',
          }}
        >
          ${displayAmount}
        </motion.div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          pesos colombianos
        </div>
      </div>

      {/* Merchant input */}
      <div style={{ padding: '8px 16px 0', position: 'relative' }}>
        <input
          type="text"
          placeholder="¿Dónde o en qué gastaste?"
          value={form.comercio}
          onChange={e => handleComercioChange(e.target.value)}
          onFocus={e => {
            e.target.style.borderColor = 'var(--blue)';
            e.target.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.12)';
            if (suggestions.length > 0) setShowSugg(true);
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--line)';
            e.target.style.boxShadow = 'none';
            if (!suggRef.current) setShowSugg(false);
          }}
          style={{
            width: '100%', boxSizing: 'border-box', height: 50,
            padding: '0 16px',
            background: 'var(--card)', border: '1.5px solid var(--line)',
            borderRadius: 'var(--r-md)', color: 'var(--ink)',
            fontSize: 15, fontFamily: 'var(--font-body)',
            outline: 'none', appearance: 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
            borderColor: prefillGlow && form.comercio ? 'var(--blue)' : undefined,
          }}
        />
        <AnimatePresence>
          {showSugg && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={quickEase}
              onMouseDown={() => { suggRef.current = true; }}
              onMouseUp={() => { suggRef.current = false; }}
              onTouchStart={() => { suggRef.current = true; }}
              onTouchEnd={() => { suggRef.current = false; }}
              style={{
                position: 'absolute', top: '100%', left: 16, right: 16, zIndex: 200,
                background: 'var(--card)', border: '1.5px solid var(--line)',
                borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-float)',
                overflow: 'hidden', marginTop: 4,
              }}
            >
              {suggestions.map((s, i) => (
                <div key={s}
                  onMouseDown={() => selectSuggestion(s)}
                  onTouchEnd={() => selectSuggestion(s)}
                  style={{
                    padding: '11px 14px', fontSize: 13.5, color: 'var(--ink)', cursor: 'pointer',
                    borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span>{s}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{knownMerchants[s]?.categoria}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Category chips */}
      <div style={{ padding: '10px 0 0' }}>
        <div style={{ paddingLeft: 16, marginBottom: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Categoría
        </div>
        <div className="ui-scroll-row" style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 4, gap: 7 }}>
          {CATEGORIES.map(cat => {
            const active = form.categoria === cat.name;
            return (
              <motion.button
                key={cat.name}
                whileTap={{ scale: 0.92 }}
                onClick={() => setForm(f => ({ ...f, categoria: f.categoria === cat.name ? '' : cat.name }))}
                style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 999,
                  background: active ? cat.color : 'var(--card)',
                  color: active ? '#fff' : 'var(--ink-2)',
                  border: `1.5px solid ${active ? cat.color : 'var(--line)'}`,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'background 0.14s ease, color 0.14s ease, border-color 0.14s ease',
                }}
              >
                {cat.name}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Bank chips */}
      <div style={{ padding: '8px 0 0' }}>
        <div style={{ paddingLeft: 16, marginBottom: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Banco
        </div>
        <div className="ui-scroll-row" style={{ paddingLeft: 16, paddingRight: 16, paddingBottom: 4, gap: 6 }}>
          {BANKS.map(b => {
            const active = form.banco === b;
            return (
              <motion.button
                key={b}
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  setForm(f => ({ ...f, banco: b }));
                  localStorage.setItem('fm_default_bank', b);
                }}
                style={{
                  flexShrink: 0, padding: '6px 13px', borderRadius: 999,
                  background: active ? 'var(--blue-soft)' : 'var(--card)',
                  color: active ? 'var(--blue)' : 'var(--ink-2)',
                  border: `1.5px solid ${active ? 'var(--blue)' : 'var(--line)'}`,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'background 0.14s ease, color 0.14s ease, border-color 0.14s ease',
                }}
              >
                {b}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Detalles adicionales (fecha, nota) */}
      <div style={{ padding: '8px 16px 0' }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowDetails(v => !v)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0',
            fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-body)',
            display: 'flex', alignItems: 'center', gap: 4,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <motion.span animate={{ rotate: showDetails ? 90 : 0 }} transition={{ duration: 0.18 }} style={{ display: 'inline-block' }}>›</motion.span>
          {showDetails ? 'Ocultar detalles' : 'Fecha y nota (opcional)'}
        </motion.button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', gap: 10, paddingTop: 8 }}>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  style={{
                    flex: 1, height: 46, padding: '0 12px',
                    background: 'var(--card)', border: '1.5px solid var(--line)',
                    borderRadius: 'var(--r-md)', color: 'var(--ink)',
                    fontSize: 14, fontFamily: 'var(--font-body)',
                    outline: 'none', appearance: 'none', colorScheme: 'light',
                  }}
                />
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  value={form.nota}
                  onChange={e => setForm(f => ({ ...f, nota: e.target.value }))}
                  style={{
                    flex: 2, height: 46, padding: '0 12px',
                    background: 'var(--card)', border: '1.5px solid var(--line)',
                    borderRadius: 'var(--r-md)', color: 'var(--ink)',
                    fontSize: 14, fontFamily: 'var(--font-body)',
                    outline: 'none', appearance: 'none',
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Numpad */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {NUMPAD_ROWS.flat().map((key, idx) => (
            <motion.button
              key={idx}
              whileTap={{ scale: 0.9 }}
              onClick={() => handleKey(key)}
              style={{
                height: 60, borderRadius: 16,
                background: key === '⌫' ? 'transparent' : 'var(--card)',
                border: key === '⌫' ? 'none' : '1.5px solid var(--line)',
                boxShadow: key === '⌫' ? 'none' : '0 1px 3px rgba(16,18,28,0.06)',
                color: key === '⌫' ? 'var(--muted)' : 'var(--ink)',
                fontFamily: key === '⌫' || key === '000' ? 'var(--font-body)' : 'var(--font-display)',
                fontSize: key === '⌫' ? 22 : key === '000' ? 18 : 26,
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '-0.02em',
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation',
              }}
            >
              {key}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div style={{ padding: '12px 16px 0' }}>
        <motion.button
          whileTap={{ scale: saveState === 'idle' ? 0.98 : 1 }}
          aria-live="polite"
          aria-busy={saveState === 'saving'}
          onClick={handleSubmit}
          disabled={saveState !== 'idle'}
          style={{
            width: '100%', height: 56,
            background: saveState === 'success' ? '#16a34a' : saveState === 'saving' ? 'var(--blue-300)' : 'var(--blue)',
            border: 'none', borderRadius: 'var(--r-lg)', color: '#fff',
            fontSize: 16, fontWeight: 700,
            cursor: saveState !== 'idle' ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)',
            boxShadow: saveState === 'idle' ? 'var(--shadow-blue)' : saveState === 'success' ? '0 8px 20px rgba(22,163,74,0.24)' : 'none',
            transition: 'background 0.15s ease, box-shadow 0.15s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {saveState === 'success'
              ? <motion.span key="success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SuccessCheck size={20} /> Guardada
                </motion.span>
              : saveState === 'saving'
                ? <motion.span key="saving" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>Guardando...</motion.span>
                : <motion.span key="idle" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>Guardar transacción</motion.span>
            }
          </AnimatePresence>
        </motion.button>
      </div>

      {/* QR Scanner overlay */}
      <AnimatePresence>
        {showQr && (
          <QrScanner onScanned={prefillFromQr} onClose={() => setShowQr(false)} />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={softSpring}
            style={{
              position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom))', left: 16, right: 16,
              padding: '13px 16px', borderRadius: 12, background: 'var(--card)',
              border: `1px solid ${toast.ok ? '#86efac' : '#fca5a5'}`,
              color: toast.ok ? '#15803d' : '#b91c1c',
              fontSize: 13.5, fontWeight: 600, textAlign: 'center', zIndex: 300, boxShadow: 'var(--shadow-float)',
            }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate warning */}
      <AnimatePresence>
        {dupePending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 400, display: 'flex', alignItems: 'flex-end', padding: '0 0 env(safe-area-inset-bottom)' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={softSpring}
              style={{ width: '100%', background: 'var(--card)', borderRadius: '20px 20px 0 0', padding: '24px 20px 28px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>¿Ya guardaste esto?</div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 24 }}>
                Hay una transacción similar de ${(dupePending.monto).toLocaleString('es-CO')} en los últimos 5 minutos.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setDupePending(null)} style={{
                  flex: 1, height: 48, borderRadius: 12, border: '1.5px solid var(--line)',
                  background: 'var(--card)', color: 'var(--ink)', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>Cancelar</button>
                <button type="button" onClick={() => { const d = dupePending; setDupePending(null); saveData(d); }} style={{
                  flex: 1, height: 48, borderRadius: 12, border: 'none',
                  background: 'var(--blue)', color: '#fff', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}>Guardar igual</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unusual spend alert */}
      <AnimatePresence>
        {unusualAlert && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ ...softSpring, delay: 1.0 }}
            onClick={() => setUnusualAlert(null)}
            style={{
              position: 'fixed', bottom: 'calc(160px + env(safe-area-inset-bottom))', left: 16, right: 16,
              padding: '13px 16px', borderRadius: 12, background: 'var(--card)',
              border: '1px solid #fde68a', color: '#92400e',
              fontSize: 13.5, fontWeight: 600, textAlign: 'center', zIndex: 301, boxShadow: 'var(--shadow-float)',
            }}
          >
            Gasto inusual en {unusualAlert}: supera el doble del promedio mensual
          </motion.div>
        )}
      </AnimatePresence>

      {/* Budget alert */}
      <AnimatePresence>
        {budgetAlert && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ ...softSpring, delay: 0.8 }}
            onClick={() => setBudgetAlert(null)}
            style={{
              position: 'fixed', bottom: 'calc(120px + env(safe-area-inset-bottom))', left: 16, right: 16,
              padding: '13px 16px', borderRadius: 12, background: 'var(--card)',
              border: '1px solid #fde68a', color: '#92400e',
              fontSize: 13.5, fontWeight: 600, textAlign: 'center', zIndex: 301, boxShadow: 'var(--shadow-float)',
            }}
          >
            {budgetAlert.pct >= 1
              ? `Superaste el presupuesto de ${budgetAlert.cat}`
              : `Vas al ${Math.round(budgetAlert.pct * 100)}% del presupuesto de ${budgetAlert.cat}`}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MicIcon({ recording }: { recording: boolean }) {
  const c = recording ? '#ef4444' : 'currentColor';
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M19 10a7 7 0 0 1-14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="9" y1="22" x2="15" y2="22" />
    </svg>
  );
}
