import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { importTransactions } from '../lib/api';
import { type ManualTransaction } from '../lib/api';
import { quickEase } from '../lib/motion';

interface ParsedRow {
  fecha: string;
  comercio: string;
  monto: number;
  tipo: string;
  banco: string;
}

interface Props {
  userId: string;
  onClose: () => void;
}

const BANKS = [
  { id: 'bancolombia', label: 'Bancolombia' },
  { id: 'bogota',      label: 'Banco de Bogotá' },
  { id: 'itau',        label: 'Itaú' },
  { id: 'otro',        label: 'Otro CSV' },
];

const BANK_DISPLAY: Record<string, string> = {
  bancolombia: 'Bancolombia',
  bogota:      'Bogotá',
  itau:        'Itaú',
  otro:        'Otro',
};

// Descriptions that indicate a payment/fee — skip these rows
const SKIP_PATTERNS = [
  /pago\s+tarjeta/i, /pago\s+t\.?\s*credito/i, /cuota\s+de\s+manejo/i,
  /cuota\s+manejo/i, /seguro\s+de\s+vida/i, /seguro\s+deudor/i,
  /gmf|4\s*x\s*mil/i, /pago\s+pse/i, /pago\s+portal/i,
];

function shouldSkip(desc: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(desc));
}

function parseCOP(raw: string): number {
  const s = raw.replace(/\s/g, '').replace(/\$/g, '');
  if (!s) return 0;
  const negative = s.startsWith('-');
  const abs = s.replace(/^-/, '');
  let val: number;
  if (abs.includes(',') && abs.includes('.')) {
    val = parseFloat(abs.lastIndexOf(',') > abs.lastIndexOf('.')
      ? abs.replace(/\./g, '').replace(',', '.')
      : abs.replace(/,/g, ''));
  } else if (abs.includes(',')) {
    val = parseFloat(abs.replace(/\./g, '').replace(',', '.'));
  } else {
    val = parseFloat(abs.replace(/\./g, '')) || 0;
  }
  return negative ? -val : val;
}

function parseCSV(text: string, bankId: string): ParsedRow[] {
  const delimiter = text.split('\n')[0].split(';').length > text.split('\n')[0].split(',').length ? ';' : ',';
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(delimiter).map(h => h.replace(/['"]/g, '').trim().toLowerCase());

  const col = (names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex(h => h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const fechaCol   = col(['fecha', 'date']);
  const descCol    = col(['descripci', 'descripcion', 'description', 'concepto', 'comercio']);
  const valorCol   = col(['valor', 'value', 'débito', 'debito', 'monto', 'cargo']);

  if (fechaCol < 0 || descCol < 0 || valorCol < 0) return [];

  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(delimiter).map(c => c.replace(/^["']|["']$/g, '').trim());
    const fecha   = cells[fechaCol] ?? '';
    const desc    = cells[descCol]  ?? '';
    const rawVal  = cells[valorCol] ?? '';

    if (!fecha || !desc || !rawVal) continue;
    if (shouldSkip(desc)) continue;

    const monto = Math.abs(parseCOP(rawVal));
    if (monto <= 0) continue;

    // Positive in Bancolombia savings CSV = expense (debited); negative = income
    const rawNum = parseCOP(rawVal);
    if (rawNum > 0 && bankId === 'bancolombia') {
      // skip ingresos (positive = received)
      continue;
    }

    rows.push({
      fecha,
      comercio: desc,
      monto,
      tipo:  'Compra',
      banco: BANK_DISPLAY[bankId] ?? 'Otro',
    });
  }

  return rows;
}

function rowToManual(row: ParsedRow): ManualTransaction {
  return {
    banco:     row.banco,
    tipo:      row.tipo,
    monto:     row.monto,
    comercio:  row.comercio,
    fecha:     row.fecha,
    categoria: '',
  };
}

type Stage = 'select' | 'preview' | 'sending' | 'done';

export function ImportarExtracto({ userId: _userId, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [bank, setBank]     = useState('bancolombia');
  const [rows, setRows]     = useState<ParsedRow[]>([]);
  const [stage, setStage]   = useState<Stage>('select');
  const [parseErr, setParseErr] = useState('');
  const [progress, setProgress] = useState(0);
  const [result, setResult]  = useState({ ok: 0, errors: 0 });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text, bank);
      if (parsed.length === 0) {
        setParseErr('No se encontraron transacciones. Verifica que el archivo tenga columnas de Fecha, Descripción y Valor.');
        return;
      }
      setParseErr('');
      setRows(parsed);
      setStage('preview');
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleImport() {
    setStage('sending');
    setProgress(0);
    const manualRows = rows.map(rowToManual);
    const res = await importTransactions(manualRows, (done, total) => {
      setProgress(Math.round((done / total) * 100));
    }, 300);
    setResult(res);
    setStage('done');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: '4%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(56px, env(safe-area-inset-top)) 20px max(32px, env(safe-area-inset-bottom))',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 2px', color: 'var(--blue-700)', fontSize: 22, lineHeight: 1 }}>
          ‹
        </motion.button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--ink)', margin: 0 }}>
          Importar extracto
        </h1>
      </div>

      <AnimatePresence mode="wait">

        {/* Stage: select */}
        {stage === 'select' && (
          <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500, marginBottom: 10 }}>
                Banco
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BANKS.map(b => (
                  <motion.button key={b.id} whileTap={{ scale: 0.93 }} onClick={() => setBank(b.id)}
                    style={{ padding: '8px 16px', borderRadius: 999, fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', border: `1.5px solid ${bank === b.id ? 'var(--blue-600)' : 'var(--line)'}`, background: bank === b.id ? 'var(--blue-50)' : 'var(--card)', color: bank === b.id ? 'var(--blue-700)' : 'var(--muted)', fontWeight: bank === b.id ? 600 : 400, cursor: 'pointer', minHeight: 'var(--touch-min)' }}>
                    {b.label}
                  </motion.button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500, marginBottom: 10 }}>
                Archivo CSV
              </div>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => fileRef.current?.click()}
                style={{ width: '100%', minHeight: 100, borderRadius: 16, border: '2px dashed var(--line)', background: 'var(--card)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ fontSize: 28 }}>📂</span>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>Toca para seleccionar archivo</span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted-2)' }}>.csv</span>
              </motion.button>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
            </div>

            {parseErr && (
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: '#b91c1c', background: '#fef2f2', padding: '10px 14px', borderRadius: 10 }}>
                {parseErr}
              </p>
            )}

            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--muted)', lineHeight: 1.6 }}>
              Descarga el CSV desde la app de tu banco:<br />
              <strong>Bancolombia</strong>: Mi perfil → Descargar movimientos<br />
              <strong>Bogotá / Itaú</strong>: Extractos → Exportar CSV
            </p>
          </motion.div>
        )}

        {/* Stage: preview */}
        {stage === 'preview' && (
          <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
            style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>

            <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500 }}>
              {rows.length} transacciones encontradas
            </div>

            <div style={{ flex: 1, overflowY: 'auto', borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)' }}>
              {rows.slice(0, 25).map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < Math.min(rows.length, 25) - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.comercio}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{row.fecha}</div>
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--ink)', flexShrink: 0, marginLeft: 12 }}>
                    ${row.monto.toLocaleString('es-CO')}
                  </div>
                </div>
              ))}
              {rows.length > 25 && (
                <div style={{ padding: '10px 14px', fontSize: 'var(--text-xs)', color: 'var(--muted)', textAlign: 'center' }}>
                  y {rows.length - 25} más…
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleImport}
                style={{ flex: 1, height: 48, background: 'var(--blue-700)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Importar {rows.length} transacciones
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setStage('select'); setRows([]); }}
                style={{ padding: '0 18px', height: 48, background: 'none', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Atrás
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Stage: sending */}
        {stage === 'sending' && (
          <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quickEase}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, flex: 1 }}>
            <div style={{ fontSize: 40 }}>⏳</div>
            <div style={{ fontSize: 'var(--text-lg)', color: 'var(--ink)', fontWeight: 600 }}>
              Enviando transacciones…
            </div>
            <div style={{ width: '100%', maxWidth: 280, height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${progress}%` }}
                transition={{ ease: 'linear', duration: 0.3 }}
                style={{ height: '100%', background: 'var(--blue-600)', borderRadius: 999 }}
              />
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              {progress}%
            </div>
          </motion.div>
        )}

        {/* Stage: done */}
        {stage === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={quickEase}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 56 }}>{result.errors === 0 ? '✅' : '⚠️'}</div>
            <div style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)', fontWeight: 700 }}>
              {result.ok} transacciones importadas
            </div>
            {result.errors > 0 && (
              <div style={{ fontSize: 'var(--text-sm)', color: '#b45309' }}>
                {result.errors} errores — revisa el Sheet
              </div>
            )}
            <motion.button whileTap={{ scale: 0.97 }} onClick={onClose}
              style={{ marginTop: 12, height: 48, padding: '0 32px', background: 'var(--blue-700)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              Listo
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
