import { motion } from 'framer-motion';
import { FixedPaymentStatus } from '../lib/api';
import { getProvider, SERVICIO_META } from '../lib/providers';
import { formatCOP, todayInTZ } from '../lib/utils';
import { getUserTimezone } from '../lib/profiles';
import { buildVencimientoNotifs, BANNER_HORIZON_DAYS, NotifTipo } from '../lib/notifications';
import { softSpring, staggerContainer, riseItem } from '../lib/motion';

interface Props {
  userId: string;
  payments: FixedPaymentStatus[];
  onGoFacturas?: () => void;
}

// Banda superior del Home: destaca facturas vencidas o que vencen hoy/mañana.
// Solo se renderiza si hay urgentes; si no, devuelve null (no ensucia el Home).
// Recibe `payments` por prop — el Home hace el fetch único y comparte el dato
// con PagosProximosCard y el efecto de notificaciones (evita 3 llamadas de red).
// Reusa la misma clasificación vencido/hoy/próximo que las notificaciones push
// (buildVencimientoNotifs), con un horizonte de 1 día (BANNER_HORIZON_DAYS) en vez
// de los 3 días del push — así "próximo" aquí siempre significa "mañana".

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function fechaCorta(ymd: string): string {
  const m = ymd.slice(5, 7);
  const d = ymd.slice(8, 10);
  if (!m || !d) return ymd;
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

export function VencimientosUrgentes({ userId, payments, onGoFacturas }: Props) {
  const fechaRef = todayInTZ(getUserTimezone(userId));
  const notifs = buildVencimientoNotifs(payments, { fechaRef, diasAnticipacion: BANNER_HORIZON_DAYS });

  type Urg = { p: FixedPaymentStatus; tipo: NotifTipo };
  const byId = new Map(payments.map(p => [p.id, p]));
  const urgentes: Urg[] = notifs
    .map(n => ({ p: byId.get(n.paymentId), tipo: n.tipo }))
    .filter((u): u is Urg => !!u.p);

  if (urgentes.length === 0) return null;

  const tieneVencidos = urgentes.some(u => u.tipo === 'vencido');
  const titulos = {
    vencido: 'Vencido',
    hoy: 'Vence hoy',
    proximo: 'Vence mañana',
  } as const;
  // Tokens del design system (no hex literals). Mismos colores que Home.tsx usa
  // para las badges de variación porcentual (--danger / --warning / --good).
  const colores = {
    vencido: { bg: 'var(--danger-bg)', borde: 'var(--danger)', texto: 'var(--danger)' },
    hoy: { bg: 'var(--warning-bg)', borde: 'var(--warning)', texto: 'var(--warning)' },
    proximo: { bg: 'var(--good-soft)', borde: 'var(--good)', texto: 'var(--good)' },
  } as const;

  const total = urgentes.reduce((s, u) => s + (u.p.ultimoMonto ?? u.p.monto ?? 0), 0);

  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      style={{
        background: tieneVencidos ? 'var(--danger-bg)' : 'var(--card)',
        border: `1.5px solid ${tieneVencidos ? 'var(--danger)' : 'var(--line)'}`,
        borderRadius: 20,
        padding: '14px 16px',
        marginBottom: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{tieneVencidos ? '⚠️' : '📅'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {tieneVencidos ? 'Pagos vencidos' : 'Vencen pronto'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
            {urgentes.length} {urgentes.length === 1 ? 'pago' : 'pagos'} · {formatCOP(total)}
          </div>
        </div>
        {onGoFacturas && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onGoFacturas}
            aria-label="Ver facturas"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: 'var(--blue-700)',
              padding: '4px 0', fontFamily: 'var(--font-body)',
            }}
          >
            Ver
          </motion.button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {urgentes.map(({ p, tipo }, i) => {
          const prov = p.providerId ? getProvider(p.providerId) : undefined;
          const emoji = prov ? SERVICIO_META[prov.servicio].emoji : '🧾';
          const col = colores[tipo];
          const monto = p.ultimoMonto ?? p.monto ?? 0;
          return (
            <motion.div
              key={`${p.id}-${i}`}
              variants={riseItem}
              transition={softSpring}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: col.bg, border: `1px solid ${col.borde}`,
                borderRadius: 14, padding: '10px 12px',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.nombre}
                </div>
                <div style={{ fontSize: 11, color: col.texto, fontWeight: 600, marginTop: 1 }}>
                  {titulos[tipo]}{tipo === 'vencido' && p.ultimaFechaVencimiento ? ` · ${fechaCorta(p.ultimaFechaVencimiento)}` : ''}
                </div>
              </div>
              {monto > 0 && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--ink)', flexShrink: 0 }}>
                  {formatCOP(monto)}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
