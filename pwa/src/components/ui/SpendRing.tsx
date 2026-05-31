import { useId } from 'react';
import { formatCOP } from '../../lib/utils';

interface Props {
  size?: number;
  pct: number;
  spent: number;
}

export function SpendRing({ size = 168, pct, spent }: Props) {
  const id = useId();
  const r = size / 2 - 14;
  const circumference = 2 * Math.PI * r;
  const clampedPct = Math.min(100, Math.max(0, pct));

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', position: 'absolute' }}>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#eef2f7" strokeWidth="14" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={`url(#ring-${id})`} strokeWidth="14" fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clampedPct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ textAlign: 'center', position: 'relative' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {formatCOP(spent)}
        </div>
      </div>
    </div>
  );
}
