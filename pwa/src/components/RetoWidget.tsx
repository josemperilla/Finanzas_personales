import { RetoProgress } from '../lib/retos';
import { getCategoryColor } from '../lib/config';

interface Props {
  progress: RetoProgress;
}

const fmt = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CO');

export function RetoWidget({ progress }: Props) {
  const { reto, current, pct, failed, diasRestantes } = progress;
  const CIRC = 175.93; // 2π×28
  const dash = Math.min(pct, 1) * CIRC;
  const color = failed ? '#ef4444' : pct >= 0.8 ? '#f59e0b' : '#16a34a';
  const pctDisplay = Math.round(pct * 100);
  const catColor = reto.categoria ? getCategoryColor(reto.categoria) : '#6366f1';

  return (
    <div style={{ background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 18, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        {/* Donut */}
        <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
          <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="36" cy="36" r="28" stroke="var(--line)" strokeWidth="7" fill="none" />
            <circle
              cx="36" cy="36" r="28"
              stroke={color} strokeWidth="7" fill="none"
              strokeDasharray={`${dash.toFixed(1)} ${CIRC}`}
              strokeLinecap="round"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {pctDisplay}%
            </span>
            <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 500 }}>
              {failed ? 'superado' : 'usado'}
            </span>
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 5, lineHeight: 1.3 }}>
            {reto.titulo}
          </div>
          {reto.categoria && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 999,
              background: catColor + '22', color: catColor,
              fontSize: 11, fontWeight: 600, marginBottom: 6,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
              {reto.categoria}
            </span>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {failed
              ? <span style={{ color: '#ef4444', fontWeight: 600 }}>Superado en {fmt(current - reto.objetivo)}</span>
              : pct >= 0.8
                ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>Casi al límite · {diasRestantes}d restantes</span>
                : <span style={{ color: '#16a34a', fontWeight: 600 }}>Vas bien · {diasRestantes}d restantes</span>
            }
          </div>
        </div>
      </div>

      {/* Progress bar + amounts */}
      {reto.tipo !== 'no_spend' && (
        <div>
          <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(pct * 100, 100)}%`, background: color, borderRadius: 999, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(current)} gastados
            </span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              límite {fmt(reto.objetivo)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
