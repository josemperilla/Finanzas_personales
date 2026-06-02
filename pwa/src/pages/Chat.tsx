import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { askChat } from '../lib/api';
import { formatCOP } from '../lib/utils';
import { cleanMerchant } from '../lib/merchantCleaner';
import { Fino } from '../components/ui/Fino';
import { quickEase, riseItem, staggerContainer } from '../lib/motion';

interface Props {
  transactions: Transaction[];
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTED = [
  '¿Cuál es mi categoría con más gasto?',
  '¿Cuánto gasto en promedio por transacción?',
  '¿Qué días de la semana gasto más?',
  '¿Cuáles son los comercios donde más transacciono?',
];

function buildContext(txs: Transaction[]) {
  if (txs.length === 0) return { message: 'No hay transacciones disponibles.' };

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const base = txs.filter(tx => {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d >= cutoff;
  });
  const used = base.length > 0 ? base : txs;

  const total = used.reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);

  // Resumen por categoría
  const byCat: Record<string, { total: number; count: number }> = {};
  for (const tx of used) {
    const cat = tx.Categoría || 'Otro';
    if (!byCat[cat]) byCat[cat] = { total: 0, count: 0 };
    byCat[cat].total += Number(tx['Monto (COP)'] || 0);
    byCat[cat].count += 1;
  }

  // Comercios por categoría (para responder preguntas cruzadas)
  const byMerchantPerCat: Record<string, Record<string, { monto: number; count: number }>> = {};
  for (const tx of used) {
    const cat = tx.Categoría || 'Otro';
    const name = cleanMerchant(tx.Comercio) || tx.Tipo || 'Sin nombre';
    if (!byMerchantPerCat[cat]) byMerchantPerCat[cat] = {};
    if (!byMerchantPerCat[cat][name]) byMerchantPerCat[cat][name] = { monto: 0, count: 0 };
    byMerchantPerCat[cat][name].monto += Number(tx['Monto (COP)'] || 0);
    byMerchantPerCat[cat][name].count += 1;
  }
  const comerciosPorCategoria: Record<string, { comercio: string; monto: number; compras: number }[]> = {};
  for (const cat of Object.keys(byMerchantPerCat)) {
    comerciosPorCategoria[cat] = Object.entries(byMerchantPerCat[cat])
      .sort(([, a], [, b]) => b.monto - a.monto)
      .map(([comercio, { monto, count }]) => ({ comercio, monto: Math.round(monto), compras: count }));
  }

  // Lista completa de transacciones para análisis ad-hoc
  const transacciones = used.map(tx => ({
    fecha: (tx.Fecha || tx.Timestamp || '').slice(0, 10),
    categoria: tx.Categoría || 'Otro',
    comercio: cleanMerchant(tx.Comercio) || tx.Tipo || 'Sin nombre',
    monto: Math.round(Number(tx['Monto (COP)'] || 0)),
  }));

  const dows = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const byDow: Record<string, number> = {};
  for (const tx of used) {
    const d = new Date((tx.Fecha || tx.Timestamp || '').replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      const dow = dows[d.getDay()];
      byDow[dow] = (byDow[dow] || 0) + Number(tx['Monto (COP)'] || 0);
    }
  }

  return {
    periodo: '6 meses recientes',
    totalTransacciones: used.length,
    totalGastado: Math.round(total),
    ticketPromedio: used.length > 0 ? Math.round(total / used.length) : 0,
    resumenCategorias: Object.entries(byCat)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([cat, { total: t, count: c }]) => ({ categoria: cat, total: Math.round(t), compras: c })),
    comerciosPorCategoria,
    gastoPorDiaSemana: Object.entries(byDow).sort(([, a], [, b]) => b - a)
      .map(([dia, monto]) => ({ dia, monto: Math.round(monto) })),
    transacciones,
  };
}

export function Chat({ transactions }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const context = buildContext(transactions);
      const answer = await askChat(question, context);
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Lo siento, hubo un error al consultar el asistente. Intenta de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  }

  const totalMonth = (() => {
    const now = new Date();
    return transactions
      .filter(tx => {
        const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 48px - max(18px, env(safe-area-inset-bottom)))', fontFamily: 'var(--font-body)', background: 'var(--surface)' }}>
      {/* Header */}
      <div style={{
        background: '#fff', borderBottom: '1px solid var(--line)',
        padding: 'max(20px, env(safe-area-inset-top)) 20px 14px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Fino size={40} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Asistente</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {transactions.length > 0
                ? `${transactions.length} transacciones · gasto del mes ${formatCOP(totalMonth)}`
                : 'Cargando datos...'}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {messages.length === 0 && (
          <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ textAlign: 'center', padding: '30px 0 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
                <Fino size={64} />
              </motion.div>
            </div>
            <motion.p variants={riseItem} transition={quickEase} style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 600, margin: '0 0 6px' }}>¡Hola! Soy tu asistente financiero</motion.p>
            <motion.p variants={riseItem} transition={quickEase} style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 24px', lineHeight: 1.5, maxWidth: 280, marginLeft: 'auto', marginRight: 'auto' }}>
              Puedo ayudarte a entender tus gastos. Prueba alguna de estas preguntas:
            </motion.p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUGGESTED.map(q => (
                <motion.button key={q} variants={riseItem} transition={quickEase} whileTap={{ scale: 0.98 }} onClick={() => send(q)} style={{
                  padding: '10px 16px', borderRadius: 12, cursor: 'pointer',
                  background: '#fff', border: '1.5px solid var(--line)',
                  color: 'var(--ink-2)', fontSize: 13, fontWeight: 500,
                  fontFamily: 'var(--font-body)', textAlign: 'left',
                  transition: 'border-color 0.15s ease',
                }}>
                  {q}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: m.role === 'user' ? 18 : -18, y: 4 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={quickEase}
            style={{
            display: 'flex', gap: 10, marginBottom: 14,
            flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
            animation: 'fadeIn 0.2s ease',
          }}>
            {m.role === 'assistant' && (
              <div style={{ flexShrink: 0, marginTop: 2 }}><Fino size={28} /></div>
            )}
            <div style={{
              maxWidth: '78%', padding: '11px 14px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: m.role === 'user' ? 'var(--blue-700)' : '#fff',
              color: m.role === 'user' ? '#fff' : 'var(--ink)',
              fontSize: 14, lineHeight: 1.55,
              boxShadow: m.role === 'assistant' ? 'var(--shadow-card)' : 'none',
              whiteSpace: 'pre-wrap',
            }}>
              {m.text}
            </div>
          </motion.div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ flexShrink: 0 }}><Fino size={28} /></motion.div>
            <div style={{
              padding: '12px 16px', borderRadius: '16px 16px 16px 4px',
              background: '#fff', boxShadow: 'var(--shadow-card)',
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: 'var(--muted-2)',
                  animation: 'pulse 1.2s ease-in-out infinite',
                  animationDelay: `${i * 0.18}s`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        background: '#fff', borderTop: '1px solid var(--line)',
        padding: '10px 16px max(16px, env(safe-area-inset-bottom))',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Pregunta sobre tus gastos..."
            style={{
              flex: 1, height: 44, padding: '0 14px',
              background: 'var(--surface)', border: '1.5px solid var(--line)',
              borderRadius: 12, color: 'var(--ink)', fontSize: 14,
              fontFamily: 'var(--font-body)', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--blue-600)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--line)'; e.target.style.boxShadow = 'none'; }}
          />
          <motion.button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            whileTap={{ scale: input.trim() && !loading ? 0.92 : 1 }}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: input.trim() && !loading ? 'var(--blue-700)' : 'var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s ease',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke={input.trim() && !loading ? '#fff' : 'var(--muted-2)'}
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
