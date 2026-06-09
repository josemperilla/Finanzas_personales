import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { getWeekdayAverages } from '../lib/analytics';
import { formatCOP } from '../lib/utils';

interface Props {
  transactions: Transaction[];
}

export function WeekdayChart({ transactions }: Props) {
  const days = useMemo(() => getWeekdayAverages(transactions, 3), [transactions]);
  const maxAvg = Math.max(...days.map(d => d.avg), 1);
  const hasData = days.some(d => d.avg > 0);

  return (
    <div style={{ padding: '16px 18px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
        Gasto promedio por día de la semana
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 16 }}>
        Últimos 3 meses
      </div>

      {!hasData ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
          Sin suficientes datos todavía
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {days.map(d => {
            const pct = d.avg > 0 ? Math.max(6, (d.avg / maxAvg) * 100) : 0;
            const isTop = d.avg === maxAvg && d.avg > 0;
            return (
              <div key={d.dayIndex} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 20, flexShrink: 0, textAlign: 'center',
                  fontSize: 12, fontWeight: isTop ? 700 : 500,
                  color: isTop ? 'var(--blue-700)' : 'var(--muted)',
                }}>
                  {d.label}
                </div>
                <div style={{ flex: 1, height: 22, background: 'var(--surface)', borderRadius: 6, overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: 'spring', stiffness: 260, damping: 28, delay: d.dayIndex * 0.05 }}
                    style={{
                      height: '100%',
                      borderRadius: 6,
                      background: isTop ? 'var(--blue-700)' : 'var(--blue-300)',
                    }}
                  />
                </div>
                <div style={{
                  width: 72, flexShrink: 0, textAlign: 'right',
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  fontWeight: isTop ? 700 : 400,
                  color: isTop ? 'var(--blue-700)' : 'var(--ink)',
                }}>
                  {d.avg > 0 ? formatCOP(d.avg) : '—'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
