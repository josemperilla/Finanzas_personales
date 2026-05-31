// desktop-screens.jsx — matching web/desktop layouts for Finanzas.
// Light browser chrome + three key screens: Landing, Sign-up, Dashboard.

function Browser({ url = 'finanzas.app', children, height = 800 }) {
  return (
    <div style={{ width: '100%', height, borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 70px rgba(15,23,42,0.18)', display: 'flex', flexDirection: 'column', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', height: 46, background: '#f1f4f9', borderBottom: '1px solid #e6ebf2', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ flex: 1, maxWidth: 460, margin: '0 auto', height: 28, borderRadius: 8, background: '#fff', border: '1px solid #e6ebf2', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="#94a3b8" strokeWidth="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#94a3b8" strokeWidth="2"/></svg>
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: '#64748b' }}>{url}</span>
        </div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{children}</div>
    </div>
  );
}

// ── D1 · Landing ─────────────────────────────────────────────
function D_Landing() {
  return (
    <Browser url="finanzas.app">
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', background: '#fff' }}>
        <Blobs variant="a" />
        {/* nav */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 48px' }}>
          <Wordmark size={20} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, fontFamily: 'DM Sans, sans-serif', fontSize: 15, color: 'var(--ink-2)', fontWeight: 500 }}>
            <span>Producto</span><span>Precios</span><span>Seguridad</span>
            <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Entrar</span>
            <Btn variant="primary" full={false} style={{ height: 44 }}>Crear cuenta</Btn>
          </div>
        </div>
        {/* hero */}
        <div style={{ position: 'relative', flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 48px', gap: 40 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, background: 'var(--orange-50)', color: 'var(--orange-600,#ea580c)', fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 600, marginBottom: 22 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange-500)' }} />Nuevo · Alertas inteligentes
            </div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 58, lineHeight: 1.02, letterSpacing: '-0.03em', color: 'var(--ink)', margin: 0, textWrap: 'balance' }}>
              Tus tarjetas,<br/>bajo <span style={{ color: 'var(--blue-700)' }}>control</span>.
            </h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 19, lineHeight: 1.55, color: 'var(--muted)', margin: '22px 0 0', maxWidth: 440, textWrap: 'pretty' }}>
              Mira cuánto llevas gastado este mes con todas tus tarjetas — en un solo lugar, en segundos.
            </p>
            <div style={{ display: 'flex', gap: 14, marginTop: 32 }}>
              <Btn variant="primary" full={false} style={{ height: 56, padding: '0 28px', fontSize: 17 }}>Empieza gratis</Btn>
              <Btn variant="outline" full={false} style={{ height: 56, padding: '0 28px', fontSize: 17 }}>Ver demo</Btn>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 28, fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted)' }}>
              <div style={{ display: 'flex' }}>{[0,1,2,3].map(i => <span key={i} style={{ width: 30, height: 30, borderRadius: '50%', background: ['#2563eb','#f97316','#1d4ed8','#fb923c'][i], border: '2.5px solid #fff', marginLeft: i ? -10 : 0 }} />)}</div>
              <span><b style={{ color: 'var(--ink-2)' }}>+24,000</b> personas ya gastan mejor</span>
            </div>
          </div>
          {/* visual */}
          <div style={{ position: 'relative', height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ position: 'absolute', width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #dbeafe, transparent 70%)' }} />
            <Fino size={150} />
            {/* floating mini dashboard */}
            <div style={{ position: 'absolute', top: 40, right: 8, width: 230, background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 24px 50px rgba(15,23,42,0.16)' }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'var(--muted)' }}>Gastado este mes</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 26, fontWeight: 500, color: 'var(--ink)', margin: '4px 0 10px' }}>$8,420</div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: '70%', height: '100%', background: 'linear-gradient(90deg,var(--blue-600),var(--orange-500))' }} /></div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>70% de tu límite · $12,000</div>
            </div>
            {/* floating card */}
            <div style={{ position: 'absolute', bottom: 26, left: 0, width: 230 }}><CreditCard /></div>
          </div>
        </div>
      </div>
    </Browser>
  );
}

// ── D2 · Sign up ─────────────────────────────────────────────
function D_SignUp() {
  const social = (icon, label, dark) => (
    <button style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 15.5, background: dark ? '#0f172a' : '#fff', color: dark ? '#fff' : 'var(--ink)', border: dark ? 'none' : '1.5px solid var(--line)' }}>{icon}{label}</button>
  );
  return (
    <Browser url="finanzas.app/registro">
      <div style={{ height: '100%', display: 'grid', gridTemplateColumns: '1.05fr 1fr' }}>
        {/* left brand panel */}
        <div style={{ position: 'relative', background: 'linear-gradient(150deg,#1d4ed8,#2563eb 60%,#1e40af)', padding: 56, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
          <Blobs variant="blue" />
          <div style={{ position: 'relative' }}><Wordmark light size={20} /></div>
          <div style={{ position: 'relative' }}>
            <Fino size={92} />
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 40, lineHeight: 1.08, color: '#fff', margin: '24px 0 0', letterSpacing: '-0.02em', textWrap: 'balance' }}>Empieza a gastar<br/>con claridad.</h2>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 17, lineHeight: 1.6, color: 'rgba(255,255,255,0.85)', margin: '18px 0 0', maxWidth: 380 }}>Conecta tus tarjetas, pon tu límite del mes y deja que Finanzas te avise antes de pasarte.</p>
            <div style={{ display: 'flex', gap: 28, marginTop: 36 }}>
              {[['Solo lectura', 'Nunca movemos tu dinero'], ['Cifrado', 'Tus datos, protegidos'], ['Gratis', 'Para siempre']].map(([t, d]) => (
                <div key={t}>
                  <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: '#fff' }}>{t}</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{d}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'relative', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>© 2026 Finanzas Personales</div>
        </div>
        {/* right form */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, background: '#fff' }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 30, color: 'var(--ink)', margin: 0, letterSpacing: '-0.02em' }}>Crea tu cuenta</h1>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15.5, color: 'var(--muted)', margin: '8px 0 26px' }}>Gratis para siempre. Sin tarjeta de crédito.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {social(<AppleGlyph />, 'Apple', true)}
              {social(<GoogleGlyph />, 'Google', false)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted-2)' }}>o con tu correo</span><div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Correo" value="andrea@correo.com" icon={MailIcon()} />
              <Field label="Contraseña" type="password" value="••••••••" icon={LockIcon()} focused hint="Mínimo 8 caracteres." />
            </div>
            <div style={{ marginTop: 22 }}><Btn variant="primary">Crear cuenta</Btn></div>
            <p style={{ textAlign: 'center', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted)', marginTop: 18 }}>¿Ya tienes cuenta? <span style={{ color: 'var(--blue-700)', fontWeight: 600 }}>Inicia sesión</span></p>
          </div>
        </div>
      </div>
    </Browser>
  );
}

// ── D3 · Dashboard web app ───────────────────────────────────
function D_Dashboard() {
  const nav = [['Inicio', true], ['Tarjetas', false], ['Movimientos', false], ['Metas', false], ['Reportes', false]];
  const tx = [
    ['Spotify', 'Suscripciones', '129.00', '20 may', '#1DB954'],
    ['Uber', 'Transporte', '184.50', '20 may', '#0f172a'],
    ['Super Aurrera', 'Comida', '1,240.30', '19 may', '#f97316'],
    ['Amazon México', 'Compras', '899.00', '18 may', '#2563eb'],
    ['Netflix', 'Suscripciones', '219.00', '17 may', '#e50914'],
  ];
  const stats = [['Disponible', '$3,580', 'var(--blue-700)'], ['Tarjetas', '3', 'var(--ink)'], ['Promedio/día', '$382', 'var(--orange-500)']];
  return (
    <Browser url="finanzas.app/inicio">
      <div style={{ height: '100%', display: 'flex', background: 'var(--surface)' }}>
        {/* sidebar */}
        <div style={{ width: 240, background: '#fff', borderRight: '1px solid var(--line)', padding: '26px 18px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '0 8px 26px' }}><Wordmark size={18} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nav.map(([l, a]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 12, background: a ? 'var(--blue-50)' : 'transparent', color: a ? 'var(--blue-700)' : 'var(--ink-2)', fontFamily: 'DM Sans, sans-serif', fontWeight: a ? 600 : 500, fontSize: 14.5 }}>
                <span style={{ width: 18, height: 18, borderRadius: 6, background: a ? 'var(--blue-700)' : 'var(--muted-2)', opacity: a ? 1 : 0.4 }} />{l}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 'auto', background: 'linear-gradient(150deg,#1d4ed8,#2563eb)', borderRadius: 18, padding: 18, position: 'relative', overflow: 'hidden' }}>
            <Fino size={40} />
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: '#fff', marginTop: 10 }}>Mejora a Pro</div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.8)', margin: '4px 0 12px' }}>Categorías ilimitadas y reportes.</div>
            <button style={{ width: '100%', height: 38, borderRadius: 10, border: 'none', background: '#fff', color: 'var(--blue-700)', fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Ver planes</button>
          </div>
        </div>
        {/* main */}
        <div style={{ flex: 1, padding: '26px 32px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted)' }}>¡Hola de nuevo, Andrea!</div>
              <h1 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 28, color: 'var(--ink)', margin: '2px 0 0', letterSpacing: '-0.02em' }}>Tu mes en un vistazo</h1>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 240, height: 42, borderRadius: 12, background: '#fff', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#94a3b8" strokeWidth="2"/><path d="m20 20-3-3" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted-2)' }}>Buscar movimiento…</span>
              </div>
              <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 800 }}>A</div>
            </div>
          </div>
          {/* grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20 }}>
            {/* ring card */}
            <div style={{ background: '#fff', borderRadius: 22, padding: 24, boxShadow: '0 10px 30px rgba(15,23,42,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ alignSelf: 'flex-start', fontFamily: 'DM Sans, sans-serif', fontSize: 14, color: 'var(--muted)' }}>Gastado este mes</div>
              <div style={{ position: 'relative', margin: '14px 0 10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SpendRing size={180} pct={70} />
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 32, fontWeight: 500, color: 'var(--ink)' }}>$8,420</div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--muted)' }}>de $12,000</div>
                </div>
              </div>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, color: 'var(--blue-700)', fontWeight: 600, background: 'var(--blue-50)', padding: '7px 14px', borderRadius: 999 }}>Te quedan $3,580 · día 22</div>
            </div>
            {/* right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {stats.map(([l, v, c]) => (
                  <div key={l} style={{ background: '#fff', borderRadius: 18, padding: 18, boxShadow: '0 10px 30px rgba(15,23,42,0.05)' }}>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--muted)' }}>{l}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 500, color: c, marginTop: 6 }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: 20, padding: '8px 20px 12px', boxShadow: '0 10px 30px rgba(15,23,42,0.05)', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0 8px' }}>
                  <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>Movimientos recientes</span>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13.5, fontWeight: 600, color: 'var(--blue-700)' }}>Ver todo</span>
                </div>
                {tx.map(([n, c, a, d, col], i) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: col, opacity: 0.92, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 14 }}>{n[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 14.5, color: 'var(--ink)' }}>{n}</div>
                      <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted)' }}>{c}</div>
                    </div>
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted-2)', marginRight: 8 }}>{d}</div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14.5, color: 'var(--ink)' }}>−${a}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Browser>
  );
}

Object.assign(window, { Browser, D_Landing, D_SignUp, D_Dashboard });
