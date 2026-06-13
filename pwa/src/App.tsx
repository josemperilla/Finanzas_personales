import { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav, Tab } from './components/BottomNav';
import { PinLock } from './components/PinLock';
import { ProfileSelector } from './components/ProfileSelector';
import { fetchTransactions, setActiveUser, Transaction, hasPin } from './lib/api';
import { HAS_WEBHOOK_URL } from './lib/config';
import { detectUnusualCategories } from './lib/analytics';
import { pageVariants, quickEase, softSpring } from './lib/motion';
import { getTheme, applyTheme, applyAccessibleMode, getAccessibleMode, applyColorScheme } from './lib/theme';
import { applyLearnings } from './lib/merchantLearning';
import { Profile, getDisplayName, getKnownProfiles, addKnownProfile, getKnownProfileIds } from './lib/profiles';
import { applyPersonalizedAppIcon, resetAppIcon } from './lib/appicon';
import { SetupPin } from './components/SetupPin';
import { TutorialCanales } from './components/TutorialCanales';
import { InviteRedeem } from './components/InviteRedeem';
import { Onboarding } from './components/Onboarding';
import { BalanceWidget } from './components/BalanceWidget';
import { Skeleton } from './components/ui/primitives';

const Home = lazy(() => import('./pages/Home').then(module => ({ default: module.Home })));
const Historial = lazy(() => import('./pages/Historial').then(module => ({ default: module.Historial })));
const Agregar = lazy(() => import('./pages/Agregar').then(module => ({ default: module.Agregar })));
const Analisis = lazy(() => import('./pages/Analisis').then(module => ({ default: module.Analisis })));
const Chat = lazy(() => import('./pages/Chat').then(module => ({ default: module.Chat })));
const Settings = lazy(() => import('./pages/Settings').then(module => ({ default: module.Settings })));

function PageFallback() {
  return (
    <div className="app-page" aria-label="Cargando pantalla" style={{ padding: 'max(24px, env(safe-area-inset-top)) 16px 110px' }}>
      <Skeleton height={18} style={{ width: 90, marginBottom: 8 }} />
      <Skeleton height={34} style={{ width: 180, marginBottom: 24 }} />
      <Skeleton height={190} radius={24} style={{ marginBottom: 14 }} />
      <Skeleton height={88} radius={20} style={{ marginBottom: 12 }} />
      <Skeleton height={88} radius={20} />
    </div>
  );
}

export default function App() {
  // Apply saved theme preference immediately on mount
  useEffect(() => { applyTheme(getTheme()); }, []);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userId, setUserId] = useState<string | null>(
    () => localStorage.getItem('fm_profile')
  );
  const [unlocked, setUnlocked] = useState(false);
  const [needsSetupPin, setNeedsSetupPin] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardDisplayName, setOnboardDisplayName] = useState<string | null>(null);
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [initialInviteCode, setInitialInviteCode] = useState(
    () => new URLSearchParams(window.location.search).get('invite') || ''
  );
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
  const lastFetchRef = useRef<number>(0);
  const [highlightLatest, setHighlightLatest] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [accessible, setAccessible] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showBalanceWidget, setShowBalanceWidget] = useState(
    () => new URLSearchParams(window.location.search).get('view') === 'balance'
  );
  const [showWelcomeToast, setShowWelcomeToast] = useState(false);

  // Migración: un dispositivo ya logueado antes de esta versión no tiene
  // fm_known_profiles — sembrar con su perfil actual para que no caiga a la
  // landing vacía.
  useEffect(() => {
    const current = localStorage.getItem('fm_profile');
    if (current && getKnownProfileIds().length === 0) addKnownProfile(current);
  }, []);

  // Auto-abrir la redención si llegan con ?invite=CODE
  useEffect(() => {
    if (!userId && initialInviteCode) setShowRedeem(true);
  }, [userId, initialInviteCode]);

  // Lista de perfiles de la landing: solo los conocidos por ESTE dispositivo
  // (datos locales, sin red ni listUsers admin-only).
  useEffect(() => {
    if (!userId) setProfiles(getKnownProfiles());
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
      setTransactions(userId ? applyLearnings(data, userId) : data);
      lastFetchRef.current = Date.now();
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

  // Silent background refresh — skipped if data was fetched less than 30s ago
  const silentLoad = useCallback(async () => {
    if (Date.now() - lastFetchRef.current < 30_000) return;
    try {
      const data = await fetchTransactions();
      setTransactions(userId ? applyLearnings(data, userId) : data);
      lastFetchRef.current = Date.now();
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

  const handleRedeemed = useCallback(async (newUserId: string, displayName: string, code: string) => {
    setShowRedeem(false);
    setInitialInviteCode('');
    setRedeemCode(code); // SetupPin lo envía para vincularse a la invitación (fix H1)
    localStorage.setItem('fm_profile', newUserId);
    setUserId(newUserId);
    setOnboardDisplayName(displayName);
    try {
      const exists = await hasPin(newUserId);
      setNeedsSetupPin(!exists); // tras redimir, normalmente no tiene PIN aún
    } catch { setNeedsSetupPin(true); }
  }, []);

  const handleUnlock = useCallback(() => {
    if (userId) {
      sessionStorage.setItem(`fm_unlocked_${userId}`, '1');
      addKnownProfile(userId); // recordar este perfil en este dispositivo
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
          className="app-page"
          key={tab}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={quickEase}
        >
          <Suspense fallback={<PageFallback />}>
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
              userId={userId ?? ''}
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
          </Suspense>
        </motion.main>
      </AnimatePresence>

      {unlocked && userId && createPortal(
        <BottomNav active={tab} onChange={setTab} accessibleMode={accessible} userId={userId} hasAnomaly={hasAnomaly && !dismissed} />,
        document.body
      )}

      <AnimatePresence>
        {!userId && !showRedeem && (
          <ProfileSelector key="profile" profiles={profiles} onSelect={handleSelectProfile} onRedeemInvite={() => setShowRedeem(true)} />
        )}
        {!userId && showRedeem && (
          <InviteRedeem
            key="redeem"
            initialCode={initialInviteCode}
            onRedeemed={handleRedeemed}
            onCancel={() => { setShowRedeem(false); setInitialInviteCode(''); }}
          />
        )}
        {userId && !unlocked && !needsSetupPin && (
          <PinLock key="pin" userId={userId} onUnlock={handleUnlock} onSwitchProfile={handleSwitchProfile} />
        )}
        {userId && !unlocked && needsSetupPin && (
          <SetupPin
            key="setup"
            userId={userId}
            inviteCode={redeemCode || undefined}
            onComplete={() => { setNeedsSetupPin(false); setRedeemCode(''); handleUnlock(); setShowOnboarding(true); }}
            onSwitchProfile={handleSwitchProfile}
          />
        )}
        {showOnboarding && userId && (
          <Onboarding
            key="onboarding"
            userId={userId}
            initialDisplayName={onboardDisplayName ?? undefined}
            onFinish={() => { setShowOnboarding(false); setOnboardDisplayName(null); setShowWelcomeToast(true); setTimeout(() => setShowWelcomeToast(false), 5000); }}
          />
        )}
        {showSettings && userId && (
          <Suspense fallback={null}>
            <Settings key="settings" userId={userId} transactions={transactions}
              onProfilesChanged={() => setProfiles(getKnownProfiles())}
              onCategoryChange={handleCategoryChange}
              onClose={() => {
                setShowSettings(false);
                setAccessible(getAccessibleMode(userId));
                applyPersonalizedAppIcon(userId, getDisplayName(userId));
              }} />
          </Suspense>
        )}
        {showTutorial && userId && (
          <TutorialCanales key="tutorial" userId={userId} onClose={() => setShowTutorial(false)} />
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
        {showWelcomeToast && (
          <motion.div
            key="welcome-toast"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))',
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 9995, width: 'calc(100% - 48px)', maxWidth: 360,
              background: 'var(--ink)', borderRadius: 16,
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              boxShadow: '0 8px 32px rgba(15,23,42,0.28)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 2 }}>
                ¡Bienvenido/a!
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.4 }}>
                Añade tu primera transacción para empezar.
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => { setShowWelcomeToast(false); setTab('agregar'); }}
              style={{
                flexShrink: 0, height: 36, padding: '0 14px',
                background: 'var(--blue-500, #3b82f6)', border: 'none', borderRadius: 10,
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              Añadir
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
