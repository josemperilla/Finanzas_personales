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
}

export function DonutChart({ slices, total }: Props) {
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
      <div style={{ textAlign: 'center', padding: '28px 0', color: '#9E9EA6', fontFamily: '"DM Sans"', fontSize: '13px' }}>
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
              style={{ transformOrigin: `${CX}px ${CY}px` }}
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
                fill="#9E9EA6" fontSize="9.5"
                fontFamily='"DM Sans"' letterSpacing="0.06em">
                {topCat.category.toUpperCase()}
              </text>
              <text x={CX} y={CY + 12} textAnchor="middle"
                fill="#1D1C1D" fontSize="12"
                fontWeight="600" fontFamily='"JetBrains Mono"'>
                {formatCOP(topCat.amount)}
              </text>
            </motion.g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {nonZero.slice(0, 6).map(s => (
          <motion.div key={s.category} variants={riseItem} transition={quickEase} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: getCategoryColor(s.category),
                flexShrink: 0,
              }} />
              <span style={{ color: '#616061', fontSize: '13px', fontFamily: '"DM Sans"' }}>
                {s.category}
              </span>
            </div>
            <span style={{ color: '#1D1C1D', fontSize: '12px', fontFamily: '"JetBrains Mono"', fontWeight: 500 }}>
              {formatCOP(s.amount)}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
