import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { formatCOP, formatDateHeader, getDateKey } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { getMerchantDomain } from '../lib/merchantLogos';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';

interface Props {
  transactions: Transaction[];
  loading: boolean;
}

export function Historial({ transactions, loading }: Props) {
  const [activeFilter, setActiveFilter] = useState<string>('Todas');
  const [selected, setSelected] = useState<Transaction | null>(null);

  const filters = ['Todas', ...CATEGORIES.map(c => c.name)];

  const filtered = activeFilter === 'Todas'
    ? transactions
    : transactions.filter(tx => tx.Categoría === activeFilter);

  const grouped = filtered.reduce<Record<string, Transaction[]>>((acc, tx) => {
    const key = getDateKey(tx.Fecha || tx.Timestamp);
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {});

  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ fontFamily: 'var(--font-body)' }}>
      {/* Header */}
      <div style={{ padding: 'max(20px, env(safe-area-inset-top)) 20px 0', marginBottom: 14 }}>
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 2px', color: 'var(--muted)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Registro
          </p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>
            Historial
          </h1>
        </div>

        {/* Filter chips with sliding indicator */}
        <div style={{ overflowX: 'auto', display: 'flex', gap: 6, paddingBottom: 4, scrollbarWidth: 'none' }}>
          {filters.map(f => {
            const isActive = f === activeFilter;
            return (
              <motion.button
                key={f}
                whileTap={{ scale: 0.94 }}
                onClick={() => setActiveFilter(f)}
                style={{
                  position: 'relative',
                  flexShrink: 0, padding: '5px 14px', borderRadius: 999,
                  border: `1.5px solid ${isActive ? 'transparent' : 'var(--line)'}`,
                  background: 'transparent',
                  color: isActive ? 'var(--blue-700)' : 'var(--ink-2)',
                  fontSize: 13, fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap', letterSpacing: '0.01em',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="historial-chip-bg"
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      background: 'var(--blue-50)',
                      border: '1.5px solid var(--blue-600)',
                    }}
                  />
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
          <EmptyState />
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
                <div style={{ background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', padding: '4px 16px' }}>
                  {group.map((tx, i) => (
                    <motion.div key={i} variants={riseItem} transition={quickEase}>
                      {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                      <TxRow tx={tx} onClick={() => setSelected(tx)} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {selected && <BottomSheet tx={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function TxRow({ tx, onClick }: { tx: Transaction; onClick: () => void }) {
  const color = getCategoryColor(tx.Categoría);
  const name = cleanMerchant(tx.Comercio) || tx.Tipo;
  const domain = getMerchantDomain(name);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      style={{
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        padding: '13px 0', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: domain && !logoFailed ? '#fff' : color,
        border: domain && !logoFailed ? '1px solid var(--line)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
        overflow: 'hidden',
      }}>
        {domain && !logoFailed ? (
          <img
            src={`https://logo.clearbit.com/${domain}?size=80`}
            alt={name}
            onError={() => setLogoFailed(true)}
            style={{ width: '76%', height: '76%', objectFit: 'contain' }}
          />
        ) : name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: 'var(--ink)', fontSize: 14.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <span style={{
            padding: '1px 7px', borderRadius: 6,
            background: 'var(--blue-50)', border: '1px solid var(--blue-100)',
            color: 'var(--blue-700)', fontSize: 10.5, fontWeight: 500,
          }}>
            {tx.Banco}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{tx.Tipo}</span>
        </div>
      </div>
      <span style={{ color: 'var(--ink)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0, marginLeft: 8 }}>
        −{formatCOP(Number(tx['Monto (COP)']))}
      </span>
    </motion.button>
  );
}

function BottomSheet({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const cleanName = cleanMerchant(tx.Comercio);
  const rows = [
    { label: 'Banco', value: tx.Banco },
    { label: 'Tipo', value: tx.Tipo },
    { label: 'Monto', value: formatCOP(Number(tx['Monto (COP)'])) },
    { label: 'Categoría', value: tx.Categoría },
    { label: 'Tarjeta / Cuenta', value: tx['Tarjeta/Cuenta'] },
    { label: 'Fecha', value: tx.Fecha },
    { label: 'Descripción original', value: tx.Comercio !== cleanName ? tx.Comercio : undefined },
  ].filter(r => r.value);

  return (
    <>
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={quickEase}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 200,
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}
      />
      <motion.div
        initial={{ y: '100%', opacity: 0.98 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.98 }}
        transition={softSpring}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.35 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 90 || info.velocity.y > 650) onClose();
        }}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          padding: '16px 20px max(20px, env(safe-area-inset-bottom))',
          zIndex: 201,
          boxShadow: '0 -4px 30px rgba(15,23,42,0.12)',
        }}
      >
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--line)', margin: '0 auto 20px' }} />
        <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', margin: '0 0 18px', letterSpacing: '-0.02em' }}>
          {cleanName || tx.Tipo}
        </p>
        {rows.map(r => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: '1px solid var(--line)',
          }}>
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
        <motion.button whileTap={{ scale: 0.98 }} onClick={onClose} style={{
          marginTop: 18, width: '100%', padding: 14,
          background: 'var(--surface)', border: '1px solid var(--line)',
          borderRadius: 12, color: 'var(--muted)', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'var(--font-body)',
        }}>
          Cerrar
        </motion.button>
      </motion.div>
    </>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      height: 52,
      borderRadius: 12,
      marginBottom: 8,
      background: 'linear-gradient(90deg, var(--line) 25%, #e2e8f0 50%, var(--line) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.8s ease-in-out infinite',
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
