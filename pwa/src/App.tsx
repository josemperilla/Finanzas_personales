import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BottomNav, Tab } from './components/BottomNav';
import { Home } from './pages/Home';
import { Historial } from './pages/Historial';
import { Agregar } from './pages/Agregar';
import { Analisis } from './pages/Analisis';
import { Chat } from './pages/Chat';
import { fetchTransactions, Transaction } from './lib/api';
import { pageVariants, quickEase } from './lib/motion';

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTransactions();
      setTransactions(data);
    } catch {
      // fail silently — empty state shown
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <Home transactions={transactions} loading={loading} onViewAll={() => setTab('historial')} />
          )}
          {tab === 'historial' && (
            <Historial transactions={transactions} loading={loading} />
          )}
          {tab === 'agregar' && (
            <Agregar onSaved={() => { load(); setTab('home'); }} />
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
    </div>
  );
}
