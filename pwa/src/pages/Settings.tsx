import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, changePin, updateProfile } from '../lib/api';
import { exportToCSV } from '../lib/export';
import { getProfile } from '../lib/profiles';
import { quickEase, softSpring } from '../lib/motion';
import { getTheme, applyTheme, type ThemeMode, getAccessibleMode, setAccessibleMode } from '../lib/theme';
import { CoverturaMeter } from '../components/CoverturaMeter';
import { ImportarExtracto } from '../components/ImportarExtracto';
import { AdminPanel } from '../components/AdminPanel';

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
  const [showImport, setShowImport] = useState(false);

  function handleThemeChange(mode: ThemeMode) {
    setTheme(mode);
    applyTheme(mode);
  }

  function handleAccessibleToggle() {
    const next = !accessible;
    setAccessible(next);
    setAccessibleMode(userId, next);
  }

  // Change PIN
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinForm, setPinForm]         = useState({ current: '', newPin: '', confirm: '' });
  const [pinSaving, setPinSaving]     = useState(false);
  const [pinError, setPinError]       = useState<string | null>(null);
  const [pinSuccess, setPinSuccess]   = useState(false);

  const isAdmin = userId === 'jose';
  const [showAdmin, setShowAdmin] = useState(false);

  // Profile editing (any user)
  const [editProfile, setEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: profile?.name ?? '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [newAvatar, setNewAvatar] = useState<string | null>(null);

  function handleAvatarFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setNewAvatar(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updates: { displayName?: string; avatar?: string } = {};
      if (profileForm.name.trim()) updates.displayName = profileForm.name.trim();
      if (newAvatar) updates.avatar = newAvatar;
      await updateProfile(updates);
      setEditProfile(false);
      setNewAvatar(null);
      setProfileSuccess(true);
      // Refresh the cached profiles so the new name/avatar takes effect on next ProfileSelector load
      try { localStorage.removeItem('fm_profiles_cache'); } catch { /* noop */ }
      setTimeout(() => setProfileSuccess(false), 2500);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Error al guardar perfil');
    } finally {
      setProfileSaving(false);
    }
  }

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
    background: 'var(--card)', color: 'var(--ink)', fontSize: 15,
    fontFamily: 'var(--font-mono)', outline: 'none', letterSpacing: '0.18em',
  };

  if (showImport) return <ImportarExtracto userId={userId} onClose={() => setShowImport(false)} />;
  if (showAdmin)  return <AdminPanel onClose={() => setShowAdmin(false)} />;

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

          {/* Profile card (tappeable for editing) */}
          <Section title="Perfil">
            <motion.button whileTap={{ scale: 0.99 }} onClick={() => { setEditProfile(v => !v); setProfileError(null); setNewAvatar(null); }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                background: (newAvatar || profile?.avatar) ? 'transparent' : 'var(--grad-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--card)', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-display)',
                boxShadow: '0 2px 8px rgba(15,23,42,0.1)',
              }}>
                {(newAvatar || profile?.avatar)
                  ? <img src={newAvatar ?? profile!.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (profile?.initial ?? '?')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                  {profileSuccess ? <span style={{ color: '#16a34a' }}>✓ Perfil actualizado</span> : (profile?.name ?? userId)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Toca para editar · {userId}</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 18 }}>{editProfile ? '↑' : '›'}</span>
            </motion.button>
            <AnimatePresence>
              {editProfile && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={quickEase} style={{ overflow: 'hidden' }}>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Nombre display</div>
                      <input value={profileForm.name} onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                        placeholder={profile?.name || userId}
                        style={{ ...inputStyle, fontFamily: 'var(--font-body)', letterSpacing: 'normal' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 5 }}>Foto de perfil</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 54, height: 54, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                          background: (newAvatar || profile?.avatar) ? 'transparent' : 'var(--grad-brand)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {(newAvatar || profile?.avatar)
                            ? <img src={newAvatar ?? profile!.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{profile?.initial ?? '?'}</span>}
                        </div>
                        <label style={{ flex: 1, height: 38, borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                          {newAvatar ? 'Cambiar foto' : 'Subir foto'}
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); }} />
                        </label>
                        {newAvatar && (
                          <button onClick={() => setNewAvatar(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 18, padding: '4px 6px' }}>✕</button>
                        )}
                      </div>
                    </div>
                    {profileError && <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{profileError}</p>}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={handleSaveProfile} disabled={profileSaving} style={{
                        flex: 1, height: 44, background: profileSaving ? 'var(--blue-300)' : 'var(--blue-700)',
                        border: 'none', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 600,
                        cursor: profileSaving ? 'default' : 'pointer', fontFamily: 'var(--font-body)',
                      }}>
                        {profileSaving ? 'Guardando…' : 'Guardar perfil'}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.97 }} onClick={() => setEditProfile(false)} style={{
                        padding: '0 16px', height: 44, background: 'none', border: '1px solid var(--line)',
                        borderRadius: 10, color: 'var(--muted)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}>
                        Cancelar
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Section>

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
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                Auto sigue la preferencia del sistema.
              </p>
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
          </Section>

          {/* ── Administración (solo Jose) ── */}
          {isAdmin && (
            <Section title="Administración">
              <Row
                label="Panel de administración"
                sublabel="Usuarios, invitaciones y accesos"
                onTap={() => setShowAdmin(true)}
                chevron="›"
              />
            </Section>
          )}

        </div>
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
    }}>
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{sublabel}</div>}
      </div>
      <span style={{ color: note ? noteColor : 'var(--muted)', fontSize: note ? 12.5 : 18, fontWeight: note ? 600 : 400, marginLeft: 8, flexShrink: 0 }}>
        {note ?? chevron ?? '›'}
      </span>
    </motion.button>
  );
}
