import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { redeemInvite } from '../lib/api';
import { quickEase } from '../lib/motion';

interface Props {
  initialCode?: string;
  onRedeemed: (userId: string, displayName: string, code: string) => void;
  onCancel: () => void;
}

// Formatea a "AB12-CD34": mayúsculas, solo alfanuméricos, guion tras 4 chars, máx 8.
function formatCode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

export function InviteRedeem({ initialCode = '', onRedeemed, onCancel }: Props) {
  const [code, setCode] = useState(() => formatCode(initialCode));
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const digits = code.replace(/[^A-Z0-9]/g, '');
  const canSubmit = digits.length === 8 && status !== 'loading';

  async function handleSubmit() {
    if (digits.length !== 8) {
      setStatus('error');
      setErrorMsg('Ingresa el código completo (8 caracteres).');
      return;
    }
    setStatus('loading');
    setErrorMsg('');
    try {
      const { userId, displayName } = await redeemInvite(digits);
      onRedeemed(userId, displayName, digits);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Código inválido o expirado');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: '6%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--surface)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 28,
        padding: 'max(48px, env(safe-area-inset-top)) 24px max(32px, env(safe-area-inset-bottom))',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 48 }}>✉️</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>
          Tengo una invitación
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--muted)', textAlign: 'center', maxWidth: 280 }}>
          Ingresa el código que te compartió el administrador para crear tu perfil.
        </div>
      </div>

      <motion.div
        animate={status === 'error'
          ? { x: [-12, 12, -8, 8, -4, 4, 0], transition: { duration: 0.44, ease: 'easeOut' } }
          : { x: 0 }}
        style={{ width: '100%', maxWidth: 300 }}
      >
        <input
          autoFocus
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={e => { setCode(formatCode(e.target.value)); if (status === 'error') { setStatus('idle'); setErrorMsg(''); } }}
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
          placeholder="AB12-CD34"
          style={{
            width: '100%', boxSizing: 'border-box', height: 56, padding: '0 16px',
            border: `1.5px solid ${status === 'error' ? '#ef4444' : 'var(--line)'}`, borderRadius: 14,
            background: 'var(--card)', color: 'var(--ink)',
            fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 600,
            letterSpacing: '0.18em', textAlign: 'center', outline: 'none',
          }}
        />
      </motion.div>

      <AnimatePresence mode="wait">
        {status === 'error' && errorMsg && (
          <motion.span key="err" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quickEase}
            style={{ fontSize: 'var(--text-xs)', color: '#ef4444', fontFamily: 'var(--font-body)', textAlign: 'center', maxWidth: 260 }}>
            {errorMsg}
          </motion.span>
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
        <motion.button
          whileTap={{ scale: canSubmit ? 0.97 : 1 }}
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            height: 50, borderRadius: 14, border: 'none',
            background: canSubmit ? 'var(--blue-700)' : 'var(--blue-300)',
            color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'default', fontFamily: 'var(--font-body)',
          }}
        >
          {status === 'loading' ? 'Verificando…' : 'Continuar'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel}
          style={{
            height: 50, background: 'none', border: '1px solid var(--line)', borderRadius: 14,
            color: 'var(--muted)', fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}>
          Volver
        </motion.button>
      </div>
    </motion.div>
  );
}
