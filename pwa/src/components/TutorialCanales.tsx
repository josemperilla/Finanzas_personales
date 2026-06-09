import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { softSpring, quickEase } from '../lib/motion';

type Platform = 'ios' | 'android';

interface Props {
  userId: string;
  onClose: () => void;
  initialCard?: number;
}

interface Card {
  icon: string;
  titulo: string;
  descripcion: string;
  pasos: string[];
  iosPasos?: string[];
  androidPasos?: string[];
  nota?: string;
  iosNota?: string;
  androidNota?: string;
}

const CARDS: Card[] = [
  {
    icon: '📱',
    titulo: 'SMS automático',
    descripcion: 'Captura tus transacciones al instante cuando recibes un SMS de tu banco.',
    pasos: [
      'Abre la app Atajos (Shortcuts) en tu iPhone',
      'Busca el Shortcut "Finanzas SMS" y agrégalo',
      'Activa la automatización: que se ejecute cuando recibes un SMS bancario',
      'Listo — cada pago se registrará solo',
    ],
    iosPasos: [
      'Abre la app Atajos (Shortcuts) en tu iPhone',
      'Busca el Shortcut "Finanzas SMS" y agrégalo',
      'Activa la automatización: que se ejecute cuando recibes un SMS bancario',
      'Listo — cada pago se registrará solo',
    ],
    androidPasos: [
      'Android no permite a apps de terceros leer SMS bancarios directamente',
      'Usa el canal de Notificaciones push (es el equivalente en Android)',
      'O importa tus movimientos manualmente con el canal de Extracto',
    ],
    nota: 'Funciona con Bancolombia, Davivienda, Banco de Bogotá e Itaú',
    iosNota: 'Funciona con Bancolombia, Davivienda, Banco de Bogotá e Itaú',
    androidNota: 'Para Android, el canal recomendado es Notificaciones push.',
  },
  {
    icon: '🔔',
    titulo: 'Notificaciones push',
    descripcion: 'Captura transacciones desde las notificaciones de tu app bancaria.',
    pasos: [
      'Descarga la app "Finanzas Captura" en tu Android',
      'Dale permiso de acceso a notificaciones cuando te lo pida',
      'Ingresa la URL del webhook y el secreto (te los damos en Ajustes)',
      'Activa el servicio — empieza a capturar automáticamente',
    ],
    iosPasos: [
      'iOS no permite que apps de terceros lean tus notificaciones bancarias',
      'En iPhone, usa el canal SMS automático con la app Atajos (es más confiable)',
      'O importa tus extractos manualmente desde Ajustes → Importar extracto',
    ],
    androidPasos: [
      'Descarga la app "Finanzas Captura" en tu Android',
      'Dale permiso de acceso a notificaciones cuando te lo pida',
      'Ingresa la URL del webhook y el secreto (te los damos en Ajustes)',
      'Activa el servicio — empieza a capturar automáticamente',
    ],
    nota: 'Solo disponible en Android 8.0 o superior',
    iosNota: 'iOS bloquea el acceso a notificaciones de otras apps. Usa SMS automático.',
    androidNota: 'Solo disponible en Android 8.0 o superior.',
  },
  {
    icon: '📧',
    titulo: 'Correo Gmail',
    descripcion: 'Si tu banco te envía comprobantes por correo, los capturamos automáticamente.',
    pasos: [
      'Abre Gmail en tu computador',
      'Ve a Configuración → Ver todas las configuraciones → Filtros',
      'Crea un filtro para correos de tu banco (p.ej. de: notificaciones@bancolombia.com.co)',
      'Activa "Reenviar a" y usa la dirección de captura que te damos',
    ],
    nota: 'Bancolombia y Davivienda envían comprobantes por correo automáticamente',
  },
  {
    icon: '📄',
    titulo: 'Importar extracto',
    descripcion: 'Carga tus movimientos pasados desde el extracto CSV de tu banco.',
    pasos: [
      'Descarga el CSV de movimientos desde la app de tu banco',
      'En Bancolombia: Mi perfil → Descargar movimientos',
      'En Bogotá: Extractos → Descargar (selecciona formato CSV)',
      'Abre Ajustes → Importar extracto bancario y selecciona el archivo',
    ],
    nota: 'Ideal para cargar los meses anteriores cuando empiezas',
  },
];

function getPasos(card: Card, platform: Platform | null): string[] {
  if (!platform) return card.pasos;
  if (platform === 'ios') return card.iosPasos ?? card.pasos;
  return card.androidPasos ?? card.pasos;
}

function getNota(card: Card, platform: Platform | null): string | undefined {
  if (!platform) return card.nota;
  if (platform === 'ios') return card.iosNota ?? card.nota;
  return card.androidNota ?? card.nota;
}

const PLATFORM_KEY = 'fm_tutorial_platform';

export function TutorialCanales({ userId, onClose, initialCard }: Props) {
  const [platform, setPlatform] = useState<Platform | null>(
    () => (localStorage.getItem(PLATFORM_KEY) as Platform | null)
  );
  const [idx, setIdx] = useState(() => {
    const stored = localStorage.getItem(PLATFORM_KEY);
    return stored ? (initialCard ?? 0) : 0;
  });

  const card = CARDS[idx];

  function selectPlatform(p: Platform) {
    localStorage.setItem(PLATFORM_KEY, p);
    setPlatform(p);
    setIdx(initialCard ?? 0);
  }

  function dismiss() {
    localStorage.setItem(`fm_tutorial_seen_${userId}`, '1');
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        background: 'rgba(15,23,42,0.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={softSpring}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--card)',
          borderRadius: '24px 24px 0 0',
          padding: '28px 24px 36px',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--ink)' }}>
            {platform ? 'Cómo registrar tus gastos' : '¿Qué teléfono usas?'}
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={dismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'var(--muted)', fontSize: 20 }}
          >
            ✕
          </motion.button>
        </div>

        {/* Platform selector — shown once if not stored */}
        {!platform ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
              Selecciona tu plataforma para ver las instrucciones correctas para cada canal.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => selectPlatform('ios')}
              style={{
                height: 60, background: 'var(--surface)', border: '1.5px solid var(--line)',
                borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--ink)',
              }}
            >
              <span style={{ fontSize: 28 }}>🍎</span> iPhone (iOS)
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => selectPlatform('android')}
              style={{
                height: 60, background: 'var(--surface)', border: '1.5px solid var(--line)',
                borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 12, cursor: 'pointer', fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--ink)',
              }}
            >
              <span style={{ fontSize: 28 }}>🤖</span> Android
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setPlatform(null); setIdx(initialCard ?? 0); localStorage.removeItem(PLATFORM_KEY); dismiss(); }}
              style={{
                height: 44, background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 'var(--text-sm)', color: 'var(--muted)', fontFamily: 'var(--font-body)',
              }}
            >
              Lo haré después
            </motion.button>
          </div>
        ) : (
          <>
            {/* Platform badge — tap to change */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {platform === 'ios' ? '🍎 iPhone' : '🤖 Android'}
              </span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { localStorage.removeItem(PLATFORM_KEY); setPlatform(null); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--blue-600)', padding: '2px 6px',
                  borderRadius: 6, fontFamily: 'var(--font-body)',
                }}
              >
                Cambiar
              </motion.button>
            </div>

            {/* Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={quickEase}
                style={{
                  background: 'var(--surface)', borderRadius: 16,
                  padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 14,
                }}
              >
                <div style={{ fontSize: 40, lineHeight: 1 }}>{card.icon}</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--text-xl)', color: 'var(--ink)', marginBottom: 4 }}>
                    {card.titulo}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', lineHeight: 1.5 }}>
                    {card.descripcion}
                  </div>
                </div>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {getPasos(card, platform).map((paso, i) => (
                    <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                      {paso}
                    </li>
                  ))}
                </ol>
                {getNota(card, platform) && (
                  <div style={{
                    fontSize: 'var(--text-xs)', color: 'var(--muted)',
                    background: 'var(--blue-50)', borderRadius: 10, padding: '8px 12px',
                    borderLeft: '3px solid var(--blue-500)',
                  }}>
                    {getNota(card, platform)}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
              {CARDS.map((_, i) => (
                <motion.button
                  key={i}
                  onClick={() => setIdx(i)}
                  animate={{ width: i === idx ? 20 : 8, background: i === idx ? 'var(--blue-600)' : 'var(--line)' }}
                  transition={{ duration: 0.2 }}
                  style={{ height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', padding: 0 }}
                />
              ))}
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: 10 }}>
              {idx > 0 ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setIdx(i => i - 1)}
                  style={{
                    flex: 1, height: 48, background: 'none', border: '1.5px solid var(--line)',
                    borderRadius: 14, color: 'var(--muted)', fontSize: 'var(--text-base)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  ← Anterior
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={dismiss}
                  style={{
                    flex: 1, height: 48, background: 'none', border: '1.5px solid var(--line)',
                    borderRadius: 14, color: 'var(--muted)', fontSize: 'var(--text-base)',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Lo haré después
                </motion.button>
              )}
              {idx < CARDS.length - 1 ? (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setIdx(i => i + 1)}
                  style={{
                    flex: 2, height: 48, background: 'var(--blue-700)', border: 'none',
                    borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Siguiente →
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={dismiss}
                  style={{
                    flex: 2, height: 48, background: 'var(--blue-700)', border: 'none',
                    borderRadius: 14, color: '#fff', fontSize: 'var(--text-base)',
                    fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  ¡Listo!
                </motion.button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
