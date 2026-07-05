import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { softSpring, navHideTransition } from '../lib/motion';
import { Icon, IconName } from './ui/icons';

export type Tab = 'home' | 'progreso' | 'agregar' | 'misiones' | 'explorar' | 'historial' | 'chat' | 'cuentas' | 'facturas';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  accessibleMode?: boolean;
  userId?: string | null;
  hasAnomaly?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

/** Las 4 pestañas fijas del rediseño Corriente (+ FAB central "Agregar"). */
const TABS: { id: Tab; label: string; icon: IconName; iconFilled: IconName }[] = [
  { id: 'home',      label: 'Inicio',      icon: 'home',           iconFilled: 'home-filled' },
  { id: 'historial', label: 'Movimientos', icon: 'list',           iconFilled: 'list-filled' },
  { id: 'explorar',  label: 'Insights',    icon: 'bar-chart',      iconFilled: 'bar-chart-filled' },
  { id: 'facturas',  label: 'Facturas',    icon: 'receipt',        iconFilled: 'receipt-filled' },
];

const SCROLL_THRESHOLD = 10;

export function BottomNav({ active, onChange, accessibleMode = false, hasAnomaly, scrollRef }: Props) {
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollTop = useRef(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (accessibleMode || !scrollRef?.current) return;

    const el = scrollRef.current;

    const handleScroll = () => {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        rafId.current = 0;
        const currentTop = el.scrollTop;
        // El ancla (lastScrollTop) solo se mueve cuando se cruza el threshold —
        // así un scroll lento y continuo (pocos px por frame) acumula delta en
        // vez de resetearse cada frame, que nunca dispararía el hide/show.
        if (currentTop <= 0) {
          setNavVisible(true);
          lastScrollTop.current = 0;
          return;
        }
        const delta = currentTop - lastScrollTop.current;
        if (delta > SCROLL_THRESHOLD) {
          setNavVisible(false);
          lastScrollTop.current = currentTop;
        } else if (delta < -SCROLL_THRESHOLD) {
          setNavVisible(true);
          lastScrollTop.current = currentTop;
        }
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [accessibleMode, scrollRef]);

  const iconSize = accessibleMode ? 28 : 26;

  const leftTabs = TABS.slice(0, 2);
  const rightTabs = TABS.slice(2, 4);

  // Modo accesible: siempre visible, con labels, sin hide/show por scroll
  if (accessibleMode) {
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
        padding: '12px 8px',
        zIndex: 'var(--z-nav)',
        minHeight: '72px',
      }} aria-label="Navegación principal">
        {leftTabs.map(t => (
          <NavTab key={t.id} label={t.label} icon={t.icon} iconFilled={t.iconFilled} size={iconSize}
            active={active === t.id} onClick={() => onChange(t.id)}
            alwaysShowLabel
            badge={t.id === 'explorar' && !!hasAnomaly}
            ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
        ))}
        <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} accessibleMode />
        {rightTabs.map(t => (
          <NavTab key={t.id} label={t.label} icon={t.icon} iconFilled={t.iconFilled} size={iconSize}
            active={active === t.id} onClick={() => onChange(t.id)}
            alwaysShowLabel
            badge={t.id === 'explorar' && !!hasAnomaly}
            ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
        ))}
      </nav>
    );
  }

  return (
    <AnimatePresence>
      {navVisible && (
        <motion.nav
          key="bottom-nav"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={navHideTransition}
          style={{
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
            padding: '8px 12px',
            zIndex: 'var(--z-nav)',
          }} aria-label="Navegación principal">
          {leftTabs.map(t => (
            <NavTab key={t.id} label={t.label} icon={t.icon} iconFilled={t.iconFilled} size={iconSize}
              active={active === t.id} onClick={() => onChange(t.id)}
              badge={t.id === 'explorar' && !!hasAnomaly}
              ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
          ))}
          <AddTab active={active === 'agregar'} onClick={() => onChange('agregar')} accessibleMode={false} />
          {rightTabs.map(t => (
            <NavTab key={t.id} label={t.label} icon={t.icon} iconFilled={t.iconFilled} size={iconSize}
              active={active === t.id} onClick={() => onChange(t.id)}
              badge={t.id === 'explorar' && !!hasAnomaly}
              ariaLabel={t.id === 'explorar' && hasAnomaly ? 'Insights — gasto inusual detectado' : undefined} />
          ))}
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

function NavTab({ label, icon, iconFilled, size, active, onClick, alwaysShowLabel, badge, ariaLabel }: {
  label: string; icon: IconName; iconFilled: IconName; size: number; active: boolean; onClick: () => void;
  alwaysShowLabel?: boolean; badge?: boolean; ariaLabel?: string;
}) {
  return (
    <motion.button onClick={onClick} whileTap={{ scale: 0.9 }} aria-label={ariaLabel || label}
      aria-current={active ? 'page' : undefined} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
      padding: '6px 12px',
      minHeight: 'var(--touch-min)', minWidth: 'var(--touch-min)',
      justifyContent: 'center',
    }}>
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {active ? (
          <Icon name={iconFilled} size={size} filled style={{ color: 'var(--ink)' }} />
        ) : (
          <Icon name={icon} size={size} style={{ color: 'var(--muted)', opacity: 0.7 }} />
        )}
        {badge && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--orange-500)',
          }} />
        )}
      </span>
      {alwaysShowLabel && (
        <span style={{
          fontSize: 'var(--text-xs)', fontFamily: 'var(--font-body)', fontWeight: 600,
          color: active ? 'var(--blue-600)' : 'var(--muted)',
          letterSpacing: '0.01em',
          transition: 'color 0.15s ease',
          marginTop: 2,
        }}>
          {label}
        </span>
      )}
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
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px',
    }}>
      <motion.span
        animate={{ y: active ? -2 : 0, scale: active ? 1.04 : 1, rotate: active ? 90 : 0 }}
        transition={softSpring}
        style={{
        width: '52px', height: '52px', borderRadius: '50%',
        background: 'var(--grad-brand)',
        boxShadow: 'var(--shadow-blue)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginTop: '-24px',
        color: '#fff',
      }}>
        <Icon name="plus" size={24} />
      </motion.span>
    </motion.button>
  );
}
