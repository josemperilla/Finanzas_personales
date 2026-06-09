import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Reto, RetoTipo, getRetos, addReto, deleteReto, computeProgress, periodDates } from '../lib/retos';
import { Transaction } from '../lib/api';
import { CATEGORIES } from '../lib/config';
import { RetoCard } from './RetoCard';
import { softSpring, quickEase } from '../lib/motion';

interface Props {
  userId: string;
  transactions: Transaction[];
}

const TIPO_OPTIONS: { value: RetoTipo; label: string; desc: string }[] = [
  { value: 'budget_limit',    label: 'Límite de gasto',     desc: 'Gastar menos de X en el período' },
  { value: 'frequency_limit', label: 'Límite de frecuencia', desc: 'Máximo X transacciones en el período' },
  { value: 'no_spend',        label: 'Sin gastos',           desc: 'No gastar nada en esta categoría' },
];

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export function RetosPanel({ userId, transactions }: Props) {
  const [retos, setRetos] = useState<Reto[]>(() => getRetos(userId));
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [titulo,        setTitulo]       = useState('');
  const [tipo,          setTipo]         = useState<RetoTipo>('budget_limit');
  const [categoria,     setCategoria]    = useState('');
  const [objetivo,      setObjetivo]     = useState('');
  const [periodoTipo,   setPeriodoTipo]  = useState<'mes' | 'semana' | 'personalizado'>('mes');
  const [fechaInicio,   setFechaInicio]  = useState('');
  const [fechaFin,      setFechaFin]     = useState('');

  const progresses = useMemo(
    () => retos.map(r => computeProgress(r, transactions)),
    [retos, transactions]
  );

  function resetForm() {
    setTitulo(''); setTipo('budget_limit'); setCategoria('');
    setObjetivo(''); setPeriodoTipo('mes'); setFechaInicio(''); setFechaFin('');
  }

  function handleAdd() {
    if (!titulo.trim()) return;
    let fi = fechaInicio, ff = fechaFin;
    if (periodoTipo !== 'personalizado') {
      const d = periodDates(periodoTipo);
      fi = d.fechaInicio; ff = d.fechaFin;
    }
    if (!fi || !ff) return;

    const reto: Reto = {
      id:          newId(),
      titulo:      titulo.trim(),
      tipo,
      categoria,
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

      {/* Create modal */}
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
                    placeholder="Ej: Gastar menos en restaurantes este mes"
                    style={{
                      width: '100%', height: 44, padding: '0 14px',
                      border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)',
                      background: 'var(--card)', color: 'var(--ink)',
                      fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                    }}
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

                {/* Categoría */}
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Categoría <span style={{ fontWeight: 400 }}>(opcional — vacío = todas)</span>
                  </label>
                  <select
                    value={categoria}
                    onChange={e => setCategoria(e.target.value)}
                    style={{
                      width: '100%', height: 44, padding: '0 14px',
                      border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)',
                      background: 'var(--card)', color: 'var(--ink)',
                      fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                    }}
                  >
                    <option value="">Todas las categorías</option>
                    {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
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
                      placeholder={tipo === 'frequency_limit' ? 'Ej: 10' : 'Ej: 200000'}
                      style={{
                        width: '100%', height: 44, padding: '0 14px',
                        border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)',
                        background: 'var(--card)', color: 'var(--ink)',
                        fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
                      }}
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
                          textTransform: 'capitalize',
                        }}
                      >
                        {p === 'personalizado' ? 'Personalizado' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </motion.button>
                    ))}
                  </div>

                  {periodoTipo === 'personalizado' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Inicio</label>
                        <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                          style={{ width: '100%', height: 40, padding: '0 10px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fin</label>
                        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                          style={{ width: '100%', height: 40, padding: '0 10px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)', color: 'var(--ink)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAdd}
                  disabled={!titulo.trim() || (tipo !== 'no_spend' && !objetivo) || (periodoTipo === 'personalizado' && (!fechaInicio || !fechaFin))}
                  style={{
                    width: '100%', height: 50,
                    background: 'var(--blue-700)', border: 'none',
                    borderRadius: 'var(--r-xl)', color: '#fff',
                    fontSize: 15, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'var(--font-display)',
                    opacity: (!titulo.trim() || (tipo !== 'no_spend' && !objetivo) || (periodoTipo === 'personalizado' && (!fechaInicio || !fechaFin))) ? 0.5 : 1,
                  }}
                >
                  Crear reto
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
