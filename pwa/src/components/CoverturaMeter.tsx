import { useMemo } from 'react';
import { Transaction, isSmsTx } from '../lib/api';

interface Props {
  transactions: Transaction[];
  onChannelTutorial?: (channelId: string) => void;
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

export function CoverturaMeter({ transactions, onChannelTutorial }: Props) {
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

    // El canal SMS usa el predicado compartido para coincidir exactamente con la
    // prueba en vivo del asistente (isSmsTx en lib/api.ts).
    const smsTxns       = recientes.filter(isSmsTx).length;
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
          ? 'Toca ? para abrir el asistente de configuración del SMS'
          : undefined,
      },
      {
        id: 'notification',
        label: 'Notificaciones push',
        icon: '🔔',
        count: notifTxns,
        active: notifTxns > 0,
        instruccion: notifTxns === 0
          ? 'Toca ? para ver cómo activar las notificaciones'
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
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500 }}>
          Canales activos
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
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
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500 }}>
                  {canal.label}
                </div>
                {canal.instruccion && (
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 1 }}>
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

              {/* Setup instructions button */}
              {onChannelTutorial && (
                <button
                  type="button"
                  onClick={() => onChannelTutorial(canal.id)}
                  style={{
                    flexShrink: 0, width: 22, height: 22,
                    borderRadius: '50%', border: '1.5px solid var(--line)',
                    background: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: 'var(--muted)', fontWeight: 700,
                    lineHeight: 1, padding: 0,
                  }}
                  aria-label={`Instrucciones para ${canal.label}`}
                >
                  ?
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
        Muestra los últimos 30 días. Un canal "Inactivo" no significa que esté roto —
        puede que no hayas tenido transacciones por ese canal en el periodo.
      </p>
    </div>
  );
}
