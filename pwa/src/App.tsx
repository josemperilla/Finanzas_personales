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
import { registrarVisita, checkBadgesSync, BADGES, addXP, updateRacha, awardBadge } from './lib/gamification';
import { getMeta } from './lib/meta';
import { detectSubscriptions } from './lib/subscriptions';
import { verificarDesafio, getDesafioActual } from './lib/desafiosMensuales';
import { getSuenos } from './lib/suenos';
import { getRetos, computeProgress } from './lib/retos';

const Home     = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Historial = lazy(() => import('./pages/Historial').then(m => ({ default: m.Historial })));
const Agregar  = lazy(() => import('./pages/Agregar').then(m => ({ default: m.Agregar })));
const Progreso = lazy(() => import('./pages/Progreso').then(m => ({ default: m.Progreso })));
const Misiones = lazy(() => import('./pages/Misiones').then(m => ({ default: m.Misiones })));
const Explorar = lazy(() => import('./pages/Explorar').then(m => ({ default: m.Explorar })));
const Chat     = lazy(() => import('./pages/Chat').then(m => ({ default: m.Chat })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));

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
  const [nuevoBadge, setNuevoBadge] = useState<string | null>(null);
  const [xpToast, setXpToast] = useState<number | null>(null);

  // Migración: sembrar perfil actual si no hay profiles conocidos
  useEffect(() => {
    const current = localStorage.getItem('fm_profile');
    if (current && getKnownProfileIds().length === 0) addKnownProfile(current);
  }, []);

  useEffect(() => {
    if (!userId && initialInviteCode) setShowRedeem(true);
  }, [userId, initialInviteCode]);

  useEffect(() => {
    if (!userId) setProfiles(getKnownProfiles());
  }, [userId]);

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
      const processed = userId ? applyLearnings(data, userId) : data;
      setTransactions(processed);
      lastFetchRef.current = Date.now();
      if (data.length === 0 && userId && !localStorage.getItem(`fm_tutorial_seen_${userId}`)) {
        setShowTutorial(true);
      }
      if (userId) {
        registrarVisita(userId);
        const meta = getMeta(userId);
        const now = new Date();
        const gastoMes = processed
          .filter(tx => { const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T')); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
          .reduce((s, tx) => s + Number(tx['Monto (COP)'] || 0), 0);
        const isWithinBudget = meta.activo && meta.monto > 0 ? gastoMes <= meta.monto : true;
        updateRacha(userId, isWithinBudget);
        const subs = detectSubscriptions(processed);
        const suenos = getSuenos(userId).filter(s => s.activo);
        const retos = getRetos(userId);
        const retosCompletados = retos.filter(r => computeProgress(r, processed).completed).length;
        const nuevos = checkBadgesSync(userId, suenos, retosCompletados, subs.length);
        if (nuevos.length > 0) {
          setNuevoBadge(nuevos[0]);
          setTimeout(() => setNuevoBadge(null), 4500);
        }

        // Verificar desafío mensual
        const desafioGanado = verificarDesafio(userId, processed);
        if (desafioGanado) {
          const desafio = getDesafioActual();
          if (desafio) {
            awardBadge(userId, desafio.badgeId);
            setTimeout(() => {
              setNuevoBadge(desafio.badgeId);
              setTimeout(() => setNuevoBadge(null), 4500);
            }, nuevos.length > 0 ? 5000 : 0); // stagger if other badge already showing
          }
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No pude conectar con Google Sheets');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (unlocked) load(); }, [load, unlocked, userId]);

  const silentLoad = useCallback(async () => {
    if (Date.now() - lastFetchRef.current < 30_000) return;
    try {
      const data = await fetchTransactions();
      setTransactions(userId ? applyLearnings(data, userId) : data);
      lastFetchRef.current = Date.now();
    } catch { /* silently ignore */ }
  }, []);

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
    try {
      const exists = await hasPin(id);
      if (!exists) setNeedsSetupPin(true);
    } catch { /* red de error */ }
  }, []);

  const handleRedeemed = useCallback(async (newUserId: string, displayName: string, code: string) => {
    setShowRedeem(false);
    setInitialInviteCode('');
    setRedeemCode(code);
    localStorage.setItem('fm_profile', newUserId);
    setUserId(newUserId);
    setOnboardDisplayName(displayName);
    try {
      const exists = await hasPin(newUserId);
      setNeedsSetupPin(!exists);
    } catch { setNeedsSetupPin(true); }
  }, []);

  const handleUnlock = useCallback(() => {
    if (userId) {
      sessionStorage.setItem(`fm_unlocked_${userId}`, '1');
      addKnownProfile(userId);
      applyAccessibleMode(userId);
      applyColorScheme(userId);
      setAccessible(getAccessibleMode(userId));
      applyPersonalizedAppIcon(userId, getDisplayName(userId));
      registrarVisita(userId);
      setUnlocked(true);
    }
  }, [userId]);

  const handleSwitchProfile = useCallback(() => {
    localStorage.removeItem('fm_profile');
    document.documentElement.dataset.mode = '';
    resetAppIcon();
    setUserId(null);
    setUnlocked(false);
    setNeedsSetupPin(false);
    setTransactions([]);
    setAccessible(false);
  }, []);

  // Dismiss anomaly badge when Explorar tab is opened
  useEffect(() => {
    if (tab === 'explorar' && userId) {
      const month = new Date().toISOString().slice(0, 7);
      localStorage.setItem(`fm_anomaly_seen_${userId}_${month}`, 'true');
      setDismissed(true);
    }
  }, [tab, userId]);

  useEffect(() => {
    if (userId) {
      const month = new Date().toISOString().slice(0, 7);
      setDismissed(localStorage.getItem(`fm_anomaly_seen_${userId}_${month}`) === 'true');
    }
  }, [userId]);

  const showXpToast = useCallback((xp: number) => {
    setXpToast(xp);
    setTimeout(() => setXpToast(null), 2200);
  }, []);

  const showBadgeToast = useCallback((badgeId: string) => {
    setNuevoBadge(badgeId);
    setTimeout(() => setNuevoBadge(null), 4500);
  }, []);

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
            {tab === 'progreso' && userId && (
              <Progreso userId={userId} transactions={transactions} />
            )}
            {tab === 'misiones' && userId && (
              <Misiones
                transactions={transactions}
                userId={userId}
                onNewBadge={showBadgeToast}
                onXpGanado={showXpToast}
              />
            )}
            {tab === 'explorar' && userId && (
              <Explorar
                transactions={transactions}
                loading={loading}
                userId={userId}
                onViewHistorial={() => setTab('historial')}
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
                  // Otorgar XP por registrar transacción
                  addXP(userId, 'registrarTransaccion');
                  showXpToast(5);
                  await load();
                  setTab('home');
                  setHighlightLatest(true);
                  window.setTimeout(() => setHighlightLatest(false), 1600);
                }}
              />
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
            onFinish={() => {
              setShowOnboarding(false);
              setOnboardDisplayName(null);
              // Redirigir a Progreso para que vean su perfil creado
              setTab('progreso');
            }}
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

        {/* Toast de XP al guardar transacción */}
        {xpToast !== null && (
          <motion.div
            key="xp-toast"
            initial={{ opacity: 0, y: 0, scale: 0.9 }}
            animate={{ opacity: 1, y: -20, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.9 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed',
              bottom: 'calc(100px + env(safe-area-inset-bottom))',
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 9997,
              background: '#15803d',
              borderRadius: 999, padding: '8px 18px',
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 4px 16px rgba(21,128,61,0.35)',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff' }}>
              +{xpToast} XP
            </span>
          </motion.div>
        )}

        {/* Toast de badge desbloqueado */}
        {nuevoBadge && BADGES[nuevoBadge] && (
          <motion.div
            key="badge-toast"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))',
              left: '50%', transform: 'translateX(-50%)',
              zIndex: 9996, width: 'calc(100% - 48px)', maxWidth: 360,
              background: 'var(--ink)', borderRadius: 16,
              padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 8px 32px rgba(15,23,42,0.28)',
            }}
          >
            <span style={{ fontSize: 28, flexShrink: 0 }}>{BADGES[nuevoBadge].emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 1 }}>
                ¡Insignia desbloqueada!
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, color: '#fff' }}>
                {BADGES[nuevoBadge].nombre}
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setNuevoBadge(null)}
              style={{ flexShrink: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 20, cursor: 'pointer', padding: '4px 2px' }}
            >
              ×
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
