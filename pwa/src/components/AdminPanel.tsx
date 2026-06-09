import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listUsers, createUser, deleteUser, resetUserPin } from '../lib/api';
import { getUserNickname } from '../lib/profiles';
import { quickEase } from '../lib/motion';

interface Props {
  adminId: string;
  onProfilesChanged: () => void;
}

interface UserRow {
  id: string;
  nickname: string;
}

type ActiveAction = { type: 'resetPin'; uid: string } | { type: 'delete'; uid: string } | null;

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px',
  border: '1.5px solid var(--line)', borderRadius: 10,
  background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--text-base)',
  fontFamily: 'var(--font-body)', outline: 'none',
};

export function AdminPanel({ adminId, onProfilesChanged }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [showNewUser, setShowNewUser] = useState(false);

  // Reset PIN state
  const [newPinValue, setNewPinValue] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Delete state
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  // Create user state
  const [newUser, setNewUser] = useState({ id: '', name: '', pin: '' });
  const [createSaving, setCreateSaving] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Link copy
  const [linkCopied, setLinkCopied] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    listUsers(adminId)
      .then(ids => setUsers(ids.map(id => ({ id, nickname: getUserNickname(id) }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminId]);

  useEffect(() => { reload(); }, [reload]);

  function toggleAction(action: ActiveAction) {
    setActiveAction(prev => {
      if (prev?.type === action?.type && prev?.uid === action?.uid) return null;
      return action;
    });
    setNewPinValue('');
    setPinMsg(null);
    setDeleteMsg(null);
  }

  async function handleResetPin(uid: string) {
    if (!newPinValue || !/^\d{4,6}$/.test(newPinValue)) {
      setPinMsg({ text: 'PIN debe tener 4–6 dígitos', ok: false }); return;
    }
    setPinSaving(true); setPinMsg(null);
    try {
      await resetUserPin(adminId, uid, newPinValue);
      setPinMsg({ text: 'PIN reseteado', ok: true });
      setNewPinValue('');
      setTimeout(() => { setPinMsg(null); setActiveAction(null); }, 1500);
    } catch (e) {
      setPinMsg({ text: e instanceof Error ? e.message : 'Error', ok: false });
    } finally { setPinSaving(false); }
  }

  async function handleDelete(uid: string) {
    setDeleting(true); setDeleteMsg(null);
    try {
      await deleteUser(adminId, uid);
      setActiveAction(null);
      setUsers(prev => prev.filter(u => u.id !== uid));
      onProfilesChanged();
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : 'Error al eliminar');
    } finally { setDeleting(false); }
  }

  async function handleCreateUser() {
    if (!newUser.id || !newUser.pin) {
      setCreateMsg({ text: 'Completa ID y PIN', ok: false }); return;
    }
    setCreateSaving(true); setCreateMsg(null);
    try {
      await createUser(adminId, newUser.id, newUser.name || newUser.id, newUser.pin);
      setNewUser({ id: '', name: '', pin: '' });
      setShowNewUser(false);
      setCreateMsg({ text: `Usuario "${newUser.id}" creado`, ok: true });
      setTimeout(() => setCreateMsg(null), 2500);
      reload();
      onProfilesChanged();
    } catch (e) {
      setCreateMsg({ text: e instanceof Error ? e.message : 'Error al crear', ok: false });
    } finally { setCreateSaving(false); }
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Lista de usuarios */}
      <div style={{ paddingTop: 8, paddingBottom: 4 }}>
        {loading ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', padding: '10px 0' }}>Cargando…</div>
        ) : users.map(u => (
          <div key={u.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: u.id === adminId ? 'var(--blue-700)' : 'var(--grad-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-display)',
              }}>
                {u.id.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>
                  {u.nickname || u.id}
                  {u.id === adminId && (
                    <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--blue-700)', fontWeight: 500 }}>Admin</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{u.id}</div>
              </div>
              {u.id !== adminId && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => toggleAction({ type: 'resetPin', uid: u.id })}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: '1px solid var(--line)',
                      background: activeAction?.type === 'resetPin' && activeAction.uid === u.id ? 'var(--blue-50)' : 'var(--card)',
                      color: 'var(--blue-700)', fontSize: 'var(--text-xs)', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>
                    PIN
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => toggleAction({ type: 'delete', uid: u.id })}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #fca5a5',
                      background: activeAction?.type === 'delete' && activeAction.uid === u.id ? '#fef2f2' : 'var(--card)',
                      color: '#dc2626', fontSize: 'var(--text-xs)', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>
                    ✕
                  </motion.button>
                </div>
              )}
            </div>

            {/* Reset PIN inline form */}
            <AnimatePresence>
              {activeAction?.type === 'resetPin' && activeAction.uid === u.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={quickEase}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>Nuevo PIN para {u.nickname || u.id} (4–6 dígitos)</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password" inputMode="numeric" maxLength={6}
                        value={newPinValue}
                        onChange={e => setNewPinValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="● ● ● ●"
                        style={{ ...inputStyle, flex: 1, letterSpacing: '0.18em', fontFamily: 'var(--font-mono)' }}
                      />
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleResetPin(u.id)} disabled={pinSaving}
                        style={{ padding: '0 14px', height: 44, background: 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: pinSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                        {pinSaving ? '…' : 'Guardar'}
                      </motion.button>
                    </div>
                    {pinMsg && (
                      <div style={{ fontSize: 'var(--text-xs)', color: pinMsg.ok ? '#16a34a' : '#dc2626' }}>
                        {pinMsg.text}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Delete confirmation inline */}
            <AnimatePresence>
              {activeAction?.type === 'delete' && activeAction.uid === u.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={quickEase}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '12px 0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626', fontWeight: 500 }}>
                      Se eliminarán TODAS las transacciones de {u.nickname || u.id}. Esta acción no se puede deshacer.
                    </div>
                    {deleteMsg && <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626' }}>{deleteMsg}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleDelete(u.id)} disabled={deleting}
                        style={{ flex: 1, height: 40, background: '#dc2626', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: deleting ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                        {deleting ? 'Eliminando…' : 'Sí, eliminar'}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setActiveAction(null)}
                        style={{ padding: '0 16px', height: 40, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Cancelar
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Agregar usuario */}
      <motion.button whileTap={{ scale: 0.99 }} onClick={() => { setShowNewUser(v => !v); setCreateMsg(null); }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
          borderTop: '1px solid var(--line)',
        }}>
        <span style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
          Agregar usuario
        </span>
        <span style={{ color: createMsg?.ok ? '#16a34a' : 'var(--muted)', fontSize: createMsg?.ok ? 'var(--text-xs)' : 18, fontWeight: createMsg?.ok ? 600 : 400 }}>
          {createMsg?.ok ? createMsg.text : (showNewUser ? '↑' : '+')}
        </span>
      </motion.button>

      <AnimatePresence>
        {showNewUser && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={quickEase}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingTop: 4, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {([
                { label: 'ID de usuario (ej: maria)', key: 'id' as const, type: 'text' },
                { label: 'Nombre visible', key: 'name' as const, type: 'text' },
                { label: 'PIN inicial (4–6 dígitos)', key: 'pin' as const, type: 'password' },
              ]).map(({ label, key, type }) => (
                <div key={key}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
                  <input
                    type={type}
                    inputMode={key === 'pin' ? 'numeric' : 'text'}
                    value={newUser[key]}
                    onChange={e => setNewUser(u => ({
                      ...u,
                      [key]: key === 'id'
                        ? e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20)
                        : key === 'pin'
                          ? e.target.value.replace(/\D/g, '').slice(0, 6)
                          : e.target.value,
                    }))}
                    placeholder={key === 'pin' ? '● ● ● ●' : ''}
                    style={{ ...inputStyle, letterSpacing: key === 'pin' ? '0.18em' : 'normal', fontFamily: key === 'pin' ? 'var(--font-mono)' : 'var(--font-body)' }}
                  />
                </div>
              ))}
              {createMsg && !createMsg.ok && (
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: '#dc2626' }}>{createMsg.text}</p>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreateUser} disabled={createSaving}
                  style={{ flex: 1, height: 44, background: createSaving ? 'var(--blue-300)' : 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: createSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                  {createSaving ? 'Creando…' : 'Crear usuario'}
                </motion.button>
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowNewUser(false)}
                  style={{ padding: '0 16px', height: 44, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                  Cancelar
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Copiar enlace de invitación */}
      <motion.button whileTap={{ scale: 0.99 }} onClick={handleCopyLink}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
          borderTop: '1px solid var(--line)',
        }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
            Copiar enlace de invitación
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>
            Comparte la URL con los nuevos usuarios
          </div>
        </div>
        <span style={{ color: linkCopied ? '#16a34a' : 'var(--muted)', fontSize: linkCopied ? 'var(--text-xs)' : 18, fontWeight: linkCopied ? 600 : 400, marginLeft: 8, flexShrink: 0 }}>
          {linkCopied ? '✓ Copiado' : '⎘'}
        </span>
      </motion.button>
    </div>
  );
}
