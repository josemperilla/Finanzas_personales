import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef } from 'react';
import { Transaction } from '../lib/api';
import { formatCOP, formatDateShort } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { DonutChart } from '../components/DonutChart';
import { Blobs } from '../components/ui/Blobs';
import { ConnectionNotice } from '../components/ui/ConnectionNotice';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { cleanMerchant } from '../lib/merchantCleaner';
import { getMerchantDomain } from '../lib/merchantLogos';
import { MerchantLogo } from '../components/ui/MerchantLogo';
import { useCountUp } from '../lib/useCountUp';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { getBudgets } from '../lib/budgets';

interface Props {
  transactions: Transaction[];
  loading: boolean;
  error?: string | null;
  missingConfig?: boolean;
  highlightLatest?: boolean;
  onRetry?: () => void;
  onAdd: () => void;
  onViewAll: () => void;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir < 0 ? -64 : 64, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 64 : -64, opacity: 0 }),
};

export function Home({ transactions, loading, error, missingConfig, highlightLatest, onRetry, onAdd, onViewAll }: Props) {
  const now = new Date();
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Derive the selected month's date
  const selDate = new Date(now.getFullYear(), now.getMonth() + selectedOffset, 1);
  const selMonth = selDate.getMonth();
  const selYear = selDate.getFullYear();

  // Header always shows current month
  const currentMonthStr = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  // Card shows selected month label
  const selMonthStr = selDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  // Transactions for selected month
  const monthTx = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    return d.getMonth() === selMonth && d.getFullYear() === selYear;
  });
  const totalMonth = monthTx.reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0);

  // Previous month for comparison (only shown in header badge when selectedOffset === 0)
  const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const prevTx = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    return d.getMonth() === prevMonthIdx && d.getFullYear() === prevYear;
  });
  const totalPrev = prevTx.reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0);
  const diff = totalPrev > 0 ? ((totalMonth - totalPrev) / totalPrev) * 100 : 0;

  // Category breakdown for selected month
  const byCategory = CATEGORIES.map(cat => ({
    category: cat.name,
    amount: monthTx
      .filter(tx => tx.Categoría === cat.name)
      .reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
  })).filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);

  // Budget alerts — categories ≥ 80% of monthly budget
  const budgets = getBudgets();
  const alerts = byCategory
    .filter(s => budgets[s.category] > 0 && s.amount / budgets[s.category] >= 0.8)
    .map(s => ({
      cat: s.category,
      budget: budgets[s.category],
      spent: s.amount,
      pct: s.amount / budgets[s.category],
      color: getCategoryColor(s.category),
    }))
    .sort((a, b) => b.pct - a.pct);

  // Recent transactions for selected month
  const recent = [...monthTx]
    .sort((a, b) => {
      const da = new Date((a.Fecha || a.Timestamp).replace(' ', 'T'));
      const db = new Date((b.Fecha || b.Timestamp).replace(' ', 'T'));
      return db.getTime() - da.getTime();
    })
    .slice(0, 5);

  const animatedTotal = useCountUp(loading ? 0 : totalMonth);

  const navigate = (delta: number) => {
    const next = Math.min(0, Math.max(-11, selectedOffset + delta));
    if (next !== selectedOffset) {
      setDirection(delta);
      setSelectedOffset(next);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > dy && Math.abs(dx) > 44) {
      navigate(dx < 0 ? 1 : -1);
    }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: '100px', position: 'relative', overflow: 'hidden' }}>
      <Blobs variant="a" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={quickEase}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: 'max(20px, env(safe-area-inset-top)) 20px 0',
          marginBottom: 20, position: 'relative',
        }}
      >
        <ProfileAvatar fallback={currentMonthStr.charAt(0).toUpperCase()} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Finanzas Personales</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
            {currentMonthStr.charAt(0).toUpperCase() + currentMonthStr.slice(1)}
          </div>
        </div>
        {!loading && totalPrev > 0 && selectedOffset === 0 && (
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={softSpring}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 999,
              background: diff <= 0 ? '#dcfce7' : '#fee2e2',
              color: diff <= 0 ? '#15803d' : '#b91c1c',
              fontSize: 11.5, fontWeight: 600,
            }}
          >
            {diff <= 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(0)}%
          </motion.span>
        )}
      </motion.div>

      <AnimatePresence>
        {missingConfig && (
          <ConnectionNotice message="Falta configurar VITE_WEBHOOK_URL en Netlify para conectar con Google Sheets." />
        )}
        {!missingConfig && error && (
          <ConnectionNotice message={error || 'No pude conectar con Google Sheets.'} onRetry={onRetry} />
        )}
      </AnimatePresence>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px', position: 'relative' }}>
        {/* Donut chart card */}
        <motion.div
          variants={riseItem}
          transition={quickEase}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            background: '#fff', borderRadius: 'var(--r-2xl)',
            padding: 22, boxShadow: 'var(--shadow-card)',
            marginBottom: 14, overflow: 'hidden',
            touchAction: 'pan-y',
          }}
        >
          {/* Month navigation header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => navigate(-1)}
                disabled={selectedOffset <= -11}
                style={{
                  background: 'none', border: 'none',
                  cursor: selectedOffset <= -11 ? 'default' : 'pointer',
                  color: selectedOffset <= -11 ? 'rgba(100,116,139,0.28)' : 'var(--muted)',
                  fontSize: 22, padding: '0 6px',
                  display: 'flex', alignItems: 'center', lineHeight: 1,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ‹
              </motion.button>
              <motion.span
                key={selectedOffset}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={quickEase}
                style={{
                  fontSize: 13.5, color: 'var(--muted)',
                  minWidth: 86, textAlign: 'center',
                  fontFamily: 'var(--font-body)',
                }}
              >
                {selectedOffset === 0 ? 'Este mes' : selMonthStr}
              </motion.span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => navigate(1)}
                disabled={selectedOffset >= 0}
                style={{
                  background: 'none', border: 'none',
                  cursor: selectedOffset >= 0 ? 'default' : 'pointer',
                  color: selectedOffset >= 0 ? 'rgba(100,116,139,0.28)' : 'var(--muted)',
                  fontSize: 22, padding: '0 6px',
                  display: 'flex', alignItems: 'center', lineHeight: 1,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ›
              </motion.button>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {loading ? '—' : formatCOP(animatedTotal)}
            </span>
          </div>

          {/* Animated chart */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Spinner />
            </div>
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={selectedOffset}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <DonutChart slices={byCategory} total={totalMonth} />
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* Budget alerts */}
        {!loading && alerts.length > 0 && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', marginBottom: 8 }}>
              Alertas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map(({ cat, budget, spent, pct, color }) => {
                const exceeded = pct >= 1;
                const accent = exceeded ? '#dc2626' : '#d97706';
                const bg = exceeded ? '#fef2f2' : '#fffbeb';
                const border = exceeded ? '#fecaca' : '#fde68a';
                return (
                  <div key={cat} style={{ background: bg, borderRadius: 'var(--r-xl)', padding: '12px 14px', border: `1.5px solid ${border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{cat}</span>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: accent, fontWeight: 700 }}>
                        {Math.round(pct * 100)}%
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct * 100, 100)}%` }}
                        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        style={{ height: '100%', borderRadius: 999, background: accent }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                      <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                        {exceeded ? 'Presupuesto superado' : 'Cerca del límite'}
                      </span>
                      <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
                        {formatCOP(spent)} / {formatCOP(budget)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Recent transactions */}
        <motion.div variants={riseItem} transition={quickEase}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Movimientos</span>
            <motion.button whileTap={{ scale: 0.96 }} onClick={onViewAll} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13.5, fontWeight: 600, color: 'var(--blue-700)',
              padding: 0, fontFamily: 'var(--font-body)',
            }}>
              Ver todo
            </motion.button>
          </div>

          {loading ? (
            [1,2,3].map(i => <SkeletonCard key={i} />)
          ) : recent.length === 0 ? (
            <FriendlyEmptyState
              title="Sin movimientos"
              message={selectedOffset === 0
                ? 'Agrega una transacción manual o conecta tus SMS para empezar a ver tu mes en vivo.'
                : `No hay transacciones registradas en ${selMonthStr}.`}
              actionLabel={selectedOffset === 0 ? 'Agregar transacción' : undefined}
              onAction={selectedOffset === 0 ? onAdd : undefined}
            />
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`txs-${selectedOffset}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', padding: '4px 16px' }}
              >
                {recent.map((tx, i) => (
                  <div key={i}>
                    {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                    <TxRow tx={tx} highlighted={Boolean(highlightLatest && i === 0 && selectedOffset === 0)} />
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}

function ProfileAvatar({ fallback }: { fallback: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div style={{
      width: 42, height: 42, borderRadius: '50%',
      background: failed ? 'var(--grad-brand)' : '#fff',
      border: '2px solid #fff',
      boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', flexShrink: 0,
      color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
    }}>
      {failed ? fallback : (
        <img
          src="/profile-avatar.jpg"
          alt="Perfil"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
      )}
    </div>
  );
}

function TxRow({ tx, highlighted }: { tx: Transaction; highlighted?: boolean }) {
  const color = getCategoryColor(tx.Categoría);
  const fecha = tx.Fecha || tx.Timestamp;
  const name = cleanMerchant(tx.Comercio) || (/bre-?b/i.test(tx.Tipo || '') ? 'Transferencia por Bre-B' : tx.Tipo);
  const domain = getMerchantDomain(name);

  return (
    <motion.div
      animate={{
        backgroundColor: highlighted ? 'rgba(37,99,235,0.08)' : 'rgba(255,255,255,0)',
        scale: highlighted ? 1.01 : 1,
      }}
      transition={softSpring}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 8px', margin: '0 -8px', borderRadius: 14 }}
    >
      <MerchantLogo domain={domain} name={name} size={38} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{tx.Categoría} · {formatDateShort(fecha)}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14.5, color: 'var(--ink)', flexShrink: 0 }}>
        −{formatCOP(Number(tx['Monto (COP)']))}
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div style={{
      height: '52px', borderRadius: 12, marginBottom: 8,
      background: 'linear-gradient(90deg, var(--line) 25%, #e2e8f0 50%, var(--line) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.8s ease-in-out infinite',
    }} />
  );
}

function Spinner() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: '2.5px solid var(--line)',
      borderTopColor: 'var(--blue-600)',
      animation: 'spin 0.9s linear infinite',
    }} />
  );
}
