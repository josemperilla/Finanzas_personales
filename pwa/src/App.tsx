import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav, Tab } from './components/BottomNav';
import { Home } from './pages/Home';
import { Historial } from './pages/Historial';
import { Agregar } from './pages/Agregar';
import { Analisis } from './pages/Analisis';
import { Chat } from './pages/Chat';
import { PinLock } from './components/PinLock';
import { fetchTransactions, Transaction } from './lib/api';
import { HAS_WEBHOOK_URL } from './lib/config';
import { pageVariants, quickEase } from './lib/motion';

export default function App() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('fm_unlocked') === '1');
  const [tab, setTab] = useState<Tab>('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlightLatest, setHighlightLatest] = useState(false);

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

  useEffect(() => { load(); }, [load]);

  const handleUnlock = useCallback(() => {
    sessionStorage.setItem('fm_unlocked', '1');
    setUnlocked(true);
  }, []);

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface)', overflowY: 'auto' }}>
      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={quickEase}
        >
          {tab === 'home' && (
            <Home
              transactions={transactions}
              loading={loading}
              error={loadError}
              missingConfig={!HAS_WEBHOOK_URL}
              highlightLatest={highlightLatest}
              onRetry={load}
              onAdd={() => setTab('agregar')}
              onViewAll={() => setTab('historial')}
            />
          )}
          {tab === 'historial' && (
            <Historial transactions={transactions} loading={loading} />
          )}
          {tab === 'agregar' && (
            <Agregar onSaved={async () => {
              await load();
              setTab('home');
              setHighlightLatest(true);
              window.setTimeout(() => setHighlightLatest(false), 1600);
            }} />
          )}
          {tab === 'analisis' && (
            <Analisis transactions={transactions} loading={loading} />
          )}
          {tab === 'chat' && (
            <Chat transactions={transactions} />
          )}
        </motion.main>
      </AnimatePresence>

      <BottomNav active={tab} onChange={setTab} />

      <AnimatePresence>
        {!unlocked && <PinLock onUnlock={handleUnlock} />}
      </AnimatePresence>
    </div>
  );
}
