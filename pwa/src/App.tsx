import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav, Tab } from './components/BottomNav';
import { Home } from './pages/Home';
import { Historial } from './pages/Historial';
import { Agregar } from './pages/Agregar';
import { Analisis } from './pages/Analisis';
import { Chat } from './pages/Chat';
import { PinLock } from './components/PinLock';
import { ProfileSelector } from './components/ProfileSelector';
import { Settings } from './pages/Settings';
import { fetchTransactions, setActiveUser, Transaction, hasPin } from './lib/api';
import { HAS_WEBHOOK_URL } from './lib/config';
import { detectUnusualCategories } from './lib/analytics';
import { pageVariants, quickEase, softSpring } from './lib/motion';
import { getTheme, applyTheme, applyAccessibleMode, getAccessibleMode, applyColorScheme } from './lib/theme';
import { fetchProfiles, Profile, getDisplayName } from './lib/profiles';
import { applyPersonalizedAppIcon, resetAppIcon } from './lib/appicon';
import { SetupPin } from './components/SetupPin';
import { ImportarExtracto } from './components/ImportarExtracto';
import { TutorialCanales } from './components/TutorialCanales';
import { BalanceWidget } from './components/BalanceWidget';

export default function App() {
  // Apply saved theme preference immediately on mount
  useEffect(() => { applyTheme(getTheme()); }, []);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userId, setUserId] = useState<string | null>(
    () => localStorage.getItem('fm_profile')
  );
  const [unlocked, setUnlocked] = useState(false);
  const [needsSetupPin, setNeedsSetupPin] = useState(false);
  const [showWelcomeImport, setShowWelcomeImport] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p === 'agregar') return 'agregar';
    return 'home';
  });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const hasAnomaly = useMemo(
    () => detectUnusualCategories(transactions).size > 0,
    [transactions]
  );
  const [dismissed, setDismissed] = useState(
    () => {
      const month = new Date().toISOString().slice(0, 7);
      return localStorage.getItem(`fm_anomaly_seen_${userId}_${month}`) === 'true';
    }
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightLatest, setHighlightLatest] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDirectImport, setShowDirectImport] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showBalanceWidget, setShowBalanceWidget] = useState(
    () => new URLSearchParams(window.location.search).get('view') === 'balance'
  );

  // Load dynamic profile list whenever no user is active (mount + every logout)
  useEffect(() => {
    if (!userId) fetchProfiles().then(setProfiles);
  }, [userId]);

  // When userId changes, register it in api.ts and check session
  useEffect(() => {
    if (userId) {
      setActiveUser(userId);
      setUnlocked(sessionStorage.getItem(`fm_unlocked_${userId}`) === '1');
    } else {
      setActiveUser(null);
      setUnlocked(false);
      setTransactions([]);
    }
  }, [userId]);

  const handleCategoryChange = useCallback((timestamp: string, categoria: string) => {
    setTransactions(prev => prev.map(tx =>
      tx.Timestamp === timestamp ? { ...tx, Categoría: categoria } : tx
    ));
  }, []);

  const handleDeleteTransaction = useCallback((timestamp: string) => {
    setTransactions(prev => prev.filter(tx => tx.Timestamp !== timestamp));
  }, []);

  const handleTransactionUpdate = useCallback((timestamp: string, data: Record<string, unknown>) => {
    setTransactions(prev => prev.map(tx =>
      tx.Timestamp === timestamp ? {
        ...tx,
        ...(data.comercio  !== undefined && { Comercio: data.comercio as string }),
        ...(data.banco     !== undefined && { Banco: data.banco as string }),
        ...(data.tipo      !== undefined && { Tipo: data.tipo as string }),
        ...(data.monto     !== undefined && { 'Monto (COP)': data.monto as number }),
        ...(data.categoria !== undefined && { Categoría: data.categoria as string }),
        ...(data.fecha     !== undefined && { Fecha: data.fecha as string }),
        ...(data.nota      !== undefined && { Nota: data.nota as string }),
      } : tx
    ));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTransactions();
      setTransactions(data);
      if (data.length === 0 && userId && !localStorage.getItem(`fm_tutorial_seen_${userId}`)) {
        setShowTutorial(true);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No pude conectar con Google Sheets');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // H-04: only fetch data after the user has authenticated
  useEffect(() => { if (unlocked) load(); }, [load, unlocked, userId]);

  // Silent background refresh — runs without showing the loading skeleton
  const silentLoad = useCallback(async () => {
    try {
      const data = await fetchTransactions();
      setTransactions(data);
    } catch { /* silently ignore */ }
  }, []);

  // Refresh when the app comes back to the foreground (e.g. after an iOS Shortcut runs)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && unlocked) silentLoad();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [silentLoad, unlocked]);

  const handleSelectProfile = useCallback(async (id: string) => {
    localStorage.setItem('fm_profile', id);
    setUserId(id);
    // Check if first-time user (no PIN set yet)
    try {
      const exists = await hasPin(id);
      if (!exists) setNeedsSetupPin(true);
    } catch { /* red de error — dejar que PinLock maneje */ }
  }, []);

  const handleUnlock = useCallback(() => {
    if (userId) {
      sessionStorage.setItem(`fm_unlocked_${userId}`, '1');
      applyAccessibleMode(userId);
      applyColorScheme(userId);
      setAccessible(getAccessibleMode(userId));
      applyPersonalizedAppIcon(userId, getDisplayName(userId));
      setUnlocked(true);
    }
  }, [userId]);

  const handleSwitchProfile = useCallback(() => {
    localStorage.removeItem('fm_profile');
    document.documentElement.dataset.mode = ''; // clear accessible mode
    resetAppIcon();
    setUserId(null);
    setUnlocked(false);
    setNeedsSetupPin(false);
    setTransactions([]);
    setAccessible(false);
  }, []);

  // Redirect out of tabs that don't exist in accessible mode
  useEffect(() => {
    if (accessible && (tab === 'analisis' || tab === 'chat')) setTab('home');
  }, [accessible, tab]);

  // Dismiss anomaly badge when Análisis tab is opened
  useEffect(() => {
    if (tab === 'analisis' && userId) {
      const month = new Date().toISOString().slice(0, 7);
      localStorage.setItem(`fm_anomaly_seen_${userId}_${month}`, 'true');
      setDismissed(true);
    }
  }, [tab, userId]);

  // Re-read dismissal state when profile changes
  useEffect(() => {
    if (userId) {
      const month = new Date().toISOString().slice(0, 7);
      setDismissed(localStorage.getItem(`fm_anomaly_seen_${userId}_${month}`) === 'true');
    }
  }, [userId]);

  return (
    <motion.div
      initial={false}
      animate={{ opacity: unlocked ? 1 : 0.88, y: unlocked ? 0 : 18 }}
      transition={softSpring}
      style={{ minHeight: '100dvh', background: 'var(--surface)', overflowY: 'auto' }}
    >
      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={quickEase}
        >
          {tab === 'home' && userId && (
            <Home
              transactions={transactions}
              loading={loading}
              error={loadError}
              missingConfig={!HAS_WEBHOOK_URL}
              highlightLatest={highlightLatest}
              onRetry={load}
              onAdd={() => setTab('agregar')}
              onViewAll={() => setTab('historial')}
              onLogout={handleSwitchProfile}
              onSettings={() => setShowSettings(true)}
              userId={userId}
            />
          )}
          {tab === 'historial' && (
            <Historial
              transactions={transactions}
              loading={loading}
              onCategoryChange={handleCategoryChange}
              onDelete={handleDeleteTransaction}
              onTransactionUpdate={handleTransactionUpdate}
            />
          )}
          {tab === 'agregar' && userId && (
            <Agregar
              transactions={transactions}
              userId={userId}
              onSaved={async () => {
              await load();
              setTab('home');
              setHighlightLatest(true);
              window.setTimeout(() => setHighlightLatest(false), 1600);
            }} />
          )}
          {tab === 'analisis' && userId && (
            <Analisis transactions={transactions} loading={loading} userId={userId} />
          )}
          {tab === 'chat' && (
            <Chat transactions={transactions} />
          )}
        </motion.main>
      </AnimatePresence>

      <BottomNav active={tab} onChange={setTab} accessibleMode={accessible} userId={userId} hasAnomaly={hasAnomaly && !dismissed} />

      <AnimatePresence>
        {!userId && (
          <ProfileSelector key="profile" profiles={profiles} onSelect={handleSelectProfile} />
        )}
        {userId && !unlocked && !needsSetupPin && (
          <PinLock key="pin" userId={userId} onUnlock={handleUnlock} onSwitchProfile={handleSwitchProfile} />
        )}
        {userId && !unlocked && needsSetupPin && (
          <SetupPin
            key="setup"
            userId={userId}
            onComplete={() => { setNeedsSetupPin(false); setShowWelcomeImport(true); handleUnlock(); }}
            onSwitchProfile={handleSwitchProfile}
          />
        )}
        {showWelcomeImport && userId && (
          <motion.div
            key="welcome-import"
            initial={{ opacity: 0, y: '4%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9995, background: 'var(--surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '32px 24px', textAlign: 'center' }}
          >
            <div style={{ fontSize: 56 }}>🎉</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-2xl)', color: 'var(--ink)' }}>
              ¡Bienvenido!
            </div>
            <div style={{ fontSize: 'var(--text-base)', color: 'var(--muted)', maxWidth: 280 }}>
              ¿Quieres cargar tus movimientos de meses anteriores? Puedes importar un CSV de tu banco ahora o hacerlo después desde Ajustes.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 300 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setShowWelcomeImport(false); setShowDirectImport(true); }}
                style={{ height: 50, background: 'var(--blue-700)', border: 'none', borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Importar ahora
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setShowWelcomeImport(false)}
                style={{ height: 50, background: 'none', border: '1px solid var(--line)', borderRadius: 14, color: 'var(--muted)', fontSize: 'var(--text-base)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                Saltar por ahora
              </motion.button>
            </div>
          </motion.div>
        )}
        {showSettings && userId && (
          <Settings key="settings" userId={userId} transactions={transactions}
            onProfilesChanged={() => fetchProfiles().then(setProfiles)}
            onCategoryChange={handleCategoryChange}
            onClose={() => {
              setShowSettings(false);
              setAccessible(getAccessibleMode(userId));
              applyPersonalizedAppIcon(userId, getDisplayName(userId));
            }} />
        )}
        {showTutorial && userId && (
          <TutorialCanales key="tutorial" userId={userId} onClose={() => setShowTutorial(false)} />
        )}
        {showDirectImport && userId && (
          <ImportarExtracto key="direct-import" userId={userId} onClose={() => setShowDirectImport(false)} />
        )}
        {showBalanceWidget && userId && unlocked && (
          <BalanceWidget
            key="balance-widget"
            transactions={transactions}
            userId={userId}
            onAdd={() => { setShowBalanceWidget(false); setTab('agregar'); }}
            onClose={() => setShowBalanceWidget(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
