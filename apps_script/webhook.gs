// ============================================================
// Personal Finance Manager — Google Apps Script Webhook
// ============================================================
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
//
// SECURITY: Set WEBHOOK_SECRET in Script Properties alongside ANTHROPIC_API_KEY.
// All requests (GET and POST) must include header X-Webhook-Secret matching that value.
// Netlify must have VITE_WEBHOOK_SECRET env var set to the same secret.
// ============================================================

// Multi-user: single spreadsheet, one tab per user.
// Script Properties needed:
//   SHEET_ID      → Google Sheet ID (shared spreadsheet)
//   APP_PIN_jose  → 4-digit PIN for Jose
//   APP_PIN_dani  → 4-digit PIN for Dani
var ALLOWED_USERS = ["jose", "dani"];

// ── User validation ───────────────────────────────────────────
function _validateUserId(userId) {
  if (!userId || ALLOWED_USERS.indexOf(userId) === -1) {
    throw new Error("userId inválido: '" + userId + "'. Valores permitidos: " + ALLOWED_USERS.join(", "));
  }
}

// ── Per-user Sheet accessor ───────────────────────────────────
// Single spreadsheet; each user gets a tab named after them (e.g. "Jose", "Dani").
function _getSheet(userId) {
  var props   = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID no configurado en Script Properties");
  var ss       = SpreadsheetApp.openById(sheetId);
  var tabName  = userId.charAt(0).toUpperCase() + userId.slice(1); // "jose" → "Jose"
  var sheet    = ss.getSheetByName(tabName);
  return { ss: ss, sheet: sheet, sheetId: sheetId, tabName: tabName };
}

// ── Rate limiting (per-user daily cap via CacheService) ───────
function _checkRateLimit(action, userId) {
  var cache = CacheService.getScriptCache();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var key = "rate_" + action + "_" + (userId || "global") + "_" + today;
  var count = parseInt(cache.get(key) || "0", 10);
  var limits = { chat: 100, voice: 50 };
  var limit = limits[action] !== undefined ? limits[action] : 100;
  if (count >= limit) {
    throw new Error("Límite diario de llamadas de IA alcanzado. Intenta mañana.");
  }
  cache.put(key, String(count + 1), 86400);
}

// ── Auth check ───────────────────────────────────────────────
function _checkSecret(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  if (!secret) throw new Error("WEBHOOK_SECRET no configurado en Script Properties");
  // Secret travels as _secret query param (GET) or _secret body field (POST).
  var fromParam = e && e.parameter && e.parameter["_secret"];
  var fromBody = null;
  if (!fromParam && e && e.postData) {
    try { fromBody = JSON.parse(e.postData.contents || "{}")["_secret"]; } catch(err) {}
  }
  var incoming = fromParam || fromBody;
  if (incoming !== secret) throw new Error("Unauthorized");
}

// ── GET endpoint — leer transacciones (usado por la PWA) ─────
function doGet(e) {
  try {
    _checkSecret(e);
  } catch(err) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  var userId = (e && e.parameter && e.parameter.userId || "").toLowerCase();
  try { _validateUserId(userId); } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }

  var action = e && e.parameter && e.parameter.action;

  if (action === "transactions") {
    return jsonResponse({ ok: true, data: getTransactions(userId) });
  }

  return jsonResponse({ ok: true, message: "Finance Webhook v2 — usa ?action=transactions&userId=jose para leer datos" });
}

// ── POST endpoint — recibir SMS del iPhone o entrada manual ──
function doPost(e) {
  try {
    _checkSecret(e);
  } catch(err) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  try {
    var payload = JSON.parse(e.postData.contents);
    var type    = payload.type || "";
    var bank    = (payload.bank || "").toLowerCase();
    var userId  = (payload.userId || "").toLowerCase();

    // Validate userId for all request types
    _validateUserId(userId);

    // Entrada manual desde la PWA
    if (type === "manual") {
      var data = {
        timestamp:    new Date(),
        fecha:        payload.fecha ? new Date(payload.fecha) : new Date(),
        banco:        payload.banco    || "Manual",
        tipo:         payload.tipo     || "Compra",
        monto:        parseFloat(payload.monto) || 0,
        comercio:     payload.comercio || "",
        tarjeta:      payload.tarjeta  || "",
        categoria:    payload.categoria || detectCategory(payload.comercio || ""),
        sms_original: "MANUAL"
      };
      appendToSheet(data, userId);
      return jsonResponse({ ok: true, data: data });
    }

    // Parseo de nota de voz con Claude API
    if (type === "voice") {
      var text = payload.text || "";
      if (!text) return jsonResponse({ ok: false, error: "empty text" });
      // Sanitize: max 500 chars to limit token abuse
      text = String(text).slice(0, 500);
      _checkRateLimit("voice", userId);
      var parsed = parseVoice(text);
      return jsonResponse({ ok: true, data: parsed });
    }

    // Actualizar categoría de una transacción existente
    if (type === "updateCategory") {
      var ts  = payload.timestamp || "";
      var cat = payload.categoria  || "";
      if (!ts || !cat) return jsonResponse({ ok: false, error: "Faltan timestamp y categoria" });
      updateCategoryInSheet(ts, cat, userId);
      return jsonResponse({ ok: true });
    }

    // Validar PIN del usuario
    if (type === "validatePin") {
      var pin = String(payload.pin || "");
      if (!pin) return jsonResponse({ ok: false, error: "PIN requerido" });
      var storedPin = PropertiesService.getScriptProperties().getProperty("APP_PIN_" + userId);
      if (!storedPin) return jsonResponse({ ok: false, error: "APP_PIN_" + userId + " no configurado en Script Properties" });
      if (pin === storedPin) return jsonResponse({ ok: true });
      return jsonResponse({ ok: false, error: "PIN incorrecto" });
    }

    // Eliminar una transacción
    if (type === "deleteTransaction") {
      var ts = payload.timestamp || "";
      if (!ts) return jsonResponse({ ok: false, error: "timestamp requerido" });
      deleteTransactionFromSheet(ts, userId);
      return jsonResponse({ ok: true });
    }

    // Actualizar campos de una transacción
    if (type === "updateTransaction") {
      var ts = payload.timestamp || "";
      if (!ts) return jsonResponse({ ok: false, error: "timestamp requerido" });
      updateTransactionFields(ts, payload, userId);
      return jsonResponse({ ok: true });
    }

    // Chat con el asistente financiero
    if (type === "chat") {
      var question = payload.question || "";
      var context  = payload.context  || {};
      if (!question) return jsonResponse({ ok: false, error: "empty question" });
      // Sanitize: max 500 chars
      question = String(question).slice(0, 500);
      _checkRateLimit("chat", userId);
      var answer = handleChat(question, context);
      return jsonResponse({ ok: true, data: { answer: answer } });
    }

    // SMS automático desde iOS Shortcut
    var sms    = (payload.sms    || "").trim();
    var sentAt = payload.timestamp || new Date().toISOString();

    if (!sms) return jsonResponse({ ok: false, error: "empty sms" });

    // Silently drop vetoed messages (never reach the Sheet)
    if (isVetoed(sms)) {
      return jsonResponse({ ok: true, skipped: true, reason: "vetoed" });
    }

    var resolvedBank = bank || detectBank(sms);

    var parsed;
    if (resolvedBank === "bogota") {
      parsed = parseBogota(sms);
    } else if (resolvedBank === "itau") {
      parsed = parseItau(sms);
    } else if (resolvedBank === "davivienda") {
      parsed = parseDavivienda(sms);
    } else if (resolvedBank === "bancolombia") {
      parsed = parseBancolombia(sms);
    } else {
      return jsonResponse({ ok: false, error: "unknown bank: " + (bank || "could not detect") });
    }

    if (!parsed) {
      return jsonResponse({ ok: false, error: "parse failed", bank: resolvedBank });
    }

    // Reversal: find and delete the original transaction instead of adding a new row
    if (parsed.reversal) {
      var removed = reverseTransaction(parsed, userId);
      return jsonResponse({ ok: true, reversed: true, found: removed });
    }

    parsed.timestamp    = new Date();
    parsed.categoria    = detectCategory(parsed.comercio);
    parsed.sms_original = sms;

    appendToSheet(parsed, userId);
    return jsonResponse({ ok: true, data: parsed });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Leer transacciones del Sheet ──────────────────────────────
// Returns transactions from the last 12 months (or all if fewer).
function getTransactions(userId) {
  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  var headers = rows[0];
  var result  = [];

  // Find the "Fecha" column index for date filtering
  var fechaCol = headers.indexOf("Fecha");
  var cutoff   = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1); // 12 months back

  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
    // Skip rows older than 12 months
    if (fechaCol >= 0) {
      var cell = row[fechaCol];
      var d = cell instanceof Date ? cell : new Date(String(cell));
      if (!isNaN(d.getTime()) && d < cutoff) continue;
    }
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }

  return result;
}

// ── Parseo de voz con Claude API ──────────────────────────────
function parseVoice(text) {
  var key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY no configurada en Script Properties");

  // FIX: user input goes in the user message (not concatenated into system prompt)
  // This prevents prompt injection via voice input.
  var systemPrompt = "Extrae la información de una transacción financiera en pesos colombianos. " +
    "Responde ÚNICAMENTE con un objeto JSON válido con exactamente estos campos: " +
    "monto (número sin símbolos ni puntos de miles, ej: 50000), " +
    "comercio (nombre del lugar o descripción, string), " +
    "categoria (una de: Comida, Transporte, Suscripciones, Mercado, Salud, Deporte, Compras, Alojamiento, Viajes, Software, Otro), " +
    "banco (Bogotá o Itaú u Otro), " +
    "tipo (Compra, Débito, Transferencia u Otro). " +
    "Si algún campo no está claro en el texto, usa el valor más probable.";

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01"
    },
    payload: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:     systemPrompt,
      messages:   [{ role: "user", content: text }]  // user input is isolated here
    }),
    muteHttpExceptions: true
  });

  var result  = JSON.parse(response.getContentText());
  var content = result.content && result.content[0] && result.content[0].text;
  if (!content) throw new Error("Claude no devolvió respuesta");

  var jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no devolvió JSON válido: " + content);

  return JSON.parse(jsonMatch[0]);
}

// ── Chat con asistente financiero ────────────────────────────
function handleChat(question, context) {
  var key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY no configurada en Script Properties");

  // System prompt contains server-generated context (safe). User question is isolated in the user turn.
  var systemPrompt = "Eres un asistente financiero personal del usuario. El usuario habla español colombiano. " +
    "Responde siempre en español. Puedes responder cualquier pregunta sobre los datos financieros del usuario, " +
    "sin importar qué tan específica o abierta sea. " +
    "Cuando el análisis lo requiera, sé detallado y usa listas o viñetas para mayor claridad. " +
    "Tienes acceso a la lista completa de transacciones en 'transacciones' y también a resúmenes pre-calculados " +
    "como 'comerciosPorCategoria' que ya agrupa los comercios por categoría con monto y número de compras. " +
    "Usa los datos más convenientes para responder con precisión. " +
    "Datos financieros del usuario (últimos 6 meses): " + JSON.stringify(context);

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01"
    },
    payload: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: "user", content: question }]
    }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  var result;
  try {
    result = JSON.parse(body);
  } catch (parseErr) {
    throw new Error("Anthropic devolvió respuesta no-JSON (HTTP " + code + "): " + body.slice(0, 120));
  }

  if (code !== 200) {
    var apiErr = result.error && result.error.message
      ? result.error.message
      : JSON.stringify(result).slice(0, 150);
    throw new Error("Anthropic API error " + code + ": " + apiErr);
  }

  var content = result.content && result.content[0] && result.content[0].text;
  if (!content) throw new Error("Respuesta inesperada de Anthropic: " + JSON.stringify(result).slice(0, 100));
  return content;
}

// ── Veto rules — messages silently ignored, never written to Sheet ────────────
// Add a regex per pattern you want to exclude.
var VETO_RULES = [
  // Itaú outbound transfer from savings account (e.g. rent payment)
  // "Se realizo Transferencia de tu Cuenta de Ahorros ****XXXX por $..."
  /Se realizo\s+Transferencia\s+de tu\s+Cuenta de Ahorros/i,
  // Itaú deposit/income TO account — excluded until the app handles income
  // "Se realizo un Deposito en Efectivo a tu Cuenta de Ahorros ****XXXX por $..."
  /Se realizo\s+u?n?\s+Deposito\s+en\s+Efectivo\s+a\s+tu\s+Cuenta/i
];

function isVetoed(sms) {
  for (var i = 0; i < VETO_RULES.length; i++) {
    if (VETO_RULES[i].test(sms)) return true;
  }
  return false;
}

// ── Auto-detect bank from SMS content ────────────────────────
function detectBank(sms) {
  if (/^DAVIVIENDA:/i.test(sms))         return "davivienda";
  if (/^Bancolombia:/i.test(sms))         return "bancolombia";
  if (/^Banco\s+de\s+Bogot/i.test(sms)) return "bogota";
  if (/\bITAU\b/i.test(sms))             return "itau";
  return null;
}

// ── Davivienda ────────────────────────────────────────────────
// Aprobado:  "DAVIVIENDA: Compra . Aprobado(a), $5,550, Tarjeta *8863, Hora 07:12,Lugar Mercado Pago*TEMBICI"
// Reversada: "DAVIVIENDA: Compra Reversada(o)  , $10,939, Tarjeta *8863, Hora 10:00,Lugar UBER RIDES            ."
function parseDavivienda(sms) {
  var re = /Compra\s+(.+?)\s*,\s*\$([\d,.]+)\s*,\s*Tarjeta\s+(\*?\d+)\s*,\s*Hora\s+(\d{2}:\d{2})\s*,\s*Lugar\s+(.+?)\.?\s*$/i;
  var m = sms.match(re);
  if (!m) return null;

  var isReversal = /Revers/i.test(m[1]);
  var monto      = parseMonto(m[2]);
  var tarjeta    = m[3];
  var hora       = m[4];
  var lugar      = normalizeComercio(m[5].trim());

  var now = new Date();
  var hp = hora.split(":");
  now.setHours(parseInt(hp[0]), parseInt(hp[1]), 0, 0);

  return {
    banco:    "Davivienda",
    tipo:     isReversal ? "Reversada" : "Compra",
    monto:    monto,
    tarjeta:  "Tarjeta *" + tarjeta.replace(/^\*/, ""),
    fecha:    now,
    comercio: lugar,
    reversal: isReversal
  };
}

// ── Bancolombia ───────────────────────────────────────────────
// PSE:   "Bancolombia: Pagaste $100,000.00 a Acciones y Valores S A desde tu producto 0018 el 02/06/2026 14:00:19."
// Bre-B: "Bancolombia: DANIELA, transferiste $137,500.00 a la llave 3164707724 desde tu cuenta *0018 a Natalia Karaman Plata el 27/05/26 a las 14:27."
function parseBancolombia(sms) {
  // PSE / pago desde producto
  var rePSE = /Pagaste\s+\$([\d,.]+)\s+a\s+(.+?)\s+desde\s+tu\s+producto\s+(\d+)\s+el\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/i;
  var mp = sms.match(rePSE);
  if (mp) {
    return {
      banco:    "Bancolombia",
      tipo:     "Pago PSE",
      monto:    parseMontoUS(mp[1]),
      comercio: normalizeComercio(mp[2].trim()),
      tarjeta:  "Producto " + mp[3],
      fecha:    parseFechaBancolombia(mp[4], mp[5])
    };
  }

  // Bre-B transfer (date format DD/MM/YY)
  var reBreb = /transferiste\s+\$([\d,.]+)\s+a\s+la\s+llave\s+[\d]+\s+desde\s+tu\s+cuenta\s+(\*?\d+)\s+a\s+(.+?)\s+el\s+(\d{2}\/\d{2}\/\d{2})\s+a\s+las\s+(\d{2}:\d{2})/i;
  var mb = sms.match(reBreb);
  if (mb) {
    return {
      banco:    "Bancolombia",
      tipo:     "Transferencia",
      monto:    parseMontoUS(mb[1]),
      tarjeta:  "Cuenta *" + mb[2].replace(/^\*/, ""),
      comercio: normalizeComercio(mb[3].trim()),
      fecha:    parseFechaBancolombia(mb[4], mb[5])
    };
  }

  return null;
}

function parseFechaBancolombia(fechaStr, horaStr) {
  var p  = fechaStr.split("/");
  var hp = horaStr.split(":");
  var year = p[2].length === 2 ? 2000 + parseInt(p[2]) : parseInt(p[2]);
  return new Date(year, parseInt(p[1]) - 1, parseInt(p[0]),
                  parseInt(hp[0]), parseInt(hp[1]), 0);
}

// Bancolombia sends amounts in US format: 100,000.00 (comma=thousands, period=decimal)
function parseMontoUS(str) {
  return parseFloat(str.replace(/,/g, ""));
}

// ── Reversal — find and delete the matching original transaction ──
// Matches on banco, tarjeta (last 4 digits), and monto within the last 30 days.
function reverseTransaction(parsed, userId) {
  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) return false;
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];

  var bancoCol   = hdrs.indexOf("Banco");
  var tipoCol    = hdrs.indexOf("Tipo");
  var montoCol   = hdrs.indexOf("Monto (COP)");
  var tarjetaCol = hdrs.indexOf("Tarjeta/Cuenta");
  var fechaCol   = hdrs.indexOf("Fecha");

  var last4match = parsed.tarjeta.match(/(\d{4})$/);
  if (!last4match) return false;
  var last4 = last4match[1];

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (String(row[bancoCol]).trim() !== parsed.banco) continue;
    if (String(row[tipoCol]).trim() !== "Compra") continue;
    if (Math.abs(parseFloat(row[montoCol]) - parsed.monto) > 0.01) continue;
    if (String(row[tarjetaCol]).indexOf(last4) === -1) continue;
    var rowDate = row[fechaCol] instanceof Date ? row[fechaCol] : new Date(String(row[fechaCol]));
    if (!isNaN(rowDate.getTime()) && rowDate < cutoff) continue;
    sheet.deleteRow(i + 1);
    return true;
  }
  return false;
}

// ── Banco de Bogotá ──────────────────────────────────────────
// "Banco de Bogota: Tu compra por 130,456 fue aprobada con
//  Tarjeta Crédito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB ¿Dudas?..."
function parseBogota(sms) {
  var re = /Tu\s+(\w+)\s+por\s+([\d,.]+)\s+fue\s+\w+\s+con\s+(Tarjeta\s+(?:Cr[eé]dito|D[eé]bito)|Cuenta)\s+(\d+)\s+el\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+en\s+(.+?)(?:\s*[¿?]Dudas|$)/i;
  var m = sms.match(re);
  if (!m) return null;

  return {
    banco:    "Bogotá",
    tipo:     normalizeTipo(m[1]),
    monto:    parseMonto(m[2]),
    tarjeta:  m[3].trim() + " " + m[4],
    fecha:    parseFechaBogota(m[5], m[6]),
    comercio: normalizeComercio(m[7].trim())
  };
}

function parseFechaBogota(fechaStr, horaStr) {
  var p  = fechaStr.split("/");
  var hp = horaStr.split(":");
  return new Date(2000 + parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]),
                  parseInt(hp[0]), parseInt(hp[1]), parseInt(hp[2]));
}

// ── Itaú ─────────────────────────────────────────────────────
// Patrón 1 — compra con tarjeta
// "Se realizo una compra en THE NEW YORK TIMES desde tu
//  Tarjeta Credito ****8439 por $7,293 el 2026/05/30 02:04:18 ITAU..."
// Patrón 2 — débito de cuenta (transferencias, Bre-B)
// "Se realizo un debito de tu Cuenta de Ahorros ****8448
//  por $23,400 el 2026/05/29 15:00:00 ITAU..."
function parseItau(sms) {
  var rePurchase = /Se realizo una?\s+(\w+)\s+en\s+(.+?)\s+desde tu\s+(Tarjeta\s+(?:Credito|Debito))\s+\*+(\d+)\s+por\s+\$([\d,.]+)\s+el\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})/i;
  var mp = sms.match(rePurchase);
  if (mp) {
    return {
      banco:    "Itaú",
      tipo:     normalizeTipo(mp[1]),
      comercio: normalizeComercio(mp[2].trim()),
      tarjeta:  mp[3].trim() + " ****" + mp[4],
      monto:    parseMonto(mp[5]),
      fecha:    parseFechaItau(mp[6], mp[7])
    };
  }

  var reDebit = /Se realizo un\s+(\w+)\s+de tu\s+(Cuenta de (?:Ahorros|Corriente))\s+\*+(\d+)\s+por\s+\$([\d,.]+)\s+el\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})/i;
  var md = sms.match(reDebit);
  if (md) {
    return {
      banco:    "Itaú",
      tipo:     normalizeTipo(md[1]),
      comercio: md[2].trim(),
      tarjeta:  md[2].trim() + " ****" + md[3],
      monto:    parseMonto(md[4]),
      fecha:    parseFechaItau(md[5], md[6])
    };
  }

  return null;
}

function parseFechaItau(fechaStr, horaStr) {
  var p  = fechaStr.split("/");
  var hp = horaStr.split(":");
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]),
                  parseInt(hp[0]), parseInt(hp[1]), parseInt(hp[2]));
}

// ── Helpers ───────────────────────────────────────────────────
function parseMonto(str) {
  return parseFloat(str.replace(/\./g, "").replace(/,/g, ""));
}

function normalizeTipo(raw) {
  var map = {
    compra: "Compra", debito: "Débito", retiro: "Retiro",
    transferencia: "Transferencia", credito: "Crédito", abono: "Abono"
  };
  return map[raw.toLowerCase()] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

function detectCategory(merchant) {
  if (!merchant) return "";
  var m = merchant.toUpperCase();

  var rules = [
    { keywords: ["RAPPI", "UBER EATS", "IFOOD", "DOMICILIOS", "MC DONALDS", "MCDONALDS",
                 "BURGER", "PIZZA", "SUBWAY", "KFC", "CREPES", "RESTAURAN", "SUSHI"],   cat: "Comida" },
    { keywords: ["NETFLIX", "SPOTIFY", "YOUTUBE", "PRIME", "DISNEY", "HBO", "APPLE TV",
                 "NEW YORK TIMES"],                                                        cat: "Suscripciones" },
    { keywords: ["UBER", "CABIFY", "DIDI", "TAXI", "TRANSMILENIO", "SITP"],              cat: "Transporte" },
    { keywords: ["JUMBO", "CARREFOUR", "EXITO", "OLÉ", "ALMACENES", "SUPERTIENDA",
                 "MERQUEO", "METRO", "FRUVER"],                                           cat: "Mercado" },
    { keywords: ["FARMACIA", "DROGUER", "DROGUERÍA", "FARMATODO", "COLSUBSIDIO",
                 "CAFAM", "COMPENSAR"],                                                   cat: "Salud" },
    { keywords: ["COUNTRY CLUB", "GYM", "GIMNASIO", "SPORT", "GOLF", "TENNIS",
                 "TENIS", "PADEL", "FITNESS"],                                            cat: "Deporte" },
    { keywords: ["AMAZON", "MERCADOLIBRE", "FALABELLA", "HOMECENTER", "EASY",
                 "IKEA", "APPLE", "SAMSUNG"],                                             cat: "Compras" },
    { keywords: ["HOTEL", "AIRBNB", "BOOKING", "HOSPEDAJE", "HOSTAL"],                   cat: "Alojamiento" },
    { keywords: ["AVIANCA", "LATAM", "COPA", "AMERICAN", "AERO", "VUELO"],               cat: "Viajes" },
    { keywords: ["GOOGLE", "MICROSOFT", "ADOBE", "CANVA", "NOTION"],                     cat: "Software" }
  ];

  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i].keywords.length; j++) {
      if (m.indexOf(rules[i].keywords[j]) !== -1) return rules[i].cat;
    }
  }
  return "";
}

// ── Actualizar categoría de una fila existente ────────────────
var ALLOWED_CATEGORIES = ["Comida","Transporte","Suscripciones","Mercado","Salud","Deporte","Compras","Alojamiento","Viajes","Software","Otro"];

function updateCategoryInSheet(timestamp, categoria, userId) {
  // Allowlist check — prevents formula injection (H-03)
  if (ALLOWED_CATEGORIES.indexOf(categoria) === -1) {
    throw new Error("Categoría no válida: " + categoria);
  }

  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];
  var tsCol  = hdrs.indexOf("Timestamp");
  var catCol = hdrs.indexOf("Categoría");
  if (tsCol === -1 || catCol === -1) throw new Error("Columnas Timestamp/Categoría no encontradas");

  var targetMs = new Date(timestamp).getTime();
  for (var i = 1; i < data.length; i++) {
    var cell   = data[i][tsCol];
    var cellMs = cell instanceof Date ? cell.getTime() : new Date(String(cell)).getTime();
    if (Math.abs(cellMs - targetMs) < 2000) {
      sheet.getRange(i + 1, catCol + 1).setValue(categoria);
      return;
    }
  }
  throw new Error("Transacción no encontrada: " + timestamp);
}

// ── Eliminar una transacción por Timestamp ───────────────────
function deleteTransactionFromSheet(timestamp, userId) {
  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) throw new Error("Hoja no encontrada para usuario: " + userId);
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];
  var tsCol = hdrs.indexOf("Timestamp");
  if (tsCol === -1) throw new Error("Columna Timestamp no encontrada");
  var targetMs = new Date(timestamp).getTime();
  for (var i = 1; i < data.length; i++) {
    var cell   = data[i][tsCol];
    var cellMs = cell instanceof Date ? cell.getTime() : new Date(String(cell)).getTime();
    if (Math.abs(cellMs - targetMs) < 2000) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
  throw new Error("Transacción no encontrada: " + timestamp);
}

// ── Actualizar campos de una transacción por Timestamp ────────
function updateTransactionFields(timestamp, payload, userId) {
  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) throw new Error("Hoja no encontrada para usuario: " + userId);
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];
  var tsCol = hdrs.indexOf("Timestamp");
  if (tsCol === -1) throw new Error("Columna Timestamp no encontrada");
  var targetMs = new Date(timestamp).getTime();
  for (var i = 1; i < data.length; i++) {
    var cell   = data[i][tsCol];
    var cellMs = cell instanceof Date ? cell.getTime() : new Date(String(cell)).getTime();
    if (Math.abs(cellMs - targetMs) < 2000) {
      var row  = i + 1;
      var cols = {
        banco:     hdrs.indexOf("Banco"),
        tipo:      hdrs.indexOf("Tipo"),
        monto:     hdrs.indexOf("Monto (COP)"),
        comercio:  hdrs.indexOf("Comercio"),
        categoria: hdrs.indexOf("Categoría"),
        fecha:     hdrs.indexOf("Fecha"),
      };
      if (payload.banco     !== undefined && cols.banco     >= 0) sheet.getRange(row, cols.banco     + 1).setValue(payload.banco);
      if (payload.tipo      !== undefined && cols.tipo      >= 0) sheet.getRange(row, cols.tipo      + 1).setValue(payload.tipo);
      if (payload.monto     !== undefined && cols.monto     >= 0) sheet.getRange(row, cols.monto     + 1).setValue(parseFloat(payload.monto) || 0);
      if (payload.comercio  !== undefined && cols.comercio  >= 0) sheet.getRange(row, cols.comercio  + 1).setValue(payload.comercio);
      if (payload.fecha     !== undefined && cols.fecha     >= 0) sheet.getRange(row, cols.fecha     + 1).setValue(payload.fecha);
      if (payload.categoria !== undefined && ALLOWED_CATEGORIES.indexOf(payload.categoria) !== -1 && cols.categoria >= 0)
        sheet.getRange(row, cols.categoria + 1).setValue(payload.categoria);
      return;
    }
  }
  throw new Error("Transacción no encontrada: " + timestamp);
}

// ── Google Sheets writer ──────────────────────────────────────
function appendToSheet(data, userId) {
  var ref   = _getSheet(userId);
  var ss    = ref.ss;
  var sheet = ref.sheet;

  if (!sheet) {
    sheet = ss.insertSheet(ref.tabName);
    sheet.appendRow([
      "Timestamp", "Fecha", "Banco", "Tipo", "Monto (COP)",
      "Comercio", "Tarjeta/Cuenta", "Categoría", "SMS_Original"
    ]);
    sheet.getRange(1, 1, 1, 9).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
  }

  var fecha = data.fecha ? Utilities.formatDate(data.fecha, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : "";

  sheet.appendRow([
    Utilities.formatDate(data.timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    fecha,
    data.banco       || "",
    data.tipo        || "",
    data.monto       || "",
    data.comercio    || "",
    data.tarjeta     || "",
    data.categoria   || "",
    data.sms_original || ""
  ]);
}

// ── Normalización de nombre de comercio ───────────────────────
function normalizeComercio(s) {
  if (!s) return s;
  s = s.trim();

  // Strip payment aggregator prefixes — these are acquirers, not the actual merchant.
  // Mercado Pago format: "MERCADO PAGO*COMERCIO" or "MERCADOPAGO*COMERCIO"
  // Bold / Vault / PayU format: "BOLD*COMERCIO"
  s = s.replace(/^(?:BOLD|VAULT|PYU|PAYU)\*\s*/i, "");
  s = s.replace(/^MERCADO\s*PAGO[\s*]*/i, "").trim();  // handles *, space, or nothing after

  // Tiendas D1
  if (/TIENDA\s+D1\b/i.test(s)) return "Tiendas D1";

  // Tembici
  if (/TEMBICI/i.test(s)) return "Tembici";

  return s.trim();
}

// ── Response helper ───────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Test manual — ejecutar desde el editor de Apps Script ─────
function testParsers() {
  var smsBogota       = "Banco de Bogota: Tu compra por 130,456 fue aprobada con Tarjeta Crédito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA ¿Dudas? Llama a la Servilinea";
  var smsItauCard     = "Se realizo una compra en THE NEW YORK TIMES desde tu Tarjeta Credito ****8439 por $7,293  el 2026/05/30 02:04:18 ITAU Tel: 5818181 Bta o 018000512633 Nal para transacciones con tarjeta";
  var smsItauDebit    = "Se realizo un debito de tu Cuenta de Ahorros ****8448 por $23,400 el 2026/05/29 15:00:00 ITAU Tel: 5818181 Bta o 018000512633 Nal para transfrencias con Bre-B";
  var smsDaviApproved = "DAVIVIENDA: Compra . Aprobado(a), $5,550, Tarjeta *8863, Hora 07:12,Lugar Mercado Pago*TEMBICI";
  var smsDaviReversed = "DAVIVIENDA: Compra Reversada(o)  , $10,939, Tarjeta *8863, Hora 10:00,Lugar UBER RIDES            .";
  var smsBancoPSE     = "Bancolombia: Pagaste $100,000.00 a Acciones y Valores S A desde tu producto 0018 el 02/06/2026 14:00:19. ¿Dudas? Llamanos al 6045109095. Estamos cerca";
  var smsBancoBreb    = "Bancolombia: DANIELA, transferiste $137,500.00 a la llave 3164707724 desde tu cuenta *0018 a Natalia Karaman Plata el 27/05/26 a las 14:27. Con Bre-b es de una y gratis. Dudas al 018000912345";

  Logger.log("Bogotá:           " + JSON.stringify(parseBogota(smsBogota)));
  Logger.log("Itaú card:        " + JSON.stringify(parseItau(smsItauCard)));
  Logger.log("Itaú debit:       " + JSON.stringify(parseItau(smsItauDebit)));
  Logger.log("Davivienda compra:" + JSON.stringify(parseDavivienda(smsDaviApproved)));
  Logger.log("Davivienda reversa:" + JSON.stringify(parseDavivienda(smsDaviReversed)));
  Logger.log("Bancolombia PSE:  " + JSON.stringify(parseBancolombia(smsBancoPSE)));
  Logger.log("Bancolombia Bre-B:" + JSON.stringify(parseBancolombia(smsBancoBreb)));
  Logger.log("detectBank Davi:  " + detectBank(smsDaviApproved));
  Logger.log("detectBank Banco: " + detectBank(smsBancoPSE));
}
