// mobile-screens.jsx — the 8 iOS onboarding screens for Finanzas.
// Each is rendered inside <IOSDevice>. Spanish copy.

const SB_TOP = 58; // clear status bar / dynamic island
const SAFE_BTM = 30;

function Shell({ children, bg = '#fff', pad = 24, footer, blobs }) {
  return (
    <div style={{
      position: 'relative', minHeight: '100%', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', background: bg,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      {blobs}
      <div style={{
        position: 'relative', flex: 1, display: 'flex', flexDirection: 'column',
        padding: `${SB_TOP}px ${pad}px ${footer ? 12 : SAFE_BTM}px`,
      }}>{children}</div>
      {footer && (
        <div style={{ position: 'relative', padding: `0 ${pad}px ${SAFE_BTM}px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {footer}
        </div>
      )}
    </div>
  );
}

const H1 = ({ children, style }) => <h1 style={{
  fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 30, lineHeight: 1.08,
  letterSpacing: '-0.025em', color: 'var(--ink)', margin: 0, textWrap: 'balance', ...style,
}}>{children}</h1>;

const Sub = ({ children, style }) => <p style={{
  fontFamily: 'DM Sans, sans-serif', fontSize: 16, lineHeight: 1.5,
  color: 'var(--muted)', margin: '12px 0 0', textWrap: 'pretty', ...style,
}}>{children}</p>;

const TopBar = ({ step, total = 6, light }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 26 }}>
    <div style={{
      width: 38, height: 38, borderRadius: 12, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: light ? 'rgba(255,255,255,0.18)' : 'var(--surface)',
      border: light ? 'none' : '1.5px solid var(--line)',
    }}>
      <svg width="9" height="16" viewBox="0 0 9 16" fill="none"><path d="M8 1 1 8l7 7" stroke={light ? '#fff' : '#0f172a'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </div>
    <div style={{ flex: 1, height: 6, borderRadius: 999, background: light ? 'rgba(255,255,255,0.25)' : 'var(--line)', overflow: 'hidden' }}>
      <div style={{ width: `${(step / total) * 100}%`, height: '100%', borderRadius: 999, background: light ? '#fff' : 'linear-gradient(90deg, var(--blue-600), var(--orange-500))' }} />
    </div>
    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: light ? 'rgba(255,255,255,0.8)' : 'var(--muted)' }}>{step}/{total}</span>
  </div>
);

// ── 1 · Bienvenida ───────────────────────────────────────────
function S_Welcome() {
  return (
    <Shell bg="linear-gradient(180deg,#f4f8ff 0%,#fff 55%)" blobs={<Blobs variant="a" />}
      footer={<>
        <Btn variant="primary">Crear cuenta</Btn>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 15, color: 'var(--muted)' }}>
          Ya tengo cuenta · <span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Inicia sesión</span>
        </button>
      </>}>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}><Wordmark /></div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4 }}>
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <div style={{ position: 'absolute', inset: -26, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.16), transparent 70%)' }} />
          <Fino size={160} />
        </div>
        <H1 style={{ fontSize: 33 }}>Tus tarjetas,<br/>bajo control.</H1>
        <Sub style={{ maxWidth: 280 }}>Mira cuánto llevas gastado este mes con tus tarjetas, en segundos.</Sub>
        <div style={{ marginTop: 24 }}><Dots total={3} active={0} /></div>
      </div>
    </Shell>
  );
}

// ── 2 · Crear cuenta ─────────────────────────────────────────
function S_SignUp() {
  const social = (icon, label, dark) => (
    <button style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52,
      borderRadius: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 15.5,
      background: dark ? '#0f172a' : '#fff', color: dark ? '#fff' : 'var(--ink)',
      border: dark ? 'none' : '1.5px solid var(--line)',
    }}>{icon}{label}</button>
  );
  return (
    <Shell footer={<>
      <Btn variant="primary">Continuar</Btn>
      <p style={{ textAlign: 'center', fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>
        Al continuar aceptas los <span style={{ color: 'var(--blue-700)' }}>Términos</span> y el <span style={{ color: 'var(--blue-700)' }}>Aviso de Privacidad</span>.
      </p>
    </>}>
      <TopBar step={1} />
      <H1>Crea tu cuenta</H1>
      <Sub>Empieza gratis. Sin tarjetas guardadas hasta que tú quieras.</Sub>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 26 }}>
        {social(<AppleGlyph />, 'Apple', true)}
        {social(<GoogleGlyph />, 'Google', false)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted-2)' }}>o con tu correo</span>
        <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Correo" value="andrea@correo.com" icon={MailIcon()} />
        <Field label="Contraseña" type="password" value="••••••••" icon={LockIcon()} focused hint="Mínimo 8 caracteres." />
      </div>
    </Shell>
  );
}

// ── 3 · Verificación ─────────────────────────────────────────
function S_Verify() {
  const code = ['4', '8', '2', '', '', ''];
  return (
    <Shell footer={<Btn variant="primary">Verificar</Btn>}>
      <TopBar step={2} />
      <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 4px' }}>
        <div style={{ width: 84, height: 84, borderRadius: 24, background: 'var(--blue-50)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {MailIcon('var(--blue-700)')}
          <span style={{ position: 'absolute' }}>{/* spacer */}</span>
        </div>
      </div>
      <H1 style={{ textAlign: 'center', marginTop: 18 }}>Revisa tu correo</H1>
      <Sub style={{ textAlign: 'center' }}>Enviamos un código de 6 dígitos a<br/><b style={{ color: 'var(--ink-2)' }}>andrea@correo.com</b></Sub>
      <div style={{ display: 'flex', gap: 9, justifyContent: 'center', marginTop: 30 }}>
        {code.map((d, i) => (
          <div key={i} style={{
            width: 46, height: 58, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 500, color: 'var(--ink)',
            background: '#fff', border: `1.5px solid ${i === 3 ? 'var(--blue-600)' : 'var(--line)'}`,
            boxShadow: i === 3 ? '0 0 0 4px rgba(37,99,235,0.12)' : 'none',
          }}>{d || (i === 3 ? <span style={{ width: 2, height: 26, background: 'var(--blue-600)', borderRadius: 2, animation: 'blink 1s step-end infinite' }} /> : '')}</div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: 26, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted)' }}>
        ¿No llegó? <span style={{ color: 'var(--muted-2)' }}>Reenviar en <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-2)' }}>0:42</span></span>
      </div>
    </Shell>
  );
}

// ── 4 · Perfil & moneda ──────────────────────────────────────
function S_Profile() {
  const currencies = [['MXN', '$', true], ['USD', '$', false], ['EUR', '€', false], ['COP', '$', false]];
  return (
    <Shell footer={<Btn variant="primary">Continuar</Btn>}>
      <TopBar step={3} />
      <H1>Un poco sobre ti</H1>
      <Sub>Así personalizamos tu experiencia.</Sub>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '24px 0 22px' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 34, color: '#fff' }}>A</div>
          <div style={{ position: 'absolute', bottom: -2, right: -2, width: 32, height: 32, borderRadius: '50%', background: 'var(--orange-500)', border: '3px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="¿Cómo te llamas?" value="Andrea Ríos" icon={UserIcon()} />
        <div>
          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 10 }}>Moneda principal</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {currencies.map(([code, sym, active]) => (
              <div key={code} style={{
                display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 14px', borderRadius: 14,
                background: active ? 'var(--blue-50)' : '#fff', border: `1.5px solid ${active ? 'var(--blue-600)' : 'var(--line)'}`,
              }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: active ? 'var(--blue-700)' : 'var(--surface)', color: active ? '#fff' : 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>{sym}</span>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 15, color: active ? 'var(--blue-700)' : 'var(--ink-2)' }}>{code}</span>
                {active && <span style={{ marginLeft: 'auto' }}>{CheckCircle('var(--blue-700)', 20)}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── 5 · Agrega tarjetas ──────────────────────────────────────
function CreditCard({ scale = 1 }) {
  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '1.6 / 1', borderRadius: 20, overflow: 'hidden',
      background: 'linear-gradient(125deg,#1d4ed8 0%,#2563eb 45%,#f97316 130%)',
      boxShadow: '0 18px 36px rgba(29,78,216,0.32)', padding: 22, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#fff',
    }}>
      <div style={{ position: 'absolute', top: -40, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.12)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ width: 42, height: 30, borderRadius: 6, background: 'linear-gradient(135deg,#ffe6b0,#f5b740)' }} />
        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, opacity: 0.95 }}>Finanzas</span>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 17, letterSpacing: 2, marginBottom: 12 }}>•••• •••• •••• 4242</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, opacity: 0.9 }}>ANDREA RÍOS</span>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontStyle: 'italic', fontWeight: 700, fontSize: 17, opacity: 0.95 }}>VISA</span>
        </div>
      </div>
    </div>
  );
}

function S_Cards() {
  return (
    <Shell footer={<Btn variant="primary">Continuar</Btn>}>
      <TopBar step={4} />
      <H1>Agrega tus tarjetas</H1>
      <Sub>Conecta las tarjetas que quieres vigilar. Solo lectura — nunca movemos tu dinero.</Sub>
      <div style={{ marginTop: 22 }}><CreditCard /></div>
      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, background: '#fff', border: '1.5px solid var(--line)' }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'JetBrains Mono, monospace' }}>V</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>Visa Oro</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, color: 'var(--muted)' }}>•••• 4242</div>
          </div>
          {CheckCircle('var(--blue-700)', 22)}
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, height: 54, borderRadius: 16, cursor: 'pointer',
          background: 'var(--blue-50)', border: '1.5px dashed var(--blue-300, #bfd4fb)', color: 'var(--blue-700)',
          fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 15,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          Agregar otra tarjeta
        </button>
      </div>
    </Shell>
  );
}

// ── 6 · Límite mensual ───────────────────────────────────────
function S_Limit() {
  const cats = [['Comida', true], ['Transporte', true], ['Compras', false], ['Suscripciones', true], ['Salud', false], ['Ocio', false]];
  return (
    <Shell footer={<Btn variant="primary">Guardar límite</Btn>}>
      <TopBar step={5} />
      <H1>Pon tu límite del mes</H1>
      <Sub>Te avisamos cuando te acerques. Puedes cambiarlo cuando quieras.</Sub>
      <div style={{ textAlign: 'center', margin: '30px 0 8px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 46, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          <span style={{ fontSize: 26, color: 'var(--muted)', verticalAlign: 'super' }}>$</span>12,000
        </div>
        <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: 'var(--muted)' }}>MXN por mes</div>
      </div>
      {/* slider */}
      <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--line)', margin: '20px 4px 8px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '58%', borderRadius: 999, background: 'linear-gradient(90deg,var(--blue-600),var(--orange-500))' }} />
        <div style={{ position: 'absolute', left: '58%', top: '50%', transform: 'translate(-50%,-50%)', width: 26, height: 26, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,0.25)', border: '2px solid var(--blue-700)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, color: 'var(--muted-2)', padding: '0 4px' }}>
        <span>$2,000</span><span>$30,000</span>
      </div>
      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', margin: '24px 0 12px' }}>¿Qué quieres vigilar?</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {cats.map(([c, a]) => <Chip key={c} active={a} icon={a ? <span style={{ display: 'flex' }}>{CheckCircle('var(--blue-700)', 16)}</span> : null}>{c}</Chip>)}
      </div>
    </Shell>
  );
}

// ── 7 · Notificaciones ───────────────────────────────────────
function S_Notify() {
  return (
    <Shell bg="linear-gradient(180deg,#1d4ed8 0%,#2563eb 100%)" blobs={<Blobs variant="blue" />}
      footer={<>
        <Btn variant="orange">Activar notificaciones</Btn>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>Ahora no</button>
      </>}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: 28, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, backdropFilter: 'blur(4px)' }}>
          {BellIcon('#fff', 42)}
        </div>
        <H1 style={{ color: '#fff', fontSize: 30 }}>¿Te avisamos antes<br/>de pasarte?</H1>
        <Sub style={{ color: 'rgba(255,255,255,0.85)', maxWidth: 300 }}>Una alerta amable cuando estés cerca de tu límite. Sin spam, lo prometemos.</Sub>
        {/* preview notification */}
        <div style={{ marginTop: 34, width: '100%', background: 'rgba(255,255,255,0.96)', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
          <Fino size={42} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>Vas al 78% de tu límite</div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--muted)' }}>Te quedan $2,640 para el día 31.</div>
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--muted-2)' }}>ahora</span>
        </div>
      </div>
    </Shell>
  );
}

// ── 8 · Dashboard (payoff) ───────────────────────────────────
function SpendRing({ size = 160, pct = 70 }) {
  const r = size / 2 - 14, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      <defs>
        <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" /><stop offset="100%" stopColor="#f97316" />
        </linearGradient>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} stroke="#eef2f7" strokeWidth="14" fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke="url(#ringg)" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
    </svg>
  );
}

function S_Dashboard() {
  const tx = [
    ['Spotify', 'Suscripciones', '129.00', '#1DB954'],
    ['Uber', 'Transporte', '184.50', '#0f172a'],
    ['Super Aurrera', 'Comida', '1,240.30', '#f97316'],
    ['Amazon', 'Compras', '899.00', '#2563eb'],
  ];
  return (
    <div style={{ position: 'relative', minHeight: '100%', background: 'var(--surface)', fontFamily: 'DM Sans, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, padding: `${SB_TOP}px 20px 0`, overflow: 'hidden' }}>
        {/* greeting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>A</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--muted)' }}>¡Todo listo, Andrea! 🎉</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 17, color: 'var(--ink)' }}>Mayo 2026</div>
          </div>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: '#fff', border: '1.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{BellIcon('#0f172a', 20)}</div>
        </div>
        {/* ring card */}
        <div style={{ background: '#fff', borderRadius: 24, padding: 22, boxShadow: '0 10px 30px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: 'var(--muted)' }}>Gastado este mes</div>
          <div style={{ position: 'relative', margin: '12px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SpendRing size={168} pct={70} />
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 30, fontWeight: 500, color: 'var(--ink)' }}>$8,420</div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted)' }}>de $12,000</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--blue-700)', fontWeight: 600, background: 'var(--blue-50)', padding: '6px 12px', borderRadius: 999 }}>
            Te quedan $3,580 · día 22
          </div>
        </div>
        {/* transactions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 2px 12px' }}>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Movimientos</span>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 600, color: 'var(--blue-700)' }}>Ver todo</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 20, padding: '4px 16px', boxShadow: '0 10px 30px rgba(15,23,42,0.05)' }}>
          {tx.map(([n, c, a, col], i) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < tx.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: col, opacity: 0.92, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15 }}>{n[0]}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{n}</div>
                <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted)' }}>{c}</div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14.5, color: 'var(--ink)' }}>−${a}</div>
            </div>
          ))}
        </div>
      </div>
      {/* tab bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '12px 24px 30px', background: '#fff', borderTop: '1px solid var(--line)', marginTop: 16 }}>
        {[['Inicio', true], ['Tarjetas', false], ['+', 'add'], ['Metas', false], ['Perfil', false]].map(([l, st]) => st === 'add' ? (
          <div key={l} style={{ width: 50, height: 50, borderRadius: 16, background: 'var(--blue-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 18px rgba(29,78,216,0.35)', marginTop: -28 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/></svg>
          </div>
        ) : (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 22, height: 22, borderRadius: 7, background: st ? 'var(--blue-700)' : 'var(--muted-2)', opacity: st ? 1 : 0.5 }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 10.5, fontWeight: 600, color: st ? 'var(--blue-700)' : 'var(--muted-2)' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  S_Welcome, S_SignUp, S_Verify, S_Profile, S_Cards, S_Limit, S_Notify, S_Dashboard, CreditCard,
});
