import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { Card, Transaction, fetchCards, saveCard, deleteCard, fetchFixedCalendar, saveFixedPayment, deleteFixedPayment, autoDetectFixed, FixedPayment, FixedPaymentStatus, FixedCalendarData, Subscription, fetchNetWorth, saveNetWorthEntry, deleteNetWorthEntry, NetWorthData, NetWorthEntry, fetchCashback, updateCashback, CashbackData } from '../lib/api';
import { attributeSpend, computeExencion, computeCupo, CardSpend, CupoStatus, ExencionStatus } from '../lib/cardOptimizer';
import { getCardBenefits } from '../lib/cardCatalog';
import { CATEGORIES, HAS_WEBHOOK_URL } from '../lib/config';
import { createPortal } from 'react-dom';

const BANKS = ['Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Nequi', 'Daviplata', 'AV Villas', 'Occidente', 'Popular', 'dale', 'Rappi', 'Otro'];
const CHASSIS_OPTIONS = ['Clásica', 'Oro', 'Platinum', 'Signature', 'Black', 'Infinite', 'World', 'Débito', 'Cuenta de Ahorros', 'Cuenta Corriente'];

const fmtCOP = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

const ZERO_SPEND: CardSpend = { gastoPeriodo: 0, numCompras: 0 };

interface Props {
  userId: string;
  transactions: Transaction[];
  initialCard?: { banco: string; ultimos4: string };
  onBack?: () => void;
}

interface FormState {
  banco: string;
  chasis: string;
  ultimos4: string;
  alias: string;
  cupo: string;
}

function initForm(editCard?: Card, initial?: { banco: string; ultimos4: string }): FormState {
  if (editCard) {
    return {
      banco: editCard.banco,
      chasis: editCard.chasis,
      ultimos4: editCard.ultimos4,
      alias: editCard.alias || '',
      cupo: editCard.cupo ? String(editCard.cupo) : '',
    };
  }
  return {
    banco: initial?.banco || BANKS[0],
    chasis: '',
    ultimos4: initial?.ultimos4 || '',
    alias: '',
    cupo: '',
  };
}

function BankIcon({ banco }: { banco: string }) {
  const colors: Record<string, string> = {
    'Bogotá':     '#e53e3e',
    'Itaú':       '#f97316',
    'Davivienda': '#dc2626',
    'Bancolombia':'#eab308',
    'Nequi':      '#7c3aed',
    'Daviplata':  '#dc2626',
    'AV Villas':  '#2563eb',
    'Occidente':  '#059669',
    'Popular':    '#0891b2',
    'dale':       '#7c3aed',
    'Rappi':      '#ff6b35',
  };
  const color = colors[banco] || '#6366f1';
  const initial = banco.charAt(0).toUpperCase();
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 14,
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, boxShadow: `0 2px 8px ${color}44`,
    }}>
      <span style={{ color: '#fff', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-body)' }}>{initial}</span>
    </div>
  );
}

function CupoBar({ cupo }: { cupo: CupoStatus }) {
  const pct = Math.round(cupo.pct * 100);
  const danger = cupo.pct >= 0.8;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: 'var(--muted)' }}>Gasto del mes</span>
        <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtCOP(cupo.usado)} / {fmtCOP(cupo.cupo)}</span>
      </div>
      <div style={{ height: 7, borderRadius: 4, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: danger ? '#ef4444' : 'var(--blue-600)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, color: danger ? '#ef4444' : 'var(--muted)', marginTop: 3 }}>
        {danger ? `Vas en el ${pct}% de tu cupo` : `Disponible aprox. ${fmtCOP(cupo.disponible)}`}
      </div>
    </div>
  );
}

function ExencionRow({ exencion }: { exencion: ExencionStatus }) {
  if (exencion.tipo === 'ninguna') {
    return (
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
        Cuota de manejo: <b style={{ color: 'var(--ink)' }}>{fmtCOP(exencion.cuotaManejo)}/mes</b>
      </div>
    );
  }
  if (exencion.exenta) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '8px 10px' }}>
        <span style={{ fontSize: 16 }}>✅</span>
        <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>
          Cuota de manejo exonerada este mes — ahorras {fmtCOP(exencion.cuotaManejo)}
        </span>
      </div>
    );
  }
  const falta = exencion.tipo === 'compras'
    ? `${exencion.faltante} compra${exencion.faltante === 1 ? '' : 's'}`
    : fmtCOP(exencion.faltante);
  const pct = Math.round(exencion.progreso * 100);
  return (
    <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-200, #bfdbfe)', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 12, color: 'var(--blue-700)', fontWeight: 600, marginBottom: 5 }}>
        Te falta {falta} para exonerar la cuota de {fmtCOP(exencion.cuotaManejo)}
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'rgba(255,255,255,0.7)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--blue-600)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function CardItem({ card, spend, onEdit, onDelete }: {
  card: Card;
  spend: CardSpend;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return; }
    onDelete(card.id);
  };

  const exencion = computeExencion(card, spend);
  const cupo = computeCupo(card, spend);
  const hasDetails = !!cupo || !!exencion;

  return (
    <motion.div
      layout
      variants={riseItem}
      style={{
        background: 'var(--card)', borderRadius: 18,
        padding: '14px 16px', marginBottom: 10,
        boxShadow: 'var(--shadow-card)',
        border: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <BankIcon banco={card.banco} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2 }}>
            {card.alias || card.banco}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              background: 'var(--blue-50)', color: 'var(--blue-700)',
              padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            }}>
              {card.chasis || 'Sin chasis'}
            </span>
            <span style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}>
              **** {card.ultimos4}
            </span>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => onEdit(card)}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--surface)', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}
          aria-label="Editar producto"
          title="Editar"
        >
          ✎
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleDelete}
          onBlur={() => setConfirming(false)}
          style={{
            width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: confirming ? '#fee2e2' : 'var(--surface)',
            color: confirming ? '#ef4444' : 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, transition: 'background 0.18s, color 0.18s',
            flexShrink: 0,
          }}
          aria-label={confirming ? 'Confirmar eliminar' : 'Eliminar tarjeta'}
          title={confirming ? 'Toca otra vez para confirmar' : 'Eliminar'}
        >
          {confirming ? '✓' : '×'}
        </motion.button>
      </div>

      {hasDetails && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cupo && <CupoBar cupo={cupo} />}
          {exencion && <ExencionRow exencion={exencion} />}
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4 }}>
            Cuota y beneficios son datos de referencia — confírmalos con tu banco.
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CardFormSheet({
  initial,
  editCard,
  onClose,
  onSave,
}: {
  initial?: { banco: string; ultimos4: string };
  editCard?: Card;
  onClose: () => void;
  onSave: (card: Card) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => initForm(editCard, initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const benefits = getCardBenefits(form.banco, form.chasis);
  const cuotaHint = benefits
    ? `Cuota de referencia ${fmtCOP(benefits.cuotaManejo)}/mes` + (
        benefits.exencionTipo === 'monto'
          ? ` · exonérala gastando ${fmtCOP(benefits.exencionUmbral)}/mes`
          : benefits.exencionTipo === 'compras'
            ? ` · exonérala con ${benefits.exencionUmbral} compras/mes`
            : '')
    : 'Registra el cupo para ver tu uso mensual y el progreso de exención.';

  const set = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.chasis.trim()) { setError('El chasis es obligatorio'); return; }
    if (!/^\d{4}$/.test(form.ultimos4)) { setError('Ingresa exactamente 4 dígitos'); return; }
    setSaving(true);
    setError('');
    try {
      const cupoNum = parseInt(form.cupo.replace(/\D/g, ''), 10);
      const card: Card = {
        id: editCard?.id ?? crypto.randomUUID(),
        banco: form.banco,
        chasis: form.chasis.trim(),
        ultimos4: form.ultimos4,
        alias: form.alias.trim() || undefined,
        cupo: cupoNum > 0 ? cupoNum : undefined,
        createdAt: editCard?.createdAt ?? new Date().toISOString(),
      };
      await onSave(card);
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Error al guardar');
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 14,
    border: '1.5px solid var(--line)', background: 'var(--surface)',
    color: 'var(--ink)', fontSize: 15, fontFamily: 'var(--font-body)',
    outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: 'var(--muted)',
    letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, display: 'block',
  };

  return createPortal(
    <motion.div
      key="sheet-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 200, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={softSpring}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, margin: '0 auto',
          background: 'var(--card)', borderRadius: '24px 24px 0 0',
          padding: '20px 20px max(24px,env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--line)', margin: '0 auto 20px' }} />
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
          {editCard ? 'Editar producto' : 'Registrar producto'}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Banco</label>
            <select value={form.banco} onChange={e => set('banco', e.target.value)} style={inputStyle}>
              {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Chasis / Nivel</label>
            <input
              type="text"
              list="chassis-list"
              value={form.chasis}
              onChange={e => set('chasis', e.target.value)}
              placeholder="ej: Platinum, Black, Débito…"
              autoComplete="off"
              style={inputStyle}
            />
            <datalist id="chassis-list">
              {CHASSIS_OPTIONS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Últimos 4 dígitos</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={form.ultimos4}
              onChange={e => set('ultimos4', e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="8863"
              style={{ ...inputStyle, letterSpacing: '0.2em', fontSize: 20 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Alias (opcional)</label>
            <input
              type="text"
              value={form.alias}
              onChange={e => set('alias', e.target.value)}
              placeholder="ej: Tarjeta principal"
              maxLength={40}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Cupo total (opcional)</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 15, pointerEvents: 'none' }}>$</span>
              <input
                type="text"
                inputMode="numeric"
                value={form.cupo ? Number(form.cupo).toLocaleString('es-CO') : ''}
                onChange={e => set('cupo', e.target.value.replace(/\D/g, ''))}
                placeholder="5.000.000"
                style={{ ...inputStyle, paddingLeft: 26 }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
              {cuotaHint}
            </div>
          </div>

          {error && (
            <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={saving}
            whileTap={{ scale: 0.96 }}
            style={{
              width: '100%', padding: '15px', borderRadius: 16, border: 'none',
              background: saving ? 'var(--muted-2)' : 'var(--blue-700)',
              color: '#fff', fontWeight: 800, fontSize: 16,
              cursor: saving ? 'default' : 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            {saving ? 'Guardando…' : editCard ? 'Guardar cambios' : 'Guardar producto'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Fixed Calendar ─────────────────────────────────────────────

const STATUS_ICON: Record<string, string> = { paid: '✅', pending: '⏳', overdue: '⚠️' };
const STATUS_LABEL: Record<string, string> = { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido' };
const STATUS_COLOR: Record<string, string> = { paid: '#15803d', pending: '#d97706', overdue: '#dc2626' };

interface FixedFormState { nombre: string; monto: string; diaDelMes: string; categoria: string; }
const emptyFixedForm = (): FixedFormState => ({ nombre: '', monto: '', diaDelMes: '1', categoria: 'Hogar' });

function FixedPaymentForm({ onSave, onClose }: { onSave: (p: FixedPayment) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<FixedFormState>(emptyFixedForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const monto = Number(form.monto.replace(/\D/g, ''));
    const dia = Number(form.diaDelMes);
    if (!form.nombre.trim()) { setErr('Escribe un nombre'); return; }
    if (!monto || monto <= 0) { setErr('Monto inválido'); return; }
    if (!dia || dia < 1 || dia > 28) { setErr('Día debe ser 1-28'); return; }
    setSaving(true);
    try {
      await onSave({ nombre: form.nombre.trim(), monto, diaDelMes: dia, categoria: form.categoria, tipo: 'manual' });
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={softSpring}
        style={{ width: '100%', maxWidth: 480, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '28px 20px calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>Nuevo pago fijo</div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22 }}>✕</motion.button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Nombre
            <input
              value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder="Arriendo, Netflix, Gym…"
              style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Monto aproximado
            <input
              value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
              placeholder="$0"
              type="text" inputMode="numeric"
              style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Día del mes (1-28)
            <input
              value={form.diaDelMes} onChange={e => setForm(p => ({ ...p, diaDelMes: e.target.value }))}
              type="number" min="1" max="28"
              style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Categoría
            <select
              value={form.categoria} onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))}
              style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}
            >
              {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          {err && <div style={{ fontSize: 13, color: '#ef4444' }}>{err}</div>}
          <motion.button
            whileTap={{ scale: 0.97 }} type="submit" disabled={saving}
            style={{ height: 50, borderRadius: 14, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            {saving ? 'Guardando…' : 'Guardar pago fijo'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function FixedCalendarSection({ userId }: { userId: string }) {
  const [data, setData] = useState<FixedCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [suggestions, setSuggestions] = useState<Subscription[]>([]);
  const [detectingAuto, setDetectingAuto] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchFixedCalendar();
      setData(d);
      if (d.autoDetected?.length) setSuggestions(d.autoDetected);
    } catch (_) {
      // silently ignore — section is optional
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (HAS_WEBHOOK_URL) load(); else setLoading(false); }, [load]);

  const handleSave = async (p: FixedPayment) => {
    await saveFixedPayment(p);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteFixedPayment(id);
    setData(prev => prev ? { ...prev, payments: prev.payments.filter(p => p.id !== id) } : prev);
  };

  const handleDetect = async () => {
    setDetectingAuto(true);
    try {
      const subs = await autoDetectFixed();
      setSuggestions(subs);
      setShowSuggestions(true);
    } catch (_) {
      // auto-detect is best-effort
    } finally {
      setDetectingAuto(false);
    }
  };

  const handleAddSuggestion = async (sub: Subscription) => {
    await saveFixedPayment({ nombre: sub.comercio, monto: sub.monthlyAvg, diaDelMes: 1, categoria: 'Suscripciones', tipo: 'auto-detected' });
    setSuggestions(prev => prev.filter(s => s.comercio !== sub.comercio));
    await load();
  };

  if (!HAS_WEBHOOK_URL) return null;
  if (loading) return (
    <div style={{ marginTop: 32 }}>
      <div style={{ height: 18, borderRadius: 8, background: 'var(--surface)', width: 160, marginBottom: 12 }} />
      {[1,2].map(i => <div key={i} style={{ height: 60, borderRadius: 14, background: 'var(--surface)', marginBottom: 8, animation: 'pulse 1.4s ease-in-out infinite' }} />)}
    </div>
  );

  const hasPayments = data && data.payments.length > 0;
  const monthLabel = data?.month ?? '';

  return (
    <div style={{ marginTop: 36 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Pagos fijos
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
            {monthLabel ? `Mes ${monthLabel.split('-')[1]}/${monthLabel.split('-')[0]}` : 'Este mes'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleDetect}
            disabled={detectingAuto}
            title="Detectar recurrentes automáticamente"
            style={{ height: 36, padding: '0 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-body)' }}
          >
            {detectingAuto ? '…' : '🔍 Detectar'}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowForm(true)}
            style={{ height: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
          >
            + Agregar
          </motion.button>
        </div>
      </div>

      {/* Summary bar */}
      {data && hasPayments && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 16px', marginBottom: 14, display: 'flex', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Esperado</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>{fmtCOP(data.totalExpected)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>Pagado</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d' }}>{fmtCOP(data.totalPaid)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>Pendiente</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#d97706' }}>{fmtCOP(data.totalPending)}</div>
          </div>
        </div>
      )}

      {/* Payment list */}
      {hasPayments ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data!.payments.map((p: FixedPaymentStatus) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={quickEase}
              style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span style={{ fontSize: 22, flexShrink: 0 }}>{STATUS_ICON[p.status]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Día {p.diaDelMes} · {p.categoria}
                  {p.tipo === 'auto-detected' && <span style={{ marginLeft: 6, background: 'var(--blue-50)', color: 'var(--blue-600)', borderRadius: 6, padding: '1px 5px', fontSize: 11, fontWeight: 600 }}>Auto</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{fmtCOP(p.monto)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[p.status] }}>{STATUS_LABEL[p.status]}</div>
              </div>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => handleDelete(p.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 4, flexShrink: 0 }}
                title="Eliminar"
              >
                ×
              </motion.button>
            </motion.div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', borderRadius: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 6 }}>Sin pagos fijos registrados</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Agrega arriendo, suscripciones, cuotas u otros pagos mensuales para hacer seguimiento automático.
          </div>
        </div>
      )}

      {/* Auto-detected suggestions */}
      {suggestions.length > 0 && showSuggestions && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 10 }}>
            Detectados automáticamente — ¿agregar al calendario?
          </div>
          {suggestions.map(sub => (
            <div key={sub.comercio} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', borderRadius: 12, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{sub.comercio}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtCOP(sub.monthlyAvg)}/mes · {sub.occurrences} veces</div>
              </div>
              <motion.button
                whileTap={{ scale: 0.93 }}
                onClick={() => handleAddSuggestion(sub)}
                style={{ height: 32, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              >
                + Agregar
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setSuggestions(prev => prev.filter(s => s.comercio !== sub.comercio))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20 }}
              >
                ×
              </motion.button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && <FixedPaymentForm onSave={handleSave} onClose={() => setShowForm(false)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Net Worth ──────────────────────────────────────────────────

interface NwFormState { tipo: 'asset' | 'debt'; nombre: string; monto: string; tasaAnual: string; cuotaMensual: string; }
const emptyNwForm = (tipo: 'asset' | 'debt'): NwFormState => ({ tipo, nombre: '', monto: '', tasaAnual: '', cuotaMensual: '' });

function NetWorthForm({ tipo, onSave, onClose }: { tipo: 'asset' | 'debt'; onSave: (e: NetWorthEntry) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<NwFormState>(emptyNwForm(tipo));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isDebt = tipo === 'debt';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const monto = Number(form.monto.replace(/\D/g, ''));
    if (!form.nombre.trim()) { setErr('Escribe un nombre'); return; }
    if (!monto || monto <= 0) { setErr('Monto inválido'); return; }
    setSaving(true);
    try {
      const entry: NetWorthEntry = isDebt
        ? { tipo, nombre: form.nombre.trim(), saldo: monto,
            tasaAnual: form.tasaAnual ? Number(form.tasaAnual) : undefined,
            cuotaMensual: form.cuotaMensual ? Number(form.cuotaMensual.replace(/\D/g, '')) : undefined }
        : { tipo, nombre: form.nombre.trim(), valor: monto };
      await onSave(entry);
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={softSpring}
        style={{ width: '100%', maxWidth: 480, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '28px 20px calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{isDebt ? 'Nueva deuda' : 'Nuevo activo'}</div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22 }}>✕</motion.button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Nombre
            <input value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
              placeholder={isDebt ? 'Crédito hipotecario, tarjeta…' : 'Ahorros, apartamento, carro…'} style={inputStyle} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            {isDebt ? 'Saldo pendiente' : 'Valor estimado'}
            <input value={form.monto} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))}
              placeholder="$0" type="text" inputMode="numeric" style={inputStyle} />
          </label>
          {isDebt && (
            <div style={{ display: 'flex', gap: 12 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                Tasa anual %
                <input value={form.tasaAnual} onChange={e => setForm(p => ({ ...p, tasaAnual: e.target.value }))}
                  placeholder="opcional" type="number" step="0.1" style={inputStyle} />
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
                Cuota/mes
                <input value={form.cuotaMensual} onChange={e => setForm(p => ({ ...p, cuotaMensual: e.target.value }))}
                  placeholder="opcional" type="text" inputMode="numeric" style={inputStyle} />
              </label>
            </div>
          )}
          {err && <div style={{ fontSize: 13, color: '#ef4444' }}>{err}</div>}
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={saving}
            style={{ height: 50, borderRadius: 14, border: 'none', background: isDebt ? '#dc2626' : 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Guardando…' : isDebt ? 'Guardar deuda' : 'Guardar activo'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function NetWorthSection({ userId }: { userId: string }) {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [formTipo, setFormTipo] = useState<'asset' | 'debt' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchNetWorth()); } catch (_) { /* optional section */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (HAS_WEBHOOK_URL) load(); else setLoading(false); }, [load]);

  const handleSave = async (entry: NetWorthEntry) => { await saveNetWorthEntry(entry); await load(); };
  const handleDelete = async (tipo: 'asset' | 'debt', id: string) => {
    await deleteNetWorthEntry(tipo, id);
    setData(prev => prev ? {
      ...prev,
      assets: tipo === 'asset' ? prev.assets.filter(a => a.id !== id) : prev.assets,
      debts: tipo === 'debt' ? prev.debts.filter(d => d.id !== id) : prev.debts,
    } : prev);
    load();
  };

  if (!HAS_WEBHOOK_URL) return null;
  if (loading) return (
    <div style={{ marginTop: 36 }}>
      <div style={{ height: 18, borderRadius: 8, background: 'var(--surface)', width: 140, marginBottom: 12 }} />
      <div style={{ height: 90, borderRadius: 16, background: 'var(--surface)', animation: 'pulse 1.4s ease-in-out infinite' }} />
    </div>
  );

  const nw = data?.netWorth ?? 0;
  const hasEntries = data && (data.assets.length > 0 || data.debts.length > 0);

  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
        Patrimonio neto
      </div>

      {/* Hero number */}
      <div style={{ background: 'var(--grad-brand)', borderRadius: 20, padding: '20px 22px', marginBottom: 14, color: '#fff', boxShadow: 'var(--shadow-blue)' }}>
        <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>Tu patrimonio neto</div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.02em' }}>{fmtCOP(nw)}</div>
        {data && hasEntries && (
          <div style={{ display: 'flex', gap: 18, marginTop: 14 }}>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>Activos</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtCOP(data.totalAssets)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>Deudas</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fmtCOP(data.totalDebts)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Assets */}
      {data && data.assets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 8 }}>Activos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.assets.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{a.nombre}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#15803d' }}>{fmtCOP(a.valor || 0)}</div>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleDelete('asset', a.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 2 }}>×</motion.button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debts */}
      {data && data.debts.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Deudas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.debts.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{d.nombre}</div>
                  {(d.tasaAnual || d.cuotaMensual) && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {d.tasaAnual ? `${d.tasaAnual}% E.A.` : ''}{d.tasaAnual && d.cuotaMensual ? ' · ' : ''}{d.cuotaMensual ? `${fmtCOP(d.cuotaMensual)}/mes` : ''}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#dc2626' }}>{fmtCOP(d.saldo || 0)}</div>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => handleDelete('debt', d.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: 2 }}>×</motion.button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasEntries && (
        <div style={{ textAlign: 'center', padding: '20px 16px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Registra tus activos (ahorros, propiedades, inversiones) y deudas para ver tu patrimonio neto real.
        </div>
      )}

      {/* Add buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setFormTipo('asset')}
          style={{ flex: 1, height: 42, borderRadius: 12, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Activo
        </motion.button>
        <motion.button whileTap={{ scale: 0.96 }} onClick={() => setFormTipo('debt')}
          style={{ flex: 1, height: 42, borderRadius: 12, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Deuda
        </motion.button>
      </div>

      <AnimatePresence>
        {formTipo && <NetWorthForm tipo={formTipo} onSave={handleSave} onClose={() => setFormTipo(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Cashback / Puntos ──────────────────────────────────────────

interface CbFormState { card: string; banco: string; programa: string; puntos: string; tasaPuntosCOP: string; }

function CashbackForm({ cards, initial, onSave, onClose }: {
  cards: Card[];
  initial?: { card: string; banco: string; programa: string; puntos: number; tasaPuntosCOP: number };
  onSave: (card: string, banco: string, programa: string, puntos: number, tasa: number) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CbFormState>(() => initial
    ? { card: initial.card, banco: initial.banco, programa: initial.programa, puntos: String(initial.puntos), tasaPuntosCOP: String(initial.tasaPuntosCOP) }
    : { card: cards[0]?.ultimos4 || '', banco: cards[0]?.banco || '', programa: '', puntos: '', tasaPuntosCOP: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const editing = !!initial;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const card = form.card.trim();
    const puntos = Number(form.puntos.replace(/\D/g, ''));
    const tasa = Number(form.tasaPuntosCOP.replace(/[^\d.]/g, ''));
    if (!card) { setErr('Selecciona o escribe una tarjeta'); return; }
    if (!form.programa.trim()) { setErr('Escribe el nombre del programa'); return; }
    setSaving(true);
    try {
      await onSave(card, form.banco.trim(), form.programa.trim(), puntos, tasa);
      onClose();
    } catch (e) {
      setErr((e as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = { height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)' };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={softSpring}
        style={{ width: '100%', maxWidth: 480, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '28px 20px calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{editing ? 'Editar programa' : 'Nuevo programa de puntos'}</div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22 }}>✕</motion.button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Tarjeta
            {cards.length > 0 && !editing ? (
              <select value={form.card} onChange={e => {
                const c = cards.find(x => x.ultimos4 === e.target.value);
                setForm(p => ({ ...p, card: e.target.value, banco: c?.banco || p.banco }));
              }} style={inputStyle}>
                {cards.map(c => <option key={c.id} value={c.ultimos4}>{c.banco} •••• {c.ultimos4}</option>)}
              </select>
            ) : (
              <input value={form.card} onChange={e => setForm(p => ({ ...p, card: e.target.value }))}
                placeholder="Últimos 4 dígitos" type="text" inputMode="numeric" maxLength={4} disabled={editing} style={{ ...inputStyle, opacity: editing ? 0.6 : 1 }} />
            )}
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            Programa
            <input value={form.programa} onChange={e => setForm(p => ({ ...p, programa: e.target.value }))}
              placeholder="LifeMiles, Puntos Colombia…" style={inputStyle} />
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
              Puntos acumulados
              <input value={form.puntos} onChange={e => setForm(p => ({ ...p, puntos: e.target.value }))}
                placeholder="0" type="text" inputMode="numeric" style={inputStyle} />
            </label>
            <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
              COP por punto
              <input value={form.tasaPuntosCOP} onChange={e => setForm(p => ({ ...p, tasaPuntosCOP: e.target.value }))}
                placeholder="ej. 32" type="text" inputMode="decimal" style={inputStyle} />
            </label>
          </div>
          {err && <div style={{ fontSize: 13, color: '#ef4444' }}>{err}</div>}
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={saving}
            style={{ height: 50, borderRadius: 14, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function CashbackSection({ cards }: { cards: Card[] }) {
  const [data, setData] = useState<CashbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchCashback()); } catch (_) { /* optional section */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (HAS_WEBHOOK_URL) load(); else setLoading(false); }, [load]);

  const handleSave = async (card: string, banco: string, programa: string, puntos: number, tasa: number) => {
    await updateCashback(card, banco, programa, puntos, tasa);
    await load();
  };

  if (!HAS_WEBHOOK_URL) return null;
  if (loading) return (
    <div style={{ marginTop: 36 }}>
      <div style={{ height: 18, borderRadius: 8, background: 'var(--surface)', width: 130, marginBottom: 12 }} />
      <div style={{ height: 70, borderRadius: 16, background: 'var(--surface)', animation: 'pulse 1.4s ease-in-out infinite' }} />
    </div>
  );

  const entries = data ? Object.entries(data.cards) : [];
  const editInitial = editKey && data ? { card: editKey, ...data.cards[editKey] } : undefined;

  return (
    <div style={{ marginTop: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Puntos y millas
          </div>
          {data && data.totalValueCOP > 0 && (
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{fmtCOP(data.totalValueCOP)} en valor</div>
          )}
        </div>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setEditKey(null); setShowForm(true); }}
          style={{ height: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
          + Agregar
        </motion.button>
      </div>

      {entries.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(([key, c]) => (
            <motion.button
              key={key}
              whileTap={{ scale: 0.99 }}
              onClick={() => { setEditKey(key); setShowForm(true); }}
              style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--grad-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>✦</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{c.programa}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.banco} •••• {key} · {c.puntos.toLocaleString('es-CO')} pts</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{fmtCOP(c.valorEnCOP)}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>≈ valor</div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--surface)', borderRadius: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>✦</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            Registra los puntos o millas de tus tarjetas (LifeMiles, Puntos Colombia, etc.) para ver cuánto valen.
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && <CashbackForm cards={cards} initial={editInitial} onSave={handleSave} onClose={() => { setShowForm(false); setEditKey(null); }} />}
      </AnimatePresence>
    </div>
  );
}

export function Cuentas({ userId, transactions, initialCard, onBack }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(!!initialCard);
  const [editCard, setEditCard] = useState<Card | null>(null);
  const [error, setError] = useState('');

  // Gasto del mes en curso atribuido a cada tarjeta (por banco + últimos 4).
  const spendByCard = useMemo(() => {
    const now = new Date();
    return attributeSpend(transactions, cards, now.getFullYear(), now.getMonth());
  }, [transactions, cards]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCards();
      setCards(data);
    } catch (err) {
      setError((err as Error).message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Open form automatically if initialCard provided and not yet registered
  useEffect(() => {
    if (initialCard && !loading) setShowForm(true);
  }, [initialCard, loading]);

  const handleSave = async (card: Card) => {
    await saveCard(card);
    setCards(prev => prev.some(c => c.id === card.id)
      ? prev.map(c => (c.id === card.id ? card : c))
      : [...prev, card]);
  };

  const handleEdit = (card: Card) => { setShowForm(false); setEditCard(card); };

  const handleDelete = async (id: string) => {
    try {
      await deleteCard(id);
      setCards(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError((err as Error).message || 'Error al eliminar');
    }
  };

  return (
    <div className="app-page" style={{ padding: 'max(24px,env(safe-area-inset-top)) 16px 110px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        {onBack && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onBack}
            style={{
              width: 38, height: 38, borderRadius: 12, border: 'none',
              background: 'var(--surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--ink)', fontSize: 20,
            }}
            aria-label="Volver"
          >
            ←
          </motion.button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
            Mis productos
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--ink)' }}>
            Tarjetas y cuentas
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => setShowForm(true)}
          style={{
            height: 38, padding: '0 16px', borderRadius: 12, border: 'none',
            background: 'var(--blue-700)', color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6,
          }}
          aria-label="Agregar producto"
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Agregar
        </motion.button>
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 72, borderRadius: 18, background: 'var(--surface)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }} />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={quickEase}
          style={{ textAlign: 'center', padding: '48px 24px' }}
        >
          <div style={{ fontSize: 52, marginBottom: 16 }}>💳</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)', marginBottom: 8 }}>
            Sin productos registrados
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24, lineHeight: 1.5 }}>
            Registra tus tarjetas y cuentas para hacer seguimiento por producto y recibir alertas cuando lleguen transacciones de productos nuevos.
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => setShowForm(true)}
            style={{
              padding: '14px 28px', borderRadius: 14, border: 'none',
              background: 'var(--blue-700)', color: '#fff',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              fontFamily: 'var(--font-body)',
            }}
          >
            Registrar primer producto
          </motion.button>
        </motion.div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show">
          {cards.map(card => (
            <CardItem
              key={card.id}
              card={card}
              spend={spendByCard.get(card.id) ?? ZERO_SPEND}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </motion.div>
      )}

      {/* Fixed Payment Calendar */}
      <FixedCalendarSection userId={userId} />

      {/* Net Worth */}
      <NetWorthSection userId={userId} />

      {/* Cashback / Points */}
      <CashbackSection cards={cards} />

      <AnimatePresence>
        {(showForm || editCard) && (
          <CardFormSheet
            initial={editCard ? undefined : initialCard}
            editCard={editCard ?? undefined}
            onClose={() => { setShowForm(false); setEditCard(null); }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
