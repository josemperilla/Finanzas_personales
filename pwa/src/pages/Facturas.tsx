import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  fetchFixedCalendar, saveFixedPayment, deleteFixedPayment, refreshFactura, issueExtToken,
  FixedPayment, FixedPaymentStatus, FixedCalendarData,
} from '../lib/api';
import { HAS_WEBHOOK_URL, CATEGORIES } from '../lib/config';
import { PROVIDERS, getProvider, SERVICIO_META, ServicioTipo } from '../lib/providers';
import { formatCOP } from '../lib/utils';
import { softSpring, quickEase } from '../lib/motion';
import { useOverlayA11y } from '../lib/useOverlayA11y';
import { Skeleton } from '../components/ui/primitives';

interface Props {
  userId: string;
}

const STATUS_LABEL: Record<FixedPaymentStatus['status'], string> = {
  pending: 'Pendiente', paid: 'Pagado', overdue: 'Vencido',
};
const STATUS_COLOR: Record<FixedPaymentStatus['status'], string> = {
  pending: 'var(--muted)', paid: '#15803d', overdue: '#dc2626',
};

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
function fechaCorta(ymd: string): string {
  const [, m, d] = ymd.split('-');
  if (!m || !d) return ymd;
  return `${Number(d)} ${MESES[Number(m) - 1]}`;
}

// Orden de grupos del picker de proveedores.
const SERVICIO_ORDER: ServicioTipo[] = [
  'energia', 'agua', 'gas', 'aseo', 'internet', 'movil', 'multiservicio', 'fijo', 'impuesto', 'otro',
];

export function Facturas({ userId }: Props) {
  const [data, setData] = useState<FixedCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FixedPaymentStatus | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [extOpen, setExtOpen] = useState(false);
  const [extToken, setExtToken] = useState<string | null>(null);
  const [extLoading, setExtLoading] = useState(false);

  const openExt = useCallback(async () => {
    setExtOpen(true);
    if (extToken) return;
    setExtLoading(true);
    try { setExtToken(await issueExtToken()); }
    catch { setExtToken(null); }
    finally { setExtLoading(false); }
  }, [extToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchFixedCalendar());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (HAS_WEBHOOK_URL) load(); else setLoading(false); }, [load, userId]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const handleSave = async (p: FixedPayment) => {
    await saveFixedPayment(p);
    await load();
  };

  const handleDelete = async (id: string) => {
    await deleteFixedPayment(id);
    setData(prev => prev ? { ...prev, payments: prev.payments.filter(p => p.id !== id) } : prev);
  };

  const handlePagar = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleConsultar = async (p: FixedPaymentStatus) => {
    setRefreshingId(p.id);
    try {
      const res = await refreshFactura(p.id);
      if (res.ok) { await load(); showToast('Factura actualizada'); }
      else showToast(res.error || 'No se pudo consultar — ingresa el monto manualmente');
    } catch {
      showToast('No se pudo consultar — ingresa el monto manualmente');
    } finally {
      setRefreshingId(null);
    }
  };

  if (!HAS_WEBHOOK_URL) {
    return (
      <div className="app-page" style={pageStyle}>
        <Header onAdd={() => {}} disabled />
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 24 }}>
          Configura la conexión con el servidor para gestionar tus facturas.
        </div>
      </div>
    );
  }

  const payments = data ? [...data.payments].sort((a, b) => a.payDate.localeCompare(b.payDate)) : [];
  const hasPayments = payments.length > 0;

  return (
    <div className="app-page" style={pageStyle}>
      <Header onAdd={() => { setEditing(null); setShowForm(true); }} onExt={openExt} />

      {loading ? (
        <div style={{ marginTop: 16 }}>
          <Skeleton height={72} radius={16} style={{ marginBottom: 12 }} />
          {[1, 2, 3].map(i => <Skeleton key={i} height={64} radius={14} style={{ marginBottom: 8 }} />)}
        </div>
      ) : (
        <>
          {data && hasPayments && (
            <div style={summaryStyle}>
              <SummaryCell label="Por pagar este mes" value={formatCOP(data.totalPending)} color="var(--ink)" big />
              <SummaryCell label="Pagado" value={formatCOP(data.totalPaid)} color="#15803d" />
            </div>
          )}

          {hasPayments ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {payments.map(p => {
                const prov = p.providerId ? getProvider(p.providerId) : undefined;
                const puedeConsultar = !!prov?.tieneConector && !!p.numeroCuenta;
                const venc = p.ultimaFechaVencimiento || p.payDate;
                return (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={quickEase}
                    style={rowStyle}
                  >
                    <button
                      onClick={() => { setEditing(p); setShowForm(true); }}
                      aria-label={`Editar ${p.nombre}`}
                      style={rowMainStyle}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATUS_COLOR[p.status], flexShrink: 0 }} />
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{prov ? SERVICIO_META[prov.servicio].emoji : '🧾'}</span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: 15, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.nombre}
                        </span>
                        <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>
                          Vence {fechaCorta(venc)} · {p.categoria}
                        </span>
                      </span>
                      <span style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ display: 'block', fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>
                          {p.monto > 0 ? formatCOP(p.monto) : 'Sin monto'}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: STATUS_COLOR[p.status] }}>
                          {STATUS_LABEL[p.status]}
                        </span>
                      </span>
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 27, marginTop: 8 }}>
                      {p.urlPago && (
                        <motion.button whileTap={{ scale: 0.95 }} onClick={() => handlePagar(p.urlPago!)} style={payBtnStyle}>
                          Pagar
                        </motion.button>
                      )}
                      {puedeConsultar && (
                        <motion.button
                          whileTap={{ scale: 0.95 }} disabled={refreshingId === p.id}
                          onClick={() => handleConsultar(p)} style={ghostBtnStyle}
                        >
                          {refreshingId === p.id ? 'Consultando…' : 'Consultar ahora'}
                        </motion.button>
                      )}
                      <div style={{ flex: 1 }} />
                      <motion.button
                        whileTap={{ scale: 0.85 }} onClick={() => handleDelete(p.id)}
                        aria-label={`Eliminar ${p.nombre}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 20, padding: 4 }}
                      >
                        ×
                      </motion.button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div style={emptyStyle}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🧾</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)', marginBottom: 6 }}>Aún no tienes facturas</div>
              <div style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 280, margin: '0 auto' }}>
                Agrega arriendo, energía, agua, gas o internet para ver montos, fechas de vencimiento y pagar a un toque.
              </div>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {showForm && (
          <FacturaForm
            initial={editing ?? undefined}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {extOpen && <ExtModal token={extToken} loading={extLoading} onClose={() => setExtOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={toastStyle}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────
function Header({ onAdd, onExt, disabled }: { onAdd: () => void; onExt?: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Calendario de pagos
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--ink)', margin: '2px 0 0' }}>
          Facturas
        </h1>
      </div>
      {!disabled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onExt && (
            <motion.button whileTap={{ scale: 0.93 }} onClick={onExt} style={ghostBtnStyle} title="Conectar extensión de navegador">
              🧩 Extensión
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.93 }} onClick={onAdd} style={addBtnStyle}>
            + Agregar
          </motion.button>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 16, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ── Formulario (bottom-sheet) ─────────────────────────────────
interface FormState {
  providerId: string;
  nombre: string;
  numeroCuenta: string;
  monto: string;
  diaDelMes: string;
  categoria: string;
  urlPago: string;
}

function initialForm(initial?: FixedPaymentStatus): FormState {
  if (initial) {
    return {
      providerId: initial.providerId || 'otro',
      nombre: initial.nombre,
      numeroCuenta: initial.numeroCuenta || '',
      monto: initial.monto ? String(initial.monto) : '',
      diaDelMes: String(initial.diaDelMes || 1),
      categoria: initial.categoria || 'Hogar',
      urlPago: initial.urlPago || '',
    };
  }
  return { providerId: '', nombre: '', numeroCuenta: '', monto: '', diaDelMes: '1', categoria: 'Hogar', urlPago: '' };
}

function FacturaForm({ initial, onSave, onClose }: {
  initial?: FixedPaymentStatus;
  onSave: (p: FixedPayment) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(initial));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayA11y(true, onClose, panelRef);

  const prov = form.providerId ? getProvider(form.providerId) : undefined;
  const esOtro = !prov || prov.id === 'otro';
  const requiereCuenta = !!prov?.requiereCuenta;
  const esUtility = requiereCuenta;

  const pickProvider = (id: string) => {
    const p = getProvider(id);
    setForm(f => ({
      ...f,
      providerId: id,
      nombre: p && p.id !== 'otro' ? p.nombre : (f.nombre || ''),
      categoria: p?.categoria || f.categoria,
      urlPago: p?.urlPago || '',
    }));
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const monto = Number(form.monto.replace(/\D/g, ''));
    const dia = Number(form.diaDelMes);
    if (!form.providerId) { setErr('Elige un proveedor'); return; }
    if (!form.nombre.trim()) { setErr('Escribe un nombre'); return; }
    if (!dia || dia < 1 || dia > 28) { setErr('Día debe ser 1-28'); return; }
    if (!esUtility && (!monto || monto <= 0)) { setErr('Monto inválido'); return; }
    setSaving(true);
    try {
      await onSave({
        ...(initial?.id ? { id: initial.id } : {}),
        nombre: form.nombre.trim(),
        monto: monto || 0,
        diaDelMes: dia,
        categoria: form.categoria,
        tipo: esUtility ? 'utility' : (initial?.tipo ?? 'manual'),
        providerId: form.providerId,
        numeroCuenta: form.numeroCuenta.trim() || undefined,
        urlPago: form.urlPago.trim() || undefined,
      });
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={scrimStyle}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={panelRef}
        role="dialog" aria-modal="true" aria-label={initial ? 'Editar factura' : 'Nueva factura'}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={softSpring}
        style={sheetStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>{initial ? 'Editar factura' : 'Nueva factura'}</div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22 }}>✕</motion.button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <Field label="Proveedor">
            <select value={form.providerId} onChange={e => pickProvider(e.target.value)} style={inputStyle}>
              <option value="" disabled>Elige un proveedor…</option>
              {SERVICIO_ORDER.map(serv => {
                const items = PROVIDERS.filter(p => p.servicio === serv);
                if (items.length === 0) return null;
                return (
                  <optgroup key={serv} label={SERVICIO_META[serv].label}>
                    {items.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </Field>

          {esOtro && (
            <Field label="Nombre">
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre de la factura" style={inputStyle} />
            </Field>
          )}

          {requiereCuenta && (
            <Field label="Número de cuenta / contrato">
              <input value={form.numeroCuenta} onChange={e => setForm(f => ({ ...f, numeroCuenta: e.target.value }))}
                placeholder="El de tu factura (no el nº de factura mensual)" inputMode="numeric" style={inputStyle} />
              {prov?.tieneConector
                ? <Hint>Se consultará el monto y la fecha automáticamente cada semana.</Hint>
                : <Hint>La consulta automática aún no está disponible para {prov?.nombre}; ingresa el monto manualmente.</Hint>}
            </Field>
          )}

          <Field label={esUtility ? 'Monto aproximado (opcional)' : 'Monto'}>
            <input value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
              placeholder="$0" inputMode="numeric" style={inputStyle} />
          </Field>

          <Field label="Día de vencimiento (1-28)">
            <input value={form.diaDelMes} onChange={e => setForm(f => ({ ...f, diaDelMes: e.target.value }))}
              type="number" min={1} max={28} style={inputStyle} />
          </Field>

          <Field label="Categoría">
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </Field>

          <Field label="Enlace de pago (opcional)">
            <input value={form.urlPago} onChange={e => setForm(f => ({ ...f, urlPago: e.target.value }))}
              placeholder="https://…" inputMode="url" style={inputStyle} />
          </Field>

          {err && <div style={{ fontSize: 13, color: '#dc2626' }}>{err}</div>}
          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={saving} style={submitStyle}>
            {saving ? 'Guardando…' : 'Guardar factura'}
          </motion.button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 400, lineHeight: 1.4 }}>{children}</span>;
}

function ExtModal({ token, loading, onClose }: { token: string | null; loading: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayA11y(true, onClose, panelRef);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!token) return;
    navigator.clipboard?.writeText(token)
      .then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); })
      .catch(() => {});
  };
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={scrimStyle}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-label="Conectar extensión"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={softSpring} style={sheetStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--ink)' }}>Conectar extensión</div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 22 }}>✕</motion.button>
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.5, marginTop: 12 }}>
          La extensión lee el monto y la fecha de tu factura en el portal del proveedor (tu sesión) y los envía aquí.
          Instálala (carpeta <b>extension/</b>, modo desarrollador en Chrome), abre sus <b>Opciones</b> y pega este token:
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input readOnly value={loading ? 'Generando…' : (token || 'Error al generar')} onFocus={e => e.target.select()}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 }} />
          <motion.button whileTap={{ scale: 0.95 }} onClick={copy} disabled={!token} style={payBtnStyle}>
            {copied ? '✓' : 'Copiar'}
          </motion.button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4, marginTop: 10 }}>
          Primero agrega aquí la factura del proveedor (para que la extensión sepa a cuál corresponde).
          Generar un token nuevo invalida el anterior.
        </p>
      </motion.div>
    </motion.div>,
    document.body
  );
}

// ── Estilos (tokens CSS) ──────────────────────────────────────
const pageStyle: React.CSSProperties = { padding: 'max(24px, env(safe-area-inset-top)) 16px 120px' };
const summaryStyle: React.CSSProperties = { background: 'var(--surface)', borderRadius: 16, padding: '14px 18px', marginTop: 18, display: 'flex', gap: 16 };
const rowStyle: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 14px' };
const rowMainStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)' };
const emptyStyle: React.CSSProperties = { textAlign: 'center', padding: '48px 16px', background: 'var(--surface)', borderRadius: 18, marginTop: 24 };
const addBtnStyle: React.CSSProperties = { height: 38, padding: '0 16px', borderRadius: 12, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' };
const payBtnStyle: React.CSSProperties = { height: 32, padding: '0 14px', borderRadius: 10, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' };
const ghostBtnStyle: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'none', color: 'var(--ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-body)' };
const scrimStyle: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 'var(--z-modal, 9990)', background: 'var(--scrim, rgba(15,23,42,0.55))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' };
const sheetStyle: React.CSSProperties = { width: '100%', maxWidth: 480, background: 'var(--card)', borderRadius: '24px 24px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))', maxHeight: '88vh', overflowY: 'auto' };
const inputStyle: React.CSSProperties = { height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 14px', fontSize: 15, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'var(--font-body)', width: '100%' };
const submitStyle: React.CSSProperties = { height: 50, borderRadius: 14, border: 'none', background: 'var(--blue-700)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-body)', marginTop: 4 };
const toastStyle: React.CSSProperties = { position: 'fixed', bottom: 'calc(96px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 9997, background: 'var(--ink)', color: '#fff', borderRadius: 999, padding: '10px 18px', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', maxWidth: '90%', textAlign: 'center', boxShadow: 'var(--shadow-float)' };
