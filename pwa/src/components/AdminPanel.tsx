import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  adminListUsers, adminDisableUser, adminEnableUser, adminDeleteUser,
  adminRevokeInvite, adminCreateInvite,
  type AdminUser, type AdminInvite, type AdminListData,
} from '../lib/api';
import { quickEase, softSpring } from '../lib/motion';

interface Props {
  onClose: () => void;
}

type Confirm = { type: 'disable' | 'enable' | 'delete' | 'deleteData'; userId: string; name: string } | null;

const STATUS_LABEL: Record<string, string> = { active: 'Activo', disabled: 'Inactivo', deleted: 'Eliminado' };
const STATUS_COLOR: Record<string, string> = { active: '#16a34a', disabled: '#b45309', deleted: '#9ca3af' };

export function AdminPanel({ onClose }: Props) {
  const [data, setData]       = useState<AdminListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [acting, setActing]   = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminListUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    setActing(true);
    try {
      await fn();
      setConfirm(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la operación');
    } finally {
      setActing(false);
    }
  }, [reload]);

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={softSpring}
      style={{
        position: 'fixed', inset: 0, background: 'var(--surface)',
        zIndex: 400, overflowY: 'auto', fontFamily: 'var(--font-body)',
        paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'max(20px, env(safe-area-inset-top)) 20px 14px',
        borderBottom: '1px solid var(--line)',
        position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
      }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} style={iconBtn}>‹</motion.button>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: 0 }}>
          Administración
        </h1>
        <motion.button whileTap={{ scale: 0.92 }} onClick={reload} disabled={loading}
          style={{ marginLeft: 'auto', ...smallBtn }}>
          {loading ? '…' : '↺ Actualizar'}
        </motion.button>
      </div>

      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && (
          <div style={{ padding: '12px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, color: '#991b1b', fontSize: 13.5 }}>
            {error}
          </div>
        )}

        {/* ── Users ── */}
        <Section title={`Usuarios${data ? ` (${data.users.length})` : ''}`}>
          {loading && !data && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Cargando…</div>
          )}
          {data?.users.map(u => (
            <UserRow key={u.id} user={u} onDisable={() => setConfirm({ type: 'disable', userId: u.id, name: u.name })}
              onEnable={() => act(() => adminEnableUser(u.id))}
              onDelete={() => setConfirm({ type: 'delete', userId: u.id, name: u.name })} />
          ))}
        </Section>

        {/* ── Invite new user ── */}
        <Section title="Invitaciones">
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowInvite(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
            <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>Generar nuevo enlace de invitación</div>
            <span style={{ color: 'var(--muted)', fontSize: 18 }}>{showInvite ? '↑' : '›'}</span>
          </motion.button>
          <AnimatePresence>
            {showInvite && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={quickEase} style={{ overflow: 'hidden' }}>
                <InviteForm onDone={reload} onCollapse={() => setShowInvite(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pending invites */}
          {data?.pendingInvites && data.pendingInvites.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                Pendientes / revocadas
              </div>
              {data.pendingInvites.map((inv, i) => (
                <InviteRow key={i} invite={inv}
                  onRevoke={() => act(() => adminRevokeInvite(inv.token))} acting={acting} />
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirm && (
          <ConfirmDialog
            confirm={confirm}
            acting={acting}
            onCancel={() => setConfirm(null)}
            onConfirmDisable={() => act(() => adminDisableUser(confirm.userId))}
            onConfirmDelete={(withData) => act(() => adminDeleteUser(confirm.userId, withData))}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function UserRow({ user, onDisable, onEnable, onDelete }: {
  user: AdminUser;
  onDisable: () => void;
  onEnable: () => void;
  onDelete: () => void;
}) {
  const isJose = user.id === 'jose';
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{user.name}</span>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>@{user.id}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: STATUS_COLOR[user.status] || '#9ca3af' }}>
            {STATUS_LABEL[user.status] || user.status}
          </span>
          {isJose && <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>admin</span>}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <span>{user.txCount} transacciones</span>
          {user.lastActivity && <span>Última actividad: {user.lastActivity}</span>}
          {user.createdAt && <span>Creado: {user.createdAt.substring(0, 10)}</span>}
        </div>
      </div>
      {!isJose && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {user.status === 'active'
            ? <motion.button whileTap={{ scale: 0.92 }} onClick={onDisable} style={dangerBtnSmall}>Desactivar</motion.button>
            : user.status === 'disabled'
            ? <motion.button whileTap={{ scale: 0.92 }} onClick={onEnable} style={smallBtn}>Activar</motion.button>
            : null
          }
          {user.status !== 'deleted' && (
            <motion.button whileTap={{ scale: 0.92 }} onClick={onDelete} style={{ ...dangerBtnSmall, background: 'none', color: '#b91c1c' }}>✕</motion.button>
          )}
        </div>
      )}
    </div>
  );
}

function InviteRow({ invite, onRevoke, acting }: { invite: AdminInvite; onRevoke: () => void; acting: boolean }) {
  const isRevocable = invite.status === 'pending' && !invite.expired;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--line)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>
          {invite.suggestedName || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Sin nombre</span>}
        </div>
        <div style={{ fontSize: 11.5, color: invite.expired ? '#9ca3af' : 'var(--muted)', marginTop: 2 }}>
          {invite.expired ? '⚠ Expirada' : invite.status === 'revoked' ? 'Revocada' : `Expira ${invite.expiresAt.substring(0, 10)}`}
        </div>
      </div>
      {isRevocable && (
        <motion.button whileTap={{ scale: 0.92 }} onClick={onRevoke} disabled={acting}
          style={{ ...dangerBtnSmall, fontSize: 11.5, padding: '4px 10px', height: 'auto' }}>
          Revocar
        </motion.button>
      )}
    </div>
  );
}

function InviteForm({ onDone, onCollapse }: { onDone: () => void; onCollapse: () => void }) {
  const [name, setName]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const { token } = await adminCreateInvite(name.trim());
      setInviteUrl(`${window.location.origin}/?invite=${token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la invitación');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      if (navigator.share) { await navigator.share({ url: inviteUrl, title: 'Invitación a Finanzas' }); return; }
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* dismissed */ }
  };

  if (inviteUrl) {
    return (
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
          Enlace de un solo uso, válido 7 días. Compártelo directamente con la persona.
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', wordBreak: 'break-all' }}>
          {inviteUrl}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleCopy} style={{ flex: 1, height: 42, background: 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            {copied ? '✓ Copiado' : 'Copiar / Compartir'}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setInviteUrl(null); setName(''); onDone(); onCollapse(); }}
            style={{ padding: '0 14px', height: 42, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
            Listo
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Nombre del invitado (opcional)</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Carlos"
          style={{ width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px', border: '1.5px solid var(--line)', borderRadius: 10, background: 'var(--card)', color: 'var(--ink)', fontSize: 15, fontFamily: 'var(--font-body)', outline: 'none' }} />
      </div>
      {error && <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{error}</p>}
      <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={saving}
        style={{ height: 44, background: saving ? 'var(--blue-300)' : 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
        {saving ? 'Generando…' : 'Generar enlace'}
      </motion.button>
    </div>
  );
}

function ConfirmDialog({ confirm, acting, onCancel, onConfirmDisable, onConfirmDelete }: {
  confirm: NonNullable<Confirm>;
  acting: boolean;
  onCancel: () => void;
  onConfirmDisable: () => void;
  onConfirmDelete: (withData: boolean) => void;
}) {
  return (
    <>
      <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', zIndex: 500 }} />
      <motion.div key="dialog" initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
        transition={quickEase}
        style={{
          position: 'fixed', left: 20, right: 20, bottom: 'max(24px, env(safe-area-inset-bottom))',
          zIndex: 501, background: 'var(--card)', borderRadius: 20, padding: '20px 20px 16px',
          boxShadow: '0 20px 60px rgba(15,23,42,0.25)',
        }}>
        {confirm.type === 'disable' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>
              ¿Desactivar a {confirm.name}?
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              No podrá iniciar sesión hasta que lo reactives. Sus datos se conservan.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={onConfirmDisable} disabled={acting}
                style={{ flex: 1, height: 46, background: '#b45309', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 600, fontSize: 14, cursor: acting ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                {acting ? '…' : 'Desactivar'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel}
                style={{ flex: 1, height: 46, background: 'none', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancelar
              </motion.button>
            </div>
          </>
        )}
        {confirm.type === 'delete' && (
          <>
            <p style={{ margin: '0 0 16px', fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>
              ¿Eliminar a {confirm.name}?
            </p>
            <p style={{ margin: '0 0 18px', fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5 }}>
              Esta acción no se puede deshacer. ¿También quieres borrar su historial de transacciones?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onConfirmDelete(true)} disabled={acting}
                style={{ height: 46, background: '#b91c1c', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 600, fontSize: 14, cursor: acting ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                {acting ? '…' : 'Eliminar usuario y datos'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => onConfirmDelete(false)} disabled={acting}
                style={{ height: 46, background: 'none', border: '1.5px solid #b91c1c', borderRadius: 12, color: '#b91c1c', fontWeight: 600, fontSize: 14, cursor: acting ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                {acting ? '…' : 'Eliminar solo el usuario (conservar datos)'}
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={onCancel}
                style={{ height: 46, background: 'none', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Cancelar
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>
        {title}
      </div>
      <div style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', padding: '0 16px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 2px',
  color: 'var(--blue-700)', fontSize: 22, lineHeight: 1,
};
const smallBtn: React.CSSProperties = {
  padding: '6px 12px', height: 32, border: '1px solid var(--line)', borderRadius: 8,
  background: 'var(--card)', color: 'var(--ink)', fontSize: 12.5, fontWeight: 500,
  cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
};
const dangerBtnSmall: React.CSSProperties = {
  padding: '6px 12px', height: 32, border: 'none', borderRadius: 8,
  background: '#fef2f2', color: '#b91c1c', fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
};
