import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveTransaction, getToken } from '../lib/api';
import { quickEase, softSpring } from '../lib/motion';
import { formatCOP } from '../lib/utils';

interface DetectedTx {
  monto: number;
  comercio: string;
  fecha: string;
  tipo: string;
  banco: string;
}

interface Props {
  userId: string;
  onClose: () => void;
  onImported?: () => void;
}

type Phase = 'pick' | 'preview' | 'analyzing' | 'review' | 'saving' | 'done' | 'error';

export function ImportarExtractoPorFoto({ userId, onClose, onImported }: Props) {
  const [phase, setPhase]               = useState<Phase>('pick');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [mediaType, setMediaType]       = useState('image/jpeg');
  const [detected, setDetected]         = useState<DetectedTx[]>([]);
  const [selected, setSelected]         = useState<Set<number>>(new Set());
  const [errorMsg, setErrorMsg]         = useState('');
  const [savedCount, setSavedCount]     = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const mt = file.type || 'image/jpeg';
    setMediaType(mt);
    const reader = new FileReader();
    reader.onload = ev => {
      const result = ev.target?.result as string;
      if (!result) return;
      // result = "data:image/jpeg;base64,XXX..." — extract base64 part
      setImageDataUrl(result);
      setPhase('preview');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function analyze() {
    if (!imageDataUrl) return;
    setPhase('analyzing');
    // Strip data URL prefix to get raw base64
    const base64 = imageDataUrl.split(',')[1] ?? '';
    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mediaType, token: getToken() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error ?? 'Error desconocido');
        setPhase('error');
        return;
      }
      const txs: DetectedTx[] = (data.transactions ?? []).filter(
        (t: DetectedTx) => t.monto > 0 && t.comercio,
      );
      if (txs.length === 0) {
        setErrorMsg('No se detectaron transacciones en la imagen. Asegúrate de que el extracto sea legible.');
        setPhase('error');
        return;
      }
      setDetected(txs);
      setSelected(new Set(txs.map((_, i) => i)));
      setPhase('review');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error de conexión');
      setPhase('error');
    }
  }

  async function importSelected() {
    setPhase('saving');
    let count = 0;
    for (const i of selected) {
      const tx = detected[i];
      if (!tx) continue;
      try {
        await saveTransaction({
          tipo: tx.tipo ?? 'Compra',
          monto: tx.monto,
          comercio: tx.comercio,
          banco: tx.banco ?? 'Otro',
          categoria: 'Otro',
          fecha: tx.fecha,
        });
        count++;
      } catch { /* continue */ }
    }
    setSavedCount(count);
    setPhase('done');
    onImported?.();
  }

  function toggleAll() {
    if (selected.size === detected.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(detected.map((_, i) => i)));
    }
  }

  function toggleOne(i: number) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={softSpring}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--card)',
          borderRadius: '24px 24px 0 0',
          padding: '24px 20px 36px',
          display: 'flex', flexDirection: 'column', gap: 16,
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
              Importar por foto
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>
              Foto o captura de pantalla de tu extracto
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, padding: 6 }}
          >
            ✕
          </motion.button>
        </div>

        <AnimatePresence mode="wait">

          {/* PICK */}
          {phase === 'pick' && (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1.6 }}>
                Toma una foto o selecciona una captura de pantalla de tu extracto bancario.
                Claude analizará la imagen y extraerá las transacciones automáticamente.
              </p>
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, height: 140, background: 'var(--surface)', border: '2px dashed var(--line)',
                borderRadius: 16, cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
                <span style={{ fontSize: 40 }}>📸</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                  Toca para abrir cámara o galería
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </label>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>
                Funciona con extractos de Bancolombia, Bogotá, Davivienda, Itaú y otros bancos colombianos.
                El análisis usa IA — revisa las transacciones antes de importar.
              </div>
            </motion.div>
          )}

          {/* PREVIEW */}
          {phase === 'preview' && imageDataUrl && (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <img
                src={imageDataUrl}
                alt="Extracto"
                style={{ width: '100%', borderRadius: 12, maxHeight: 260, objectFit: 'cover' }}
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={analyze}
                style={{
                  height: 50, background: 'var(--blue-700)', border: 'none',
                  borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Analizar con Claude IA
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPhase('pick')}
                style={{
                  height: 44, background: 'none', border: '1.5px solid var(--line)',
                  borderRadius: 14, color: 'var(--muted)', fontSize: 'var(--text-sm)',
                  cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Cambiar imagen
              </motion.button>
            </motion.div>
          )}

          {/* ANALYZING */}
          {phase === 'analyzing' && (
            <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }} />
              <div style={{ fontFamily: 'var(--font-body)', color: 'var(--muted)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                Claude está analizando tu extracto…<br />
                Esto toma unos segundos.
              </div>
            </motion.div>
          )}

          {/* REVIEW */}
          {phase === 'review' && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 600 }}>
                  {detected.length} transacciones detectadas
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleAll}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--blue-600)', fontFamily: 'var(--font-body)' }}
                >
                  {selected.size === detected.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </motion.button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {detected.map((tx, i) => (
                  <motion.button
                    key={i}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleOne(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 12px', background: selected.has(i) ? 'var(--blue-50)' : 'var(--surface)',
                      border: `1.5px solid ${selected.has(i) ? 'var(--blue-300)' : 'var(--line)'}`,
                      borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      background: selected.has(i) ? 'var(--blue-600)' : 'var(--card)',
                      border: `1.5px solid ${selected.has(i) ? 'var(--blue-600)' : 'var(--line)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected.has(i) && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {tx.comercio}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{tx.fecha} · {tx.tipo}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {formatCOP(tx.monto)}
                    </div>
                  </motion.button>
                ))}
              </div>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={importSelected}
                disabled={selected.size === 0}
                style={{
                  height: 50, background: selected.size > 0 ? 'var(--blue-700)' : 'var(--line)',
                  border: 'none', borderRadius: 14, color: '#fff',
                  fontSize: 'var(--text-base)', fontWeight: 600, cursor: selected.size > 0 ? 'pointer' : 'default',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Importar {selected.size > 0 ? `${selected.size} transacción${selected.size > 1 ? 'es' : ''}` : 'seleccionadas'}
              </motion.button>
            </motion.div>
          )}

          {/* SAVING */}
          {phase === 'saving' && (
            <motion.div key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '32px 0' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.9s linear infinite' }} />
              <div style={{ fontFamily: 'var(--font-body)', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
                Guardando transacciones…
              </div>
            </motion.div>
          )}

          {/* DONE */}
          {phase === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '24px 0' }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
                ¡Importado!
              </div>
              <div style={{ fontFamily: 'var(--font-body)', color: 'var(--muted)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                {savedCount} transacción{savedCount !== 1 ? 'es' : ''} guardada{savedCount !== 1 ? 's' : ''}.
                Ve al Historial para categorizar las nuevas entradas.
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={onClose}
                style={{
                  height: 50, width: '100%', background: 'var(--blue-700)', border: 'none',
                  borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Listo
              </motion.button>
            </motion.div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '14px 16px', background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 'var(--text-sm)', color: '#b91c1c', fontWeight: 600, marginBottom: 4 }}>Error al analizar</div>
                <div style={{ fontSize: 'var(--text-xs)', color: '#991b1b', lineHeight: 1.5 }}>{errorMsg}</div>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setPhase('pick')}
                style={{
                  height: 50, background: 'var(--blue-700)', border: 'none',
                  borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                }}
              >
                Intentar con otra imagen
              </motion.button>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
