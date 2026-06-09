import { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Reto, RetoTipo, getRetos, addReto, deleteReto, computeProgress, periodDates } from '../lib/retos';
import { Transaction } from '../lib/api';
import { CATEGORIES, getCategoryColor } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { RetoCard } from './RetoCard';
import { softSpring, quickEase } from '../lib/motion';

interface Props {
  userId: string;
  transactions: Transaction[];
}

const TIPO_OPTIONS: { value: RetoTipo; label: string; desc: string }[] = [
  { value: 'budget_limit',    label: 'Límite de gasto',      desc: 'Gastar menos de X en el período' },
  { value: 'frequency_limit', label: 'Límite de frecuencia', desc: 'Máximo X transacciones en el período' },
  { value: 'no_spend',        label: 'Sin gastos',            desc: 'No gastar nada en estas categorías / comercios' },
];

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 14px',
  border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)',
  background: 'var(--card)', color: 'var(--ink)',
  fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
  boxSizing: 'border-box',
};

export function RetosPanel({ userId, transactions }: Props) {
  const [retos, setRetos] = useState<Reto[]>(() => getRetos(userId));
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [titulo,       setTitulo]      = useState('');
  const [tipo,         setTipo]        = useState<RetoTipo>('budget_limit');
  const [categorias,   setCategorias]  = useState<string[]>([]);
  const [comercios,    setComercio]    = useState<string[]>([]);
  const [objetivo,     setObjetivo]    = useState('');
  const [periodoTipo,  setPeriodoTipo] = useState<'mes' | 'semana' | 'personalizado'>('mes');
  const [fechaInicio,  setFechaInicio] = useState('');
  const [fechaFin,     setFechaFin]    = useState('');

  // Merchant autocomplete state
  const [mercQuery,    setMercQuery]   = useState('');
  const [showMercDrop, setShowMercDrop] = useState(false);
  const mercRef = useRef<HTMLDivElement>(null);

  // Build sorted list of unique clean merchant names from transaction history
  const knownMerchants = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tx of transactions) {
      const name = cleanMerchant(tx.Comercio);
      if (name && name.length >= 2) counts[name] = (counts[name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [transactions]);

  const mercSuggestions = useMemo(() => {
    if (!mercQuery.trim()) return knownMerchants.slice(0, 8);
    const q = mercQuery.toLowerCase();
    return knownMerchants.filter(m => m.toLowerCase().includes(q)).slice(0, 8);
  }, [mercQuery, knownMerchants]);

  // Close dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (mercRef.current && !mercRef.current.contains(e.target as Node)) {
        setShowMercDrop(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const progresses = useMemo(
    () => retos.map(r => computeProgress(r, transactions)),
    [retos, transactions]
  );

  function resetForm() {
    setTitulo(''); setTipo('budget_limit'); setCategorias([]); setComercio([]);
    setObjetivo(''); setPeriodoTipo('mes'); setFechaInicio(''); setFechaFin('');
    setMercQuery(''); setShowMercDrop(false);
  }

  function toggleCat(name: string) {
    setCategorias(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  }

  function addMerchant(name: string) {
    if (!comercios.includes(name)) setComercio(prev => [...prev, name]);
    setMercQuery('');
    setShowMercDrop(false);
  }

  function removeMerchant(name: string) {
    setComercio(prev => prev.filter(m => m !== name));
  }

  function handleAdd() {
    if (!titulo.trim()) return;
    let fi = fechaInicio, ff = fechaFin;
    if (periodoTipo !== 'personalizado') {
      const d = periodDates(periodoTipo);
      fi = d.fechaInicio; ff = d.fechaFin;
    }
    if (!fi || !ff) return;

    // If user typed a merchant but didn't select from dropdown, add it
    if (mercQuery.trim() && !comercios.includes(mercQuery.trim())) {
      comercios.push(mercQuery.trim());
    }

    const reto: Reto = {
      id:          newId(),
      titulo:      titulo.trim(),
      tipo,
      categorias,
      comercios,
      objetivo:    tipo === 'no_spend' ? 0 : (parseFloat(objetivo) || 0),
      fechaInicio: fi,
      fechaFin:    ff,
    };
    addReto(userId, reto);
    setRetos(getRetos(userId));
    setShowForm(false);
    resetForm();
  }

  function handleDelete(id: string) {
    deleteReto(userId, id);
    setRetos(getRetos(userId));
  }

  const canSubmit = titulo.trim()
    && (tipo === 'no_spend' || !!objetivo)
    && (periodoTipo !== 'personalizado' || (!!fechaInicio && !!fechaFin));

  return (
    <div style={{ padding: '0 16px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Mis retos</div>
          {retos.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {progresses.filter(p => p.completed).length} completado{progresses.filter(p => p.completed).length !== 1 ? 's' : ''}
              {' · '}
              {progresses.filter(p => !p.completed && !p.failed).length} activo{progresses.filter(p => !p.completed && !p.failed).length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => setShowForm(true)}
          style={{
            height: 32, padding: '0 14px',
            background: 'var(--blue-700)', border: 'none',
            borderRadius: 'var(--r-xl)', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nuevo
        </motion.button>
      </div>

      {/* Empty state */}
      {retos.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={quickEase}
          style={{
            textAlign: 'center', padding: '24px 16px',
            background: 'var(--card)', borderRadius: 'var(--r-xl)',
            border: '1.5px dashed var(--line)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>Sin retos activos</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Crea un reto para comprometerte con una meta de gasto.</div>
        </motion.div>
      )}

      {/* Cards */}
      <AnimatePresence mode="popLayout">
        {progresses.map(p => (
          <div key={p.reto.id} style={{ marginBottom: 10 }}>
            <RetoCard progress={p} onDelete={() => handleDelete(p.reto.id)} />
          </div>
        ))}
      </AnimatePresence>

      {/* Create modal — rendered via portal to escape CSS transform containing block */}
      {createPortal(
        <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setShowForm(false); resetForm(); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'flex-end' }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={softSpring}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--surface)', width: '100%',
                borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
                maxHeight: '92dvh', overflowY: 'auto',
              }}
            >
              {/* Modal header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
                  Nuevo reto
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => { setShowForm(false); resetForm(); }}
                  style={{ background: 'var(--line)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >✕</motion.button>
              </div>

              <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Título */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Título del reto</label>
                  <input
                    value={titulo}
                    onChange={e => setTitulo(e.target.value)}
                    placeholder="Ej: Gastar menos en salidas este mes"
                    style={inputStyle}
                  />
                </div>

                {/* Tipo */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Tipo</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {TIPO_OPTIONS.map(opt => (
                      <motion.button
                        key={opt.value}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setTipo(opt.value)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          padding: '10px 14px', borderRadius: 'var(--r-lg)',
                          border: `1.5px solid ${tipo === opt.value ? 'var(--blue-700)' : 'var(--line)'}`,
                          background: tipo === opt.value ? 'var(--blue-50)' : 'var(--card)',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: tipo === opt.value ? 'var(--blue-700)' : 'var(--ink)' }}>
                          {opt.label}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{opt.desc}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Categorías — multi-select chips */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                    Categorías <span style={{ fontWeight: 400 }}>(opcional — toca para seleccionar)</span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {CATEGORIES.map(c => {
                      const active = categorias.includes(c.name);
                      return (
                        <motion.button
                          key={c.name}
                          whileTap={{ scale: 0.92 }}
                          onClick={() => toggleCat(c.name)}
                          style={{
                            padding: '5px 11px', borderRadius: 999, border: 'none',
                            cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
                            fontFamily: 'var(--font-body)',
                            background: active ? `${c.color}22` : 'var(--card)',
                            color: active ? c.color : 'var(--muted)',
                            boxShadow: active ? `0 0 0 1.5px ${c.color}` : '0 0 0 1px var(--line)',
                            transition: 'all 0.15s',
                          }}
                        >
                          {c.name}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                {/* Comercios — autocomplete + chips */}
                <div ref={mercRef}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Comercios <span style={{ fontWeight: 400 }}>(opcional — busca o escribe)</span>
                  </label>

                  {/* Selected merchant chips */}
                  {comercios.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {comercios.map(m => (
                        <span
                          key={m}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 999,
                            background: 'var(--card)', border: '1px solid var(--line)',
                            fontSize: 12, color: 'var(--ink)', fontWeight: 600,
                          }}
                        >
                          🏪 {m}
                          <button
                            type="button"
                            onClick={() => removeMerchant(m)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1, marginLeft: 2 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search input */}
                  <div style={{ position: 'relative' }}>
                    <input
                      value={mercQuery}
                      onChange={e => { setMercQuery(e.target.value); setShowMercDrop(true); }}
                      onFocus={() => setShowMercDrop(true)}
                      placeholder="Ej: Rappi, Netflix, Uber…"
                      style={inputStyle}
                    />

                    {/* Dropdown */}
                    <AnimatePresence>
                      {showMercDrop && mercSuggestions.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.12 }}
                          style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                            background: 'var(--surface)', border: '1px solid var(--line)',
                            borderRadius: 'var(--r-lg)', marginTop: 4,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            overflow: 'hidden',
                          }}
                        >
                          {mercSuggestions
                            .filter(m => !comercios.includes(m))
                            .map(m => (
                              <button
                                type="button"
                                key={m}
                                onMouseDown={e => { e.preventDefault(); addMerchant(m); }}
                                style={{
                                  width: '100%', padding: '10px 14px', textAlign: 'left',
                                  background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
                                  cursor: 'pointer', fontSize: 13, color: 'var(--ink)',
                                  fontFamily: 'var(--font-body)',
                                }}
                              >
                                🏪 {m}
                              </button>
                            ))}
                          {/* Add custom if not in list */}
                          {mercQuery.trim() && !knownMerchants.some(m => m.toLowerCase() === mercQuery.trim().toLowerCase()) && (
                            <button
                              type="button"
                              onMouseDown={e => { e.preventDefault(); addMerchant(mercQuery.trim()); }}
                              style={{
                                width: '100%', padding: '10px 14px', textAlign: 'left',
                                background: 'none', border: 'none',
                                cursor: 'pointer', fontSize: 13, color: 'var(--blue-700)',
                                fontFamily: 'var(--font-body)', fontWeight: 600,
                              }}
                            >
                              + Agregar "{mercQuery.trim()}"
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Objetivo (hidden for no_spend) */}
                {tipo !== 'no_spend' && (
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                      {tipo === 'frequency_limit' ? 'Máximo de transacciones' : 'Límite de gasto (COP)'}
                    </label>
                    <input
                      type="number"
                      value={objetivo}
                      onChange={e => setObjetivo(e.target.value)}
                      placeholder={tipo === 'frequency_limit' ? 'Ej: 10' : 'Ej: 500000'}
                      style={inputStyle}
                    />
                  </div>
                )}

                {/* Período */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Período</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: periodoTipo === 'personalizado' ? 10 : 0 }}>
                    {(['mes', 'semana', 'personalizado'] as const).map(p => (
                      <motion.button
                        key={p}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => setPeriodoTipo(p)}
                        style={{
                          flex: 1, height: 36, borderRadius: 'var(--r-lg)',
                          border: `1.5px solid ${periodoTipo === p ? 'var(--blue-700)' : 'var(--line)'}`,
                          background: periodoTipo === p ? 'var(--blue-50)' : 'var(--card)',
                          color: periodoTipo === p ? 'var(--blue-700)' : 'var(--ink-2)',
                          fontSize: 13, fontWeight: periodoTipo === p ? 600 : 400,
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                        }}
                      >
                        {p === 'personalizado' ? 'Custom' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </motion.button>
                    ))}
                  </div>

                  {periodoTipo === 'personalizado' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Inicio</label>
                        <input type="date" title="Fecha de inicio" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                          style={{ ...inputStyle, height: 40, fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fin</label>
                        <input type="date" title="Fecha de fin" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                          style={{ ...inputStyle, height: 40, fontSize: 13 }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAdd}
                  disabled={!canSubmit}
                  style={{
                    width: '100%', height: 50,
                    background: 'var(--blue-700)', border: 'none',
                    borderRadius: 'var(--r-xl)', color: '#fff',
                    fontSize: 15, fontWeight: 700,
                    cursor: canSubmit ? 'pointer' : 'default',
                    fontFamily: 'var(--font-display)',
                    opacity: canSubmit ? 1 : 0.5,
                  }}
                >
                  Crear reto
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
