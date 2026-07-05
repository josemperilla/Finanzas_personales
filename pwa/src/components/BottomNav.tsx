import { motion } from 'framer-motion';
import { softSpring } from '../lib/motion';
import { Icon, IconName } from './ui/icons';

export type Tab = 'home' | 'progreso' | 'agregar' | 'misiones' | 'explorar' | 'historial' | 'chat' | 'cuentas' | 'facturas';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  accessibleMode?: boolean;
  userId?: string | null;
  hasAnomaly?: boolean;
}

/** Las 4 pestañas fijas del rediseño Corriente (+ FAB central "Agregar"). */
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'home',      label: 'Inicio',      icon: 'home' },
  { id: 'historial', label: 'Movimientos', icon: 'list' },
  { id: 'explorar',  label: 'Insights',    icon: 'bar-chart' },
  { id: 'facturas',  label: 'Facturas',    icon: 'receipt' },
];

export function BottomNav({ active, onChange, accessibleMode = false, hasAnomaly }: Props) {
  const iconSize = accessibleMode ? 28 : 22;
  const navMinHeight = accessibleMode ? '72px' : undefined;

  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2, 4);

  return (
    <nav style={{
      position: 'fixed',
      bottom: 'max(14px, env(safe-area-inset-bottom))',
      left: 14, right: 14,
      borderRadius: 'var(--r-2xl)',
      background: 'var(--nav-glass)',
      backdropFilter: 'blur(20px) saturate(140%)',
      WebkitBackdropFilter: 'blur(20px) saturate(140%)',
      border: '1px solid var(--nav-border)',
      boxShadow: 'var(--shadow-nav)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
      paddingTop: accessibleMode ? '14px' : '10px',
      paddingBottom: accessibleMode ? '14px' : '10px',
      paddingLeft: 8, paddingRight: 8,
      zIndex: 'var(--z-nav)',
      minHeight: navMinHeight,
    }} aria-label="Navegación principal">
      {leftTabs.map(t => (
        <NavTab key={t.id} label={t.label} icon={t.icon} size={iconSize}
          active={active === t.id} onClick={() => onChange(t.id)}
          alwaysShowLabel={accessibleMode}
          badge={t.id === 'explorar' && !!hasAnomaly}
          ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
      ))}
      <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} accessibleMode={accessibleMode} />
      {rightTabs.map(t => (
        <NavTab key={t.id} label={t.label} icon={t.icon} size={iconSize}
          active={active === t.id} onClick={() => onChange(t.id)}
          alwaysShowLabel={accessibleMode}
          badge={t.id === 'explorar' && !!hasAnomaly}
          ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
      ))}
    </nav>
  );
}

function NavTab({ label, icon, size, active, onClick, alwaysShowLabel, badge, ariaLabel }: {
  label: string; icon: IconName; size: number; active: boolean; onClick: () => void;
  alwaysShowLabel: boolean; badge?: boolean; ariaLabel?: string;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.92 }} aria-label={ariaLabel || label}
      aria-current={active ? 'page' : undefined} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
      padding: '4px 8px',
      minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)',
      justifyContent: 'center',
    }}>
      {/* Wrapper del icono: tamaño estable para que el blob no mueva el layout */}
      <span style={{ position: 'relative', display: 'inline-flex', padding: '6px 16px' }}>
        {/* Blob/píldora teal detrás del icono activo */}
        <motion.span
          animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
          transition={softSpring}
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 'var(--r-pill)',
            background: 'var(--blue-100)',
          }}
        />
        <motion.span
          animate={{ scale: active ? 1.08 : 1, opacity: active ? 1 : (alwaysShowLabel ? 0.65 : 0.45) }}
          transition={softSpring}
          style={{ display: 'flex', position: 'relative', color: active ? 'var(--blue-600)' : 'var(--muted)' }}
        >
          <Icon name={icon} size={size} />
          {badge && (
            <span style={{
              position: 'absolute', top: -2, right: -2,
              width: 8, height: 8, borderRadius: '50%',
              background: 'var(--orange-500)',
            }} />
          )}
        </motion.span>
      </span>
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
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--grad-brand)',
            boxShadow: 'var(--shadow-blue)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
          }}
        >
          <Icon name="plus" size={28} />
        </motion.span>
        <span style={{
          fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
          color: active ? 'var(--blue-600)' : 'var(--muted)',
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
        animate={{ y: active ? -2 : 0, scale: active ? 1.04 : 1, rotate: active ? 90 : 0 }}
        transition={softSpring}
        style={{
        width: '56px', height: '56px', borderRadius: '50%',
        background: 'var(--grad-brand)',
        boxShadow: 'var(--shadow-blue)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: '-28px',
        color: '#fff',
      }}>
        <Icon name="plus" size={26} />
      </motion.span>
      <span style={{
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
        color: active ? 'var(--blue-600)' : 'var(--muted)',
        letterSpacing: '0.01em',
      }}>
        Agregar
      </span>
    </motion.button>
  );
}
