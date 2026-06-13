import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CirculosBienestar } from './CirculosBienestar';
import { getMeta } from '../lib/meta';
import { formatCOP } from '../lib/utils';
import type { Transaction } from '../lib/api';
import type { RetoProgress } from '../lib/retos';

interface Props {
  userId: string;
  monthTx: Transaction[];
  retosProgress: RetoProgress[];
}

export function DailyStatusCard({ userId, monthTx, retosProgress }: Props) {
  const meta = getMeta(userId);

  const { gastoHoy, presupuestoDiario, pctGasto } = useMemo(() => {
    const hoy = new Date().toISOString().split('T')[0];
    const txHoy = monthTx.filter(t => t.Fecha === hoy);
    const gastoHoy = txHoy.reduce((s, t) => s + t['Monto (COP)'], 0);
    const diasMes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const presupuestoDiario = meta.activo && meta.monto > 0 ? meta.monto / diasMes : 0;
    const pctGasto = presupuestoDiario > 0 ? Math.min(gastoHoy / presupuestoDiario, 1.5) : 0;
    return { gastoHoy, presupuestoDiario, pctGasto };
  }, [monthTx, meta]);

  const overBudget = presupuestoDiario > 0 && gastoHoy > presupuestoDiario;
  const barColor = overBudget ? '#ef4444' : pctGasto > 0.8 ? '#f59e0b' : 'var(--blue-600)';

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: 'var(--r-2xl)',
      padding: '16px',
      boxShadow: 'var(--shadow-card)',
      marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Left: daily budget status */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            Hoy
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 22, color: overBudget ? '#dc2626' : 'var(--ink)', lineHeight: 1, marginBottom: 6 }}>
            {formatCOP(gastoHoy)}
          </div>

          {meta.activo && presupuestoDiario > 0 ? (
            <>
              <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden', marginBottom: 5 }}>
                <motion.div
                  animate={{ width: `${Math.min(pctGasto / 1.5, 1) * 100}%` }}
                  initial={{ width: 0 }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', borderRadius: 999, background: barColor }}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {overBudget
                  ? `+${formatCOP(gastoHoy - presupuestoDiario)} sobre el límite diario`
                  : `${formatCOP(presupuestoDiario - gastoHoy)} disponibles hoy`}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Define una meta mensual para ver tu ritmo diario
            </div>
          )}
        </div>

        {/* Right: círculos de bienestar */}
        <CirculosBienestar
          userId={userId}
          monthTx={monthTx}
          retosProgress={retosProgress}
        />
      </div>
    </div>
  );
}
