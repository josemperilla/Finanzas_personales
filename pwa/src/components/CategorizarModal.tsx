import { useState, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, updateCategory } from '../lib/api';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { CATEGORIES } from '../lib/config';
import { formatCOP } from '../lib/utils';
import { cleanMerchant } from '../lib/merchantCleaner';
import { getCategoryColor } from '../lib/config';
import { softSpring, quickEase } from '../lib/motion';
import { MerchantLogo } from './ui/MerchantLogo';
import { getMerchantDomain } from '../lib/merchantLogos';

interface Props {
  transactions: Transaction[];
  onCategoryChange?: (timestamp: string, categoria: string) => void;
  onClose: () => void;
}

export function CategorizarModal({ transactions, onCategoryChange, onClose }: Props) {
  const pending = useMemo(
    () => transactions.filter(tx => !tx.Categoría || tx.Categoría === 'Otro'),
    [transactions]
  );

  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  useOverlayA11y(true, onClose, sheetRef);

  const current = pending[index];
  const total = pending.length;
  const progress = total > 0 ? index / total : 1;

  async function handleSelect(cat: string) {
    if (!current || saving) return;
    setSaving(true);
    try {
      await updateCategory(current.Timestamp, cat);
      onCategoryChange?.(current.Timestamp, cat);
    } catch { /* ignore — optimistic update still moves forward */ }
    setSaving(false);
    if (index + 1 >= total) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
    }
  }

  function handleSkip() {
    if (index + 1 >= total) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
    }
  }

  const name = current ? (cleanMerchant(current.Comercio) || current.Tipo || '—') : '';
  const domain = current ? getMerchantDomain(name) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 400, display: 'flex', alignItems: 'flex-end',
      }}
    >
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Categorizar pendientes"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={softSpring}
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', width: '100%',
          borderRadius: 'var(--r-2xl) var(--r-2xl) 0 0',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
          maxHeight: '90dvh', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>
              Categorizar pendientes
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {done ? 'Todo listo' : `${index + 1} de ${total}`}
            </div>
          </div>
          <motion.button type="button" aria-label="Cerrar" whileTap={{ scale: 0.9 }} onClick={onClose} style={{
            background: 'var(--line)', border: 'none', borderRadius: '50%',
            width: 30, height: 30, cursor: 'pointer', color: 'var(--muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
          }}>✕</motion.button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--line)', margin: '0 20px 20px' }}>
          <motion.div
            animate={{ width: `${done ? 100 : progress * 100}%` }}
            transition={quickEase}
            style={{ height: '100%', background: 'var(--blue-700)', borderRadius: 999 }}
          />
        </div>

        {/* Done state */}
        {(done || total === 0) && (
          <div style={{ textAlign: 'center', padding: '32px 24px 16px' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--ink)', marginBottom: 6 }}>
              {total === 0 ? 'Sin pendientes' : '¡Listo!'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {total === 0
                ? 'Todas tus transacciones ya tienen categoría.'
                : `Categorizaste ${index} transacción${index !== 1 ? 'es' : ''}.`}
            </div>
            <motion.button
              type="button" whileTap={{ scale: 0.96 }} onClick={onClose}
              style={{
                marginTop: 24, padding: '12px 32px',
                background: 'var(--blue-700)', color: 'white',
                border: 'none', borderRadius: 'var(--r-xl)',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                cursor: 'pointer',
              }}
            >
              Cerrar
            </motion.button>
          </div>
        )}

        {/* Transaction card */}
        {!done && current && (
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={quickEase}
            >
              {/* Tx info */}
              <div style={{
                margin: '0 20px 16px',
                background: 'var(--card)', borderRadius: 'var(--r-xl)',
                padding: '16px', boxShadow: 'var(--shadow-card)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <MerchantLogo domain={domain} name={name} size={44} color="var(--blue-700)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {current.Fecha?.split('T')[0] || current.Timestamp?.split('T')[0] || ''}
                    {current.Banco ? ` · ${current.Banco}` : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: 'var(--ink)', flexShrink: 0 }}>
                  {formatCOP(Number(current['Monto (COP)'] || 0))}
                </div>
              </div>

              {/* Category grid */}
              <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {CATEGORIES.filter(c => c.name !== 'Otro').map(cat => (
                  <motion.button
                    key={cat.name}
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    disabled={saving}
                    onClick={() => handleSelect(cat.name)}
                    style={{
                      padding: '10px 4px', borderRadius: 'var(--r-lg)',
                      border: `1.5px solid ${cat.color}22`,
                      background: `${cat.color}12`,
                      cursor: saving ? 'wait' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                      opacity: saving ? 0.6 : 1,
                    }}
                  >
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-body)', lineHeight: 1.2 }}>
                      {cat.name}
                    </span>
                  </motion.button>
                ))}
              </div>

              {/* Skip */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, padding: '0 20px' }}>
                <motion.button
                  type="button" whileTap={{ scale: 0.95 }} onClick={handleSkip}
                  style={{
                    background: 'none', border: '1.5px solid var(--line)', borderRadius: 'var(--r-xl)',
                    padding: '9px 28px', cursor: 'pointer', color: 'var(--muted)', fontSize: 13,
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Saltar →
                </motion.button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}
