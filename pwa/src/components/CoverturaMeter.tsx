import { useMemo } from 'react';
import { Transaction } from '../lib/api';

interface Props {
  transactions: Transaction[];
}

interface Canal {
  id: string;
  label: string;
  icon: string;
  count: number;
  active: boolean;
  instruccion?: string;
}

const DIAS = 30;

export function CoverturaMeter({ transactions }: Props) {
  const canales = useMemo<Canal[]>(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DIAS);

    const recientes = transactions.filter(tx => {
      const d = tx.Fecha ? new Date(tx.Fecha) : null;
      return d && !isNaN(d.getTime()) && d >= cutoff;
    });

    const count = (fuente: string | string[]) => {
      const fuenteArr = Array.isArray(fuente) ? fuente : [fuente];
      return recientes.filter(tx => {
        const f = (tx.Fuente || 'sms').toLowerCase();
        return fuenteArr.some(v => f === v || f.startsWith(v));
      }).length;
    };

    const smsTxns       = count('sms');
    const notifTxns     = count('notification');
    const emailTxns     = count('email');
    const importTxns    = count(['manual', 'pdf']);

    return [
      {
        id: 'sms',
        label: 'SMS automático',
        icon: '📱',
        count: smsTxns,
        active: smsTxns > 0,
        instruccion: smsTxns === 0
          ? 'Configura el Shortcut de SMS en ios_shortcut/SETUP.md'
          : undefined,
      },
      {
        id: 'notification',
        label: 'Notificaciones push',
        icon: '🔔',
        count: notifTxns,
        active: notifTxns > 0,
        instruccion: notifTxns === 0
          ? 'Agrega los Shortcuts de notificación en ios_shortcut/SETUP.md'
          : undefined,
      },
      {
        id: 'email',
        label: 'Correo Gmail',
        icon: '📧',
        count: emailTxns,
        active: emailTxns > 0,
        instruccion: emailTxns === 0
          ? 'Ejecuta setupGmailTrigger() en el editor de Apps Script'
          : undefined,
      },
      {
        id: 'import',
        label: 'Extractos importados',
        icon: '📄',
        count: importTxns,
        active: importTxns > 0,
        instruccion: undefined,
      },
    ];
  }, [transactions]);

  const totalActivos = canales.filter(c => c.active).length;
  const totalTxns    = canales.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ paddingTop: 12, paddingBottom: 4 }}>
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
          Canales activos
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {totalActivos}/{canales.length} · {totalTxns} txns (30d)
        </span>
      </div>

      {/* Channel rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {canales.map((canal, idx) => (
          <div key={canal.id}>
            {idx > 0 && (
              <div style={{ height: 1, background: 'var(--line)', marginLeft: 28 }} />
            )}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 0',
            }}>
              {/* Icon */}
              <span style={{ fontSize: 16, flexShrink: 0 }}>{canal.icon}</span>

              {/* Label + instruccion */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>
                  {canal.label}
                </div>
                {canal.instruccion && (
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
                    {canal.instruccion}
                  </div>
                )}
              </div>

              {/* Status badge */}
              {canal.active ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#16a34a',
                  }} />
                  <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                    {canal.count} txns
                  </span>
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: 'var(--muted)', opacity: 0.4,
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Inactivo
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
        Muestra los últimos 30 días. Un canal "Inactivo" no significa que esté roto —
        puede que no hayas tenido transacciones por ese canal en el periodo.
      </p>
    </div>
  );
}
