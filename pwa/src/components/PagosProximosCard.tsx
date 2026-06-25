import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { fetchFixedCalendar, FixedPaymentStatus } from '../lib/api';
import { getCategoryColor } from '../lib/config';
import { formatCOP } from '../lib/utils';

interface Props {
  userId: string;
  onGoPagosFijos?: () => void;
}

const DAY_LABELS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

const CALENDAR_PATH =
  'M8 2v3M16 2v3M3.5 9.5h17M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z';

function getNext7Days() {
  const result = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    result.push({
      date: d,
      label: DAY_LABELS[d.getDay()],
      dayNum: d.getDate(),
      key: d.toISOString().split('T')[0],
    });
  }
  return result;
}

function nextOccurrence(diaDelMes: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), diaDelMes);
  if (thisMonth >= today) return thisMonth;
  return new Date(today.getFullYear(), today.getMonth() + 1, diaDelMes);
}

function dayLabel(key: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().split('T')[0];
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowKey = tomorrow.toISOString().split('T')[0];
  if (key === todayKey) return 'Hoy';
  if (key === tomorrowKey) return 'Mañana';
  const [, m, d] = key.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

export function PagosProximosCard({ userId, onGoPagosFijos }: Props) {
  const [payments, setPayments] = useState<FixedPaymentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFixedCalendar()
      .then(data => { if (!cancelled) setPayments(data.payments); })
      .catch(() => { if (!cancelled) setPayments([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const days = getNext7Days();
  const todayKey = days[0].key;
  const windowEnd = days[days.length - 1].date;

  // Map dateKey → payments due that day
  const byDay = new Map<string, FixedPaymentStatus[]>();
  for (const p of payments) {
    const occ = nextOccurrence(p.diaDelMes);
    if (occ <= windowEnd) {
      const key = occ.toISOString().split('T')[0];
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(p);
    }
  }

  const upcoming = days
    .filter(d => byDay.has(d.key))
    .flatMap(d => (byDay.get(d.key) ?? []).map(p => ({ ...p, dateKey: d.key })));

  if (loading) return null;
  if (upcoming.length === 0) return null;

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--line)',
      borderRadius: 24,
      padding: '18px 20px',
      boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 8px 22px rgba(16,18,28,.06)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 16 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 15, flexShrink: 0,
          background: 'linear-gradient(150deg, var(--blue-2, #3b82f6), var(--blue, #2563eb))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 16px rgba(37,99,235,.28)',
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={CALENDAR_PATH} />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Próximos 7 días</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)', lineHeight: 1.1 }}>
            Pagos fijos
          </div>
        </div>
        {onGoPagosFijos && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onGoPagosFijos}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--blue-700)',
              padding: '4px 0', fontFamily: 'var(--font-body)',
            }}
          >
            Ver todos
          </motion.button>
        )}
      </div>

      {/* 7-day grid */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {days.map(({ key, label, dayNum }) => {
          const dayPayments = byDay.get(key) ?? [];
          const hasPayment = dayPayments.length > 0;
          const isToday = key === todayKey;
          const dotColor = hasPayment
            ? (dayPayments.length === 1
              ? getCategoryColor(dayPayments[0].categoria)
              : 'var(--blue)')
            : undefined;

          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.04 }}
                style={{
                  width: 30, height: 30, borderRadius: 10, position: 'relative',
                  background: hasPayment ? dotColor : 'var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: isToday && hasPayment
                    ? '0 0 0 3px var(--blue-50, rgba(219,234,254,0.9))'
                    : 'none',
                  border: isToday && !hasPayment ? '1.5px solid var(--line)' : 'none',
                }}
              >
                {hasPayment && (
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {dayPayments.length > 1 ? dayPayments.length : '·'}
                  </span>
                )}
              </motion.div>
              <span style={{
                fontSize: 10,
                color: hasPayment ? 'var(--ink)' : 'var(--muted)',
                fontWeight: hasPayment ? 700 : 400,
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 9,
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono)',
              }}>
                {dayNum}
              </span>
            </div>
          );
        })}
      </div>

      {/* Upcoming list */}
      <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {upcoming.map((p, i) => {
          const color = getCategoryColor(p.categoria);
          return (
            <motion.div
              key={`${p.id}-${i}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: i * 0.05 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: color, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.nombre}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {dayLabel(p.dateKey)} · {p.categoria}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', flexShrink: 0 }}>
                {formatCOP(p.monto)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
