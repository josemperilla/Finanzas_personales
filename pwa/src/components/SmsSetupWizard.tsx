import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IOS_SHORTCUT_URL } from '../lib/config';
import { getLastSmsSeen } from '../lib/api';
import { quickEase } from '../lib/motion';

type Phase = 'install' | 'automation' | 'test';
type TestState = 'idle' | 'waiting' | 'success' | 'timeout' | 'error';

interface Props {
  userId: string;
  accentColor?: string;
  onVerified?: () => void;
}

const PHASES: { key: Phase; label: string }[] = [
  { key: 'install',    label: 'Instalar' },
  { key: 'automation', label: 'Automatización' },
  { key: 'test',       label: 'Probar' },
];

const POLL_MS = 4_000;
const TIMEOUT_MS = 90_000;

// Imagen-guía opcional: si el archivo aún no existe en /public, se oculta sin romper.
function GuideImg({ src, alt }: { src: string; alt: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setHidden(true)}
      style={{ width: '100%', borderRadius: 10, border: '1px solid var(--line)', display: 'block' }}
    />
  );
}

export function SmsSetupWizard({ userId, accentColor = 'var(--blue-700)', onVerified }: Props) {
  const [phase, setPhase] = useState<Phase>('install');
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState<TestState>('idle');
  const [showTrouble, setShowTrouble] = useState(false);

  const baselineRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const resolvedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    resolvedRef.current = false;
    return () => { mountedRef.current = false; if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function copyId() {
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function poll() {
    if (!mountedRef.current) { stopPoll(); return; }
    if (Date.now() > deadlineRef.current) {
      stopPoll();
      setTestState('timeout');
      setShowTrouble(true);
      return;
    }
    try {
      const at = await getLastSmsSeen();
      if (!mountedRef.current) { stopPoll(); return; }
      if (baselineRef.current != null && at > baselineRef.current && !resolvedRef.current) {
        resolvedRef.current = true;
        stopPoll();
        setTestState('success');
        localStorage.setItem('fm_sms_verified_' + userId, '1');
        onVerified?.();
      }
    } catch { /* error transitorio: seguir intentando hasta el timeout */ }
  }

  // Captura el baseline AL iniciar (antes de que el usuario mande el SMS de prueba)
  // y arranca el polling. El orden tap→enviar evita falsos negativos.
  async function startTest() {
    resolvedRef.current = false;
    setTestState('waiting');
    try {
      const baseline = await getLastSmsSeen();
      if (!mountedRef.current) return;
      baselineRef.current = baseline;
    } catch {
      if (!mountedRef.current) return;
      setTestState('error');
      return;
    }
    deadlineRef.current = Date.now() + TIMEOUT_MS;
    stopPoll();
    pollRef.current = setInterval(poll, POLL_MS);
  }

  const primaryBtn: React.CSSProperties = {
    width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: 'pointer',
    background: accentColor, color: '#fff', fontSize: 'var(--text-base)', fontWeight: 700,
    fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
  const ghostBtn: React.CSSProperties = {
    width: '100%', height: 44, borderRadius: 12, cursor: 'pointer',
    background: 'none', border: '1.5px solid var(--line)', color: 'var(--muted)',
    fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stepper header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {PHASES.map((p, i) => {
          const activeIdx = PHASES.findIndex(x => x.key === phase);
          const done = i < activeIdx;
          const active = i === activeIdx;
          return (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i < PHASES.length - 1 ? 1 : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-body)',
                  background: active || done ? accentColor : 'var(--line)',
                  color: active || done ? '#fff' : 'var(--muted)',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{
                  fontSize: 11, fontWeight: active ? 700 : 500,
                  color: active ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap',
                }}>
                  {p.label}
                </span>
              </div>
              {i < PHASES.length - 1 && (
                <div style={{ flex: 1, height: 1.5, background: done ? accentColor : 'var(--line)', minWidth: 8 }} />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={quickEase}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {/* ── Fase 1: Instalar ── */}
          {phase === 'install' && (
            <>
              <motion.a
                href={IOS_SHORTCUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                whileTap={{ scale: 0.97 }}
                style={{ ...primaryBtn, textDecoration: 'none', height: 50 }}
              >
                <span style={{ fontSize: 18 }}>⬇</span> Instalar atajo "Finanzas SMS"
              </motion.a>

              <div style={{
                fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5,
                background: 'var(--blue-50)', borderRadius: 10, padding: '10px 12px',
                borderLeft: '3px solid var(--blue-500)',
              }}>
                Esto solo agrega el atajo a <b>Mis Atajos</b>. Todavía <b>NO captura nada</b> —
                falta crear la Automatización en el Paso 2.
              </div>

              {/* ID del usuario */}
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: accentColor }}>
                Si el atajo te pide un ID, este es el tuyo:
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--card)', border: '1.5px solid var(--blue-300, #93c5fd)',
                borderRadius: 10, padding: '10px 14px',
              }}>
                <span style={{
                  flex: 1, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20,
                  color: accentColor, letterSpacing: '0.06em',
                }}>
                  {userId}
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={copyId}
                  style={{
                    background: copied ? '#10b981' : 'var(--blue-600)', border: 'none', borderRadius: 7,
                    padding: '5px 10px', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? '✓ Copiado' : 'Copiar ID'}
                </motion.button>
              </div>

              <motion.button whileTap={{ scale: 0.97 }} style={primaryBtn} onClick={() => setPhase('automation')}>
                Ya lo instalé → Paso 2
              </motion.button>
            </>
          )}

          {/* ── Fase 2: Automatización ── */}
          {phase === 'automation' && (
            <>
              <div style={{
                fontSize: 'var(--text-sm)', color: '#92400e', fontWeight: 600, lineHeight: 1.5,
                background: '#fef3c7', borderRadius: 10, padding: '10px 12px',
                border: '1px solid #fde68a',
              }}>
                ⚠️ Sin este paso el atajo no se ejecuta solo. Instalar ≠ automatizar.
              </div>

              <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                  Abre <b>Atajos</b> (Shortcuts) → pestaña <b>Automatización</b> (<b>Automation</b>, ícono del reloj abajo)
                </li>
                <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                  Toca <b>+</b> → <b>Nueva automatización</b> (<b>New Automation</b>) → <b>Mensaje</b> (<b>Message</b>)
                </li>
                <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                  En <b>Contiene</b> (<b>Contains</b>) escribe <b>$</b> · deja <b>De / Sender</b> en <b>Cualquiera / Any</b>
                </li>
                <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                  Toca <b>Siguiente / Next</b> → agrega la acción <b>Ejecutar atajo</b> (<b>Run Shortcut</b>) → elige <b>Finanzas SMS</b>
                </li>
              </ol>

              {/* Los dos toggles críticos */}
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--ink)' }}>
                  Los 2 ajustes que SIEMPRE se olvidan:
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.3 }}>✅</span>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>Ejecutar inmediatamente / Run Immediately = ACTIVADO.</b> Si no, te pregunta cada vez y nunca corre solo.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 16, lineHeight: 1.3 }}>❌</span>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>Preguntar antes / Run After Confirmation = DESACTIVADO.</b> Si queda activo, cada SMS muestra un aviso que debes confirmar.
                  </div>
                </div>
              </div>

              <GuideImg src="/onboarding/ios/04-toggles.png" alt="Ajustes de la automatización" />

              {/* Deep link directo a la pantalla de automatización */}
              <motion.a
                href="shortcuts://create-automation"
                whileTap={{ scale: 0.97 }}
                style={{ ...ghostBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: accentColor, borderColor: accentColor }}
              >
                Abrir la pantalla de Automatización ↗
              </motion.a>

              <motion.button whileTap={{ scale: 0.97 }} style={primaryBtn} onClick={() => { setPhase('test'); setTestState('idle'); }}>
                Listo, ya la creé → Probar
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} style={ghostBtn} onClick={() => setPhase('install')}>
                ← Volver al Paso 1
              </motion.button>
            </>
          )}

          {/* ── Fase 3: Probar ── */}
          {phase === 'test' && (
            <>
              {testState === 'success' ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  background: 'var(--good-soft, #e4f6ea)', borderRadius: 14, padding: '22px 16px', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 44, lineHeight: 1 }}>✅</div>
                  <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--good, #15a34a)' }}>
                    ¡Funcionó!
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    Tu iPhone ya está reenviando los SMS. A partir de ahora cada movimiento de tu banco se registra solo.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    Comprobemos que quedó bien:
                  </div>
                  <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                      Toca <b>Iniciar prueba</b> aquí abajo.
                    </li>
                    <li style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)', lineHeight: 1.5 }}>
                      Desde <b>Mensajes</b>, envíate a tu propio número un SMS con el texto:{' '}
                      <b style={{ fontFamily: 'var(--font-mono)' }}>$1 prueba</b>
                    </li>
                  </ol>

                  {testState === 'waiting' && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--blue-50)', borderRadius: 10, padding: '12px 14px',
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: '2px solid rgba(37,99,235,0.3)', borderTopColor: 'var(--blue-600)',
                        animation: 'spin 0.7s linear infinite',
                      }} />
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--blue-700)', lineHeight: 1.4 }}>
                        Esperando tu SMS… (puede tardar hasta ~1 min). Mándalo ahora si no lo has hecho.
                      </div>
                    </div>
                  )}

                  {testState === 'timeout' && (
                    <div style={{
                      fontSize: 'var(--text-xs)', color: '#92400e', lineHeight: 1.5,
                      background: '#fef3c7', borderRadius: 10, padding: '10px 12px', border: '1px solid #fde68a',
                    }}>
                      No recibimos el SMS aún. Revisa la sección de abajo y vuelve a intentar.
                    </div>
                  )}

                  {testState === 'error' && (
                    <div style={{
                      fontSize: 'var(--text-xs)', color: '#991b1b', lineHeight: 1.5,
                      background: '#fee2e2', borderRadius: 10, padding: '10px 12px', border: '1px solid #fecaca',
                    }}>
                      No pudimos preparar la prueba. Verifica tu conexión e intenta de nuevo.
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    style={{ ...primaryBtn, opacity: testState === 'waiting' ? 0.6 : 1 }}
                    disabled={testState === 'waiting'}
                    onClick={startTest}
                  >
                    {testState === 'idle' ? 'Iniciar prueba' : testState === 'waiting' ? 'Esperando…' : 'Reintentar'}
                  </motion.button>
                </>
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Acordeón de problemas — visible en Paso 2 y 3 */}
      {phase !== 'install' && testState !== 'success' && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
          <button
            onClick={() => setShowTrouble(v => !v)}
            style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-body)',
            }}
          >
            ¿No llegan tus SMS?
            <span style={{ color: 'var(--muted)', transform: showTrouble ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌄</span>
          </button>
          <AnimatePresence initial={false}>
            {showTrouble && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                style={{ overflow: 'hidden' }}
              >
                <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>El atajo está en "Mis Atajos" pero la Automatización no existe.</b> Es el error #1:
                    instalar el atajo no basta.{' '}
                    <button onClick={() => { setPhase('automation'); setShowTrouble(false); }} style={{ background: 'none', border: 'none', color: 'var(--blue-600)', cursor: 'pointer', padding: 0, fontSize: 'var(--text-xs)', textDecoration: 'underline' }}>
                      Ir al Paso 2
                    </button>
                  </li>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>"Preguntar antes de ejecutar" quedó activo.</b> Abre Atajos → Automatización → tu automatización → desactívalo.
                  </li>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>No puedes seleccionar el atajo (aparece en gris).</b> Ejecuta una vez cualquier atajo de la Galería para habilitar atajos de terceros.
                  </li>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>Modo Concentración / No molestar.</b> Algunos modos pausan las automatizaciones. Revísalo en Ajustes → Concentración.
                  </li>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>El SMS de prueba debe contener "$".</b> El servidor ignora mensajes sin el símbolo. Usa exactamente <b style={{ fontFamily: 'var(--font-mono)' }}>$1 prueba</b>.
                  </li>
                  <li style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)', lineHeight: 1.5 }}>
                    <b>El atajo guardó otro ID.</b> Borra <b>finanzas_usuario.txt</b> en iCloud Drive → Shortcuts y vuelve a enviarte el SMS. Tu ID es <b style={{ fontFamily: 'var(--font-mono)' }}>{userId}</b>.
                  </li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
