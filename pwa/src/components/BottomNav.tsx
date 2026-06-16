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
      background: 'linear-gradient(to top, var(--surface) 65%, transparent)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingTop: accessibleMode ? '16px' : '12px',
      paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      zIndex: 'var(--z-nav)',
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
      <motion.span
        animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : (alwaysShowLabel ? 0.65 : 0.45) }}
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
        color: active ? 'var(--blue-600)' : 'var(--muted)',
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
            background: 'var(--grad-orange)',
            boxShadow: 'var(--shadow-orange)',
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
          color: active ? 'var(--orange-500)' : 'var(--muted)',
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
        width: '58px', height: '58px', borderRadius: '20px',
        background: 'var(--grad-orange)',
        boxShadow: 'var(--shadow-orange)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: '-28px',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </motion.span>
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
        color: active ? 'var(--orange-500)' : 'var(--muted)',
        letterSpacing: '0.01em',
      }}>
        Agregar
      </span>
    </motion.button>
  );
}

function HomeIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-600)' : 'var(--muted)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function TrophyIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-600)' : 'var(--muted)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 20V10M12 20V5M19 20v-7" />
    </svg>
  );
}

function LightningIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-600)' : 'var(--muted)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CompassIcon({ active, size }: { active: boolean; size: number }) {
  const c = active ? 'var(--blue-600)' : 'var(--muted)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="11" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}
