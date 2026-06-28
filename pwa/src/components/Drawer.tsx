import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getProfile, getUserNickname, getUserAvatar, getDisplayName } from '../lib/profiles';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { Icon, IconName } from './ui/icons';

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCuentas: () => void;
  onAsistente: () => void;
  onProgreso: () => void;
  onAjustes: () => void;
  onExportar: () => void;
  onUsuarios: () => void;
  onLogout: () => void;
}

/** Panel lateral del rediseño Corriente (se abre desde el avatar del topbar). */
export function Drawer({ open, userId, onClose, onCuentas, onAsistente, onProgreso, onAjustes, onExportar, onUsuarios, onLogout }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useOverlayA11y(open, onClose, panelRef);

  const profile = getProfile(userId);
  const customAvatar = getUserAvatar(userId);
  const displayName = getUserNickname(userId) || getDisplayName(userId) || profile?.name || userId;
  const avatarSrc = customAvatar || profile?.avatar;
  const initial = profile?.initial ?? userId.charAt(0).toUpperCase();

  const items: { icon: IconName; label: string; action: () => void }[] = [
    { icon: 'credit-card', label: 'Cuentas', action: onCuentas },
    { icon: 'message', label: 'Asistente', action: onAsistente },
    { icon: 'trophy', label: 'Progreso', action: onProgreso },
    { icon: 'settings', label: 'Ajustes', action: onAjustes },
    { icon: 'download', label: 'Exportar datos', action: onExportar },
    { icon: 'users', label: 'Administrar usuarios', action: onUsuarios },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 'var(--z-overlay)' }}
          />
          <motion.aside
            ref={panelRef}
            initial={{ x: '101%' }} animate={{ x: 0 }} exit={{ x: '101%' }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            aria-label="Menú"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '78%', maxWidth: 300,
              background: 'var(--surface)', borderLeft: '1px solid var(--line)',
              boxShadow: 'var(--shadow-float)', zIndex: 'var(--z-drawer, 9999)',
              display: 'flex', flexDirection: 'column',
              padding: 'max(50px, env(safe-area-inset-top)) 18px max(24px, env(safe-area-inset-bottom))',
              fontFamily: 'var(--font-body)',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 8px 20px', borderBottom: '1px solid var(--line)', marginBottom: 10,
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                background: avatarSrc ? 'var(--card)' : 'var(--grad-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17,
              }}>
                {avatarSrc
                  ? <img src={avatarSrc} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  : initial}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Sesión activa</div>
              </div>
            </div>

            {items.map(it => (
              <motion.button
                key={it.label}
                whileTap={{ scale: 0.97 }}
                onClick={() => { onClose(); it.action(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  padding: '13px 10px', borderRadius: 'var(--r-md)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--ink)', fontSize: 14, fontWeight: 500, width: '100%',
                  textAlign: 'left', fontFamily: 'var(--font-body)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ color: 'var(--muted)', display: 'inline-flex' }}>
                  <Icon name={it.icon} size={20} />
                </span>
                {it.label}
              </motion.button>
            ))}

            <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => { onClose(); onLogout(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 13,
                  padding: '13px 10px', borderRadius: 'var(--r-md)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--orange)', fontSize: 14, fontWeight: 500, width: '100%',
                  textAlign: 'left', fontFamily: 'var(--font-body)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ display: 'inline-flex' }}><Icon name="arrow-right" size={20} /></span>
                Cerrar sesión
              </motion.button>
              <div style={{ paddingTop: 8, fontSize: 10.5, color: 'var(--muted)', textAlign: 'center' }}>
                Corriente
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
