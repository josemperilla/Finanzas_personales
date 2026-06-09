import { useMemo } from 'react';
import { Transaction } from '../lib/api';
import { getCategoryComparison } from '../lib/analytics';
import { formatCOP } from '../lib/utils';
import { getCategoryColor } from '../lib/config';

interface Props {
  transactions: Transaction[];
}

function DeltaBadge({ delta }: { delta: number }) {
  const isUp = delta > 0;
  const bg = isUp ? '#fee2e2' : '#dcfce7';
  const color = isUp ? '#b91c1c' : '#15803d';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: 999,
      background: bg, color, fontSize: 11, fontWeight: 700,
    }}>
      {isUp ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%
    </span>
  );
}

export function CategoryComparison({ transactions }: Props) {
  const rows = useMemo(() => getCategoryComparison(transactions), [transactions]);

  if (rows.length === 0) {
    return (
      <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--muted)' }}>
        Sin datos suficientes para comparar meses.
      </div>
    );
  }

  const now = new Date();
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = (d: Date) => d.toLocaleDateString('es-CO', { month: 'short' });

  return (
    <div style={{ padding: '16px 18px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
        Comparativa mes a mes
      </div>

      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px', gap: 4, padding: '6px 0', borderBottom: '1.5px solid var(--line)', marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Categoría</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>{monthLabel(prevDate)}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>{monthLabel(now)}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>Δ</div>
      </div>

      {rows.map(row => (
        <div key={row.category} style={{
          display: 'grid', gridTemplateColumns: '1fr 80px 80px 64px', gap: 4,
          padding: '8px 0', borderBottom: '1px solid var(--line)',
          alignItems: 'center',
          background: row.anomaly ? '#fff7ed' : 'transparent',
          marginLeft: row.anomaly ? -6 : 0,
          marginRight: row.anomaly ? -6 : 0,
          paddingLeft: row.anomaly ? 6 : 0,
          paddingRight: row.anomaly ? 6 : 0,
          borderRadius: row.anomaly ? 8 : 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: getCategoryColor(row.category),
            }} />
            <span style={{ fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.anomaly ? '⚠️ ' : ''}{row.category}
            </span>
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: row.prev > 0 ? 'var(--muted)' : 'var(--line)', textAlign: 'right' }}>
            {row.prev > 0 ? formatCOP(row.prev) : '—'}
          </div>
          <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>
            {row.current > 0 ? formatCOP(row.current) : '—'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            {row.prev > 0 && row.current > 0 ? (
              <DeltaBadge delta={row.delta} />
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
            )}
          </div>
        </div>
      ))}
      {rows.some(r => r.anomaly) && (
        <div style={{ fontSize: 11, color: '#7c2d12', marginTop: 8 }}>
          ⚠️ = más del doble vs. mes anterior
        </div>
      )}
    </div>
  );
}
