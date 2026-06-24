import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Transaction, changePin, updateProfile, getProfileFromServer, fetchCards, fetchCategoryBudgets, setCategoryBudget, deleteCategoryBudget, fetchRules, deleteRule } from '../lib/api';
import type { Card, CategoryBudgetsData, AutoRule } from '../lib/api';
import { AdminPanel } from '../components/AdminPanel';
import { CategorizarModal } from '../components/CategorizarModal';
import { exportToCSV, exportToJSON } from '../lib/export';
import { getProfile, getUserNickname, setUserNickname, getUserAvatar, setUserAvatar, getUserTimezone, setUserTimezone, getUserTabOrder, setUserTabOrder, ReorderableTab } from '../lib/profiles';
import { TIMEZONE_OPTIONS, formatCOP } from '../lib/utils';
import { quickEase, softSpring } from '../lib/motion';
import { getTheme, applyTheme, type ThemeMode, getAccessibleMode, setAccessibleMode } from '../lib/theme';
import { CoverturaMeter } from '../components/CoverturaMeter';
import { ImportarExtracto } from '../components/ImportarExtracto';
import { ImportarExtractoPorFoto } from '../components/ImportarExtractoPorFoto';
import { TutorialCanales } from '../components/TutorialCanales';
import { isBiometricSupported, hasBiometric, registerBiometric, clearBiometric } from '../lib/webauthn';
import { resizeImageToAvatar } from '../lib/avatar';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { getLearnedMappings, removeLearnedMapping, clearLearnedMappings } from '../lib/merchantLearning';
import type { LearnedMapping } from '../lib/merchantLearning';
import { CATEGORIES, HAS_WEBHOOK_URL } from '../lib/config';
import { BadgeGallery } from '../components/BadgeGallery';

const ADMIN_USER = 'jose';
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'auto',  label: 'Sistema' },
  { value: 'dark',  label: 'Oscuro' },
];

interface Props {
  userId: string;
  transactions: Transaction[];
  onClose: () => void;
  onProfilesChanged?: () => void;
  onCategoryChange?: (timestamp: string, categoria: string) => void;
  onDataRefresh?: () => void;
}

export function Settings({ userId, transactions, onClose, onProfilesChanged, onCategoryChange, onDataRefresh }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  useOverlayA11y(true, onClose, overlayRef);
  const profile = getProfile(userId);

  const [defaultBank, setDefaultBank] = useState(
    () => localStorage.getItem('fm_default_bank') || 'Otro'
  );

  const [cards, setCards] = useState<Card[]>([]);
  const availableBanks = useMemo(() => {
    if (cards.length > 0) {
      const banks = [...new Set(cards.map(c => c.banco).filter(Boolean))];
      return banks.sort((a, b) => a.localeCompare(b, 'es')).concat('Otro');
    }
    const seen = new Set<string>();
    for (const tx of transactions) {
      if (tx.Banco && tx.Banco !== 'Otro') seen.add(tx.Banco.trim());
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'es')).concat('Otro');
  }, [cards, transactions]);

  const [theme, setTheme] = useState<ThemeMode>(getTheme);
  const [accessible, setAccessible] = useState(() => getAccessibleMode(userId));
  const [nickname, setNickname] = useState(() => getUserNickname(userId));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => getUserAvatar(userId));
  const [timezone, setTimezone] = useState(() => getUserTimezone(userId));
  const [tabOrder, setTabOrderState] = useState<ReorderableTab[]>(() => getUserTabOrder(userId));
  const [learnedMappings, setLearnedMappings] = useState<LearnedMapping[]>(() => getLearnedMappings(userId));

  // Alertas por email (F7 + F8)
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('200000');
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [alertsSaving, setAlertsSaving] = useState(false);
  const [alertsSaved, setAlertsSaved] = useState(false);

  function handleRemoveLearning(rawMerchant: string) {
    removeLearnedMapping(userId, rawMerchant);
    setLearnedMappings(getLearnedMappings(userId));
  }

  function handleClearAllLearnings() {
    clearLearnedMappings(userId);
    setLearnedMappings([]);
  }

  async function handleSaveAlerts() {
    setAlertsSaving(true);
    try {
      await updateProfile({
        alertEmail: alertsEnabled ? alertEmail : '',
        alertThreshold: alertsEnabled ? Number(alertThreshold) || 0 : 0,
        weeklyDigest,
      });
      setAlertsSaved(true);
      setTimeout(() => setAlertsSaved(false), 2500);
    } catch { /* ignore — server might not support yet */ }
    finally { setAlertsSaving(false); }
  }

  function moveTab(index: number, dir: -1 | 1) {
    const next = [...tabOrder];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setTabOrderState(next);
    setUserTabOrder(userId, next);
  }

  // Sync server profile to localStorage on mount (handles new-device logins).
  useEffect(() => {
    getProfileFromServer().then(data => {
      if (data.displayName) { setNickname(data.displayName); setUserNickname(userId, data.displayName); }
      if (data.avatar) { setAvatarUrl(data.avatar); setUserAvatar(userId, data.avatar); }
      if (data.alertEmail) { setAlertEmail(data.alertEmail); setAlertsEnabled(true); }
      if (data.alertThreshold) setAlertThreshold(String(data.alertThreshold));
      if (data.weeklyDigest != null) setWeeklyDigest(data.weeklyDigest);
    }).catch(() => {}); // fire-and-forget, no token → skip silently
    if (HAS_WEBHOOK_URL) {
      fetchCards().then(setCards).catch(() => {});
      setBudgetsLoading(true);
      fetchCategoryBudgets().then(setServerBudgets).catch(() => {}).finally(() => setBudgetsLoading(false));
      fetchRules().then(setServerRules).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function handleNicknameSave(value: string) {
    const trimmed = value.trim();
    setNickname(trimmed);
    setUserNickname(userId, trimmed);
    updateProfile({ displayName: trimmed }).catch(() => {}); // sync cross-device
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be re-selected
    if (!file) return;
    try {
      const dataUrl = await resizeImageToAvatar(file);
      setAvatarUrl(dataUrl);
      setUserAvatar(userId, dataUrl);
      updateProfile({ avatar: dataUrl }).catch(() => {}); // sync cross-device
    } catch { /* imagen inválida — ignorar */ }
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
  const [showCategorizar, setShowCategorizar] = useState(false);
  const uncategorizedCount = transactions.filter(tx => !tx.Categoría || tx.Categoría === 'Otro').length;
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialCard, setTutorialCard] = useState(0);

  const CHANNEL_CARD: Record<string, number> = { sms: 0, notification: 1, email: 2, import: 3 };

  function openChannelTutorial(channelId: string) {
    setTutorialCard(CHANNEL_CARD[channelId] ?? 0);
    setShowTutorial(true);
  }

  // Change PIN
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinForm, setPinForm]         = useState({ current: '', newPin: '', confirm: '' });
  const [pinSaving, setPinSaving]     = useState(false);
  const [pinError, setPinError]       = useState<string | null>(null);
  const [pinSuccess, setPinSuccess]   = useState(false);

  // Biometría
  const [bioRegistered, setBioRegistered] = useState(() => hasBiometric(userId));
  const [bioLoading, setBioLoading]       = useState(false);
  const bioSupported = isBiometricSupported();

  async function handleBioToggle() {
    if (bioRegistered) {
      clearBiometric(userId);
      setBioRegistered(false);
    } else {
      setBioLoading(true);
      const ok = await registerBiometric(userId);
      setBioLoading(false);
      setBioRegistered(ok);
    }
  }

  const [showFotoImport, setShowFotoImport] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [serverBudgets, setServerBudgets] = useState<CategoryBudgetsData | null>(null);
  const [budgetsLoading, setBudgetsLoading] = useState(false);
  const [addingBudget, setAddingBudget] = useState(false);
  const [newBudgetCat, setNewBudgetCat] = useState('');
  const [newBudgetAmt, setNewBudgetAmt] = useState('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [serverRules, setServerRules] = useState<AutoRule[] | null>(null);

  async function handleDeleteServerBudget(cat: string) {
    try {
      await deleteCategoryBudget(currentMonth, cat);
      setServerBudgets(prev => { if (!prev) return prev; const next = { ...prev }; delete next[cat]; return next; });
    } catch { /* ignore */ }
  }

  async function handleSaveServerBudget() {
    if (!newBudgetCat || !newBudgetAmt) return;
    const amount = parseInt(newBudgetAmt, 10);
    if (isNaN(amount) || amount <= 0) return;
    setBudgetSaving(true);
    try {
      await setCategoryBudget(currentMonth, newBudgetCat, amount);
      const updated = await fetchCategoryBudgets();
      setServerBudgets(updated);
      setAddingBudget(false);
      setNewBudgetCat('');
      setNewBudgetAmt('');
    } catch { /* ignore */ }
    finally { setBudgetSaving(false); }
  }

  async function handleDeleteServerRule(pattern: string) {
    try {
      await deleteRule(pattern);
      setServerRules(prev => prev ? prev.filter(r => r.pattern !== pattern) : prev);
    } catch { /* ignore */ }
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
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
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
          <h1 id="settings-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--ink)', margin: 0 }}>
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

          {/* ── Progreso (Gamificación) ── */}
          <Section title="Progreso">
            <BadgeGallery userId={userId} />
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

            {bioSupported && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
                    Face ID / Huella digital
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 2 }}>
                    {bioRegistered ? 'Activado — toca para desactivar' : 'Entrar sin PIN con biometría'}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={handleBioToggle}
                  disabled={bioLoading}
                  style={{
                    width: 51, height: 31, borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: bioRegistered ? 'var(--blue-600)' : 'var(--line)',
                    position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
                  }}
                >
                  <motion.div
                    animate={{ x: bioRegistered ? 22 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    style={{
                      position: 'absolute', top: 3, width: 25, height: 25,
                      borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                    }}
                  />
                </motion.button>
              </div>
            )}
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
                {availableBanks.map(b => (
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

            <div style={{ paddingTop: 4, paddingBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, marginBottom: 8 }}>Zona horaria</div>
              <select
                value={timezone}
                aria-label="Zona horaria"
                onChange={e => { setTimezone(e.target.value); setUserTimezone(userId, e.target.value); }}
                style={{
                  width: '100%', height: 44, padding: '0 12px',
                  background: 'var(--card)', border: '1.5px solid var(--line)',
                  borderRadius: 12, color: 'var(--ink)', fontSize: 14,
                  fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer',
                }}
              >
                {TIMEZONE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--muted)' }}>
                Se usa para calcular la fecha al agregar transacciones. Por defecto: Colombia (UTC-5).
              </p>
            </div>
          </Section>

          {/* ── Alertas ── */}
          <Section title="Alertas">
            <div style={{ paddingTop: 8, paddingBottom: 4 }}>
              {/* Toggle alertas de gasto */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>Alertas de gasto grande</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Recibe un email al superar el umbral</div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setAlertsEnabled(e => !e)}
                  role="switch"
                  aria-checked={alertsEnabled}
                  aria-label="Alertas de gasto grande"
                  style={{
                    width: 44, height: 26, borderRadius: 999, cursor: 'pointer',
                    background: alertsEnabled ? 'var(--blue-600, #2563eb)' : 'var(--line)',
                    position: 'relative', transition: 'background 0.25s',
                    flexShrink: 0, border: 'none',
                  }}
                >
                  <motion.span
                    animate={{ x: alertsEnabled ? 20 : 2 }}
                    transition={softSpring}
                    style={{
                      position: 'absolute', top: 3, left: 0, width: 20, height: 20,
                      borderRadius: '50%', background: '#fff',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                    }}
                  />
                </motion.button>
              </div>

              {/* Expandable alert config */}
              <AnimatePresence initial={false}>
                {alertsEnabled && (
                  <motion.div
                    key="alert-config"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Email de notificación</div>
                        <input
                          type="email"
                          value={alertEmail}
                          onChange={e => setAlertEmail(e.target.value)}
                          placeholder="tu@email.com"
                          style={{
                            width: '100%', height: 42, padding: '0 12px',
                            background: 'var(--card)', border: '1.5px solid var(--line)',
                            borderRadius: 12, color: 'var(--ink)', fontSize: 14,
                            fontFamily: 'var(--font-body)', outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Alertar a partir de (COP)</div>
                        <input
                          type="number"
                          value={alertThreshold}
                          onChange={e => setAlertThreshold(e.target.value)}
                          placeholder="200000"
                          style={{
                            width: '100%', height: 42, padding: '0 12px',
                            background: 'var(--card)', border: '1.5px solid var(--line)',
                            borderRadius: 12, color: 'var(--ink)', fontSize: 14,
                            fontFamily: 'var(--font-mono)', outline: 'none',
                            boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Weekly digest toggle — only if email is set */}
              {alertsEnabled && alertEmail.trim() && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: 'var(--ink)', fontWeight: 500 }}>Resumen semanal (lunes)</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Resumen de gastos de la semana</div>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setWeeklyDigest(d => !d)}
                    role="switch"
                    aria-checked={weeklyDigest}
                    aria-label="Resumen semanal"
                    style={{
                      width: 44, height: 26, borderRadius: 999, cursor: 'pointer',
                      background: weeklyDigest ? 'var(--blue-600, #2563eb)' : 'var(--line)',
                      position: 'relative', transition: 'background 0.25s',
                      flexShrink: 0, border: 'none',
                    }}
                  >
                    <motion.span
                      animate={{ x: weeklyDigest ? 20 : 2 }}
                      transition={softSpring}
                      style={{
                        position: 'absolute', top: 3, left: 0, width: 20, height: 20,
                        borderRadius: '50%', background: '#fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                      }}
                    />
                  </motion.button>
                </div>
              )}

              {/* Save button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSaveAlerts}
                disabled={alertsSaving}
                style={{
                  width: '100%', height: 44,
                  background: alertsSaved ? 'var(--success, #16a34a)' : 'var(--blue-600, #2563eb)',
                  color: '#fff', border: 'none', borderRadius: 12, cursor: alertsSaving ? 'default' : 'pointer',
                  fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)',
                  transition: 'background 0.3s', opacity: alertsSaving ? 0.7 : 1,
                }}
              >
                {alertsSaved ? '✓ Guardado' : alertsSaving ? 'Guardando…' : 'Guardar configuración'}
              </motion.button>
            </div>
          </Section>

          {/* ── Presupuestos por categoría ── */}
          {HAS_WEBHOOK_URL && (
            <Section title="Presupuestos del mes">
              <div style={{ paddingTop: 4, paddingBottom: 4 }}>
                {budgetsLoading ? (
                  <p style={{ margin: '14px 0', fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>Cargando…</p>
                ) : serverBudgets && Object.keys(serverBudgets).length > 0 ? (
                  Object.entries(serverBudgets).map(([cat, data]) => {
                    const pct = Math.min(data.pct, 100);
                    const barColor = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
                    return (
                      <div key={cat} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{cat}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                              {formatCOP(data.spent)} / {formatCOP(data.budget)}
                            </span>
                            <motion.button
                              whileTap={{ scale: 0.88 }}
                              onClick={() => handleDeleteServerBudget(cat)}
                              style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '2px 4px', fontSize: 13, lineHeight: 1 }}
                              aria-label={`Eliminar presupuesto ${cat}`}
                            >✕</motion.button>
                          </div>
                        </div>
                        <div style={{ height: 5, background: 'var(--line)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ fontSize: 11, color: barColor, marginTop: 3, textAlign: 'right', fontWeight: 600 }}>{pct}%</div>
                      </div>
                    );
                  })
                ) : !budgetsLoading ? (
                  <p style={{ margin: '14px 0', fontSize: 13, color: 'var(--muted)' }}>Sin presupuestos para {currentMonth}.</p>
                ) : null}

                <AnimatePresence>
                  {addingBudget ? (
                    <motion.div
                      key="add-budget-form"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      transition={quickEase} style={{ overflow: 'hidden' }}
                    >
                      <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Categoría</div>
                          <select
                            value={newBudgetCat}
                            onChange={e => setNewBudgetCat(e.target.value)}
                            style={{ width: '100%', height: 42, padding: '0 10px', background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 10, color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none' }}
                          >
                            <option value="">Seleccionar…</option>
                            {CATEGORIES.filter(c => !serverBudgets || !serverBudgets[c.name]).map(c => (
                              <option key={c.name} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Presupuesto mensual (COP)</div>
                          <input
                            type="number" value={newBudgetAmt} onChange={e => setNewBudgetAmt(e.target.value)}
                            placeholder="400000"
                            style={{ width: '100%', height: 42, padding: '0 12px', boxSizing: 'border-box', background: 'var(--surface)', border: '1.5px solid var(--line)', borderRadius: 10, color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none' }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <motion.button whileTap={{ scale: 0.97 }} onClick={handleSaveServerBudget} disabled={budgetSaving || !newBudgetCat || !newBudgetAmt}
                            style={{ flex: 1, height: 40, background: 'var(--blue-700)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', opacity: budgetSaving ? 0.6 : 1 }}>
                            {budgetSaving ? 'Guardando…' : 'Guardar'}
                          </motion.button>
                          <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setAddingBudget(false); setNewBudgetCat(''); setNewBudgetAmt(''); }}
                            style={{ padding: '0 14px', height: 40, border: '1.5px solid var(--line)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Cancelar
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.button key="add-budget-btn" whileTap={{ scale: 0.97 }} onClick={() => setAddingBudget(true)}
                      style={{ marginTop: 10, width: '100%', height: 38, border: '1.5px dashed var(--line)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                      + Agregar presupuesto
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </Section>
          )}

          {/* ── Reglas de categorización (servidor) ── */}
          {HAS_WEBHOOK_URL && serverRules && serverRules.length > 0 && (
            <Section title={`Reglas aprendidas (${serverRules.length})`}>
              <div style={{ padding: '4px 0' }}>
                <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--muted)' }}>
                  Reglas automáticas creadas al recategorizar transacciones.
                </p>
                {serverRules.map((rule, i) => {
                  const cat = CATEGORIES.find(c => c.name === rule.category);
                  const color = cat?.color ?? 'var(--muted)';
                  return (
                    <div key={rule.pattern} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < serverRules.length - 1 ? '1px solid var(--line)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rule.pattern}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          → <span style={{ padding: '1px 8px', borderRadius: 20, background: color + '22', color, fontSize: 12 }}>{rule.category}</span>
                        </div>
                      </div>
                      <motion.button whileTap={{ scale: 0.88 }} onClick={() => handleDeleteServerRule(rule.pattern)}
                        style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', padding: 6, flexShrink: 0 }}
                        aria-label="Eliminar regla">🗑</motion.button>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Orden de pestañas ── */}
          <Section title="Orden de pestañas">
            <div style={{ paddingTop: 10, paddingBottom: 4 }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--muted)' }}>
                Los primeros 2 aparecen a la izquierda del botón +, los últimos 2 a la derecha.
              </p>
              {tabOrder.map((tabId, i) => {
                const labels: Record<ReorderableTab, string> = { home: 'Inicio', progreso: 'Progreso', misiones: 'Misiones', explorar: 'Explorar' };
                return (
                  <div key={tabId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < tabOrder.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{labels[tabId]}</span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.88 }}
                      onClick={() => moveTab(i, -1)}
                      disabled={i === 0}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--line)',
                        background: 'var(--surface)', cursor: i === 0 ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: i === 0 ? 0.3 : 1, fontSize: 16, color: 'var(--ink)',
                      }}
                    >↑</motion.button>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.88 }}
                      onClick={() => moveTab(i, 1)}
                      disabled={i === tabOrder.length - 1}
                      style={{
                        width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--line)',
                        background: 'var(--surface)', cursor: i === tabOrder.length - 1 ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: i === tabOrder.length - 1 ? 0.3 : 1, fontSize: 16, color: 'var(--ink)',
                      }}
                    >↓</motion.button>
                  </div>
                );
              })}
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
            <CoverturaMeter transactions={transactions} onChannelTutorial={openChannelTutorial} />
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
              label="Categorizar transacciones faltantes"
              sublabel={uncategorizedCount > 0 ? `${uncategorizedCount} sin categoría` : 'Todo categorizado ✓'}
              note={uncategorizedCount > 0 ? String(uncategorizedCount) : undefined}
              noteColor="var(--blue-700)"
              onTap={() => setShowCategorizar(true)}
              chevron="›"
            />
            <Row
              label="Importar extracto bancario"
              sublabel="CSV de Bancolombia, Bogotá, Itaú u otro"
              onTap={() => setShowImport(true)}
              chevron="›"
            />
            <Row
              label="Importar extracto por foto"
              sublabel="Foto o captura de pantalla — analiza con IA"
              onTap={() => setShowFotoImport(true)}
              chevron="›"
            />
            <Row
              label="Exportar CSV"
              sublabel={`${transactions.length} transacciones`}
              onTap={() => exportToCSV(transactions, `backup_${userId}.csv`)}
              chevron="↓"
            />
            <Row
              label="Exportar JSON"
              sublabel="Formato completo con todos los campos"
              onTap={() => exportToJSON(transactions, `backup_${userId}.json`)}
              chevron="↓"
            />
          </Section>

          {/* ── Reglas aprendidas ── */}
          {learnedMappings.length > 0 && (
            <Section title={`Reglas aprendidas (${learnedMappings.length})`}>
              <div style={{ padding: '4px 0' }}>
                {learnedMappings.map(m => {
                  const cat = CATEGORIES.find(c => c.name === m.categoria);
                  const color = cat?.color ?? 'var(--muted)';
                  return (
                    <AnimatePresence key={m.rawMerchant}>
                      <motion.div
                        layout
                        exit={{ x: 40, opacity: 0, height: 0, marginBottom: 0 }}
                        transition={quickEase}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.rawMerchant}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{m.canonicalName || '—'}</span>
                            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20, background: color + '22', color }}>
                              {m.categoria}
                            </span>
                          </div>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.92 }}
                          onClick={() => handleRemoveLearning(m.rawMerchant)}
                          style={{ border: 'none', background: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', padding: '6px', flexShrink: 0 }}
                          aria-label="Eliminar regla"
                        >
                          🗑
                        </motion.button>
                      </motion.div>
                    </AnimatePresence>
                  );
                })}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleClearAllLearnings}
                  style={{ marginTop: 8, marginBottom: 4, width: '100%', height: 36, border: '1.5px solid var(--line)', borderRadius: 10, background: 'none', color: 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                >
                  Borrar todas las reglas
                </motion.button>
              </div>
            </Section>
          )}

        </div>
      </motion.div>

      <AnimatePresence>
        {showCategorizar && (
          <CategorizarModal
            key="categorizar"
            transactions={transactions}
            onCategoryChange={onCategoryChange}
            onClose={() => setShowCategorizar(false)}
          />
        )}
        {showImport && (
          <ImportarExtracto key="import" userId={userId} onClose={() => setShowImport(false)} />
        )}
        {showFotoImport && (
          <ImportarExtractoPorFoto
            key="foto-import"
            userId={userId}
            onClose={() => setShowFotoImport(false)}
            onImported={() => setShowFotoImport(false)}
          />
        )}
        {showTutorial && (
          <TutorialCanales key="tutorial" userId={userId} initialCard={tutorialCard} onClose={() => setShowTutorial(false)} onVerified={onDataRefresh} />
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
