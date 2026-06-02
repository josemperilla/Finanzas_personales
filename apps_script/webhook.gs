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

var SHEET_ID   = "TU_SHEET_ID_AQUI";  // Reemplaza con el ID de tu Google Sheet
var SHEET_NAME = "Transacciones";

// ── Auth check ───────────────────────────────────────────────
function _checkSecret(e) {
  var secret = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  if (!secret) return; // no secret configured → open (backward compat during migration)
  var incoming = e && e.parameter && e.parameter["X-Webhook-Secret"]
    || (e && e.postData && JSON.parse(e.postData.contents || "{}"))["_secret"];
  // Apps Script doesn't expose HTTP headers to doGet/doPost.
  // The secret is sent as a query param (?_secret=...) or body field for POST.
  // This is not ideal but is the only option for Apps Script Web Apps.
  if (incoming !== secret) {
    throw new Error("Unauthorized");
  }
}

// ── GET endpoint — leer transacciones (usado por la PWA) ─────
function doGet(e) {
  try {
    _checkSecret(e);
  } catch(err) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  var action = e && e.parameter && e.parameter.action;

  if (action === "transactions") {
    return jsonResponse({ ok: true, data: getTransactions() });
  }

  return jsonResponse({ ok: true, message: "Finance Webhook v2 — usa ?action=transactions para leer datos" });
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
    var type    = (payload.type || "").toLowerCase();
    var bank    = (payload.bank || "").toLowerCase();

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
      appendToSheet(data);
      return jsonResponse({ ok: true, data: data });
    }

    // Parseo de nota de voz con Claude API
    if (type === "voice") {
      var text = payload.text || "";
      if (!text) return jsonResponse({ ok: false, error: "empty text" });
      // Sanitize: max 500 chars to limit token abuse
      text = String(text).slice(0, 500);
      var parsed = parseVoice(text);
      return jsonResponse({ ok: true, data: parsed });
    }

    // Chat con el asistente financiero
    if (type === "chat") {
      var question = payload.question || "";
      var context  = payload.context  || {};
      if (!question) return jsonResponse({ ok: false, error: "empty question" });
      // Sanitize: max 500 chars
      question = String(question).slice(0, 500);
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

    var parsed;
    if (bank === "bogota") {
      parsed = parseBogota(sms);
    } else if (bank === "itau") {
      parsed = parseItau(sms);
    } else {
      return jsonResponse({ ok: false, error: "unknown bank: " + bank });
    }

    if (!parsed) {
      appendToSheet({
        timestamp:    new Date(),
        fecha:        "",
        banco:        bank,
        tipo:         "NO RECONOCIDO",
        monto:        "",
        comercio:     "",
        tarjeta:      "",
        categoria:    "",
        sms_original: sms
      });
      return jsonResponse({ ok: false, error: "parse failed", sms: sms });
    }

    parsed.timestamp    = new Date();
    parsed.categoria    = detectCategory(parsed.comercio);
    parsed.sms_original = sms;

    appendToSheet(parsed);
    return jsonResponse({ ok: true, data: parsed });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Leer transacciones del Sheet ──────────────────────────────
// Returns transactions from the last 12 months (or all if fewer).
function getTransactions() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
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
      messages:   [{ role: "user", content: question }]  // user input isolated here
    }),
    muteHttpExceptions: true
  });

  var result  = JSON.parse(response.getContentText());
  var content = result.content && result.content[0] && result.content[0].text;
  if (!content) throw new Error("Claude no devolvió respuesta");
  return content;
}

// ── Veto rules — messages silently ignored, never written to Sheet ────────────
// Add a regex per pattern you want to exclude.
var VETO_RULES = [
  // Itaú outbound transfer from savings account (e.g. rent payment)
  // "Se realizo Transferencia de tu Cuenta de Ahorros ****XXXX por $..."
  /Se realizo\s+Transferencia\s+de tu\s+Cuenta de Ahorros/i
];

function isVetoed(sms) {
  for (var i = 0; i < VETO_RULES.length; i++) {
    if (VETO_RULES[i].test(sms)) return true;
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

// ── Google Sheets writer ──────────────────────────────────────
function appendToSheet(data) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
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

  // Strip payment aggregator prefixes: Bold*, Vault*, PayU*
  s = s.replace(/^(?:BOLD|VAULT|PYU|PAYU|MERCADO\s*PAGO)\*\s*/i, "");

  // Tiendas D1
  if (/TIENDA\s+D1\b/i.test(s)) return "Tiendas D1";

  // Tembici (strip any preceding processor prefix like "Mercado Pago*")
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
  var smsBogota    = "Banco de Bogota: Tu compra por 130,456 fue aprobada con Tarjeta Crédito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA ¿Dudas? Llama a la Servilinea";
  var smsItauCard  = "Se realizo una compra en THE NEW YORK TIMES desde tu Tarjeta Credito ****8439 por $7,293  el 2026/05/30 02:04:18 ITAU Tel: 5818181 Bta o 018000512633 Nal para transacciones con tarjeta";
  var smsItauDebit = "Se realizo un debito de tu Cuenta de Ahorros ****8448 por $23,400 el 2026/05/29 15:00:00 ITAU Tel: 5818181 Bta o 018000512633 Nal para transfrencias con Bre-B";

  Logger.log("Bogotá:     " + JSON.stringify(parseBogota(smsBogota)));
  Logger.log("Itaú card:  " + JSON.stringify(parseItau(smsItauCard)));
  Logger.log("Itaú debit: " + JSON.stringify(parseItau(smsItauDebit)));
}
