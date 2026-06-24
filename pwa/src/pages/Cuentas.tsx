import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { Card, Transaction, fetchCards, saveCard, deleteCard } from '../lib/api';
import { attributeSpend, computeExencion, computeCupo, CardSpend, CupoStatus, ExencionStatus } from '../lib/cardOptimizer';
import { getCardBenefits } from '../lib/cardCatalog';
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
