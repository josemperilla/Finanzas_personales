import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { getSuenos, addSueno, deleteSueno, generarRetosParaSueno } from '../lib/suenos';
import { addReto, getRetos, computeProgress, periodDates } from '../lib/retos';
import { addXP, awardBadge } from '../lib/gamification';
import type { Sueno, RetoSugerido } from '../lib/suenos';
import type { Transaction } from '../lib/api';
import { SuenoCard } from '../components/SuenoCard';
import { RetosPanel } from '../components/RetosPanel';
import { formatCOP } from '../lib/utils';
import { createPortal } from 'react-dom';

const EMOJIS = ['✈️','🏝️','🎸','🚗','🏠','🎓','💍','🏋️','🎿','📷','🎮','🍽️','🎉','💻','👶','🌍','🏖️','🛳️','🎭','🏄'];

interface Props {
  transactions: Transaction[];
  userId: string;
  onNewBadge?: (badgeId: string) => void;
  onXpGanado?: (xp: number) => void;
}

interface FormState {
  nombre: string;
  emoji: string;
  monto: string;
  fechaObjetivo: string;
}

function defaultFecha(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().split('T')[0];
}

export function Misiones({ transactions, userId, onNewBadge, onXpGanado }: Props) {
  const [suenos, setSuenos] = useState<Sueno[]>([]);
  const [showSuenoForm, setShowSuenoForm] = useState(false);
  const [form, setForm] = useState<FormState>({ nombre: '', emoji: '✈️', monto: '', fechaObjetivo: defaultFecha() });
  const [formError, setFormError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(() => setSuenos(getSuenos(userId)), [userId]);
  useEffect(() => { reload(); }, [reload]);

  const retosActivos = getRetos(userId)
    .map(r => computeProgress(r, transactions))
    .filter(p => !p.completed && !p.failed);

  const retosCompletados = getRetos(userId)
    .map(r => computeProgress(r, transactions))
    .filter(p => p.completed);

  const handleCrearSueno = useCallback(() => {
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10);
    if (!form.nombre.trim()) { setFormError('Escribe el nombre del sueño'); return; }
    if (!monto || monto < 1000) { setFormError('El monto debe ser mayor a $1.000'); return; }
    if (!form.fechaObjetivo) { setFormError('Elige una fecha objetivo'); return; }

    addSueno(userId, {
      nombre: form.nombre.trim(),
      emoji: form.emoji,
      monto,
      fechaObjetivo: form.fechaObjetivo,
      activo: true,
    });

    const isFirst = getSuenos(userId).length === 1;
    if (isFirst) {
      const badgeGiven = awardBadge(userId, 'primer-sueno');
      if (badgeGiven) onNewBadge?.('primer-sueno');
    }

    addXP(userId, 'configurarMeta');
    onXpGanado?.(20);
    setShowSuenoForm(false);
    setForm({ nombre: '', emoji: '✈️', monto: '', fechaObjetivo: defaultFecha() });
    setFormError('');
    reload();
  }, [form, userId, reload, onNewBadge]);

  const handleAceptarReto = useCallback((reto: RetoSugerido) => {
    const { fechaInicio, fechaFin } = periodDates('mes');
    addReto(userId, {
      id: crypto.randomUUID(),
      titulo: reto.titulo,
      tipo: 'budget_limit',
      categorias: [reto.categoria],
      comercios: [],
      objetivo: reto.ahorroEstimado,
      fechaInicio,
      fechaFin,
    });
  }, [userId]);

  const handleEliminarSueno = useCallback((id: string) => {
    deleteSueno(userId, id);
    setDeletingId(null);
    reload();
  }, [userId, reload]);

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 16px 0', marginBottom: 16 }}>
        <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          Objetivos
        </p>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          Misiones
        </h1>
      </div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px' }}>

        {/* Retos activos */}
        <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 20 }}>
          <div style={{
            background: 'var(--card)', borderRadius: 24, border: '1px solid var(--line)',
            boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)', padding: '18px 0 4px',
          }}>
            <RetosPanel userId={userId} transactions={transactions} />
          </div>
        </motion.div>

        {/* Sueños */}
        <motion.div variants={riseItem} transition={quickEase}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
                Mis Sueños
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                {suenos.length === 0
                  ? 'Define una meta y crea retos para alcanzarla'
                  : `${suenos.filter(s => s.activo).length} activo${suenos.filter(s => s.activo).length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowSuenoForm(true)}
              style={{
                height: 34, padding: '0 14px',
                background: 'var(--blue-700)', border: 'none',
                borderRadius: 'var(--r-xl)', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Nuevo
            </motion.button>
          </div>

          {suenos.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={quickEase}
              style={{
                textAlign: 'center', padding: '32px 16px',
                background: 'var(--card)', borderRadius: 'var(--r-2xl)',
                border: '1.5px dashed var(--line)', marginBottom: 14,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 10 }}>✨</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 6 }}>
                ¿Cuál es tu próximo sueño?
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                Define una meta de ahorro y te ayudaré a crear retos para alcanzarla más rápido.
              </div>
            </motion.div>
          ) : (
            <AnimatePresence mode="popLayout">
              {suenos.filter(s => s.activo).map(sueno => (
                <motion.div
                  key={sueno.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={quickEase}
                  style={{ marginBottom: 14 }}
                >
                  <SuenoCard
                    sueno={sueno}
                    retosParaSueno={generarRetosParaSueno(sueno, transactions)}
                    onAceptarReto={handleAceptarReto}
                    onDelete={() => setDeletingId(sueno.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </motion.div>
      </motion.div>

      {/* Form de nuevo sueño */}
      {createPortal(
        <AnimatePresence>
          {showSuenoForm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setShowSuenoForm(false); setFormError(''); }}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 16px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>
                    Nuevo Sueño ✨
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setShowSuenoForm(false); setFormError(''); }}
                    style={{ background: 'var(--line)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', color: 'var(--muted)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</motion.button>
                </div>
                <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Emoji selector */}
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Ícono</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {EMOJIS.map(e => (
                        <motion.button
                          key={e} whileTap={{ scale: 0.88 }}
                          onClick={() => setForm(f => ({ ...f, emoji: e }))}
                          style={{
                            fontSize: 22, width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                            background: form.emoji === e ? 'var(--blue-50)' : 'var(--card)',
                            boxShadow: form.emoji === e ? '0 0 0 2px var(--blue-600)' : '0 0 0 1px var(--line)',
                            transition: 'all 0.12s',
                          }}
                        >{e}</motion.button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Nombre del sueño</label>
                    <input
                      value={form.nombre}
                      onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                      placeholder="Ej: Viaje a Europa"
                      style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)', color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Monto objetivo (COP)</label>
                    <input
                      type="number"
                      value={form.monto}
                      onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                      placeholder="Ej: 5000000"
                      style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)', color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                    />
                    {form.monto && parseInt(form.monto) > 0 && (
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                        = {formatCOP(parseInt(form.monto))}
                      </p>
                    )}
                  </div>

                  <div>
                    <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>Fecha objetivo</label>
                    <input
                      type="date"
                      value={form.fechaObjetivo}
                      onChange={e => setForm(f => ({ ...f, fechaObjetivo: e.target.value }))}
                      style={{ width: '100%', height: 44, padding: '0 14px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--card)', color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  {formError && (
                    <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>
                      {formError}
                    </p>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleCrearSueno}
                    style={{
                      width: '100%', height: 50,
                      background: 'var(--blue-700)', border: 'none',
                      borderRadius: 'var(--r-xl)', color: '#fff',
                      fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    Crear sueño
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Confirmar eliminación */}
      {createPortal(
        <AnimatePresence>
          {deletingId && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                transition={quickEase}
                onClick={e => e.stopPropagation()}
                style={{ background: 'var(--surface)', borderRadius: 'var(--r-2xl)', padding: '24px 20px', width: '100%', maxWidth: 320 }}
              >
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', marginBottom: 8 }}>
                  ¿Eliminar sueño?
                </div>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
                  Se borrará esta meta y su progreso. Esta acción no se puede deshacer.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setDeletingId(null)}
                    style={{ flex: 1, height: 44, background: 'var(--line)', border: 'none', borderRadius: 'var(--r-lg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: 'var(--ink)' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleEliminarSueno(deletingId)}
                    style={{ flex: 1, height: 44, background: '#dc2626', border: 'none', borderRadius: 'var(--r-lg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', color: '#fff' }}
                  >
                    Eliminar
                  </button>
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
