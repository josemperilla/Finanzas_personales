import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Transaction } from '../lib/api';
import { askChat } from '../lib/api';
import { Fino } from './ui/Fino';
import { buildContext } from '../lib/chatContext';

interface Message { role: 'user' | 'assistant'; text: string; }

const SUGGESTED = [
  '¿Cuál es mi categoría más costosa?',
  '¿Cuánto gasto en promedio?',
  '¿Qué días gasto más?',
  '¿Mis comercios más frecuentes?',
];

export function ChatInline({ transactions }: { transactions: Transaction[] }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const answer = await askChat(q, buildContext(transactions));
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error al conectar. Intenta de nuevo.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 'var(--r-2xl)',
      boxShadow: 'var(--shadow-card)', marginBottom: 14, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 16px 11px',
        borderBottom: messages.length > 0 ? '1px solid var(--line)' : 'none',
      }}>
        <Fino size={30} />
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
            Pregúntale a Fino
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Asistente financiero</div>
        </div>
      </div>

      {/* Suggested chips — only before first message */}
      {messages.length === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, padding: '11px 14px 4px' }}>
          {SUGGESTED.map(q => (
            <button
              key={q}
              onClick={() => send(q)}
              style={{
                padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                background: 'var(--surface)', border: '1.5px solid var(--line)',
                color: 'var(--ink-2)', fontSize: 12, fontWeight: 500,
                fontFamily: 'var(--font-body)', textAlign: 'left', lineHeight: 1.35,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          style={{ maxHeight: 300, overflowY: 'auto', padding: '12px 14px 6px' }}
        >
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex', gap: 8, marginBottom: 10,
                flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              }}
            >
              {m.role === 'assistant' && (
                <div style={{ flexShrink: 0, marginTop: 2 }}><Fino size={24} /></div>
              )}
              <div style={{
                maxWidth: '80%', padding: '9px 12px',
                borderRadius: m.role === 'user' ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                background: m.role === 'user' ? 'var(--blue-700)' : 'var(--surface)',
                color: m.role === 'user' ? '#fff' : 'var(--ink)',
                fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                boxShadow: m.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {busy && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <Fino size={24} />
              <div style={{
                padding: '10px 14px', borderRadius: '14px 14px 14px 3px',
                background: 'var(--surface)', display: 'flex', gap: 4, alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: 'var(--muted-2)',
                    animation: 'pulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.18}s`,
                  }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px 14px', alignItems: 'center' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
          placeholder="Pregunta sobre tus gastos..."
          aria-label="Pregunta para el asistente"
          style={{
            flex: 1, height: 40, padding: '0 12px',
            background: 'var(--surface)', border: '1.5px solid var(--line)',
            borderRadius: 10, color: 'var(--ink)', fontSize: 13.5,
            fontFamily: 'var(--font-body)', outline: 'none',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'var(--blue-600)';
            e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.1)';
          }}
          onBlur={e => {
            e.target.style.borderColor = 'var(--line)';
            e.target.style.boxShadow = 'none';
          }}
        />
        <motion.button
          onClick={() => send(input)}
          disabled={!input.trim() || busy}
          whileTap={{ scale: input.trim() && !busy ? 0.92 : 1 }}
          aria-label="Enviar"
          style={{
            width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: input.trim() && !busy ? 'var(--blue-700)' : 'var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background 0.15s ease',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={input.trim() && !busy ? '#fff' : 'var(--muted-2)'}
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </motion.button>
      </div>
    </div>
  );
}
