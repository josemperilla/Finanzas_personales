import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';
import { getUserTabOrder, ReorderableTab } from '../lib/profiles';

export type Tab = 'home' | 'historial' | 'agregar' | 'analisis' | 'chat';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  accessibleMode?: boolean;
  userId?: string | null;
}

const TAB_META: Record<ReorderableTab, { label: string; icon: (active: boolean, size: number) => React.ReactNode }> = {
  home:     { label: 'Inicio',    icon: (a, s) => <HomeIcon  active={a} size={s} /> },
  historial:{ label: 'Historial', icon: (a, s) => <ListIcon  active={a} size={s} /> },
  analisis: { label: 'Análisis',  icon: (a, s) => <ChartIcon active={a} size={s} /> },
  chat:     { label: 'Chat',      icon: (a, s) => <ChatIcon  active={a} size={s} /> },
};

export function BottomNav({ active, onChange, accessibleMode = false, userId }: Props) {
  const iconSize = accessibleMode ? 28 : 22;
  const navMinHeight = accessibleMode ? '72px' : undefined;
  const btnPadding = accessibleMode ? '6px 16px' : '4px 10px';

  // In accessible mode show fixed Home + Historial; otherwise respect user order
  const order = (accessibleMode || !userId)
    ? (['home', 'historial', 'analisis', 'chat'] as ReorderableTab[])
    : getUserTabOrder(userId);

  const leftTabs  = order.slice(0, 2);
  const rightTabs = order.slice(2, 4);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--card)',
      borderTop: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingTop: accessibleMode ? '12px' : '10px',
      paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      zIndex: 100,
      boxShadow: '0 -10px 30px rgba(15,23,42,0.06)',
      minHeight: navMinHeight,
    }}>
      {leftTabs.map(tabId => {
        if (accessibleMode && (tabId === 'analisis' || tabId === 'chat')) return null;
        const meta = TAB_META[tabId];
        return (
          <NavTab key={tabId} label={meta.label} icon={meta.icon(active === tabId, iconSize)}
            active={active === tabId} onClick={() => onChange(tabId as Tab)}
            padding={btnPadding} alwaysShowLabel={accessibleMode} />
        );
      })}
      <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} accessibleMode={accessibleMode} />
      {rightTabs.map(tabId => {
        if (accessibleMode && (tabId === 'analisis' || tabId === 'chat')) return null;
        const meta = TAB_META[tabId];
        return (
          <NavTab key={tabId} label={meta.label} icon={meta.icon(active === tabId, iconSize)}
            active={active === tabId} onClick={() => onChange(tabId as Tab)}
            padding={btnPadding} alwaysShowLabel={accessibleMode} />
        );
      })}
    </nav>
  );
}

function NavTab({ label, icon, active, onClick, padding, alwaysShowLabel }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
  padding: string; alwaysShowLabel: boolean;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.92 }} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
      padding,
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
        animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : (alwaysShowLabel ? 0.6 : 0.45) }}
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

function AddTab({ active, onClick, accessibleMode }: { active: boolean; onClick: () => void; accessibleMode: boolean }) {
  if (accessibleMode) {
    return (
      <motion.button onClick={onClick} whileTap={{ scale: 0.93 }} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        background: 'none', border: 'none', cursor: 'pointer', padding: '6px 16px',
        minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)', justifyContent: 'center',
      }}>
        <motion.span
          animate={{ scale: active ? 1.06 : 1 }}
          transition={softSpring}
          style={{
            width: 52, height: 52, borderRadius: 16,
            background: active ? 'var(--grad-accent)' : 'var(--blue-700)',
            boxShadow: active ? 'var(--shadow-blue)' : '0 4px 14px rgba(29,78,216,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
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

function HomeIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ListIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function ChartIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="12" width="4" height="10" rx="1" />
      <rect x="9" y="7" width="4" height="15" rx="1" />
      <rect x="16" y="3" width="4" height="19" rx="1" />
    </svg>
  );
}

function ChatIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
