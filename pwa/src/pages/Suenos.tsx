import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { getSuenos, addSueno, deleteSueno, generarRetosParaSueno } from '../lib/suenos';
import { addReto, periodDates } from '../lib/retos';
import { addXP, awardBadge } from '../lib/gamification';
import type { Sueno, RetoSugerido } from '../lib/suenos';
import type { Transaction } from '../lib/api';
import { SuenoCard } from '../components/SuenoCard';
import { formatCOP } from '../lib/utils';

const EMOJIS = ['✈️','🏝️','🎸','🚗','🏠','🎓','💍','🏋️','🎿','📷','🎮','🍽️','🎉','💻','👶','🌍','🏖️','🛳️','🎭','🏄'];

interface Props {
  transactions: Transaction[];
  userId: string;
  onNewBadge?: (badgeId: string) => void;
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

export function SuenosPage({ transactions, userId, onNewBadge }: Props) {
  const [suenos, setSuenos] = useState<Sueno[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>({ nombre: '', emoji: '✈️', monto: '', fechaObjetivo: defaultFecha() });
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(() => setSuenos(getSuenos(userId)), [userId]);

  useEffect(() => { reload(); }, [reload]);

  const handleCrear = useCallback(() => {
    const monto = parseInt(form.monto.replace(/\D/g, ''), 10);
    if (!form.nombre.trim()) { setError('Escribe el nombre del sueño'); return; }
    if (!monto || monto < 1000) { setError('El monto debe ser mayor a $1.000'); return; }
    if (!form.fechaObjetivo) { setError('Elige una fecha objetivo'); return; }

    const nuevo = addSueno(userId, {
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

    setShowForm(false);
    setForm({ nombre: '', emoji: '✈️', monto: '', fechaObjetivo: defaultFecha() });
    setError('');
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
    // pequeño feedback visual
  }, [userId]);

  const retos = suenos.map(s => ({
    id: s.id,
    retos: generarRetosParaSueno(s, transactions),
  }));

  return (
    <div style={{ padding: '16px 16px calc(84px + env(safe-area-inset-bottom))', minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingTop: 'env(safe-area-inset-top)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Mis Sueños</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cada peso cuenta hacia lo que importa</p>
        </div>
        {suenos.length < 3 && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowForm(true)}
            style={{
              background: 'var(--blue-600, #2563eb)', color: '#fff',
              border: 'none', borderRadius: 12, padding: '8px 16px',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>+</span> Nuevo
          </motion.button>
        )}
      </div>

      {/* Estado vacío */}
      {suenos.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={quickEase}
          style={{ textAlign: 'center', padding: '48px 24px' }}
        >
          <div style={{ fontSize: 64, marginBottom: 16 }}>✨</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>
            Define tu primer Sueño
          </h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 24 }}>
            Un viaje, un concierto, la universidad, un carro.
            La app te ayuda a llegar con un plan realista basado en tus gastos.
          </p>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowForm(true)}
            style={{
              background: 'var(--blue-600, #2563eb)', color: '#fff',
              border: 'none', borderRadius: 14, padding: '14px 28px',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Crear mi primer Sueño
          </motion.button>
        </motion.div>
      )}

      {/* Lista de Sueños */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AnimatePresence>
          {suenos.map(sueno => {
            const retosInfo = retos.find(r => r.id === sueno.id)?.retos ?? [];
            return (
              <motion.div
                key={sueno.id}
                variants={riseItem}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={quickEase}
                layout
              >
                <SuenoCard
                  sueno={sueno}
                  retosParaSueno={retosInfo}
                  onDelete={() => { setDeletingId(sueno.id); }}
                  onAceptarReto={handleAceptarReto}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {suenos.length > 0 && (
        <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 20 }}>
          Máximo 3 Sueños activos simultáneos
        </p>
      )}

      {/* Modal crear Sueño */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowForm(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end' }}
          >
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ ...softSpring, damping: 28 }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', background: 'var(--surface)',
                borderRadius: '20px 20px 0 0', padding: '24px 20px',
                paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
              }}
            >
              <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 20px' }} />
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, color: 'var(--ink)' }}>Nuevo Sueño</h3>

              {/* Emoji picker */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  Ícono
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {EMOJIS.map(e => (
                    <motion.button
                      key={e}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => setForm(f => ({ ...f, emoji: e }))}
                      style={{
                        fontSize: 22, padding: '6px 8px', borderRadius: 10, cursor: 'pointer',
                        border: form.emoji === e ? '2px solid var(--blue-600, #2563eb)' : '2px solid transparent',
                        background: form.emoji === e ? 'rgba(37,99,235,0.1)' : 'var(--bg)',
                      }}
                    >
                      {e}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Nombre del sueño
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Viaje a San Andrés"
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 14px', fontSize: 15, boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12,
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
              </div>

              {/* Monto */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  ¿Cuánto necesitas? (COP)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.monto}
                  onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                  placeholder="3000000"
                  style={{
                    width: '100%', padding: '12px 14px', fontSize: 15, boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12,
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
                {form.monto && !isNaN(Number(form.monto)) && Number(form.monto) > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {formatCOP(Number(form.monto))}
                  </p>
                )}
              </div>

              {/* Fecha */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  ¿Para cuándo?
                </label>
                <input
                  type="date"
                  value={form.fechaObjetivo}
                  onChange={e => setForm(f => ({ ...f, fechaObjetivo: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  style={{
                    width: '100%', padding: '12px 14px', fontSize: 15, boxSizing: 'border-box',
                    background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12,
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
              </div>

              {error && (
                <p style={{ color: 'var(--danger, #dc2626)', fontSize: 13, marginBottom: 12 }}>{error}</p>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => { setShowForm(false); setError(''); }}
                  style={{
                    flex: 1, padding: '13px', fontSize: 15, fontWeight: 600,
                    background: 'var(--bg)', border: '1px solid var(--line)',
                    borderRadius: 12, cursor: 'pointer', color: 'var(--muted)',
                  }}
                >
                  Cancelar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={handleCrear}
                  style={{
                    flex: 2, padding: '13px', fontSize: 15, fontWeight: 700,
                    background: 'var(--blue-600, #2563eb)', color: '#fff',
                    border: 'none', borderRadius: 12, cursor: 'pointer',
                  }}
                >
                  Crear Sueño
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmar eliminar */}
      <AnimatePresence>
        {deletingId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDeletingId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }} transition={quickEase}
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--surface)', borderRadius: 18, padding: 24, width: '100%', maxWidth: 320 }}
            >
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--ink)' }}>
                ¿Eliminar este Sueño?
              </h3>
              <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 20 }}>
                Se eliminará el progreso y no se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setDeletingId(null)}
                  style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 600, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12, cursor: 'pointer', color: 'var(--muted)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => { deleteSueno(userId, deletingId!); setDeletingId(null); reload(); }}
                  style={{ flex: 1, padding: 12, fontSize: 14, fontWeight: 700, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' }}
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
