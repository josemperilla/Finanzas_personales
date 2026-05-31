import { motion } from 'framer-motion';
import { useState } from 'react';
import { Transaction } from '../lib/api';
import { formatCOP, currentMonthLabel, formatDateShort } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { DonutChart } from '../components/DonutChart';
import { Blobs } from '../components/ui/Blobs';
import { cleanMerchant } from '../lib/merchantCleaner';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';

interface Props {
  transactions: Transaction[];
  loading: boolean;
  onViewAll: () => void;
}

export function Home({ transactions, loading, onViewAll }: Props) {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthTx = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const totalMonth = monthTx.reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0);

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevTx = transactions.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
  });
  const totalPrev = prevTx.reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0);
  const diff = totalPrev > 0 ? ((totalMonth - totalPrev) / totalPrev) * 100 : 0;

  const byCategory = CATEGORIES.map(cat => ({
    category: cat.name,
    amount: monthTx
      .filter(tx => tx.Categoría === cat.name)
      .reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
  })).filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);

  const recent = [...transactions].slice(0, 5);
  const monthLabel = currentMonthLabel();

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
      }}>
        <ProfileAvatar fallback={monthLabel.charAt(0).toUpperCase()} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Finanzas Personales</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          </div>
        </div>
        {!loading && totalPrev > 0 && (
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
          }}>
            {diff <= 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(0)}%
          </motion.span>
        )}
      </motion.div>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px', position: 'relative' }}>
        {/* Donut chart card */}
        <motion.div variants={riseItem} transition={quickEase} style={{
          background: '#fff', borderRadius: 'var(--r-2xl)',
          padding: 22, boxShadow: 'var(--shadow-card)',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>Gastado este mes</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {loading ? '—' : formatCOP(totalMonth)}
            </span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Spinner />
            </div>
          ) : (
            <DonutChart slices={byCategory} total={totalMonth} />
          )}
        </motion.div>

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
            <EmptyState />
          ) : (
            <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ background: '#fff', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', padding: '4px 16px' }}>
              {recent.map((tx, i) => (
                <motion.div key={i} variants={riseItem} transition={quickEase}>
                  {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                  <TxRow tx={tx} />
                </motion.div>
              ))}
            </motion.div>
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
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      )}
    </div>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const color = getCategoryColor(tx.Categoría);
  const fecha = tx.Fecha || tx.Timestamp;
  const name = cleanMerchant(tx.Comercio) || tx.Tipo;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0' }}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
        flexShrink: 0,
      }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{tx.Categoría} · {formatDateShort(fecha)}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14.5, color: 'var(--ink)', flexShrink: 0 }}>
        −{formatCOP(Number(tx['Monto (COP)']))}
      </div>
    </div>
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

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--muted)' }}>
      <p style={{ margin: 0, fontSize: 13 }}>Sin transacciones aún</p>
    </div>
  );
}
