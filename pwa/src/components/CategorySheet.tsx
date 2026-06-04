import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { formatCOP, formatDateShort } from '../lib/utils';
import { getCategoryColor } from '../lib/config';
import { cleanMerchant } from '../lib/merchantCleaner';
import { quickEase, softSpring } from '../lib/motion';

interface Props {
  category: string;
  transactions: Transaction[];
  onClose: () => void;
}

const DOWS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DOW_JS = [1, 2, 3, 4, 5, 6, 0];

function parseDate(tx: Transaction): Date {
  return new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
}

function formatPeriodicity(days: number): string {
  if (days < 2) return 'Casi diario';
  if (days < 8) return `Cada ${Math.round(days)} días`;
  if (days < 14) return 'Semanal';
  if (days < 25) return 'Quincenal';
  if (days < 45) return 'Mensual';
  return 'Esporádico';
}

export function CategorySheet({ category, transactions, onClose }: Props) {
  const color = getCategoryColor(category);

  const catTxs = useMemo(
    () => transactions.filter(tx => tx.Categoría === category),
    [transactions, category]
  );

  const stats = useMemo(() => {
    if (catTxs.length === 0) return null;

    const total = catTxs.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
    const count = catTxs.length;
    const avgTicket = total / count;

    const dated = catTxs
      .map(tx => ({ tx, d: parseDate(tx) }))
      .filter(({ d }) => !isNaN(d.getTime()))
      .sort((a, b) => a.d.getTime() - b.d.getTime());

    let periodicity: number | null = null;
    if (dated.length >= 2) {
      const spanMs = dated[dated.length - 1].d.getTime() - dated[0].d.getTime();
      periodicity = spanMs / (1000 * 60 * 60 * 24) / (dated.length - 1);
    }

    const dowCount: Record<number, number> = {};
    for (const { d } of dated) {
      const dow = d.getDay();
      dowCount[dow] = (dowCount[dow] || 0) + 1;
    }
    const maxDowCount = Math.max(...Object.values(dowCount), 1);
    const topDowEntry = Object.entries(dowCount).sort(([, a], [, b]) => b - a)[0];
    const topDowName = topDowEntry
      ? DOWS[DOW_JS.indexOf(parseInt(topDowEntry[0]))]
      : null;

    const merchantMap: Record<string, { amount: number; count: number }> = {};
    for (const tx of catTxs) {
      const name = cleanMerchant(tx.Comercio) || tx.Tipo || 'Sin nombre';
      if (!merchantMap[name]) merchantMap[name] = { amount: 0, count: 0 };
      merchantMap[name].amount += Number(tx['Monto (COP)'] || 0);
      merchantMap[name].count += 1;
    }
    const topMerchants = Object.entries(merchantMap)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .slice(0, 5)
      .map(([name, v]) => ({ name, ...v }));
    const maxMerchant = topMerchants[0]?.amount || 1;

    const recentTxs = [...dated]
      .reverse()
      .slice(0, 10)
      .map(({ tx }) => tx);

    return { total, count, avgTicket, periodicity, dowCount, maxDowCount, topDowName, topMerchants, maxMerchant, recentTxs };
  }, [catTxs]);

  const monthlyTrend = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const m = d.getMonth(), y = d.getFullYear();
      const total = catTxs
        .filter(tx => { const td = parseDate(tx); return td.getMonth() === m && td.getFullYear() === y; })
        .reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
      const label = d.toLocaleDateString('es-CO', { month: 'short' }).slice(0, 3);
      const isCurrent = i === 5;
      return { label: label.charAt(0).toUpperCase() + label.slice(1), total, isCurrent };
    });
  }, [catTxs]);

  const trendMax = Math.max(...monthlyTrend.map(m => m.total), 1);

  const card = {
    background: 'var(--card)',
    borderRadius: 'var(--r-xl)' as const,
    padding: '14px 16px',
    marginBottom: 10,
    boxShadow: 'var(--shadow-card)',
  };

  return (
    <>
      <motion.div
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={quickEase}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(15,23,42,0.35)',
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
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
          background: 'var(--surface)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 30px rgba(15,23,42,0.12)',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--font-body)',
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 3, borderRadius: 2, background: 'var(--line)', margin: '14px auto 0', flexShrink: 0 }} />

        {/* Header */}
        <div style={{ padding: '12px 20px 12px', flexShrink: 0, borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em', flex: 1 }}>
              {category}
            </h2>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--line)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--muted)', fontSize: 12, fontWeight: 700,
              }}
            >✕</motion.button>
          </div>
          {stats && (
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--muted)' }}>
              {stats.count} transacción{stats.count !== 1 ? 'es' : ''} · {formatCOP(stats.total)} total
            </p>
          )}
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px max(16px, env(safe-area-inset-bottom))' }}>
          {!stats ? (
            <p style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: 14 }}>
              Sin transacciones en esta categoría
            </p>
          ) : (
            <>
              {/* 2×2 metric grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                {[
                  { label: 'Ticket promedio', value: formatCOP(Math.round(stats.avgTicket)), mono: true },
                  { label: 'Transacciones', value: String(stats.count), mono: false },
                  {
                    label: 'Periodicidad',
                    value: stats.periodicity !== null ? formatPeriodicity(stats.periodicity) : '—',
                    sub: stats.periodicity !== null && stats.periodicity >= 2 ? `~${Math.round(stats.periodicity)} días entre compras` : undefined,
                    mono: false,
                  },
                  { label: 'Día más activo', value: stats.topDowName || '—', mono: false },
                ].map(({ label, value, sub, mono }) => (
                  <div key={label} style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '12px 14px', boxShadow: 'var(--shadow-card)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
                    <div style={{
                      fontFamily: mono ? 'var(--font-mono)' : 'var(--font-display)',
                      fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.2,
                    }}>
                      {value}
                    </div>
                    {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>{sub}</div>}
                  </div>
                ))}
              </div>

              {/* Monthly trend */}
              {monthlyTrend.some(m => m.total > 0) && (
                <div style={card}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', marginBottom: 14 }}>
                    Tendencia 6 meses
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 72 }}>
                    {monthlyTrend.map(({ label, total, isCurrent }, i) => {
                      const pct = total / trendMax;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                          {isCurrent && total > 0 && (
                            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: color, fontWeight: 700, whiteSpace: 'nowrap' }}>
                              {formatCOP(total)}
                            </span>
                          )}
                          <div style={{ width: '100%', borderRadius: 4, background: 'var(--line)', overflow: 'hidden', height: `${Math.max(pct * 52, total > 0 ? 4 : 0)}px` }}>
                            <motion.div
                              initial={{ scaleY: 0 }}
                              animate={{ scaleY: 1 }}
                              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
                              style={{
                                width: '100%', height: '100%',
                                background: color,
                                opacity: isCurrent ? 1 : 0.45,
                                transformOrigin: 'bottom',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 9.5, color: isCurrent ? 'var(--ink)' : 'var(--muted)', fontWeight: isCurrent ? 700 : 400 }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top merchants */}
              {stats.topMerchants.length > 0 && (
                <div style={card}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
                    Top comercios
                  </div>
                  {stats.topMerchants.map(({ name, amount, count }, i) => (
                    <div key={name} style={{ marginBottom: i < stats.topMerchants.length - 1 ? 10 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                          {name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', flexShrink: 0 }}>
                          {formatCOP(amount)}
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(amount / stats.maxMerchant) * 100}%` }}
                          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: i * 0.06 }}
                          style={{ height: '100%', borderRadius: 999, background: color }}
                        />
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
                        {count} transacción{count !== 1 ? 'es' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Day of week */}
              <div style={card}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', marginBottom: 12 }}>
                  Por día de la semana
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {DOW_JS.map((jsDay, i) => {
                    const cnt = stats.dowCount[jsDay] || 0;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--muted)', width: 76, flexShrink: 0 }}>{DOWS[i]}</span>
                        <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
                          {cnt > 0 && (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${(cnt / stats.maxDowCount) * 100}%` }}
                              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.04 }}
                              style={{ height: '100%', borderRadius: 999, background: color, opacity: 0.85 }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--muted)', width: 18, textAlign: 'right', flexShrink: 0 }}>{cnt}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent transactions */}
              <div style={card}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', marginBottom: 8 }}>
                  Transacciones recientes
                </div>
                {stats.recentTxs.map((tx, i) => {
                  const name = cleanMerchant(tx.Comercio) || tx.Tipo || '';
                  return (
                    <div key={i}>
                      {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 0', gap: 10 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {formatDateShort(tx.Fecha || tx.Timestamp)}
                          </div>
                        </div>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--ink)', flexShrink: 0 }}>
                          −{formatCOP(Number(tx['Monto (COP)']))}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
