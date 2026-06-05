import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, changePin, listUsers, createUser } from '../lib/api';
import { exportToCSV } from '../lib/export';
import { getProfile } from '../lib/profiles';
import { quickEase, softSpring } from '../lib/motion';
import { getTheme, applyTheme, type ThemeMode, getAccessibleMode, setAccessibleMode } from '../lib/theme';
import { CoverturaMeter } from '../components/CoverturaMeter';
import { ImportarExtracto } from '../components/ImportarExtracto';

const ADMIN_USER = 'jose';
const BANKS = ['Bogotá', 'Itaú', 'Davivienda', 'Bancolombia', 'Otro'];
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto',  label: 'Auto' },
  { value: 'light', label: 'Claro' },
  { value: 'dark',  label: 'Oscuro' },
];

interface Props {
  userId: string;
  transactions: Transaction[];
  onClose: () => void;
}

export function Settings({ userId, transactions, onClose }: Props) {
  const profile = getProfile(userId);

  const [defaultBank, setDefaultBank] = useState(
    () => localStorage.getItem('fm_default_bank') || 'Otro'
  );
  const [theme, setTheme] = useState<ThemeMode>(getTheme);
  const [accessible, setAccessible] = useState(() => getAccessibleMode(userId));

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    applyTheme(mode);
  }

  function handleAccessibleToggle() {
    const next = !accessible;
    setAccessible(next);
    setAccessibleMode(userId, next);
  }

  // Admin: user management
  const isAdmin = userId === ADMIN_USER;
  const [showImport, setShowImport] = useState(false);
  const [userList, setUserList]         = useState<string[]>([]);
  const [showNewUser, setShowNewUser]   = useState(false);
  const [newUser, setNewUser]           = useState({ id: '', name: '', pin: '' });
  const [newUserSaving, setNewUserSaving] = useState(false);
  const [newUserError, setNewUserError]   = useState<string | null>(null);
  const [newUserSuccess, setNewUserSuccess] = useState(false);

  useEffect(() => {
    if (isAdmin) listUsers(userId).then(setUserList).catch(() => {});
  }, [isAdmin, userId]);

  async function handleCreateUser() {
    if (!newUser.id || !newUser.pin) { setNewUserError('Completa ID y PIN'); return; }
    setNewUserSaving(true); setNewUserError(null);
    try {
      await createUser(userId, newUser.id, newUser.name || newUser.id, newUser.pin);
      setUserList(prev => [...prev, newUser.id]);
      setNewUser({ id: '', name: '', pin: '' });
      setShowNewUser(false);
      setNewUserSuccess(true);
      setTimeout(() => setNewUserSuccess(false), 2000);
    } catch (e) {
      setNewUserError(e instanceof Error ? e.message : 'Error al crear usuario');
    } finally { setNewUserSaving(false); }
  }

  // Change PIN
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinForm, setPinForm]         = useState({ current: '', newPin: '', confirm: '' });
  const [pinSaving, setPinSaving]     = useState(false);
  const [pinError, setPinError]       = useState<string | null>(null);
  const [pinSuccess, setPinSuccess]   = useState(false);

  function handleBankChange(bank: string) {
    setDefaultBank(bank);
    localStorage.setItem('fm_default_bank', bank);
  }

  async function handlePinChange() {
    if (!pinForm.current || !pinForm.newPin || !pinForm.confirm) {
      setPinError('Completa todos los campos'); return;
    }
    if (pinForm.newPin !== pinForm.confirm) {
      setPinError('Los PINs nuevos no coinciden'); return;
    }
    if (!/^\d{4,6}$/.test(pinForm.newPin)) {
      setPinError('El nuevo PIN debe tener 4–6 dígitos'); return;
    }
    setPinError(null);
    setPinSaving(true);
    try {
      await changePin(pinForm.current, pinForm.newPin);
      setPinForm({ current: '', newPin: '', confirm: '' });
      setShowPinForm(false);
      setPinSuccess(true);
      setTimeout(() => setPinSuccess(false), 2500);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Error al cambiar PIN');
    } finally {
      setPinSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px',
    border: '1.5px solid var(--line)', borderRadius: 10,
    background: 'var(--card)', color: 'var(--ink)', fontSize: 'var(--text-base)',
    fontFamily: 'var(--font-mono)', outline: 'none', letterSpacing: '0.18em',
  };

  if (showImport) {
    return <ImportarExtracto userId={userId} onClose={() => setShowImport(false)} />;
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.25)', zIndex: 300 }}
      />

      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={softSpring}
        style={{
          position: 'fixed', inset: 0, background: 'var(--surface)',
          zIndex: 301, overflowY: 'auto', fontFamily: 'var(--font-body)',
          paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Sticky header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: 'max(20px, env(safe-area-inset-top)) 20px 14px',
          borderBottom: '1px solid var(--line)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        }}>
          <motion.button whileTap={{ scale: 0.88 }} onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px 4px 2px',
            color: 'var(--blue-700)', fontSize: 22, lineHeight: 1, display: 'flex', alignItems: 'center',
          }}>
            ‹
          </motion.button>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: 0 }}>
            Ajustes
          </h1>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Profile card */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: 'var(--card)', borderRadius: 'var(--r-xl)', padding: '14px 16px',
            boxShadow: 'var(--shadow-card)',
          }}>
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--card)', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {profile?.initial ?? '?'}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{profile?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Sesión activa · {userId}</div>
            </div>
          </div>

          {/* ── Cuenta ── */}
          <Section title="Cuenta">
            <Row
              label="Cambiar PIN"
              note={pinSuccess ? '✓ PIN actualizado' : undefined}
              noteColor="#16a34a"
              onTap={() => { setShowPinForm(v => !v); setPinError(null); }}
              chevron={showPinForm ? '↑' : '›'}
            />
            <AnimatePresence>
              {showPinForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={quickEase}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {([
                      { label: 'PIN actual',               key: 'current' },
                      { label: 'Nuevo PIN (4–6 dígitos)',  key: 'newPin'  },
                      { label: 'Confirmar nuevo PIN',      key: 'confirm' },
                    ] as { label: string; key: 'current' | 'newPin' | 'confirm' }[]).map(({ label, key }) => (
                      <div key={key}>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
                        <input
                          type="password" inputMode="numeric"
                          value={pinForm[key]}
                          onChange={e => setPinForm(f => ({ ...f, [key]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                          maxLength={6}
                          placeholder="● ● ● ●"
                          style={inputStyle}
                        />
                      </div>
                    ))}
                    {pinError && (
                      <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{pinError}</p>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handlePinChange} disabled={pinSaving} style={{
                        flex: 1, height: 44, background: pinSaving ? 'var(--blue-300)' : 'var(--blue-700)',
                        border: 'none', borderRadius: 10, color: 'var(--card)', fontSize: 14, fontWeight: 600,
                        cursor: pinSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                      }}>
                        {pinSaving ? 'Guardando…' : 'Guardar nuevo PIN'}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowPinForm(false)} style={{
                        padding: '0 16px', height: 44, background: 'none',
                        border: '1px solid var(--line)', borderRadius: 10,
                        color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}>
                        Cancelar
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

          {/* ── Apariencia ── */}
          <Section title="Apariencia">
            <div style={{ paddingTop: 12, paddingBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 10 }}>Tema</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {THEME_OPTIONS.map(({ value, label }) => (
                  <motion.button key={value} whileTap={{ scale: 0.92 }} onClick={() => handleThemeChange(value)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontFamily: 'var(--font-body)',
                    border: `1.5px solid ${theme === value ? 'var(--blue-600)' : 'var(--line)'}`,
                    background: theme === value ? 'var(--blue-50)' : 'var(--card)',
                    color: theme === value ? 'var(--blue-700)' : 'var(--muted)',
                    fontWeight: theme === value ? 600 : 400, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}>{label}</motion.button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                Auto sigue la preferencia del sistema.
              </p>

              {/* Modo accesible */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500 }}>
                      Modo accesible
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 3 }}>
                      Texto e íconos más grandes para mayor comodidad
                    </div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={handleAccessibleToggle}
                    style={{
                      flexShrink: 0,
                      width: 50, height: 28, borderRadius: 999,
                      background: accessible ? 'var(--blue-600)' : 'var(--line)',
                      border: 'none', cursor: 'pointer', position: 'relative',
                      transition: 'background 0.2s ease',
                    }}
                    aria-label="Toggle modo accesible"
                  >
                    <motion.span
                      animate={{ x: accessible ? 24 : 4 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      style={{
                        position: 'absolute', top: 4, left: 0,
                        width: 20, height: 20, borderRadius: '50%',
                        background: 'white',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      }}
                    />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* Modo accesible */}
            <div style={{ borderTop: '1px solid var(--line)', padding: '14px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', fontWeight: 500 }}>Modo accesible</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>Texto e íconos más grandes</div>
              </div>
              <motion.button
                onClick={handleAccessibleToggle}
                aria-label="Toggle modo accesible"
                style={{
                  width: 52, height: 30, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: accessible ? 'var(--blue-600)' : 'var(--line)',
                  position: 'relative', flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <motion.div
                  animate={{ x: accessible ? 24 : 4 }}
                  transition={softSpring}
                  style={{ position: 'absolute', top: 4, width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}
                />
              </motion.button>
            </div>
          </Section>

          {/* ── Preferencias ── */}
          <Section title="Preferencias">
            <div style={{ paddingTop: 12, paddingBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 10 }}>Banco predeterminado</div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {BANKS.map(b => (
                  <motion.button key={b} whileTap={{ scale: 0.92 }} onClick={() => handleBankChange(b)} style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 13, fontFamily: 'var(--font-body)',
                    border: `1.5px solid ${defaultBank === b ? 'var(--blue-600)' : 'var(--line)'}`,
                    background: defaultBank === b ? 'var(--blue-50)' : 'var(--card)',
                    color: defaultBank === b ? 'var(--blue-700)' : 'var(--muted)',
                    fontWeight: defaultBank === b ? 600 : 400, cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}>{b}</motion.button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                Se usa como valor por defecto al agregar transacciones manualmente.
              </p>
            </div>
          </Section>

          {/* ── Usuarios (solo admin) ── */}
          {isAdmin && (
            <Section title="Usuarios">
              {userList.length > 0 && (
                <div style={{ paddingTop: 10, paddingBottom: 4 }}>
                  {userList.map(uid => (
                    <div key={uid} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                      {uid}
                    </div>
                  ))}
                </div>
              )}
              <Row
                label="Agregar usuario"
                note={newUserSuccess ? '✓ Creado' : undefined}
                noteColor="#16a34a"
                onTap={() => { setShowNewUser(v => !v); setNewUserError(null); }}
                chevron={showNewUser ? '↑' : '+'}
              />
              <AnimatePresence>
                {showNewUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={quickEase}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 4, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { label: 'ID de usuario (ej: maria)', key: 'id' as const },
                        { label: 'Nombre visible', key: 'name' as const },
                        { label: 'PIN inicial (4–6 dígitos)', key: 'pin' as const },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 5 }}>{label}</div>
                          <input
                            type={key === 'pin' ? 'password' : 'text'}
                            inputMode={key === 'pin' ? 'numeric' : 'text'}
                            value={newUser[key]}
                            onChange={e => setNewUser(u => ({ ...u, [key]: key === 'id' ? e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') : e.target.value }))}
                            placeholder={key === 'pin' ? '● ● ● ●' : ''}
                            style={{ width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px', border: '1.5px solid var(--line)', borderRadius: 10, background: 'var(--card)', color: 'var(--ink)', fontSize: 'var(--text-base)', fontFamily: 'var(--font-body)', outline: 'none' }}
                          />
                        </div>
                      ))}
                      {newUserError && <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: '#b91c1c' }}>{newUserError}</p>}
                      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                        <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreateUser} disabled={newUserSaving} style={{ flex: 1, height: 44, background: newUserSaving ? 'var(--blue-300)' : 'var(--blue-700)', border: 'none', borderRadius: 10, color: 'var(--card)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: newUserSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)' }}>
                          {newUserSaving ? 'Creando…' : 'Crear usuario'}
                        </motion.button>
                        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowNewUser(false)} style={{ padding: '0 16px', height: 44, background: 'none', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                          Cancelar
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Section>
          )}

          {/* ── Captura ── */}
          <Section title="Captura de transacciones">
            <CoverturaMeter transactions={transactions} />
          </Section>

          {/* ── Datos ── */}
          <Section title="Datos">
            <Row
              label="Importar extracto bancario"
              sublabel="CSV de Bancolombia, Bogotá, Itaú u otro"
              onTap={() => setShowImport(true)}
              chevron="›"
            />
            <Row
              label="Exportar backup completo"
              sublabel={`${transactions.length} transacciones`}
              onTap={() => exportToCSV(transactions, `backup_${userId}.csv`)}
              chevron="↓"
            />
            <Row
              label="Importar extracto bancario"
              sublabel="CSV de Bancolombia, Bogotá, Itaú u otro banco"
              onTap={() => setShowImport(true)}
              chevron="↑"
            />
          </Section>

        </div>
      </motion.div>

      <AnimatePresence>
        {showImport && (
          <ImportarExtracto key="import" userId={userId} onClose={() => setShowImport(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600, marginBottom: 8, paddingLeft: 4 }}>
        {title}
      </div>
      <div style={{ background: 'var(--card)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-card)', padding: '0 16px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, sublabel, note, noteColor, onTap, chevron }: {
  label: string;
  sublabel?: string;
  note?: string;
  noteColor?: string;
  onTap: () => void;
  chevron?: string;
}) {
  return (
    <motion.button whileTap={{ scale: 0.99 }} onClick={onTap} style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
      minHeight: 'var(--touch-min)',
    }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>{sublabel}</div>}
      </div>
      <span style={{ color: note ? noteColor : 'var(--muted)', fontSize: note ? 'var(--text-xs)' : 18, fontWeight: note ? 600 : 400, marginLeft: 8, flexShrink: 0 }}>
        {note ?? chevron ?? '›'}
      </span>
    </motion.button>
  );
}
