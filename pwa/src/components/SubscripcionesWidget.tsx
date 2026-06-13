import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { detectSubscriptions } from '../lib/subscriptions';
import { useCountUp } from '../lib/useCountUp';
import { formatCOP } from '../lib/utils';
import { getCategoryColor } from '../lib/config';
import { riseItem, staggerContainer, quickEase } from '../lib/motion';

interface Props {
  transactions: Transaction[];
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${d} ${months[Number(m) - 1]}`;
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - now.getTime()) / 86_400_000);
}

export function SubscripcionesWidget({ transactions }: Props) {
  const [expanded, setExpanded] = useState(false);

  const subscriptions = useMemo(() => detectSubscriptions(transactions), [transactions]);
  const totalMensual = useMemo(
    () => subscriptions.reduce((s, sub) => s + sub.montoMensual, 0),
    [subscriptions]
  );
  const animatedTotal = useCountUp(totalMensual);

  if (subscriptions.length === 0) return null;

  return (
    <motion.div variants={riseItem} transition={quickEase}>
      <div style={{
        background: 'var(--card)',
        borderRadius: 'var(--r-2xl)',
        padding: '14px 16px',
        boxShadow: 'var(--shadow-card)',
        marginBottom: 14,
      }}>
        {/* Header */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            gap: 10, background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 18 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
              Suscripciones
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {subscriptions.length} detectada{subscriptions.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', marginRight: 6 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
              {formatCOP(animatedTotal)}/mes
            </div>
          </div>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={quickEase}
            style={{ color: 'var(--muted)', fontSize: 14, flexShrink: 0 }}
          >
            ▾
          </motion.div>
        </motion.button>

        {/* Expandable list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                {subscriptions.map(sub => {
                  const dias = daysUntil(sub.proximaEsperada);
                  const vencePronto = dias >= 0 && dias <= 5;
                  const color = getCategoryColor(sub.categoria);
                  return (
                    <motion.div
                      key={sub.comercio}
                      variants={riseItem}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sub.comercio}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {vencePronto ? (
                            <span style={{
                              fontSize: 10.5, fontWeight: 600,
                              background: 'var(--warning-bg, #fff3cd)',
                              color: 'var(--warning, #b45309)',
                              padding: '2px 7px', borderRadius: 20,
                            }}>
                              vence en {dias === 0 ? 'hoy' : `${dias}d`}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                              próx. {formatDate(sub.proximaEsperada)}
                            </span>
                          )}
                          <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                            · {sub.periodoDias === 30 ? 'mensual' : 'bimestral'} · {sub.ocurrencias} veces
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                          {formatCOP(sub.montoMensual)}/mes
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
