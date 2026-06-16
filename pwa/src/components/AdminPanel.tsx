import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listUsersData, createUser, deleteUser, disableUser, enableUser, resetUserPin, generateEmergencyPin, createInvite, listInvites, revokeInvite, Invite } from '../lib/api';
import { getUserNickname } from '../lib/profiles';
import { quickEase } from '../lib/motion';

interface Props {
  adminId: string;
  onProfilesChanged: () => void;
}

interface UserRow {
  id: string;
  nickname: string;
  status: 'active' | 'disabled';
  txCount: number;
  lastActivity: string | null;
}

type ActiveAction = { type: 'resetPin'; uid: string } | { type: 'delete'; uid: string } | { type: 'emergencyPin'; uid: string } | null;

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
  const [deleteData, setDeleteData] = useState(true);

  // Disable/enable state
  const [togglingDisabled, setTogglingDisabled] = useState<string | null>(null);
  const [disableError, setDisableError] = useState<{ uid: string; text: string } | null>(null);

  // Create user state
  const [newUser, setNewUser] = useState({ id: '', name: '', pin: '' });
  const [createSaving, setCreateSaving] = useState(false);
  const [createMsg, setCreateMsg] = useState<{ text: string; ok: boolean } | null>(null);

  // Emergency PIN state
  const [emergResult, setEmergResult] = useState<{ code: string; expiresAt: string } | null>(null);
  const [emergLoading, setEmergLoading] = useState(false);

  // Link copy
  const [linkCopied, setLinkCopied] = useState(false);

  // Invitations state
  const [invites, setInvites] = useState<Invite[]>([]);
  const [showNewInvite, setShowNewInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteCreating, setInviteCreating] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [lastInvite, setLastInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [revokingCode, setRevokingCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    listUsersData(adminId)
      .then(data => setUsers(data.users.map(u => ({
        id: u.id,
        nickname: getUserNickname(u.id),
        status: u.status,
        txCount: u.txCount,
        lastActivity: u.lastActivity,
      }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [adminId]);

  const reloadInvites = useCallback(() => {
    listInvites(adminId).then(setInvites).catch(() => {});
  }, [adminId]);

  useEffect(() => { reload(); reloadInvites(); }, [reload, reloadInvites]);

  async function handleCreateInvite() {
    if (!inviteName.trim()) {
      setInviteMsg({ text: 'Escribe el nombre visible', ok: false }); return;
    }
    setInviteCreating(true); setInviteMsg(null);
    try {
      const res = await createInvite(adminId, inviteName.trim());
      setLastInvite({ code: res.code, expiresAt: res.expiresAt });
      setInviteName('');
      setShowNewInvite(false);
      reloadInvites();
      onProfilesChanged();
    } catch (e) {
      setInviteMsg({ text: e instanceof Error ? e.message : 'Error al crear invitación', ok: false });
    } finally { setInviteCreating(false); }
  }

  async function handleRevokeInvite(code: string) {
    setRevokingCode(code);
    try {
      await revokeInvite(adminId, code);
      setInvites(prev => prev.filter(i => i.code !== code));
      if (lastInvite?.code === code) setLastInvite(null);
      onProfilesChanged();
    } catch (e) {
      setInviteMsg({ text: e instanceof Error ? e.message : 'Error al revocar invitación', ok: false });
    } finally { setRevokingCode(null); }
  }

  function copyInviteCode(code: string) {
    const link = `${window.location.origin}?invite=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  function toggleAction(action: ActiveAction) {
    setActiveAction(prev => {
      if (prev?.type === action?.type && prev?.uid === action?.uid) return null;
      return action;
    });
    setNewPinValue('');
    setPinMsg(null);
    setDeleteMsg(null);
    setEmergResult(null);
  }

  async function handleGenerateEmergencyPin(uid: string) {
    setEmergLoading(true); setEmergResult(null);
    try {
      const res = await generateEmergencyPin(adminId, uid);
      setEmergResult(res);
    } catch (e) {
      setPinMsg({ text: e instanceof Error ? e.message : 'Error', ok: false });
    } finally { setEmergLoading(false); }
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
      await deleteUser(adminId, uid, deleteData);
      setActiveAction(null);
      setUsers(prev => prev.filter(u => u.id !== uid));
      onProfilesChanged();
    } catch (e) {
      setDeleteMsg(e instanceof Error ? e.message : 'Error al eliminar');
    } finally { setDeleting(false); }
  }

  async function handleDisableToggle(uid: string, currentStatus: 'active' | 'disabled') {
    setTogglingDisabled(uid);
    setDisableError(null);
    try {
      if (currentStatus === 'active') await disableUser(adminId, uid);
      else await enableUser(adminId, uid);
      reload();
    } catch (e) {
      setDisableError({ uid, text: e instanceof Error ? e.message : 'Error al cambiar estado' });
    } finally { setTogglingDisabled(null); }
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
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: u.status === 'disabled' ? 'var(--muted)' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {u.nickname || u.id}
                  {u.id === adminId && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--blue-700)', fontWeight: 500 }}>Admin</span>
                  )}
                  {u.status === 'disabled' && (
                    <span style={{ fontSize: 'var(--text-xs)', color: '#dc2626', fontWeight: 500, background: '#fef2f2', padding: '1px 6px', borderRadius: 4 }}>deshabilitado</span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                  {u.id}
                  {' · '}
                  {u.txCount > 0
                    ? `${u.txCount} tx${u.lastActivity ? ` · última ${u.lastActivity}` : ''}`
                    : 'sin transacciones'}
                </div>
              </div>
              {u.id !== adminId && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => handleDisableToggle(u.id, u.status)}
                    disabled={togglingDisabled === u.id}
                    style={{
                      padding: '5px 10px', borderRadius: 8,
                      border: u.status === 'disabled' ? '1px solid #bbf7d0' : '1px solid var(--line)',
                      background: u.status === 'disabled' ? '#f0fdf4' : 'var(--card)',
                      color: u.status === 'disabled' ? '#16a34a' : 'var(--muted)',
                      fontSize: 'var(--text-xs)', fontWeight: 600,
                      cursor: togglingDisabled === u.id ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                    }}>
                    {togglingDisabled === u.id ? '…' : u.status === 'disabled' ? 'Activar' : 'Pausar'}
                  </motion.button>
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
                    onClick={() => toggleAction({ type: 'emergencyPin', uid: u.id })}
                    style={{
                      padding: '5px 10px', borderRadius: 8, border: '1px solid #fde68a',
                      background: activeAction?.type === 'emergencyPin' && activeAction.uid === u.id ? '#fffbeb' : 'var(--card)',
                      color: '#b45309', fontSize: 'var(--text-xs)', fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>
                    SOS
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => { setDeleteData(true); toggleAction({ type: 'delete', uid: u.id }); }}
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
              {disableError?.uid === u.id && (
                <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626', marginTop: 4 }}>{disableError.text}</div>
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
                      Eliminar usuario {u.nickname || u.id}. Esta acción no se puede deshacer.
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--ink)', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={deleteData}
                        onChange={e => setDeleteData(e.target.checked)}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Borrar también las transacciones ({u.txCount} registros)
                    </label>
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
            {/* Emergency PIN inline */}
            <AnimatePresence>
              {activeAction?.type === 'emergencyPin' && activeAction.uid === u.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={quickEase}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ padding: '12px 0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 'var(--text-xs)', color: '#92400e' }}>
                      Genera un PIN de un solo uso válido por 24 horas para {u.nickname || u.id}.
                    </div>
                    {!emergResult ? (
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleGenerateEmergencyPin(u.id)} disabled={emergLoading}
                        style={{ height: 40, background: '#f59e0b', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: emergLoading ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                        {emergLoading ? 'Generando…' : 'Generar PIN de emergencia'}
                      </motion.button>
                    ) : (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: '#92400e', marginBottom: 4 }}>
                          PIN de emergencia (válido 24h, uso único):
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color: '#b45309', letterSpacing: '0.2em' }}>
                          {emergResult.code}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: '#92400e', marginTop: 4 }}>
                          Expira: {new Date(emergResult.expiresAt).toLocaleString('es-CO')}
                        </div>
                        <button type="button" onClick={() => { setEmergResult(null); setActiveAction(null); }}
                          style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)' }}>
                          Cerrar
                        </button>
                      </div>
                    )}
                    {pinMsg && !pinMsg.ok && (
                      <div style={{ fontSize: 'var(--text-xs)', color: '#dc2626' }}>{pinMsg.text}</div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── Invitaciones ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, paddingBottom: 4 }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Invitaciones
        </div>

        {/* Código recién generado */}
        <AnimatePresence>
          {lastInvite && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={quickEase}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ background: 'var(--blue-50)', border: '1px solid var(--blue-300)', borderRadius: 12, padding: '14px 16px', marginBottom: 10 }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--blue-700)', marginBottom: 4 }}>
                  Código de invitación (válido 7 días, uso único):
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 26, color: 'var(--blue-700)', letterSpacing: '0.16em' }}>
                  {lastInvite.code}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => copyInviteCode(lastInvite.code)}
                    style={{ flex: 1, height: 38, background: 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    {copiedCode === lastInvite.code ? '✓ Copiado' : 'Copiar enlace'}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setLastInvite(null)}
                    style={{ padding: '0 14px', height: 38, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Cerrar
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Lista de invitaciones pendientes */}
        {invites.map(inv => (
          <div key={inv.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>{inv.displayName}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                {inv.code} · expira {new Date(inv.expiresAt).toLocaleDateString('es-CO')}
              </div>
            </div>
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => copyInviteCode(inv.code)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--blue-700)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {copiedCode === inv.code ? '✓' : '⎘'}
            </motion.button>
            <motion.button whileTap={{ scale: 0.94 }} onClick={() => handleRevokeInvite(inv.code)} disabled={revokingCode === inv.code}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #fca5a5', background: 'var(--card)', color: '#dc2626', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
              {revokingCode === inv.code ? '…' : 'Revocar'}
            </motion.button>
          </div>
        ))}

        {/* Generar invitación */}
        <motion.button whileTap={{ scale: 0.99 }} onClick={() => { setShowNewInvite(v => !v); setInviteMsg(null); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 'var(--text-base)', color: 'var(--blue-700)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
            Generar invitación
          </span>
          <span style={{ color: 'var(--muted)', fontSize: 18 }}>{showNewInvite ? '↑' : '+'}</span>
        </motion.button>

        <AnimatePresence>
          {showNewInvite && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={quickEase} style={{ overflow: 'hidden' }}>
              <div style={{ paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 5 }}>Nombre visible (ej: María)</div>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateInvite(); }}
                    style={inputStyle}
                  />
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                  Se crea un perfil sin PIN. La persona ingresa el código en la app y define su propio PIN.
                </div>
                {inviteMsg && !inviteMsg.ok && (
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: '#dc2626' }}>{inviteMsg.text}</p>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreateInvite} disabled={inviteCreating}
                    style={{ flex: 1, height: 44, background: inviteCreating ? 'var(--blue-300)' : 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: inviteCreating ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                    {inviteCreating ? 'Generando…' : 'Generar código'}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowNewInvite(false)}
                    style={{ padding: '0 16px', height: 44, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Cancelar
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
