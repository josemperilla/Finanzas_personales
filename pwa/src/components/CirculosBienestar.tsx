import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quickEase } from '../lib/motion';
import { getGamification, getVisitasSemana } from '../lib/gamification';
import { getMeta } from '../lib/meta';
import type { Transaction } from '../lib/api';
import type { RetoProgress } from '../lib/retos';

interface Props {
  userId: string;
  monthTx: Transaction[];
  retosProgress: RetoProgress[];
}

interface Circulo {
  label: string;
  color: string;
  trackColor: string;
  pct: number;
  tooltip: string;
}

const SIZE = 84;
const STROKE = 8;
const GAP = 6;

function ringRadius(index: number) {
  return SIZE / 2 - STROKE / 2 - index * (STROKE + GAP);
}

function ringCircumference(index: number) {
  return 2 * Math.PI * ringRadius(index);
}

export function CirculosBienestar({ userId, monthTx, retosProgress }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [circulos, setCirculos] = useState<Circulo[]>([]);

  useEffect(() => {
    const meta = getMeta(userId);
    const hoy = new Date();
    const todayStr = hoy.toISOString().split('T')[0];
    const txHoy = monthTx.filter(t => t.Fecha === todayStr);
    const gastoHoy = txHoy.reduce((s, t) => s + t['Monto (COP)'], 0);

    // Círculo rojo: presupuesto diario
    let pctPresupuesto = 0;
    if (meta.activo && meta.monto > 0) {
      const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const presupuestoDiario = meta.monto / diasMes;
      // lleno = BUENO (dentro del presupuesto). Si gasto 0 = 100%. Si = presupuesto = 0%.
      pctPresupuesto = presupuestoDiario > 0
        ? Math.max(0, Math.min(1, 1 - gastoHoy / presupuestoDiario))
        : 0;
    }

    // Círculo verde: reto semanal completado
    const retoActivo = retosProgress.find(r => !r.failed);
    const pctReto = retoActivo?.completed ? 1 : (retoActivo?.pct ?? 0);

    // Círculo azul: visitas esta semana (lleno con 3+)
    const visitas = getVisitasSemana(userId);
    const pctVisitas = Math.min(1, visitas / 3);

    setCirculos([
      {
        label: 'Presupuesto',
        color: '#ef4444',
        trackColor: 'rgba(239,68,68,0.15)',
        pct: pctPresupuesto,
        tooltip: meta.activo
          ? `Gasto hoy: $${Math.round(gastoHoy / 1000)}K de tu meta diaria`
          : 'Define una meta mensual para activar este círculo',
      },
      {
        label: 'Reto',
        color: '#22c55e',
        trackColor: 'rgba(34,197,94,0.15)',
        pct: pctReto,
        tooltip: retoActivo
          ? `Reto: ${Math.round(retoActivo.pct * 100)}% completado`
          : 'Sin reto activo esta semana',
      },
      {
        label: 'Registro',
        color: '#3b82f6',
        trackColor: 'rgba(59,130,246,0.15)',
        pct: pctVisitas,
        tooltip: `${visitas} de 3 visitas esta semana`,
      },
    ]);
  }, [userId, monthTx, retosProgress]);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
        aria-label="Círculos de bienestar financiero"
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {circulos.map((c, i) => {
            const r = ringRadius(i);
            const circ = ringCircumference(i);
            const offset = circ * (1 - c.pct);
            return (
              <g key={c.label}>
                <circle
                  cx={SIZE / 2} cy={SIZE / 2} r={r}
                  fill="none"
                  stroke={c.trackColor}
                  strokeWidth={STROKE}
                />
                <circle
                  cx={SIZE / 2} cy={SIZE / 2} r={r}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                  style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)' }}
                />
              </g>
            );
          })}
        </svg>
        <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Hoy
        </span>
      </button>

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                zIndex: 100, display: 'flex', alignItems: 'flex-end',
              }}
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }} transition={quickEase}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%', background: 'var(--surface)',
                  borderRadius: '20px 20px 0 0', padding: '24px 20px',
                  paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
                }}
              >
                <div style={{ width: 36, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 20px' }} />
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>
                  Círculos de bienestar
                </h3>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                  Tres hábitos financieros que tu semana ideal cierra.
                </p>
                {circulos.map((c, i) => (
                  <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: c.color, flexShrink: 0,
                    }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>
                        {c.label} — {Math.round(c.pct * 100)}%
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.tooltip}</div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
