import { RetoProgress } from '../lib/retos';
import { getCategoryColor } from '../lib/config';

interface Props {
  progress: RetoProgress;
}

const fmt = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CO');

function TargetChips({ reto }: { reto: RetoProgress['reto'] }) {
  const cats  = reto.categorias?.length ? reto.categorias : (reto.categoria ? [reto.categoria] : []);
  const mercs = reto.comercios ?? [];
  const all   = [
    ...cats.map(c  => ({ label: c, type: 'cat'  as const })),
    ...mercs.map(m => ({ label: m, type: 'merc' as const })),
  ];

  if (all.length === 0) {
    return (
      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
        Todos los gastos
      </span>
    );
  }

  const visible  = all.slice(0, 3);
  const overflow = all.length - 3;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {visible.map(({ label, type }) => {
        const color = type === 'cat' ? getCategoryColor(label) : '#64748b';
        return (
          <span
            key={`${type}-${label}`}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 999,
              background: `${color}22`, color,
              fontWeight: 600,
            }}
          >
            {type === 'merc' && '🏪 '}{label}
          </span>
        );
      })}
      {overflow > 0 && (
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>y {overflow} más</span>
      )}
    </div>
  );
}

export function RetoWidget({ progress }: Props) {
  const { reto, current, pct, failed, diasRestantes } = progress;
  const CIRC = 175.93; // 2π×28
  const dash = Math.min(pct, 1) * CIRC;
  const color = failed ? '#ef4444' : pct >= 0.8 ? '#f59e0b' : '#16a34a';
  const pctDisplay = Math.round(pct * 100);

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
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 6, lineHeight: 1.3 }}>
            {reto.titulo}
          </div>
          <div style={{ marginBottom: 6 }}>
            <TargetChips reto={reto} />
          </div>
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
