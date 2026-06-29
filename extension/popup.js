const $ = (id) => document.getElementById(id);
const DEFAULT_BACKEND = 'https://finanzas-abiertas.pages.dev';

// Función inyectada en la página del portal. Debe ser autocontenida (se serializa).
function extractBillFromPage() {
  const pad = (n) => { n = String(n); return n.length < 2 ? '0' + n : n; };
  const meses = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, setiembre:9, octubre:10, noviembre:11, diciembre:12 };
  function parseDate(s) {
    let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-zé]+)\s+de\s+(\d{4})/);
    if (m && meses[m[2]]) return m[3] + '-' + pad(meses[m[2]]) + '-' + pad(m[1]);
    return null;
  }
  const norm = (document.body.innerText || '').replace(/\s+/g, ' ');
  const low = norm.toLowerCase();

  let amount = null;
  const amtKw = ['valor a pagar', 'total a pagar', 'total factura', 'valor factura', 'saldo a pagar', 'valor total', 'pago total', 'total a cancelar'];
  for (const kw of amtKw) {
    const i = low.indexOf(kw);
    if (i >= 0) {
      const m = norm.slice(i, i + 120).match(/\$?\s*([\d][\d.,]{3,})/);
      if (m) { const n = parseInt(m[1].replace(/[.,]/g, ''), 10); if (n > 0) { amount = n; break; } }
    }
  }
  if (amount == null) {
    const all = (norm.match(/\$\s*[\d][\d.,]{3,}/g) || []).map(s => parseInt(s.replace(/[^\d]/g, ''), 10)).filter(n => n > 0);
    if (all.length) amount = Math.max.apply(null, all);
  }

  let date = null;
  const dateKw = ['fecha límite', 'fecha limite', 'pago oportuno', 'fecha de pago', 'fecha máxima', 'fecha maxima', 'pague hasta', 'fecha de vencimiento', 'vencimiento', 'vence'];
  for (const kw of dateKw) {
    const i = low.indexOf(kw);
    if (i >= 0) { date = parseDate(norm.slice(i, i + 80)); if (date) break; }
  }
  return { amount, date };
}

async function init() {
  const cfg = await chrome.storage.local.get(['extToken', 'backendUrl']);
  const backendUrl = cfg.backendUrl || DEFAULT_BACKEND;
  if (!cfg.extToken) {
    $('msg').innerHTML = 'Falta conectar. Abre <a id="opt">Opciones</a> y pega el token desde el app (Facturas → Conectar extensión).';
    $('opt').onclick = () => chrome.runtime.openOptionsPage();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let provider = null;
  try { provider = detectProvider(new URL(tab.url).hostname); } catch (_) {}

  if (!provider) {
    $('prov').textContent = 'Proveedor no reconocido';
    $('msg').className = 'msg muted';
    $('msg').textContent = 'Abre la página de tu factura en el portal del proveedor (Acueducto, Vanti, Enel, ETB…) y vuelve a abrir la extensión.';
    return;
  }
  $('prov').textContent = provider.nombre;

  // Extraer de la página activa.
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractBillFromPage });
    const data = (res && res.result) || {};
    if (data.amount) $('monto').value = data.amount;
    if (data.date) $('venc').value = data.date;
    if (!data.amount && !data.date) {
      $('msg').className = 'msg muted';
      $('msg').textContent = 'No pude leer monto/fecha automáticamente. Escríbelos a mano y envía.';
    }
  } catch (_) {
    $('msg').className = 'msg muted';
    $('msg').textContent = 'No pude leer la página. Escribe monto/fecha a mano.';
  }

  $('send').disabled = false;
  $('send').onclick = () => send(provider, backendUrl, cfg.extToken);
}

async function send(provider, backendUrl, extToken) {
  const monto = parseInt(($('monto').value || '').replace(/[^\d]/g, ''), 10);
  const fechaVencimiento = $('venc').value || null;
  if ((!monto || monto <= 0) && !fechaVencimiento) {
    $('msg').className = 'msg err'; $('msg').textContent = 'Pon al menos el monto o la fecha.'; return;
  }
  $('send').disabled = true;
  $('msg').className = 'msg muted'; $('msg').textContent = 'Enviando…';
  try {
    const r = await fetch(backendUrl + '/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ type: 'ingestFactura', extToken, providerId: provider.providerId, monto: monto || null, fechaVencimiento }),
    });
    const json = await r.json();
    if (json.ok) {
      $('msg').className = 'msg ok';
      $('msg').textContent = '✓ Enviado: ' + (json.factura ? json.factura.nombre : provider.nombre);
    } else {
      $('msg').className = 'msg err';
      $('msg').textContent = json.error || 'No se pudo enviar';
      $('send').disabled = false;
    }
  } catch (e) {
    $('msg').className = 'msg err';
    $('msg').textContent = 'Error de red: ' + e.message;
    $('send').disabled = false;
  }
}

init();
