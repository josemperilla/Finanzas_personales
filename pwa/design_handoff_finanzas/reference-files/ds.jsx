// ds.jsx — Finanzas design system: tokens, mascot, abstract shapes, UI atoms.
// Exports everything to window for the other babel files.

// ─────────────────────────────────────────────────────────────
// Mascot — "Fino" the coin. Built from circles + a smile arc only.
// ─────────────────────────────────────────────────────────────
function Fino({ size = 96, look = 'happy' }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`coin-${id}`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#ffc785" />
          <stop offset="45%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#f97316" />
        </radialGradient>
        <linearGradient id={`rim-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd9b0" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="50" cy="92" rx="28" ry="5" fill="#0f172a" opacity="0.10" />
      {/* coin body */}
      <circle cx="50" cy="48" r="42" fill={`url(#rim-${id})`} />
      <circle cx="50" cy="48" r="37" fill={`url(#coin-${id})`} />
      {/* inner ring */}
      <circle cx="50" cy="48" r="31" stroke="#fff" strokeOpacity="0.45" strokeWidth="2" />
      {/* highlight */}
      <ellipse cx="38" cy="34" rx="11" ry="7" fill="#fff" opacity="0.35" transform="rotate(-25 38 34)" />
      {/* eyes */}
      <circle cx="40" cy="46" r="4.4" fill="#11295f" />
      <circle cx="60" cy="46" r="4.4" fill="#11295f" />
      <circle cx="41.4" cy="44.6" r="1.5" fill="#fff" />
      <circle cx="61.4" cy="44.6" r="1.5" fill="#fff" />
      {/* blush */}
      <circle cx="32" cy="55" r="3.6" fill="#ef5b1c" opacity="0.35" />
      <circle cx="68" cy="55" r="3.6" fill="#ef5b1c" opacity="0.35" />
      {/* smile */}
      {look === 'happy'
        ? <path d="M41 57 Q50 66 59 57" stroke="#11295f" strokeWidth="3" strokeLinecap="round" fill="none" />
        : <path d="M42 60 Q50 56 58 60" stroke="#11295f" strokeWidth="3" strokeLinecap="round" fill="none" />}
    </svg>
  );
}

// Compact brand mark — rounded square coin
function Mark({ size = 32 }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`mk-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#mk-${id})`} />
      <circle cx="20" cy="20" r="11" fill="#f97316" />
      <path d="M20 14v12M16.5 17.2c0-1.7 1.6-2.7 3.5-2.7s3.3.9 3.3 2.4c0 3.4-7 1.5-7 4.9 0 1.6 1.6 2.6 3.7 2.6 1.9 0 3.4-.9 3.4-2.5"
        stroke="#fff" strokeWidth="1.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Wordmark({ light = false, size = 21 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Mark size={size * 1.5} />
      <span style={{
        fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: size,
        letterSpacing: '-0.02em', color: light ? '#fff' : 'var(--ink)',
      }}>Finanzas</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Abstract gradient blobs — decorative background
// ─────────────────────────────────────────────────────────────
function Blobs({ variant = 'a', style = {} }) {
  const sets = {
    a: [
      { t: -60, l: -50, s: 220, c: 'radial-gradient(circle at 30% 30%, #dbeafe, #93c5fd00)' },
      { t: 280, l: 230, s: 200, c: 'radial-gradient(circle at 30% 30%, #ffedd5, #fdba7400)' },
    ],
    b: [
      { t: -40, l: 200, s: 200, c: 'radial-gradient(circle at 30% 30%, #fde3c4, #fb923c00)' },
      { t: 420, l: -70, s: 220, c: 'radial-gradient(circle at 30% 30%, #dbeafe, #60a5fa00)' },
    ],
    blue: [
      { t: -80, l: -60, s: 300, c: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), transparent 70%)' },
      { t: 300, l: 180, s: 260, c: 'radial-gradient(circle at 30% 30%, rgba(249,115,22,0.45), transparent 70%)' },
    ],
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', ...style }}>
      {sets[variant].map((b, i) => (
        <div key={i} style={{
          position: 'absolute', top: b.t, left: b.l, width: b.s, height: b.s,
          borderRadius: '50%', background: b.c, filter: 'blur(8px)',
        }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────
function Btn({ children, variant = 'primary', full = true, leftIcon, style = {}, ...rest }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: full ? '100%' : 'auto', height: 54, borderRadius: 16, border: 'none',
    fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 16,
    cursor: 'pointer', letterSpacing: '-0.01em', boxSizing: 'border-box', padding: '0 20px',
    transition: 'transform .12s ease',
  };
  const variants = {
    primary: { background: 'var(--blue-700)', color: '#fff', boxShadow: '0 8px 20px rgba(29,78,216,0.28)' },
    orange: { background: 'var(--orange-500)', color: '#fff', boxShadow: '0 8px 20px rgba(249,115,22,0.30)' },
    dark: { background: '#0f172a', color: '#fff' },
    outline: { background: '#fff', color: 'var(--ink)', border: '1.5px solid var(--line)' },
    ghost: { background: 'transparent', color: 'var(--blue-700)', height: 44, boxShadow: 'none' },
    soft: { background: 'var(--blue-50)', color: 'var(--blue-700)' },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...style }} {...rest}>
      {leftIcon}{children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Form field
// ─────────────────────────────────────────────────────────────
function Field({ label, value, placeholder, type = 'text', icon, focused = false, hint }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <div style={{
        fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600,
        color: 'var(--ink-2)', marginBottom: 8, letterSpacing: '-0.01em',
      }}>{label}</div>}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, height: 54,
        padding: '0 16px', borderRadius: 14, background: '#fff', boxSizing: 'border-box',
        border: `1.5px solid ${focused ? 'var(--blue-600)' : 'var(--line)'}`,
        boxShadow: focused ? '0 0 0 4px rgba(37,99,235,0.12)' : 'none',
      }}>
        {icon && <span style={{ color: 'var(--muted)', display: 'flex' }}>{icon}</span>}
        <span style={{
          flex: 1, fontFamily: 'DM Sans, sans-serif', fontSize: 16,
          color: value ? 'var(--ink)' : 'var(--muted-2)',
        }}>{value || placeholder}</span>
        {type === 'password' && value && <Eye />}
        {focused && <span style={{
          width: 2, height: 22, background: 'var(--blue-600)', borderRadius: 2,
          animation: 'blink 1s step-end infinite', marginLeft: -4,
        }} />}
      </div>
      {hint && <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12.5, color: 'var(--muted)', marginTop: 7 }}>{hint}</div>}
    </label>
  );
}

function Chip({ children, active = false, icon }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px',
      borderRadius: 999, fontFamily: 'DM Sans, sans-serif', fontSize: 14, fontWeight: 500,
      border: `1.5px solid ${active ? 'var(--blue-600)' : 'var(--line)'}`,
      background: active ? 'var(--blue-50)' : '#fff',
      color: active ? 'var(--blue-700)' : 'var(--ink-2)', whiteSpace: 'nowrap',
    }}>{icon}{children}</span>
  );
}

function Dots({ total = 3, active = 0 }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          width: i === active ? 22 : 7, height: 7, borderRadius: 999,
          background: i === active ? 'var(--blue-700)' : 'var(--line)',
          transition: 'all .2s',
        }} />
      ))}
    </div>
  );
}

// Tiny inline icons
const Eye = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="#94a3b8" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="#94a3b8" strokeWidth="1.8"/></svg>;
const MailIcon = (c = '#64748b') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke={c} strokeWidth="1.8"/><path d="m4 7 8 6 8-6" stroke={c} strokeWidth="1.8"/></svg>;
const LockIcon = (c = '#64748b') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="3" stroke={c} strokeWidth="1.8"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke={c} strokeWidth="1.8"/></svg>;
const UserIcon = (c = '#64748b') => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.8"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke={c} strokeWidth="1.8"/></svg>;
const BellIcon = (c = '#fff', s = 26) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke={c} strokeWidth="1.8" strokeLinejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" stroke={c} strokeWidth="1.8" strokeLinecap="round"/></svg>;
const AppleGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1 2.8-2.1c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9ZM14.2 6c.6-.8 1-1.8.9-2.9-.9 0-2 .6-2.6 1.3-.6.7-1.1 1.7-1 2.7 1 .1 2-.5 2.7-1.1Z"/></svg>;
const GoogleGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.5l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6C4.7 19.9 8.1 22 12 22Z"/><path fill="#FBBC05" d="M6.4 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8V7.6H3.1C2.4 8.9 2 10.4 2 12s.4 3.1 1.1 4.4l3.3-2.6Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.9 14.7 2 12 2 8.1 2 4.7 4.1 3.1 7.6l3.3 2.6C7.2 7.6 9.4 5.9 12 5.9Z"/></svg>;
const CheckCircle = (c = 'var(--blue-700)', s = 22) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill={c}/><path d="m8 12 2.5 2.5L16 9" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;

Object.assign(window, {
  Fino, Mark, Wordmark, Blobs, Btn, Field, Chip, Dots,
  Eye, MailIcon, LockIcon, UserIcon, BellIcon, AppleGlyph, GoogleGlyph, CheckCircle,
});
