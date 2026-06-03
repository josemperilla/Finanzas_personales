import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav, Tab } from './components/BottomNav';
import { Home } from './pages/Home';
import { Historial } from './pages/Historial';
import { Agregar } from './pages/Agregar';
import { Analisis } from './pages/Analisis';
import { Chat } from './pages/Chat';
import { PinLock } from './components/PinLock';
import { ProfileSelector } from './components/ProfileSelector';
import { fetchTransactions, setActiveUser, Transaction } from './lib/api';
import { HAS_WEBHOOK_URL } from './lib/config';
import { pageVariants, quickEase, softSpring } from './lib/motion';

export default function App() {
  const [userId, setUserId] = useState<string | null>(
    () => localStorage.getItem('fm_profile')
  );
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightLatest, setHighlightLatest] = useState(false);

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
      } : tx
    ));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchTransactions();
      setTransactions(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'No pude conectar con Google Sheets');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const handleSelectProfile = useCallback((id: string) => {
    localStorage.setItem('fm_profile', id);
    setUserId(id);
  }, []);

  const handleUnlock = useCallback(() => {
    if (userId) {
      sessionStorage.setItem(`fm_unlocked_${userId}`, '1');
      setUnlocked(true);
    }
  }, [userId]);

  const handleSwitchProfile = useCallback(() => {
    localStorage.removeItem('fm_profile');
    setUserId(null);
    setUnlocked(false);
    setTransactions([]);
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

      <BottomNav active={tab} onChange={setTab} />

      <AnimatePresence>
        {!userId && (
          <ProfileSelector key="profile" onSelect={handleSelectProfile} />
        )}
        {userId && !unlocked && (
          <PinLock key="pin" userId={userId} onUnlock={handleUnlock} onSwitchProfile={handleSwitchProfile} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
