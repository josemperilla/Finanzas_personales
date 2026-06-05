import { useState, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, updateCategory, deleteTransaction, updateTransaction, ManualTransaction } from '../lib/api';
import { formatCOP, formatDateHeader, getDateKey } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { getMerchantDomain } from '../lib/merchantLogos';
import { MerchantLogo } from '../components/ui/MerchantLogo';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { exportToCSV } from '../lib/export';

type DateRange = 'month' | '3m' | '6m' | 'year' | 'all';

interface Props {
  transactions: Transaction[];
  loading: boolean;
  onCategoryChange?: (timestamp: string, categoria: string) => void;
  onDelete?: (timestamp: string) => void;
  onTransactionUpdate?: (timestamp: string, data: Partial<ManualTransaction>) => void;
}

const DATE_CHIPS: { label: string; value: DateRange }[] = [
  { label: 'Este mes', value: 'month' },
  { label: '3 meses',  value: '3m' },
  { label: '6 meses',  value: '6m' },
  { label: 'Este año', value: 'year' },
  { label: 'Todo',     value: 'all' },
];

function isInDateRange(dateStr: string, range: DateRange): boolean {
  if (range === 'all') return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const now = new Date();
  if (range === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (range === 'year')  return d.getFullYear() === now.getFullYear();
  const months = range === '3m' ? 2 : 5;
  return d >= new Date(now.getFullYear(), now.getMonth() - months, 1);
}

function csvFilename(range: DateRange): string {
  const now = new Date();
  if (range === 'month') return `gastos_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.csv`;
  if (range === 'year')  return `gastos_${now.getFullYear()}.csv`;
  return `gastos_historial.csv`;
}

export function Historial({ transactions, loading, onCategoryChange, onDelete, onTransactionUpdate }: Props) {
  const [activeFilter, setActiveFilter]   = useState<string>('Todas');
  const [selected, setSelected]           = useState<Transaction | null>(null);
  const [searchQuery, setSearchQuery]     = useState('');
  const [dateRange, setDateRange]         = useState<DateRange>('all');
  const [bankFilter, setBankFilter]       = useState('Todos');
  const [typeFilter, setTypeFilter]       = useState('Todos');
  const [showAdvanced, setShowAdvanced]   = useState(false);

  const filters = ['Todas', ...CATEGORIES.map(c => c.name)];

  const banks = useMemo(() => ['Todos', ...Array.from(new Set(transactions.map(tx => tx.Banco).filter(Boolean))).sort()], [transactions]);
  const types = useMemo(() => ['Todos', ...Array.from(new Set(transactions.map(tx => tx.Tipo).filter(Boolean))).sort()], [transactions]);

  const filtered = useMemo(() => (
    (activeFilter === 'Todas' ? transactions : transactions.filter(tx => tx.Categoría === activeFilter))
      .filter(tx => isInDateRange(tx.Fecha || tx.Timestamp, dateRange))
      .filter(tx => bankFilter === 'Todos' || tx.Banco === bankFilter)
      .filter(tx => typeFilter === 'Todos' || tx.Tipo === typeFilter)
      .filter(tx => !searchQuery ||
        cleanMerchant(tx.Comercio).toLowerCase().includes(searchQuery.toLowerCase()) ||
        tx.Comercio.toLowerCase().includes(searchQuery.toLowerCase()))
  ), [transactions, activeFilter, dateRange, bankFilter, typeFilter, searchQuery]);

  const grouped = useMemo(() => filtered.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const key = getDateKey(tx.Fecha || tx.Timestamp);
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {}), [filtered]);

  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const handleDelete = async (ts: string) => {
    await deleteTransaction(ts);
    onDelete?.(ts);
    if (selected?.Timestamp === ts) setSelected(null);
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 0', marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Registro
            </p>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
              Historial
            </h1>
          </div>
          <button
            onClick={() => exportToCSV(filtered, csvFilename(dateRange))}
            title="Exportar CSV"
            style={{
              background: 'var(--blue-50)', border: '1.5px solid var(--blue-100)',
              borderRadius: 10, padding: '7px 12px', cursor: 'pointer',
              color: 'var(--blue-700)', fontSize: 12.5, fontWeight: 600,
              fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 5,
            }}
          >
            <span style={{ fontSize: 14 }}>↓</span> CSV
          </button>
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar comercio..."
            style={{
              width: '100%', padding: '9px 36px 9px 14px', borderRadius: 999,
              border: '1.5px solid var(--line)', background: 'var(--surface)',
              color: 'var(--ink)', fontSize: 13.5, fontFamily: 'var(--font-body)',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', fontSize: 15, padding: 2,
              display: 'flex', alignItems: 'center', lineHeight: 1,
            }}>✕</button>
          )}
        </div>

        {/* Date range chips */}
        <div style={{ overflowX: 'auto', display: 'flex', gap: 6, paddingBottom: 4, scrollbarWidth: 'none', marginBottom: 8 }}>
          {DATE_CHIPS.map(({ label, value }) => {
            const isActive = value === dateRange;
            return (
              <motion.button key={value} whileTap={{ scale: 0.94 }} onClick={() => setDateRange(value)} style={{
                position: 'relative', flexShrink: 0, padding: '5px 12px', borderRadius: 999,
                border: `1.5px solid ${isActive ? 'transparent' : 'var(--line)'}`,
                background: 'transparent',
                color: isActive ? 'var(--blue-700)' : 'var(--ink-2)',
                fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
              }}>
                {isActive && (
                  <motion.span layoutId="date-chip-bg" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--blue-50)', border: '1.5px solid var(--blue-600)' }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
              </motion.button>
            );
          })}
          <motion.button whileTap={{ scale: 0.94 }} onClick={() => setShowAdvanced(v => !v)} style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 999,
            border: `1.5px solid ${showAdvanced ? 'var(--blue-600)' : 'var(--line)'}`,
            background: showAdvanced ? 'var(--blue-50)' : 'transparent',
            color: showAdvanced ? 'var(--blue-700)' : 'var(--ink-2)',
            fontSize: 12.5, fontWeight: 400, cursor: 'pointer',
            fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 13 }}>⊟</span> Filtros
          </motion.button>
        </div>

        {/* Advanced filters — bank and type */}
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={quickEase}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ paddingBottom: 8 }}>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Banco</div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {banks.map(b => (
                    <motion.button key={b} whileTap={{ scale: 0.94 }} onClick={() => setBankFilter(b)} style={{
                      flexShrink: 0, padding: '4px 11px', borderRadius: 999, fontSize: 12,
                      border: `1.5px solid ${bankFilter === b ? 'var(--blue-600)' : 'var(--line)'}`,
                      background: bankFilter === b ? 'var(--blue-50)' : 'transparent',
                      color: bankFilter === b ? 'var(--blue-700)' : 'var(--ink-2)',
                      fontFamily: 'var(--font-body)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>{b}</motion.button>
                  ))}
                </div>
              </div>
              <div style={{ paddingBottom: 8 }}>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Tipo</div>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                  {types.map(t => (
                    <motion.button key={t} whileTap={{ scale: 0.94 }} onClick={() => setTypeFilter(t)} style={{
                      flexShrink: 0, padding: '4px 11px', borderRadius: 999, fontSize: 12,
                      border: `1.5px solid ${typeFilter === t ? 'var(--blue-600)' : 'var(--line)'}`,
                      background: typeFilter === t ? 'var(--blue-50)' : 'transparent',
                      color: typeFilter === t ? 'var(--blue-700)' : 'var(--ink-2)',
                      fontFamily: 'var(--font-body)', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>{t}</motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category filter chips */}
        <div style={{ overflowX: 'auto', display: 'flex', gap: 6, paddingBottom: 4, scrollbarWidth: 'none' }}>
          {filters.map(f => {
            const isActive = f === activeFilter;
            return (
              <motion.button key={f} whileTap={{ scale: 0.94 }} onClick={() => setActiveFilter(f)} style={{
                position: 'relative', flexShrink: 0, padding: '5px 14px', borderRadius: 999,
                border: `1.5px solid ${isActive ? 'transparent' : 'var(--line)'}`,
                background: 'transparent',
                color: isActive ? 'var(--blue-700)' : 'var(--ink-2)',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
              }}>
                {isActive && (
                  <motion.span layoutId="historial-chip-bg"
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--blue-50)', border: '1.5px solid var(--blue-600)' }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{f}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '0 16px 100px' }}>
        {loading ? (
          [1,2,3,4,5].map(i => <SkeletonCard key={i} />)
        ) : sortedKeys.length === 0 ? (
          searchQuery
            ? <FriendlyEmptyState title="Sin resultados" message={`No hay transacciones que coincidan con "${searchQuery}".`} />
            : <EmptyState />
        ) : (
          <motion.div variants={staggerContainer} initial="initial" animate="animate">
            {sortedKeys.map(dateKey => {
              const group = grouped[dateKey];
              const dayTotal = group.reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0);
              return (
                <motion.div key={dateKey} variants={riseItem} transition={quickEase} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, padding: '0 2px' }}>
                    <span style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'capitalize', letterSpacing: '0.03em' }}>
                      {formatDateHeader(dateKey)}
                    </span>
                    <span style={{ color: 'var(--muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {formatCOP(dayTotal)}
                    </span>
                  </div>
                  <div style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                    {group.map((tx, i) => (
                      <div key={tx.Timestamp || i}>
                        {i > 0 && <div style={{ height: 1, background: 'var(--line)', marginLeft: 16 }} />}
                        <TxRow tx={tx} onClick={() => setSelected(tx)} onDelete={handleDelete} />
                      </div>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <BottomSheet
            tx={selected}
            onClose={() => setSelected(null)}
            onCategoryChange={onCategoryChange}
            onDelete={ts => { handleDelete(ts); setSelected(null); }}
            onTransactionUpdate={onTransactionUpdate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TxRow({ tx, onClick, onDelete }: { tx: Transaction; onClick: () => void; onDelete: (ts: string) => void }) {
  const color    = getCategoryColor(tx.Categoría || 'Otro');
  const name     = cleanMerchant(tx.Comercio) || (/bre-?b/i.test(tx.Tipo || '') ? 'Transferencia por Bre-B' : tx.Tipo);
  const domain   = getMerchantDomain(name);
  const startX   = useRef(0);
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState(false);

  function onTouchStart(e: React.TouchEvent) { startX.current = e.touches[0].clientX; }
  function onTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientX - startX.current;
    if (delta < 0) setOffset(Math.max(delta, -80));
  }
  function onTouchEnd() { setOffset(prev => prev < -40 ? -80 : 0); }

  async function confirmDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try { await onDelete(tx.Timestamp); } catch { setDeleting(false); setOffset(0); }
  }

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Delete button revealed on swipe */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 80,
        background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }} onClick={confirmDelete}>
        {deleting
          ? <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
          : <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)' }}>Eliminar</span>
        }
      </div>

      {/* Main content */}
      <motion.div
        style={{ transform: `translateX(${offset}px)`, background: 'var(--card)', position: 'relative', zIndex: 1, padding: '0 16px' }}
        animate={{ x: offset }}
        transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.7 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (offset !== 0) { setOffset(0); } else { onClick(); } }}
      >
        <div style={{
          padding: '13px 0', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        }}>
          <MerchantLogo domain={domain} name={name} size={38} color={color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, color: 'var(--ink)', fontSize: 'var(--text-base)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </p>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span style={{
                padding: '1px 7px', borderRadius: 6,
                background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
                color: 'var(--blue-700)', fontSize: 'var(--text-2xs)', fontWeight: 500,
              }}>
                {tx.Banco}
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>{tx.Tipo}</span>
            </div>
          </div>
          <span style={{ color: 'var(--ink)', fontSize: 'var(--text-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            −{formatCOP(Number(tx['Monto (COP)']))}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function BottomSheet({ tx, onClose, onCategoryChange, onDelete, onTransactionUpdate }: {
  tx: Transaction;
  onClose: () => void;
  onCategoryChange?: (timestamp: string, categoria: string) => void;
  onDelete?: (ts: string) => void;
  onTransactionUpdate?: (timestamp: string, data: Partial<ManualTransaction>) => void;
}) {
  const cleanName = cleanMerchant(tx.Comercio);
  const [localCategory, setLocalCategory] = useState(tx.Categoría);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    comercio: cleanName || tx.Comercio,
    banco: tx.Banco,
    tipo: tx.Tipo,
    monto: String(tx['Monto (COP)'] || ''),
    categoria: tx.Categoría,
    fecha: (tx.Fecha || '').slice(0, 10),
  });
  const [editSaving, setEditSaving] = useState(false);
  const [nota, setNota] = useState(tx.Nota || '');
  const [notaSaving, setNotaSaving] = useState(false);
  const [notaSaved, setNotaSaved] = useState(false);

  async function handleNotaSave() {
    if (nota === (tx.Nota || '')) return;
    setNotaSaving(true);
    try {
      await updateTransaction(tx.Timestamp, { nota });
      onTransactionUpdate?.(tx.Timestamp, { nota });
      setNotaSaved(true);
      setTimeout(() => setNotaSaved(false), 1800);
    } catch { /* keep text on error */ } finally {
      setNotaSaving(false);
    }
  }

  async function handleCategorySelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const newCat = e.target.value;
    setLocalCategory(newCat);
    setSaving(true); setSaved(false);
    try {
      await updateCategory(tx.Timestamp, newCat);
      onCategoryChange?.(tx.Timestamp, newCat);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setLocalCategory(tx.Categoría);
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSave() {
    setEditSaving(true);
    try {
      const data: Partial<ManualTransaction> = {
        comercio: editForm.comercio,
        banco:    editForm.banco,
        tipo:     editForm.tipo,
        monto:    Number(editForm.monto.replace(/\D/g, '')) || 0,
        categoria: editForm.categoria,
        fecha:    editForm.fecha,
      };
      await updateTransaction(tx.Timestamp, data);
      onTransactionUpdate?.(tx.Timestamp, data);
      setEditing(false);
      onClose();
    } catch {
      // keep editing open on error
    } finally {
      setEditSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 42, padding: '0 12px',
    border: '1.5px solid var(--line)', borderRadius: 10,
    background: 'var(--card)', color: 'var(--ink)', fontSize: 13.5,
    fontFamily: 'var(--font-body)', outline: 'none',
  };

  const staticRows = [
    { label: 'Banco',   value: tx.Banco },
    { label: 'Tipo',    value: tx.Tipo },
    { label: 'Monto',   value: formatCOP(Number(tx['Monto (COP)'])) },
    { label: 'Tarjeta / Cuenta', value: tx['Tarjeta/Cuenta'] },
    { label: 'Fecha',   value: tx.Fecha },
    { label: 'Descripción original', value: tx.Comercio !== cleanName ? tx.Comercio : undefined },
  ].filter(r => r.value);

  return (
    <>
      <motion.div onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={quickEase}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 200, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      />
      <motion.div
        initial={{ y: '100%', opacity: 0.98 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0.98 }}
        transition={softSpring}
        drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 650) onClose(); }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--card)',
          borderRadius: '20px 20px 0 0',
          padding: '16px 20px max(20px, env(safe-area-inset-bottom))',
          zIndex: 201, boxShadow: '0 -4px 30px rgba(15,23,42,0.12)',
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--line)', margin: '0 auto 20px' }} />

        {/* Header row with edit/delete */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em', flex: 1, marginRight: 12 }}>
            {cleanName || tx.Tipo}
          </p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!editing && (
              <button onClick={() => setEditing(true)} style={{
                background: 'var(--blue-50)', border: '1.5px solid var(--blue-100)',
                borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                color: 'var(--blue-700)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>Editar</button>
            )}
            {onDelete && !editing && (
              <button onClick={() => onDelete(tx.Timestamp)} style={{
                background: '#fee2e2', border: '1.5px solid #fca5a5',
                borderRadius: 9, padding: '5px 10px', fontSize: 12, fontWeight: 600,
                color: '#b91c1c', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>Eliminar</button>
            )}
          </div>
        </div>

        {editing ? (
          /* ── Edit mode ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Comercio', key: 'comercio', type: 'text' },
              { label: 'Monto (COP)', key: 'monto', type: 'text' },
              { label: 'Fecha', key: 'fecha', type: 'date' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
                <input type={type} value={editForm[key as keyof typeof editForm]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  style={inputStyle} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Banco</div>
              <select value={editForm.banco} onChange={e => setEditForm(f => ({ ...f, banco: e.target.value }))} style={{ ...inputStyle }}>
                {['Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Otro'].map(b => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Tipo</div>
              <select value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))} style={{ ...inputStyle }}>
                {['Compra', 'Débito', 'Transferencia', 'Pago PSE', 'Otro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Categoría</div>
              <select value={editForm.categoria} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))} style={{ ...inputStyle }}>
                {CATEGORIES.map(c => <option key={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleEditSave} disabled={editSaving} style={{
                flex: 1, height: 48, background: editSaving ? 'var(--blue-300)' : 'var(--blue-700)',
                border: 'none', borderRadius: 12, color: '#fff', fontSize: 15, fontWeight: 600,
                cursor: editSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
              }}>
                {editSaving ? 'Guardando...' : 'Guardar cambios'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setEditing(false)} style={{
                flex: 0, padding: '0 18px', height: 48,
                background: 'var(--surface)', border: '1px solid var(--line)',
                borderRadius: 12, color: 'var(--muted)', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
                Cancelar
              </motion.button>
            </div>
          </div>
        ) : (
          /* ── Read mode ── */
          <>
            {/* Categoría — editable */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>Categoría</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving && <div style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--line)', borderTopColor: 'var(--blue-600)', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
                {saved && <span style={{ color: '#16a34a', fontSize: 13, fontWeight: 700 }}>✓</span>}
                <select value={localCategory} onChange={handleCategorySelect} disabled={saving} style={{
                  border: 'none', background: 'transparent', color: 'var(--blue-700)',
                  fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer',
                  outline: 'none', fontFamily: 'var(--font-body)',
                  WebkitAppearance: 'none', appearance: 'none', paddingRight: 16,
                }}>
                  {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
                <span style={{ color: 'var(--blue-700)', fontSize: 10, pointerEvents: 'none', marginLeft: -14 }}>▾</span>
              </div>
            </div>

            {staticRows.map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{r.label}</span>
                <span style={{
                  color: r.label === 'Monto' ? 'var(--blue-700)' : r.label === 'Descripción original' ? 'var(--muted)' : 'var(--ink)',
                  fontSize: r.label === 'Descripción original' ? 11.5 : 13,
                  fontWeight: r.label === 'Monto' ? 700 : 500,
                  fontFamily: r.label === 'Monto' ? 'var(--font-mono)' : 'var(--font-body)',
                  maxWidth: '55%', textAlign: 'right',
                }}>
                  {r.value}
                </span>
              </div>
            ))}

            {/* Note — always editable inline */}
            <div style={{ paddingTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Nota personal</span>
                {notaSaving && <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Guardando…</span>}
                {notaSaved && <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600 }}>✓ Guardado</span>}
              </div>
              <textarea
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder="Añade una nota a esta transacción..."
                rows={2}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
                  border: '1.5px solid var(--line)', borderRadius: 10,
                  background: nota ? 'rgba(254,252,232,0.8)' : 'var(--surface)',
                  color: 'var(--ink)', fontSize: 13.5, fontFamily: 'var(--font-body)',
                  outline: 'none', resize: 'none', lineHeight: '1.5',
                }}
                onFocus={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = '#2563eb'; }}
                onBlur={e => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = 'var(--line)'; handleNotaSave(); }}
              />
            </div>

            <motion.button whileTap={{ scale: 0.98 }} onClick={onClose} style={{
              marginTop: 14, width: '100%', padding: 14,
              background: 'var(--surface)', border: '1px solid var(--line)',
              borderRadius: 12, color: 'var(--muted)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}>
              Cerrar
            </motion.button>
          </>
        )}
      </motion.div>
    </>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      height: 52, borderRadius: 12, marginBottom: 8,
      background: 'linear-gradient(90deg, var(--line) 25%, #e2e8f0 50%, var(--line) 75%)',
      backgroundSize: '200% 100%', animation: 'shimmer 1.8s ease-in-out infinite',
    }} />
  );
}

function EmptyState() {
  return (
    <FriendlyEmptyState
      title="Sin historial todavía"
      message="Cuando entren transacciones desde SMS o manuales, aparecerán agrupadas por día aquí."
    />
  );
}
