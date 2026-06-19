import { AnimatePresence, motion } from 'framer-motion';
import { useState, useRef, useEffect, useMemo } from 'react';
import { MonthRecapModal } from '../components/MonthRecapModal';
import { Transaction, isGasto, isIncomeTx, INCOME_CATEGORY, Card, getUnknownCards } from '../lib/api';
import { getProfile, getUserNickname, getUserAvatar, getDisplayName } from '../lib/profiles';
import { formatCOP, formatDateShort } from '../lib/utils';
import { getCategoryColor, CATEGORIES } from '../lib/config';
import { DonutChart } from '../components/DonutChart';
import { CategorySheet } from '../components/CategorySheet';
import { Blobs } from '../components/ui/Blobs';
import { ConnectionNotice } from '../components/ui/ConnectionNotice';
import { FriendlyEmptyState } from '../components/ui/FriendlyEmptyState';
import { cleanMerchant } from '../lib/merchantCleaner';
import { getMerchantDomain } from '../lib/merchantLogos';
import { MerchantLogo } from '../components/ui/MerchantLogo';
import { useCountUp } from '../lib/useCountUp';
import { quickEase, riseItem, softSpring, staggerContainer } from '../lib/motion';
import { RachaDisplay } from '../components/RachaDisplay';
import { DailyGreeting } from '../components/DailyGreeting';
import { DailyStatusCard } from '../components/DailyStatusCard';
import { getGamification } from '../lib/gamification';
import { RetoWidget } from '../components/RetoWidget';
import { SuenoCard } from '../components/SuenoCard';
import { MetaMensualWidget } from '../components/MetaMensualWidget';
import { getSuenos, generarRetosParaSueno } from '../lib/suenos';
import { getRetos, computeProgress } from '../lib/retos';
import { getDesafioActual, getDesafioProgress, getDesafioCompletado } from '../lib/desafiosMensuales';

interface Props {
  transactions: Transaction[];
  loading: boolean;
  error?: string | null;
  missingConfig?: boolean;
  highlightLatest?: boolean;
  onRetry?: () => void;
  onAdd: () => void;
  onViewAll: () => void;
  onLogout?: () => void;
  onSettings?: () => void;
  userId: string;
  gamificationKey?: number;
  cards?: Card[];
  onManageCards?: () => void;
  onRegisterUnknown?: (banco: string, ultimos4: string) => void;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir < 0 ? -64 : 64, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 64 : -64, opacity: 0 }),
};

function buildDailyCumulative(txs: Transaction[], year: number, month: number, maxDays: number): number[] {
  const daily = new Array<number>(maxDays).fill(0);
  for (const tx of txs.filter(isGasto)) {
    const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
    if (d.getMonth() === month && d.getFullYear() === year) {
      const day = d.getDate() - 1;
      if (day < maxDays) daily[day] += Number(tx['Monto (COP)'] || 0);
    }
  }
  for (let i = 1; i < daily.length; i++) daily[i] += daily[i - 1];
  return daily;
}

export function Home({ transactions, loading, error, missingConfig, highlightLatest, onRetry, onAdd, onViewAll, onLogout, onSettings, userId, gamificationKey, cards = [], onManageCards, onRegisterUnknown }: Props) {
  const now = new Date();
  const [selectedOffset, setSelectedOffset] = useState(0);
  const [direction, setDirection] = useState(0);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [showRecap, setShowRecap] = useState(false);
  const [unknownBannerDismissed, setUnknownBannerDismissed] = useState(
    () => sessionStorage.getItem(`fm_unknown_cards_dismissed_${userId}`) === '1'
  );

  const unknownCards = useMemo(
    () => (!loading && cards.length >= 0) ? getUnknownCards(transactions, cards) : [],
    [transactions, cards, loading]
  );

  useEffect(() => {
    if (loading) return;
    const now = new Date();
    if (now.getDate() !== 1) return;
    const key = `fm_recap_seen_${userId}`;
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (localStorage.getItem(key) === thisMonth) return;
    localStorage.setItem(key, thisMonth);
    setShowRecap(true);
  }, [loading, userId]);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const selDate = new Date(now.getFullYear(), now.getMonth() + selectedOffset, 1);
  const selMonth = selDate.getMonth();
  const selYear = selDate.getFullYear();

  const currentMonthStr = now.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const selMonthStr = selDate.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

  const prevMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const monthTx = useMemo(
    () => transactions.filter(tx => {
      const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
      return d.getMonth() === selMonth && d.getFullYear() === selYear;
    }),
    [transactions, selMonth, selYear],
  );
  const totalMonth = useMemo(
    () => monthTx.filter(isGasto).reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
    [monthTx],
  );

  const prevTx = useMemo(
    () => transactions.filter(tx => {
      const d = new Date((tx.Fecha || tx.Timestamp).replace(' ', 'T'));
      return d.getMonth() === prevMonthIdx && d.getFullYear() === prevYear;
    }),
    [transactions, prevMonthIdx, prevYear],
  );
  const totalPrev = useMemo(
    () => prevTx.filter(isGasto).reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
    [prevTx],
  );
  const diff = totalPrev > 0 ? ((totalMonth - totalPrev) / totalPrev) * 100 : 0;

  const incomeMonth = useMemo(
    () => monthTx.filter(isIncomeTx).reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
    [monthTx],
  );
  const incomePrev = useMemo(
    () => prevTx.filter(isIncomeTx).reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
    [prevTx],
  );
  const balanceMonth = incomeMonth - totalMonth;
  const balancePrev = incomePrev - totalPrev;
  const balanceDiff = balancePrev !== 0 ? ((balanceMonth - balancePrev) / Math.abs(balancePrev)) * 100 : 0;
  const animatedBalance = useCountUp(loading ? 0 : balanceMonth);

  const retosProgress = useMemo(
    () => getRetos(userId).map(r => computeProgress(r, transactions)),
    [userId, transactions],
  );

  const primerRetoActivo = useMemo(
    () => retosProgress.find(p => !p.completed && !p.failed) ?? null,
    [retosProgress],
  );

  const primerSueno = useMemo(
    () => getSuenos(userId).filter(s => s.activo)[0] ?? null,
    [userId],
  );

  const racha = useMemo(() => getGamification(userId).racha, [userId, gamificationKey]);

  const rachaEnRiesgo = useMemo(() => {
    const hora = new Date().getHours();
    if (hora < 18) return false;
    const hoy = new Date().toISOString().slice(0, 10);
    return !transactions.some(tx => (tx.Fecha || tx.Timestamp || '').slice(0, 10) === hoy);
  }, [transactions]);

  const desafioActual = useMemo(() => getDesafioActual(), []);
  const desafioProgress = useMemo(
    () => desafioActual ? getDesafioProgress(userId, transactions) : null,
    [userId, transactions, desafioActual],
  );
  const desafioCompletadoHoy = useMemo(
    () => desafioActual ? getDesafioCompletado(userId) : false,
    [userId, desafioActual],
  );

  const retosParaPrimerSueno = useMemo(
    () => primerSueno ? generarRetosParaSueno(primerSueno, transactions) : [],
    [primerSueno, transactions],
  );

  const byCategory = useMemo(
    () => CATEGORIES.map(cat => ({
      category: cat.name,
      amount: monthTx
        .filter(tx => tx.Categoría === cat.name)
        .reduce((sum, tx) => sum + Number(tx['Monto (COP)'] || 0), 0),
    })).filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount),
    [monthTx],
  );

  const recent = useMemo(
    () => [...monthTx]
      .sort((a, b) => {
        const da = new Date((a.Fecha || a.Timestamp).replace(' ', 'T'));
        const db = new Date((b.Fecha || b.Timestamp).replace(' ', 'T'));
        return db.getTime() - da.getTime();
      })
      .slice(0, 5),
    [monthTx],
  );

  const animatedTotal = useCountUp(loading ? 0 : totalMonth);

  const dayOfMonth = now.getDate();

  const daysInSelMonth = new Date(selYear, selMonth + 1, 0).getDate();
  const selDays = selectedOffset === 0 ? dayOfMonth : daysInSelMonth;
  const compDate = new Date(selYear, selMonth - 1, 1);
  const compChartMonth = compDate.getMonth();
  const compChartYear = compDate.getFullYear();
  const daysInCompMonth = new Date(compChartYear, compChartMonth + 1, 0).getDate();
  const compDays = selectedOffset === 0 ? Math.min(dayOfMonth, daysInCompMonth) : daysInCompMonth;
  const selCumulative = useMemo(
    () => buildDailyCumulative(transactions, selYear, selMonth, selDays),
    [transactions, selYear, selMonth, selDays],
  );
  const compCumulative = useMemo(
    () => buildDailyCumulative(transactions, compChartYear, compChartMonth, compDays),
    [transactions, compChartYear, compChartMonth, compDays],
  );
  const showSpendLine = !loading && (selCumulative.some(v => v > 0) || compCumulative.some(v => v > 0));

  const navigate = (delta: number) => {
    const next = Math.min(0, Math.max(-11, selectedOffset + delta));
    if (next !== selectedOffset) {
      setDirection(delta);
      setSelectedOffset(next);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > dy && Math.abs(dx) > 44) navigate(dx < 0 ? 1 : -1);
  };

  const firstName = (getUserNickname(userId) || getProfile(userId)?.name || userId).split(' ')[0];
  const timeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', paddingBottom: '100px', position: 'relative', overflow: 'hidden' }}>
      <Blobs variant="a" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={quickEase}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'max(20px, env(safe-area-inset-top)) 20px 0',
          marginBottom: 18, position: 'relative',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontFamily: 'var(--font-body)', lineHeight: 1.2 }}>
            {timeGreeting()},
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {firstName}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RachaDisplay userId={userId} gamificationKey={gamificationKey} />
          <ProfileAvatar userId={userId} onLogout={onLogout} onSettings={onSettings} />
        </div>
      </motion.div>

      <AnimatePresence>
        {missingConfig && (
          <ConnectionNotice message="Falta configurar WEBHOOK_URL en el servidor para conectar con Google Sheets." />
        )}
        {!missingConfig && error && (
          <ConnectionNotice message={error || 'No pude conectar con Google Sheets.'} onRetry={onRetry} />
        )}
      </AnimatePresence>

      <motion.div variants={staggerContainer} initial="initial" animate="animate" style={{ padding: '0 16px', position: 'relative' }}>

        {/* Saludo diario — aparece una vez por día */}
        {!loading && selectedOffset === 0 && (
          <DailyGreeting
            userId={userId}
            racha={racha}
            retoActivo={primerRetoActivo ? { titulo: primerRetoActivo.reto.titulo } : null}
          />
        )}

        {/* Alerta racha en riesgo — después de las 6pm sin transacciones de hoy */}
        {!loading && selectedOffset === 0 && rachaEnRiesgo && racha > 0 && (
          <motion.div variants={riseItem} transition={quickEase}>
            <div style={{
              background: '#fef3c7',
              border: '1.5px solid #f59e0b',
              borderRadius: 'var(--r-xl)',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
              <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                Tu racha de {racha} días se rompe hoy si no registras algo
              </span>
            </div>
          </motion.div>
        )}

        {/* Banner productos desconocidos */}
        {!loading && !unknownBannerDismissed && unknownCards.length > 0 && (
          <motion.div variants={riseItem} transition={quickEase}>
            <div style={{
              background: 'rgba(37,99,235,0.07)',
              border: '1.5px solid rgba(37,99,235,0.22)',
              borderRadius: 'var(--r-xl)',
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 14,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>💳</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 700, marginBottom: 2 }}>
                  {unknownCards.length === 1
                    ? '1 producto sin registrar'
                    : `${unknownCards.length} productos sin registrar`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Tienes transacciones de {unknownCards[0].tarjetaCuenta}
                  {unknownCards.length > 1 ? ` y ${unknownCards.length - 1} más` : ''} sin identificar.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => onRegisterUnknown?.(unknownCards[0].banco, unknownCards[0].ultimos4)}
                  style={{
                    padding: '6px 12px', borderRadius: 10, border: 'none',
                    background: 'var(--blue-700)', color: '#fff',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Registrar
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => {
                    sessionStorage.setItem(`fm_unknown_cards_dismissed_${userId}`, '1');
                    setUnknownBannerDismissed(true);
                  }}
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: 'none',
                    background: 'var(--surface)', color: 'var(--muted)',
                    fontSize: 16, cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  aria-label="Descartar"
                >
                  ×
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 1. Donut chart card — protagonista */}
        <motion.div
          variants={riseItem}
          transition={quickEase}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{
            background: 'var(--card)', borderRadius: 24,
            border: '1px solid var(--line)',
            padding: 22, boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)',
            marginBottom: 14, overflow: 'hidden',
            touchAction: 'pan-y',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => navigate(-1)} disabled={selectedOffset <= -11}
                style={{ background: 'none', border: 'none', cursor: selectedOffset <= -11 ? 'default' : 'pointer', color: selectedOffset <= -11 ? 'rgba(100,116,139,0.28)' : 'var(--muted)', fontSize: 22, padding: '0 6px', display: 'flex', alignItems: 'center', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>
                ‹
              </motion.button>
              <motion.span key={selectedOffset} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={quickEase}
                style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink)', minWidth: 86, textAlign: 'center' }}>
                {selectedOffset === 0
                  ? 'Gastos de ' + new Date().toLocaleString('es-CO', { month: 'long' })
                  : selMonthStr}
              </motion.span>
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => navigate(1)} disabled={selectedOffset >= 0}
                style={{ background: 'none', border: 'none', cursor: selectedOffset >= 0 ? 'default' : 'pointer', color: selectedOffset >= 0 ? 'rgba(100,116,139,0.28)' : 'var(--muted)', fontSize: 22, padding: '0 6px', display: 'flex', alignItems: 'center', lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>
                ›
              </motion.button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {!loading && totalPrev > 0 && selectedOffset === 0 && (
                <motion.span initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={softSpring}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 999, background: diff <= 0 ? 'var(--good-soft)' : '#fee2e2', color: diff <= 0 ? 'var(--good)' : '#b91c1c', fontSize: 11, fontWeight: 600 }}>
                  {diff <= 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(0)}%
                </motion.span>
              )}
              <motion.button whileTap={{ scale: 0.93 }} onClick={onViewAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--blue-700)', fontFamily: 'var(--font-body)', padding: '4px 0' }}>
                Ver todo
              </motion.button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Spinner />
            </div>
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={selectedOffset}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <DonutChart slices={byCategory} total={totalMonth} centerLabel="Gastado este mes" onSliceClick={setDrillCategory} />
                {showSpendLine && (
                  <DailySpendLine current={selCumulative} previous={compCumulative} daysInMonth={daysInSelMonth} />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>

        {/* 2. Desafío mensual — blue gradient */}
        {!loading && selectedOffset === 0 && desafioActual && desafioProgress && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <div style={{
              background: desafioCompletadoHoy
                ? 'linear-gradient(100deg, #15803d 0%, #16a34a 100%)'
                : 'linear-gradient(100deg, var(--blue) 0%, #1d4fd0 100%)',
              borderRadius: 20, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'rgba(255,255,255,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14 }}>{desafioActual.emoji}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: 'var(--orange-2)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>Reto activo</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: '#fff' }}>{desafioActual.titulo}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: '#fff', flexShrink: 0 }}>{desafioProgress.texto}</span>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,.2)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(desafioProgress.pct * 100, 100)}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', background: 'var(--orange-2)', borderRadius: 999 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* 3. Balance compacto */}
        {!loading && incomeMonth > 0 && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 18 }}>
            <div style={{
              background: 'var(--card)', border: '1px solid var(--line)',
              borderRadius: 18, padding: '14px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              boxShadow: '0 1px 2px rgba(16,18,28,.04)',
            }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 2 }}>Balance del mes</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color: 'var(--ink)', letterSpacing: '-0.01em', lineHeight: 1 }}>
                  {formatCOP(animatedBalance)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {balancePrev !== 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: balanceDiff >= 0 ? 'var(--good-soft)' : '#fee2e2', color: balanceDiff >= 0 ? 'var(--good)' : '#b91c1c', fontSize: 11.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999 }}>
                    <span style={{ fontSize: 9 }}>{balanceDiff >= 0 ? '▲' : '▼'}</span> {Math.abs(balanceDiff).toFixed(1)}%
                  </span>
                )}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>vs. mes anterior</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 4. DailyStatusCard */}
        {!loading && selectedOffset === 0 && (
          <motion.div variants={riseItem} transition={quickEase}>
            <DailyStatusCard
              userId={userId}
              monthTx={monthTx}
              retosProgress={retosProgress}
            />
          </motion.div>
        )}

        {/* 5. Meta mensual */}
        {!loading && selectedOffset === 0 && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <MetaMensualWidget monthTx={monthTx} userId={userId} />
          </motion.div>
        )}

        {/* Primer reto activo (compacto) */}
        {!loading && primerRetoActivo && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <RetoWidget progress={primerRetoActivo} />
          </motion.div>
        )}

        {/* Primer sueño activo (compacto) */}
        {!loading && primerSueno && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <SuenoCard sueno={primerSueno} retosParaSueno={retosParaPrimerSueno} compact />
          </motion.div>
        )}

        {/* Mis productos */}
        {!loading && onManageCards && (
          <motion.div variants={riseItem} transition={quickEase} style={{ marginBottom: 14 }}>
            <div style={{
              background: 'var(--card)', borderRadius: 'var(--r-xl)',
              boxShadow: 'var(--shadow-card)', padding: '14px 16px',
              border: '1px solid var(--line)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: cards.length > 0 ? 12 : 0 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Mis productos</span>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={onManageCards}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--blue-700)',
                    padding: '4px 0', fontFamily: 'var(--font-body)',
                  }}
                >
                  {cards.length === 0 ? 'Registrar' : 'Ver todos'}
                </motion.button>
              </div>
              {cards.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>
                  Registra tus tarjetas y cuentas para identificar cada transacción.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cards.slice(0, 3).map(card => (
                    <div key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        background: 'var(--blue-700)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>
                          {card.banco.charAt(0)}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {card.alias || card.banco}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                          {card.chasis} · **** {card.ultimos4}
                        </div>
                      </div>
                    </div>
                  ))}
                  {cards.length > 3 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', paddingTop: 4 }}>
                      +{cards.length - 3} más
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Últimas 5 transacciones */}
        <motion.div variants={riseItem} transition={quickEase}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>Movimientos</span>
            <motion.button whileTap={{ scale: 0.96 }} onClick={onViewAll} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--blue-700)',
              padding: '8px 0', fontFamily: 'var(--font-body)',
              minHeight: 'var(--touch-min)',
            }}>
              Ver todo
            </motion.button>
          </div>

          {loading ? (
            [1,2,3].map(i => <SkeletonCard key={i} />)
          ) : recent.length === 0 ? (
            <FriendlyEmptyState
              title="Sin movimientos"
              message={selectedOffset === 0
                ? 'Agrega una transacción manual o conecta tus SMS para empezar a ver tu mes en vivo.'
                : `No hay transacciones registradas en ${selMonthStr}.`}
              actionLabel={selectedOffset === 0 ? 'Agregar transacción' : undefined}
              onAction={selectedOffset === 0 ? onAdd : undefined}
            />
          ) : (
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={`txs-${selectedOffset}`}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: 'var(--card)', borderRadius: 24, border: '1px solid var(--line)', boxShadow: '0 1px 2px rgba(16,18,28,.04), 0 10px 26px rgba(16,18,28,.07)', padding: '4px 16px' }}
              >
                {recent.map((tx, i) => (
                  <div key={i}>
                    {i > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                    <TxRow tx={tx} highlighted={Boolean(highlightLatest && i === 0 && selectedOffset === 0)} />
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {drillCategory && (
          <CategorySheet category={drillCategory} transactions={transactions} onClose={() => setDrillCategory(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRecap && (
          <MonthRecapModal transactions={transactions} userId={userId} onClose={() => setShowRecap(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ProfileAvatar({ userId, onLogout, onSettings }: { userId: string; onLogout?: () => void; onSettings?: () => void }) {
  const profile  = getProfile(userId);
  const customAvatar = getUserAvatar(userId);
  const displayName = getUserNickname(userId) || profile?.name || userId;
  const avatarSrc = customAvatar || profile?.avatar;
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setMenuOpen(v => !v)}
        style={{
          width: 42, height: 42, borderRadius: '50%',
          background: (failed || !avatarSrc) ? 'var(--grad-brand)' : 'var(--card)',
          border: '2px solid #fff',
          boxShadow: '0 8px 20px rgba(15,23,42,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', cursor: 'pointer', padding: 0,
          color: 'var(--card)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16,
        }}
      >
        {(failed || !avatarSrc) ? (
          profile?.initial ?? userId.charAt(0).toUpperCase()
        ) : (
          <img src={avatarSrc} alt={displayName} onError={() => setFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
        )}
      </motion.button>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }} onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={quickEase}
              style={{
                position: 'absolute', top: 50, right: 0, zIndex: 51,
                background: 'var(--card)', borderRadius: 14, overflow: 'hidden',
                boxShadow: '0 8px 30px rgba(15,23,42,0.16)',
                border: '1px solid var(--line)', minWidth: 160,
              }}
            >
              <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{displayName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>Sesión activa</div>
              </div>
              {onSettings && (
                <button onClick={() => { setMenuOpen(false); onSettings(); }}
                  style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
                  Ajustes
                </button>
              )}
              {onLogout && (
                <button onClick={() => { setMenuOpen(false); onLogout(); }}
                  style={{ width: '100%', padding: '11px 14px', background: 'none', border: 'none', borderTop: '1px solid var(--line)', textAlign: 'left', cursor: 'pointer', fontSize: 13.5, fontWeight: 500, color: '#b91c1c', fontFamily: 'var(--font-body)' }}>
                  Cerrar sesión
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function TxRow({ tx, highlighted }: { tx: Transaction; highlighted?: boolean }) {
  const isIncome = isIncomeTx(tx);
  const color = isIncome ? '#16a34a' : getCategoryColor(tx.Categoría || 'Otro');
  const fecha = tx.Fecha || tx.Timestamp;
  const name = cleanMerchant(tx.Comercio) || (/bre-?b/i.test(tx.Tipo || '') ? 'Transferencia por Bre-B' : tx.Tipo);
  const domain = getMerchantDomain(name);

  return (
    <motion.div
      animate={{ backgroundColor: highlighted ? 'rgba(37,99,235,0.06)' : 'transparent', scale: highlighted ? 1.01 : 1 }}
      transition={softSpring}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderRadius: 14 }}
    >
      <MerchantLogo domain={domain} name={name} size={40} color={color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>
          {name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{isIncome ? 'Ingreso' : (tx.Categoría || 'Otro')} · {formatDateShort(fecha)}</div>
        {tx.Nota && (
          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
            {tx.Nota}
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14.5, fontWeight: 700, color: isIncome ? 'var(--good)' : 'var(--ink)', flexShrink: 0, letterSpacing: '-0.02em' }}>
        {isIncome ? '+' : '−'}{formatCOP(Number(tx['Monto (COP)']))}
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ height: '52px', borderRadius: 12, marginBottom: 8, background: 'linear-gradient(90deg, var(--line) 25%, #e2e8f0 50%, var(--line) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.8s ease-in-out infinite' }} />
  );
}

function Spinner() {
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--line)', borderTopColor: '#2563eb', animation: 'spin 0.9s linear infinite' }} />
  );
}

function DailySpendLine({ current, previous, daysInMonth }: { current: number[]; previous: number[]; daysInMonth: number }) {
  const W = 300; const H = 52; const PX = 2; const PY = 4;
  const maxVal = Math.max(...current, ...previous, 1);
  const toX = (i: number, len: number) => PX + (len <= 1 ? 0 : (i / (len - 1)) * (W - PX * 2));
  const toY = (v: number) => H - PY - (v / maxVal) * (H - PY * 2);
  const buildPath = (data: number[]) => {
    if (data.length < 2) return '';
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, data.length).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  };
  const currPath = buildPath(current);
  const prevPath = buildPath(previous);
  const lastVal = current[current.length - 1] ?? 0;
  const lastX = toX(current.length - 1, current.length);
  const lastY = toY(lastVal);
  const areaFill = currPath ? `${currPath} L ${lastX.toFixed(1)} ${H} L ${PX} ${H} Z` : '';

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>Acumulado del mes</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)' }}>{formatCOP(lastVal)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 52, display: 'block', overflow: 'visible' }}>
        {areaFill && <path d={areaFill} fill="rgba(37,99,235,0.07)" />}
        {prevPath && previous.some(v => v > 0) && <path d={prevPath} fill="none" stroke="rgba(100,116,139,0.32)" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />}
        {currPath && current.some(v => v > 0) && <path d={currPath} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {lastVal > 0 && current.length > 1 && <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r="3" fill="#2563eb" />}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        {['1', String(Math.ceil(daysInMonth / 2)), String(daysInMonth)].map(label => (
          <span key={label} style={{ fontSize: 9, color: 'rgba(100,116,139,0.55)', fontFamily: 'var(--font-mono)' }}>{label}</span>
        ))}
      </div>
    </div>
  );
}
