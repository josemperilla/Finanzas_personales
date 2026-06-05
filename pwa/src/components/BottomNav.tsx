import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';

export type Tab = 'home' | 'historial' | 'agregar' | 'analisis' | 'chat';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--card)',
      borderTop: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingTop: '10px',
      paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      zIndex: 100,
      boxShadow: '0 -10px 30px rgba(15,23,42,0.06)',
    }}>
      <NavTab label="Inicio" icon={<HomeIcon active={active === 'home'} />} active={active === 'home'} onClick={() => onChange('home')} />
      <NavTab label="Historial" icon={<ListIcon active={active === 'historial'} />} active={active === 'historial'} onClick={() => onChange('historial')} />
      <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} />
      <NavTab label="Análisis" icon={<ChartIcon active={active === 'analisis'} />} active={active === 'analisis'} onClick={() => onChange('analisis')} />
      <NavTab label="Chat" icon={<ChatIcon active={active === 'chat'} />} active={active === 'chat'} onClick={() => onChange('chat')} />
    </nav>
  );
}

function NavTab({ label, icon, active, onClick }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.92 }} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
      padding: '4px 10px',
      minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)',
      justifyContent: 'center',
    }}>
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          transition={softSpring}
          style={{
            position: 'absolute', top: 0, width: 38, height: 26,
            borderRadius: 999, background: 'var(--blue-50)',
          }}
        />
      )}
      <motion.span
        animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : 0.45 }}
        transition={softSpring}
        style={{ display: 'flex', position: 'relative' }}
      >
        {icon}
      </motion.span>
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
        color: active ? 'var(--blue-700)' : 'var(--muted-2)',
        letterSpacing: '0.01em',
        transition: 'color 0.15s ease',
      }}>
        {label}
      </span>
    </motion.button>
  );
}

function AddTab({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.9 }} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px',
    }}>
      <motion.span
        animate={{ y: active ? -2 : 0, scale: active ? 1.04 : 1 }}
        transition={softSpring}
        style={{
        width: '50px', height: '50px', borderRadius: '16px',
        background: active ? 'var(--grad-accent)' : 'var(--blue-700)',
        boxShadow: active ? 'var(--shadow-blue)' : '0 4px 14px rgba(29,78,216,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s ease',
        marginTop: '-24px',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </motion.span>
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
        color: active ? 'var(--blue-700)' : 'var(--muted-2)',
        letterSpacing: '0.01em',
      }}>
        Agregar
      </span>
    </motion.button>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ListIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="12" width="4" height="10" rx="1" />
      <rect x="9" y="7" width="4" height="15" rx="1" />
      <rect x="16" y="3" width="4" height="19" rx="1" />
    </svg>
  );
}

function ChatIcon({ active }: { active: boolean }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
