import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, changePin } from '../lib/api';
import { AdminPanel } from '../components/AdminPanel';
import { exportToCSV } from '../lib/export';
import { getProfile, getUserNickname, setUserNickname, getUserAvatar, setUserAvatar } from '../lib/profiles';
import { quickEase, softSpring } from '../lib/motion';
import { getTheme, applyTheme, type ThemeMode, getAccessibleMode, setAccessibleMode } from '../lib/theme';
import { CoverturaMeter } from '../components/CoverturaMeter';
import { ImportarExtracto } from '../components/ImportarExtracto';
import { TutorialCanales } from '../components/TutorialCanales';

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
  onProfilesChanged?: () => void;
}

export function Settings({ userId, transactions, onClose, onProfilesChanged }: Props) {
  const profile = getProfile(userId);

  const [defaultBank, setDefaultBank] = useState(
    () => localStorage.getItem('fm_default_bank') || 'Otro'
  );
  const [theme, setTheme] = useState<ThemeMode>(getTheme);
  const [accessible, setAccessible] = useState(() => getAccessibleMode(userId));
  const [nickname, setNickname] = useState(() => getUserNickname(userId));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getUserAvatar(userId));

  function handleNicknameSave(value: string) {
    const trimmed = value.trim();
    setNickname(trimmed);
    setUserNickname(userId, trimmed);
  }

  function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(objectUrl);
      setAvatarUrl(dataUrl);
      setUserAvatar(userId, dataUrl);
    };
    img.src = objectUrl;
  }

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
  const [showTutorial, setShowTutorial] = useState(false);

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
            {(avatarUrl || profile?.avatar) ? (
              <img src={avatarUrl || profile!.avatar} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--card)', fontWeight: 800, fontSize: 18, fontFamily: 'var(--font-display)', flexShrink: 0 }}>
                {profile?.initial ?? userId.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{nickname || profile?.name || userId}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Sesión activa · {userId}</div>
            </div>
          </div>

          {/* ── Mi perfil ── */}
          <Section title="Mi perfil">
            <div style={{ paddingTop: 16, paddingBottom: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              {/* Avatar */}
              <div style={{ position: 'relative' }}>
                {(avatarUrl || profile?.avatar) ? (
                  <img src={avatarUrl || profile!.avatar} alt="" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                ) : (
                  <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--card)', fontWeight: 800, fontSize: 28, fontFamily: 'var(--font-display)' }}>
                    {profile?.initial ?? userId.charAt(0).toUpperCase()}
                  </div>
                )}
                <label style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 26, height: 26, borderRadius: '50%',
                  background: 'var(--blue-700)', border: '2px solid var(--card)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', fontSize: 13,
                }}>
                  ✎
                  <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
                </label>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textAlign: 'center' }}>
                Toca el lápiz para cambiar tu foto
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, paddingBottom: 14 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: 6 }}>Nombre visible</div>
              <input
                type="text"
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                onBlur={e => handleNicknameSave(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                placeholder={profile?.name || userId}
                style={{
                  width: '100%', boxSizing: 'border-box', height: 44, padding: '0 12px',
                  border: '1.5px solid var(--line)', borderRadius: 10,
                  background: 'var(--surface)', color: 'var(--ink)', fontSize: 'var(--text-base)',
                  fontFamily: 'var(--font-body)', outline: 'none',
                }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                Solo visible para ti. No cambia tu ID de usuario ({userId}).
              </p>
            </div>
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
              <AdminPanel adminId={userId} onProfilesChanged={onProfilesChanged ?? (() => {})} />
            </Section>
          )}

          {/* ── Captura ── */}
          <Section title="Captura de transacciones">
            <CoverturaMeter transactions={transactions} />
            <Row
              label="Ver tutorial de canales"
              sublabel="Cómo activar SMS, notificaciones, Gmail o importar extractos"
              onTap={() => setShowTutorial(true)}
              chevron="›"
            />
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

        </div>
      </motion.div>

      <AnimatePresence>
        {showImport && (
          <ImportarExtracto key="import" userId={userId} onClose={() => setShowImport(false)} />
        )}
        {showTutorial && (
          <TutorialCanales key="tutorial" userId={userId} onClose={() => setShowTutorial(false)} />
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
