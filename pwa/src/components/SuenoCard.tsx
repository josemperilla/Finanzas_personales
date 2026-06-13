import { motion } from 'framer-motion';
import { softSpring, quickEase } from '../lib/motion';
import type { Sueno, RetoSugerido } from '../lib/suenos';
import { calcularSueno } from '../lib/suenos';
import { formatCOP } from '../lib/utils';
import { useCountUp } from '../lib/useCountUp';

interface Props {
  sueno: Sueno;
  retosParaSueno: RetoSugerido[];
  onDelete?: () => void;
  onAceptarReto?: (reto: RetoSugerido) => void;
  compact?: boolean; // para la mini-vista en Home
}

function progressColor(pct: number): string {
  if (pct >= 1) return '#f59e0b';      // dorado — logrado
  if (pct >= 0.8) return '#22c55e';    // verde — casi
  if (pct >= 0.5) return '#3b82f6';    // azul — bien
  return 'var(--muted)';               // gris — inicio
}

export function SuenoCard({ sueno, retosParaSueno, onDelete, onAceptarReto, compact = false }: Props) {
  const calc = calcularSueno(sueno);
  const animatedPct = useCountUp(Math.round(calc.pctCompletado * 100));
  const animatedAhorrado = useCountUp(sueno.ahorrado);

  const color = progressColor(calc.pctCompletado);
  const barHeight = compact ? 6 : 10;

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 16,
      padding: compact ? '14px 16px' : '18px 18px',
      border: '1px solid var(--line)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: compact ? 24 : 28 }}>{sueno.emoji}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? 14 : 16, color: 'var(--ink)', lineHeight: 1.2 }}>
            {sueno.nombre}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {calc.mesesRestantes >= 1
              ? `${Math.ceil(calc.mesesRestantes)} ${Math.ceil(calc.mesesRestantes) === 1 ? 'mes' : 'meses'} restantes`
              : `${calc.diasRestantes} días restantes`}
          </div>
        </div>
        {!compact && (
          <motion.span
            key={animatedPct}
            initial={{ scale: 1.2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={softSpring}
            style={{ fontSize: 20, fontWeight: 800, color }}
          >
            {animatedPct}%
          </motion.span>
        )}
        {onDelete && !compact && (
          <button
            onClick={onDelete}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--muted)', padding: '4px 2px' }}
            aria-label="Eliminar Sueño"
          >
            ×
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      <div style={{ marginBottom: compact ? 8 : 12 }}>
        <div style={{
          height: barHeight, background: 'var(--line)',
          borderRadius: barHeight, overflow: 'hidden',
        }}>
          <motion.div
            animate={{ width: `${calc.pctCompletado * 100}%` }}
            initial={{ width: 0 }}
            transition={{ ...softSpring, duration: 0.8 }}
            style={{ height: '100%', background: color, borderRadius: barHeight }}
          />
        </div>
        {!compact && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {formatCOP(animatedAhorrado)} ahorrado
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              Meta: {formatCOP(sueno.monto)}
            </span>
          </div>
        )}
      </div>

      {/* Línea de ahorro necesario */}
      {!compact && calc.ahorroMensualNecesario > 0 && (
        <div style={{
          fontSize: 13, color: 'var(--ink)', marginBottom: retosParaSueno.length > 0 ? 14 : 0,
          padding: '8px 10px', background: 'var(--bg)', borderRadius: 10,
        }}>
          Necesitas ahorrar <strong>{formatCOP(Math.round(calc.ahorroMensualNecesario))}/mes</strong>
          {calc.mesesRestantes >= 1 && ` durante ${Math.ceil(calc.mesesRestantes)} meses`}
        </div>
      )}

      {/* Retos sugeridos */}
      {!compact && retosParaSueno.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Retos sugeridos
          </div>
          {retosParaSueno.slice(0, 3).map((reto, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ ...quickEase, delay: i * 0.06 }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', marginBottom: 6,
                background: 'var(--bg)', borderRadius: 10, gap: 10,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{reto.titulo}</div>
                <div style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>{reto.descripcion}</div>
              </div>
              {onAceptarReto && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onAceptarReto(reto)}
                  style={{
                    background: 'var(--blue-600, #2563eb)', color: '#fff',
                    border: 'none', borderRadius: 8, padding: '5px 10px',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  Aceptar
                </motion.button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Vista compacta: monto y % */}
      {compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {formatCOP(sueno.ahorrado)} / {formatCOP(sueno.monto)}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color }}>
            {Math.round(calc.pctCompletado * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
