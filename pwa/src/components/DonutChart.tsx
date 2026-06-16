import { memo } from 'react';
import { motion } from 'framer-motion';
import { getCategoryColor } from '../lib/config';
import { formatCOP } from '../lib/utils';
import { quickEase, riseItem, staggerContainer } from '../lib/motion';

interface Slice {
  category: string;
  amount: number;
}

interface Props {
  slices: Slice[];
  total: number;
  onSliceClick?: (category: string) => void;
}

export const DonutChart = memo(function DonutChart({ slices, total, onSliceClick }: Props) {
  const SIZE = 180;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 76;
  const R_INNER = 52;
  const GAP = 0.025;

  const nonZero = slices.filter(s => s.amount > 0);
  const topCat = nonZero[0];

  if (nonZero.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--muted)', fontFamily: 'var(--font-body)', fontSize: '13px' }}>
        Sin datos este mes
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const paths = nonZero.map(slice => {
    const frac = slice.amount / total;
    const sweep = frac * (2 * Math.PI) - GAP;
    const startAngle = angle + GAP / 2;
    const endAngle = startAngle + sweep;

    const x1o = CX + R_OUTER * Math.cos(startAngle);
    const y1o = CY + R_OUTER * Math.sin(startAngle);
    const x2o = CX + R_OUTER * Math.cos(endAngle);
    const y2o = CY + R_OUTER * Math.sin(endAngle);
    const x1i = CX + R_INNER * Math.cos(endAngle);
    const y1i = CY + R_INNER * Math.sin(endAngle);
    const x2i = CX + R_INNER * Math.cos(startAngle);
    const y2i = CY + R_INNER * Math.sin(startAngle);
    const large = sweep > Math.PI ? 1 : 0;

    const d = `M ${x1o} ${y1o} A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${R_INNER} ${R_INNER} 0 ${large} 0 ${x2i} ${y2i} Z`;
    angle += frac * 2 * Math.PI;

    return { d, color: getCategoryColor(slice.category), category: slice.category, amount: slice.amount };
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: 'visible' }}>
          {/* Track ring */}
          <circle cx={CX} cy={CY} r={R_OUTER} fill="rgba(0,0,0,0.04)" />
          <circle cx={CX} cy={CY} r={R_INNER} fill="#FFFFFF" />

          {paths.map((p, i) => (
            <motion.path
              key={i}
              d={p.d}
              fill={p.color}
              opacity="0.9"
              initial={{ opacity: 0, scale: 0.94, rotate: -3 }}
              animate={{ opacity: 0.9, scale: 1, rotate: 0 }}
              transition={{ ...quickEase, delay: i * 0.045 }}
              style={{ transformOrigin: `${CX}px ${CY}px`, cursor: onSliceClick ? 'pointer' : 'default' }}
              whileTap={onSliceClick ? { scale: 0.96 } : undefined}
              onClick={() => onSliceClick?.(p.category)}
            />
          ))}

          {topCat && (
            <motion.g
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...quickEase, delay: 0.18 }}
              style={{ transformOrigin: `${CX}px ${CY}px` }}
            >
              <text x={CX} y={CY - 5} textAnchor="middle"
                fill="var(--muted)" fontSize="9.5"
                fontFamily='var(--font-body)' letterSpacing="0.06em">
                {topCat.category.toUpperCase()}
              </text>
              <text x={CX} y={CY + 13} textAnchor="middle"
                fill="var(--ink)" fontSize="13"
                fontWeight="600" fontFamily='var(--font-mono)'>
                {formatCOP(topCat.amount)}
              </text>
            </motion.g>
          )}
        </svg>
      </div>

      {/* Legend — 2-column grid */}
      <motion.div
        variants={staggerContainer} initial="initial" animate="animate"
        style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 18px' }}
      >
        {nonZero.slice(0, 6).map(s => (
          <motion.div
            key={s.category}
            variants={riseItem}
            transition={quickEase}
            whileTap={onSliceClick ? { scale: 0.97 } : undefined}
            onClick={() => onSliceClick?.(s.category)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: onSliceClick ? 'pointer' : 'default',
            }}
          >
            <span style={{
              width: 9, height: 9, borderRadius: 3, flexShrink: 0,
              background: getCategoryColor(s.category),
            }} />
            <span style={{ color: 'var(--ink-2)', fontSize: 12.5, fontFamily: 'var(--font-body)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.category}
            </span>
            <span style={{ color: 'var(--ink)', fontSize: 11.5, fontFamily: 'var(--font-mono)', fontWeight: 600, flexShrink: 0 }}>
              {formatCOP(s.amount)}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
});
