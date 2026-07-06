const $ = (id) => document.getElementById(id);
// DEFAULT_BACKEND viene de config.js (cargado antes que este script — ver popup.html).

// numeroCuenta leído del portal (si se encontró). Se envía junto al payload para que el
// backend haga match fino cuando hay varias facturas del mismo proveedor.
let cachedNumeroCuenta = null;

// ──────────────────────────────────────────────────────────────────────────
// Extracción en la página del portal. Debe ser autocontenida (se serializa).
// Recibe el `providerId` (string) para aplicar intentos específicos por portal;
// si no hay selectores definidos o no matchean, cae a la heurística genérica.
// Devuelve { amount, date, numeroCuenta } (cualquiera puede ser null).
// ──────────────────────────────────────────────────────────────────────────
function extractBillFromPage(providerId) {
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

  // ── Intentos por proveedor: textos exactos que usa cada portal colombiano ──
  // Cada entrada son keywords ordenadas por prioridad. Si una matchea, se usa ese
  // monto/fecha y se deja de buscar. Mantener la heurística genérica como fallback.
  const PER_PROVIDER = {
    'acueducto-bogota': {
      amt: ['valor a pagar', 'total a pagar', 'saldo a pagar', 'valor total'],
      date: ['fecha limite de pago', 'fecha límite de pago', 'fecha de pago', 'pago oportuno', 'vence', 'vencimiento'],
    },
    'vanti': {
      amt: ['total a pagar', 'valor a pagar', 'saldo a pagar', 'factura total', 'pago total'],
      date: ['fecha de pago oportuno', 'pago oportuno', 'fecha límite', 'fecha limite', 'vencimiento', 'vence'],
    },
    'enel-codensa': {
      amt: ['total a pagar', 'valor a pagar', 'valor factura', 'saldo a pagar', 'total factura'],
      date: ['fecha límite de pago', 'fecha limite de pago', 'pago oportuno', 'fecha de vencimiento', 'vencimiento', 'vence'],
    },
    'etb': {
      amt: ['total a pagar', 'valor a pagar', 'saldo a pagar', 'valor total', 'pago total'],
      date: ['fecha límite', 'fecha limite', 'pago oportuno', 'fecha de vencimiento', 'vencimiento', 'vence'],
    },
  };
  const kwAmtGeneric = ['valor a pagar', 'total a pagar', 'total factura', 'valor factura', 'saldo a pagar', 'valor total', 'pago total', 'total a cancelar'];
  const kwDateGeneric = ['fecha límite', 'fecha limite', 'pago oportuno', 'fecha de pago', 'fecha máxima', 'fecha maxima', 'pague hasta', 'fecha de vencimiento', 'vencimiento', 'vence'];

  // MONTO: busca el primer número COP ($X o X.XXX.XXX) tras la keyword, con prioridad
  // por cercanía al label. Itera por keywords ordenadas; la primera que produzca un
  // monto válido > 0 gana.
  function montoTrasKeywords(kws) {
    for (const kw of kws) {
      const i = low.indexOf(kw);
      if (i < 0) continue;
      // Ventana corta (120 chars) para priorizar cercanía al label correcto.
      const m = norm.slice(i, i + 120).match(/\$?\s*([\d][\d.,]{3,})/);
      if (m) {
        const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
        if (n > 0) return n;
      }
    }
    return null;
  }
  // FECHA: primera keyword que produzca una fecha parseable.
  function fechaTrasKeywords(kws) {
    for (const kw of kws) {
      const i = low.indexOf(kw);
      if (i < 0) continue;
      const d = parseDate(norm.slice(i, i + 80));
      if (d) return d;
    }
    return null;
  }

  const spec = PER_PROVIDER[providerId] || {};
  let amount = montoTrasKeywords(spec.amt || kwAmtGeneric);
  if (amount == null) {
    // Fallback: de todos los valores "$X" de la página, descarta los triviales (<1000,
    // típicamente decimales de consumo) y toma el más FRECUENTE (no el máximo, que en
    // SPAs captura totales erróneos como "consumo del período anterior").
    const all = (norm.match(/\$?\s*[\d][\d.,]{3,}/g) || [])
      .map(s => parseInt(s.replace(/[^\d]/g, ''), 10))
      .filter(n => n > 1000);
    if (all.length) {
      // Moda simple: agrupa y toma el más repetido; si hay empate, el mayor.
      const counts = {};
      for (const n of all) counts[n] = (counts[n] || 0) + 1;
      amount = Object.entries(counts).reduce((best, [val, c]) => {
        if (!best) return [Number(val), c];
        return c > best[1] || (c === best[1] && Number(val) > best[0]) ? [Number(val), c] : best;
      }, null)[0];
    }
  }

  const date = fechaTrasKeywords(spec.date || kwDateGeneric);

  // NÚMERO DE CUENTA/CONTRATO visible en el portal (para match fino en el backend
  // cuando hay varias facturas del mismo proveedor). Solo dígitos largos (>=5).
  const cuentaMatch = low.match(/(?:n(?:ú|u)mero\s+de\s+(?:cuenta|contrato|suscriptor|cliente|servicio)|contrato\s*n[ºo\.]|referencia)[^0-9]{0,12}(\d{5,})/);
  const numeroCuenta = cuentaMatch ? cuentaMatch[1] : null;

  return { amount, date, numeroCuenta };
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

  // Extraer de la página activa, pasando el providerId para selectores por portal.
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractBillFromPage,
      args: [provider.providerId],
    });
    const data = (res && res.result) || {};
    if (data.amount) $('monto').value = data.amount;
    if (data.date) $('venc').value = data.date;
    // Guardamos el numeroCuenta leído para usarlo en el envío (match fino en el backend).
    cachedNumeroCuenta = data.numeroCuenta || null;
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
    const payload = { type: 'ingestFactura', extToken, providerId: provider.providerId, monto: monto || null, fechaVencimiento };
    if (cachedNumeroCuenta) payload.numeroCuenta = cachedNumeroCuenta;
    const r = await fetch(backendUrl + '/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
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
