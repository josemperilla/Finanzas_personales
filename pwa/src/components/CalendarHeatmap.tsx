import { useMemo } from 'react';
import { Transaction } from '../lib/api';
import { formatCOP } from '../lib/utils';

interface Props {
  transactions: Transaction[];
  year: number;
  month: number; // 0-indexed
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function interpolateColor(t: number): string {
  // t in [0,1]: 0 = --surface (#f6f8fc), 1 = --blue-700 (#1d4ed8)
  // We read from CSS vars at runtime; fall back to hardcoded defaults
  if (t <= 0) return 'var(--surface)';
  const stops = [
    [0.001, 'var(--blue-50)'],
    [0.25,  'var(--blue-100)'],
    [0.55,  'var(--blue-300)'],
    [0.80,  'var(--blue-500)'],
    [1.0,   'var(--blue-700)'],
  ] as const;
  for (const [threshold, color] of stops) {
    if (t <= threshold) return color;
  }
  return 'var(--blue-700)';
}

export function CalendarHeatmap({ transactions, year, month }: Props) {
  const { cells, maxSpend } = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daily: number[] = new Array(daysInMonth).fill(0);

    for (const tx of transactions) {
      const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
      if (isNaN(d.getTime())) continue;
      if (d.getFullYear() === year && d.getMonth() === month) {
        daily[d.getDate() - 1] += Number(tx['Monto (COP)'] || 0);
      }
    }

    const max = Math.max(...daily, 1);

    // First day of month: JS getDay() 0=Sun → convert to Mon=0
    const firstJs = new Date(year, month, 1).getDay();
    const firstDi = firstJs === 0 ? 6 : firstJs - 1;

    const cells: { day: number | null; spend: number; t: number }[] = [];
    for (let i = 0; i < firstDi; i++) cells.push({ day: null, spend: 0, t: 0 });
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, spend: daily[d - 1], t: daily[d - 1] / max });
    }
    // Pad to complete last week
    while (cells.length % 7 !== 0) cells.push({ day: null, spend: 0, t: 0 });

    return { cells, maxSpend: max };
  }, [transactions, year, month]);

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div style={{ padding: '0 4px 8px' }}>
      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {DAY_LABELS.map((label, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 600,
            color: 'var(--muted)', padding: '4px 0',
          }}>
            {label}
          </div>
        ))}
      </div>

      {/* Calendar cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {cells.map((cell, i) => {
          if (!cell.day) {
            return <div key={i} style={{ aspectRatio: '1', borderRadius: 6 }} />;
          }
          const isToday = isCurrentMonth && cell.day === today.getDate();
          return (
            <div
              key={i}
              title={cell.spend > 0 ? `Día ${cell.day}: ${formatCOP(cell.spend)}` : `Día ${cell.day}`}
              style={{
                aspectRatio: '1',
                borderRadius: 6,
                background: interpolateColor(cell.t),
                border: isToday ? '2px solid var(--blue-700)' : '1px solid transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: isToday ? 700 : 400,
                color: cell.t > 0.55 ? 'white' : 'var(--ink)',
                cursor: cell.spend > 0 ? 'default' : 'default',
                transition: 'opacity 0.15s',
              }}
            >
              {cell.day}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Menos</span>
        {[0, 0.25, 0.55, 0.80, 1.0].map((t, i) => (
          <div key={i} style={{
            width: 14, height: 14, borderRadius: 3,
            background: t === 0 ? 'var(--surface)' : interpolateColor(t),
            border: '1px solid var(--line)',
          }} />
        ))}
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Más</span>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 6 }}>
          máx {formatCOP(maxSpend)}
        </span>
      </div>
    </div>
  );
}
