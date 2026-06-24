import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';

export type CardFranchise = 'visa-platinum' | 'mastercard-black' | 'generic';

export interface Card3DProps {
  banco: string;
  franchise: CardFranchise;
  last4: string;
  alias?: string;
  cupo?: number;
  /** Cuota de manejo de referencia (editable). Ej: "$43.190" o "Exonerada 6 periodos". */
  cuota?: string;
  /** Monto atribuido este mes (para el optimizer del reverso). */
  attributed?: number;
  /** Progreso de exención 0–100. */
  exencionPct?: number;
  exencionLabel?: string;
  onCuotaChange?: (value: string) => void;
}

const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cardBg(franchise: CardFranchise): React.CSSProperties {
  if (franchise === 'visa-platinum') {
    return { background: 'linear-gradient(135deg,#F2F4F7 0%,#C9CFD8 38%,#E6E8EC 62%,#A9AFBA 100%)', color: '#1a1d22' };
  }
  if (franchise === 'mastercard-black') {
    return { background: 'radial-gradient(circle at 30% 20%,#26262b 0%,#0a0a0c 70%)', color: '#ffffff' };
  }
  return { background: 'linear-gradient(135deg,var(--blue),var(--blue-2))', color: '#fff' };
}

export function Card3D({ banco, franchise, last4, alias, cupo, cuota, attributed, exencionPct, exencionLabel, onCuotaChange }: Card3DProps) {
  const [flipped, setFlipped] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const isDark = franchise === 'mastercard-black';

  const onMove = useCallback((e: React.PointerEvent) => {
    if (reduced || flipped || !innerRef.current) return;
    const r = innerRef.current.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -10;
    const ry = ((e.clientX - r.left) / r.width - 0.5) * 14;
    innerRef.current.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }, [flipped]);

  const onLeave = useCallback(() => {
    if (reduced || !innerRef.current) return;
    if (!flipped) innerRef.current.style.transform = '';
  }, [flipped]);

  const toggleFlip = () => {
    setFlipped(f => {
      const next = !f;
      if (innerRef.current) innerRef.current.style.transform = next ? 'rotateY(180deg)' : '';
      return next;
    });
  };

  const flipBtn = (
    <button
      onClick={toggleFlip}
      aria-label={flipped ? 'Ver frente' : 'Ver reverso'}
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 2,
        width: 30, height: 30, borderRadius: '50%',
        background: flipped ? 'var(--papel, var(--surface))' : 'rgba(255,255,255,.2)',
        color: flipped ? 'var(--muted)' : '#fff',
        display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
      </svg>
    </button>
  );

  return (
    <div style={{ perspective: '1200px', marginBottom: 14 }}>
      <div
        ref={innerRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{
          position: 'relative', transformStyle: 'preserve-3d',
          transition: 'transform .6s cubic-bezier(.4,0,.2,1)', aspectRatio: '1.6',
        }}
      >
        {/* FRENTE */}
        <div style={{
          ...cardBg(franchise),
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-card, 0 10px 26px rgba(0,0,0,.18))',
          padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          {isDark && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '4px 4px', pointerEvents: 'none' }} />}
          {franchise === 'visa-platinum' && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg,transparent 30%,rgba(255,255,255,.55) 48%,transparent 60%)', pointerEvents: 'none' }} />}
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', opacity: .85 }}>{banco}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 500, marginTop: 4 }}>
              {franchise === 'visa-platinum' ? 'Visa Platinum' : franchise === 'mastercard-black' ? 'black' : alias || 'Tarjeta'}
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '.08em', opacity: .92 }}>●●●● {last4}</div>
            {franchise === 'visa-platinum'
              ? <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, fontWeight: 500 }}>VISA</div>
              : franchise === 'mastercard-black'
                ? <div style={{ display: 'flex' }}>
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#EB001B', marginRight: -10, opacity: .92 }} />
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#F79E1B', opacity: .92 }} />
                  </div>
                : null}
          </div>
          {flipBtn}
        </div>

        {/* REVERSO */}
        <div style={{
          position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
          transform: 'rotateY(180deg)', background: 'var(--card)', color: 'var(--ink)',
          border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow-card, 0 10px 26px rgba(0,0,0,.18))',
          padding: 18, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)' }}>
            {banco} · {last4}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', margin: '8px 0 12px' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Cuota/mes</span>
            <input
              type="text"
              value={cuota ?? ''}
              placeholder="$0"
              onChange={(e) => onCuotaChange?.(e.target.value)}
              style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', width: '100%' }}
            />
          </div>
          {attributed !== undefined && (
            <Row label="Atribuido este mes" value={attributed.toLocaleString('es-CO')} />
          )}
          {exencionPct !== undefined && (
            <Row label={exencionLabel ?? 'Progreso exención'} value={`${exencionPct}%`} accent />
          )}
          {cupo !== undefined && (
            <Row label="Uso de cupo" value={cupo > 0 ? `${Math.round((attributed ?? 0) / cupo * 100)}%` : '—'} />
          )}
          {flipBtn}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: accent ? 'var(--blue)' : 'var(--ink)' }}>{value}</span>
    </div>
  );
}
