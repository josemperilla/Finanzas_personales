// ============================================================
// Personal Finance Manager — Google Apps Script Webhook
// ============================================================
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================

var SHEET_ID   = "TU_SHEET_ID_AQUI";  // Reemplaza con el ID de tu Google Sheet
var SHEET_NAME = "Transacciones";

// ── GET endpoint — leer transacciones (usado por la PWA) ─────
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === "transactions") {
    return jsonResponse({ ok: true, data: getTransactions() });
  }

  return jsonResponse({ ok: true, message: "Finance Webhook v2 — usa ?action=transactions para leer datos" });
}

// ── POST endpoint — recibir SMS del iPhone o entrada manual ──
function doPost(e) {
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
      var parsed = parseVoice(text);
      return jsonResponse({ ok: true, data: parsed });
    }

    // Chat con el asistente financiero
    if (type === "chat") {
      var question = payload.question || "";
      var context  = payload.context  || {};
      if (!question) return jsonResponse({ ok: false, error: "empty question" });
      var answer = handleChat(question, context);
      return jsonResponse({ ok: true, data: { answer: answer } });
    }

    // SMS automático desde iOS Shortcut
    var sms    = (payload.sms    || "").trim();
    var sentAt = payload.timestamp || new Date().toISOString();

    if (!sms) return jsonResponse({ ok: false, error: "empty sms" });

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
function getTransactions() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  var headers = rows[0];
  var result  = [];

  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
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

  var prompt = "Extrae la información de una transacción financiera en pesos colombianos del siguiente texto en español. " +
    "Responde ÚNICAMENTE con un objeto JSON válido con exactamente estos campos: " +
    "monto (número sin símbolos ni puntos de miles, ej: 50000), " +
    "comercio (nombre del lugar o descripción, string), " +
    "categoria (una de: Comida, Transporte, Suscripciones, Mercado, Salud, Deporte, Compras, Alojamiento, Viajes, Software, Otro), " +
    "banco (Bogotá o Itaú u Otro), " +
    "tipo (Compra, Débito, Transferencia u Otro). " +
    "Si algún campo no está claro en el texto, usa el valor más probable. " +
    "Texto: \"" + text + "\"";

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
      messages:   [{ role: "user", content: prompt }]
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

  var prompt = "Eres un asistente financiero personal amigable y conciso. " +
    "El usuario habla español colombiano. Responde siempre en español, de forma breve y útil (máximo 4 oraciones). " +
    "Aquí está el resumen financiero del usuario:\n" +
    JSON.stringify(context, null, 2) +
    "\n\nPregunta del usuario: " + question;

  var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
    method: "post",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01"
    },
    payload: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages:   [{ role: "user", content: prompt }]
    }),
    muteHttpExceptions: true
  });

  var result  = JSON.parse(response.getContentText());
  var content = result.content && result.content[0] && result.content[0].text;
  if (!content) throw new Error("Claude no devolvió respuesta");
  return content;
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
    comercio: m[7].trim()
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
      comercio: mp[2].trim(),
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
