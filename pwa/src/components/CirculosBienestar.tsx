import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { getGamification, getVisitasSemana } from '../lib/gamification';
import { getMeta } from '../lib/meta';
import type { Transaction } from '../lib/api';
import { isGasto } from '../lib/api';
import type { RetoProgress } from '../lib/retos';
import { quickEase } from '../lib/motion';

interface Props {
  userId: string;
  monthTx: Transaction[];
  retosProgress: RetoProgress[];
}

interface Anillo {
  label: string;
  color: string;
  pct: number;
  tooltip: string;
}

export function CirculosBienestar({ userId, monthTx, retosProgress }: Props) {
  const [anillos, setAnillos] = useState<Anillo[]>([]);

  useEffect(() => {
    const meta = getMeta(userId);
    const hoy = new Date();
    const todayStr = hoy.toISOString().split('T')[0];
    const txHoy = monthTx.filter(t => t.Fecha === todayStr);
    const gastoHoy = txHoy.filter(isGasto).reduce((s, t) => s + Number(t['Monto (COP)'] || 0), 0);

    let pctAhorro = 0;
    if (meta.activo && meta.monto > 0) {
      const diasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
      const presupuestoDiario = meta.monto / diasMes;
      pctAhorro = presupuestoDiario > 0
        ? Math.max(0, Math.min(1, 1 - gastoHoy / presupuestoDiario))
        : 0;
    }

    const retoActivo = retosProgress.find(r => !r.failed);
    const pctConstancia = retoActivo?.completed ? 1 : (retoActivo?.pct ?? 0);

    const visitas = getVisitasSemana(userId);
    const pctControl = Math.min(1, visitas / 3);

    setAnillos([
      { label: 'Ahorro',     color: 'var(--blue)',   pct: pctAhorro,      tooltip: meta.activo ? `Gasto hoy: $${Math.round(gastoHoy/1000)}K de meta diaria` : 'Define una meta mensual' },
      { label: 'Constancia', color: 'var(--orange)',  pct: pctConstancia,  tooltip: retoActivo ? `Reto ${Math.round(pctConstancia*100)}% completado` : 'Sin reto activo' },
      { label: 'Control',    color: 'var(--blue-2)', pct: pctControl,     tooltip: `${visitas} de 3 visitas esta semana` },
    ]);
  }, [userId, monthTx, retosProgress]);

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      {anillos.map(({ label, color, pct, tooltip }) => {
        const fill = Math.round(pct * 100);
        const empty = 100 - fill;
        return (
          <div
            key={label}
            title={tooltip}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }}
          >
            <div style={{ position: 'relative', width: 74, height: 74 }}>
              <svg viewBox="0 0 36 36" style={{ width: 74, height: 74 }}>
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="var(--surface-2)" strokeWidth="3.4" />
                <motion.circle
                  cx="18" cy="18" r="15.9155"
                  fill="none"
                  stroke={color}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeDasharray={`${fill} ${empty}`}
                  transform="rotate(-90 18 18)"
                  initial={{ strokeDasharray: '0 100' }}
                  animate={{ strokeDasharray: `${fill} ${empty}` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              </svg>
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-mono)', fontWeight: 700,
                fontSize: 14, color: 'var(--ink)',
              }}>
                <motion.span
                  key={fill}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={quickEase}
                >
                  {fill}%
                </motion.span>
              </div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 500 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
