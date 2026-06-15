import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';
import { getUserTabOrder, ReorderableTab } from '../lib/profiles';

export type Tab = 'home' | 'progreso' | 'agregar' | 'misiones' | 'explorar' | 'historial' | 'chat' | 'cuentas';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  accessibleMode?: boolean;
  userId?: string | null;
  hasAnomaly?: boolean;
}

const TAB_META: Record<ReorderableTab, { label: string; icon: (active: boolean, size: number) => React.ReactNode }> = {
  home:     { label: 'Inicio',   icon: (a, s) => <HomeIcon    active={a} size={s} /> },
  progreso: { label: 'Progreso', icon: (a, s) => <TrophyIcon  active={a} size={s} /> },
  misiones: { label: 'Misiones', icon: (a, s) => <LightningIcon active={a} size={s} /> },
  explorar: { label: 'Explorar', icon: (a, s) => <CompassIcon  active={a} size={s} /> },
};

export function BottomNav({ active, onChange, accessibleMode = false, userId, hasAnomaly }: Props) {
  const iconSize = accessibleMode ? 28 : 22;
  const navMinHeight = accessibleMode ? '72px' : undefined;
  const btnPadding = accessibleMode ? '6px 16px' : '4px 10px';

  const order = (accessibleMode || !userId)
    ? (['home', 'progreso', 'misiones', 'explorar'] as ReorderableTab[])
    : getUserTabOrder(userId);

  const leftTabs  = order.slice(0, 2);
  const rightTabs = order.slice(2, 4);

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--nav-glass)',
      backdropFilter: 'blur(24px) saturate(1.35)', WebkitBackdropFilter: 'blur(24px) saturate(1.35)',
      borderTop: '1px solid var(--nav-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingTop: accessibleMode ? '12px' : '10px',
      paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      zIndex: 'var(--z-nav)',
      boxShadow: '0 -1px 0 rgba(255,255,255,0.5), var(--shadow-nav)',
      minHeight: navMinHeight,
    }} aria-label="Navegación principal">
      {leftTabs.map(tabId => {
        const meta = TAB_META[tabId];
        return (
          <NavTab key={tabId} label={meta.label} icon={meta.icon(active === tabId, iconSize)}
            active={active === tabId} onClick={() => onChange(tabId as Tab)}
            padding={btnPadding} alwaysShowLabel={accessibleMode}
            badge={tabId === 'explorar' && !!hasAnomaly}
            ariaLabel={tabId === 'explorar' ? (hasAnomaly ? 'Explorar — gasto inusual detectado' : 'Explorar') : undefined} />
        );
      })}
      <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} accessibleMode={accessibleMode} />
      {rightTabs.map(tabId => {
        const meta = TAB_META[tabId];
        return (
          <NavTab key={tabId} label={meta.label} icon={meta.icon(active === tabId, iconSize)}
            active={active === tabId} onClick={() => onChange(tabId as Tab)}
            padding={btnPadding} alwaysShowLabel={accessibleMode}
            badge={tabId === 'explorar' && !!hasAnomaly}
            ariaLabel={tabId === 'explorar' ? (hasAnomaly ? 'Explorar — gasto inusual detectado' : 'Explorar') : undefined} />
        );
      })}
    </nav>
  );
}

function NavTab({ label, icon, active, onClick, padding, alwaysShowLabel, badge, ariaLabel }: {
  label: string; icon: React.ReactNode; active: boolean; onClick: () => void;
  padding: string; alwaysShowLabel: boolean; badge?: boolean; ariaLabel?: string;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.92 }} aria-label={ariaLabel || label}
      aria-current={active ? 'page' : undefined} style={{
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
            position: 'absolute', top: 0, width: 42, height: 28,
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
        {badge && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 8, height: 8, borderRadius: '50%',
            background: '#f97316',
          }} />
        )}
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
      <motion.button onClick={onClick} whileTap={{ scale: 0.93 }} aria-label="Agregar transacción"
        aria-current={active ? 'page' : undefined} style={{
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
    <motion.button onClick={onClick} whileTap={{ scale: 0.9 }} aria-label="Agregar transacción"
      aria-current={active ? 'page' : undefined} style={{
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

function TrophyIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 21h8M12 17v4M7 4H4a1 1 0 0 0-1 1v3a4 4 0 0 0 4 4h1M17 4h3a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4h-1" />
      <path d="M7 4h10v8a5 5 0 0 1-10 0V4z" />
    </svg>
  );
}

function LightningIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? 'var(--blue-700)' : 'none'} stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CompassIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-700)' : 'var(--muted-2)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill={active ? 'var(--blue-700)' : 'none'} />
    </svg>
  );
}
