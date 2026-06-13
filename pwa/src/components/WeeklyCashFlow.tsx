import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { formatCOP } from '../lib/utils';
import { softSpring } from '../lib/motion';

interface Props {
  transactions: Transaction[];
}

const DAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

function getMondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function pct(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function WeeklyCashFlow({ transactions }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = ((today.getDay() + 6) % 7); // Mon=0 ... Sun=6

  const thisWeekMonday = getMondayOfWeek(today);
  const lastWeekMonday = new Date(thisWeekMonday);
  lastWeekMonday.setDate(lastWeekMonday.getDate() - 7);

  const { dailyAmounts, weekTotal, prevWeekTotal } = useMemo(() => {
    const daily = Array(7).fill(0);
    let weekTotal = 0;
    let prevWeekTotal = 0;

    for (const tx of transactions) {
      const raw = (tx.Fecha || tx.Timestamp || '').replace(' ', 'T');
      const d = new Date(raw);
      if (isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const amount = Number(tx['Monto (COP)'] || 0);
      if (amount <= 0) continue;

      const diffMs = d.getTime() - thisWeekMonday.getTime();
      const diffDays = Math.round(diffMs / 86_400_000);

      if (diffDays >= 0 && diffDays <= 6) {
        daily[diffDays] += amount;
        weekTotal += amount;
      } else {
        const prevDiff = Math.round((d.getTime() - lastWeekMonday.getTime()) / 86_400_000);
        if (prevDiff >= 0 && prevDiff <= 6) {
          prevWeekTotal += amount;
        }
      }
    }

    return { dailyAmounts: daily, weekTotal, prevWeekTotal };
  }, [transactions, thisWeekMonday.getTime(), lastWeekMonday.getTime()]);

  const maxAmount = Math.max(...dailyAmounts, 1);
  const maxDowIdx = dailyAmounts.indexOf(Math.max(...dailyAmounts));

  const deltaVsPrev = prevWeekTotal > 0
    ? ((weekTotal - prevWeekTotal) / prevWeekTotal) * 100
    : null;

  const MIN_BAR_H = 3;
  const MAX_BAR_H = 72;

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: 'var(--r-2xl)',
      padding: '14px 16px 16px',
      boxShadow: 'var(--shadow-card)',
      marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 600, marginBottom: 2 }}>
          Esta semana
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>
            {formatCOP(weekTotal)}
          </span>
          {deltaVsPrev !== null && (
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: deltaVsPrev > 0 ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)',
            }}>
              {deltaVsPrev > 0 ? '+' : ''}{deltaVsPrev.toFixed(0)}% vs sem. ant.
            </span>
          )}
        </div>
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {dailyAmounts.map((amount, i) => {
          const isFuture = i > todayDow;
          const isToday = i === todayDow;
          const isMax = i === maxDowIdx && amount > 0;

          const barH = isFuture
            ? MIN_BAR_H
            : amount > 0
              ? Math.max(MIN_BAR_H, Math.round(pct(amount, maxAmount) * MAX_BAR_H))
              : MIN_BAR_H;

          const barColor = isFuture
            ? 'var(--line)'
            : isMax && !isToday
              ? 'var(--blue-600, #2563eb)'
              : 'var(--blue-200, #bfdbfe)';

          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {/* Amount label — only past days with spending */}
              <div style={{ height: 14, display: 'flex', alignItems: 'flex-end' }}>
                {!isFuture && amount > 0 && (
                  <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                    {amount >= 1000000
                      ? `${(amount / 1000000).toFixed(1)}M`
                      : amount >= 1000
                        ? `${Math.round(amount / 1000)}k`
                        : String(Math.round(amount))}
                  </span>
                )}
              </div>

              {/* Bar */}
              <div style={{
                width: '100%',
                height: MAX_BAR_H,
                display: 'flex',
                alignItems: 'flex-end',
              }}>
                {isFuture ? (
                  <div style={{
                    width: '100%', height: MIN_BAR_H,
                    borderRadius: 3, background: 'var(--line)', opacity: 0.4,
                  }} />
                ) : (
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 'bottom', width: '100%', height: barH, borderRadius: 3 }}
                    transition={{ delay: i * 0.03, ...softSpring }}
                  >
                    <div style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 3,
                      background: barColor,
                      outline: isToday ? '2px solid var(--blue-500, #3b82f6)' : 'none',
                      outlineOffset: 1,
                    }} />
                  </motion.div>
                )}
              </div>

              {/* Day label */}
              <div style={{
                fontSize: 10,
                color: isToday ? 'var(--ink)' : 'var(--muted)',
                fontWeight: isToday ? 700 : 400,
                lineHeight: 1,
              }}>
                {DAY_LABELS[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
