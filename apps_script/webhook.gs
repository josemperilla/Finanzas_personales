// ============================================================
// Personal Finance Manager — Google Apps Script Webhook
// ============================================================
// Deploy as Web App: Execute as Me, Access: Anyone
// ============================================================
//
// SECURITY: Set WEBHOOK_SECRET in Script Properties alongside ANTHROPIC_API_KEY.
// All requests (GET and POST) must include the _secret param matching that value.
// Cloudflare Pages lee WEBHOOK_SECRET como variable de entorno del proyecto.
// ============================================================

// Multi-user: single spreadsheet, one tab per user.
// Script Properties needed:
//   SHEET_ID       → Google Sheet ID (shared spreadsheet)
//   APP_PIN_<id>   → 4-6 digit PIN for each user (e.g. APP_PIN_jose)
//   USERS_LIST     → JSON array of user IDs, managed by createUser()
//   ADMIN_USER     → (optional) override for the admin user ID
var ADMIN_USER = "jose"; // can also be set in Script Properties as ADMIN_USER

// ── Dynamic user list (persisted in Script Properties) ────────
// Falls back to ["jose","dani"] so existing users are never broken.
function _getAllowedUsers() {
  var stored = PropertiesService.getScriptProperties().getProperty("USERS_LIST");
  if (stored) {
    try { return JSON.parse(stored); } catch(e) {}
  }
  return ["jose", "dani"];
}

// ── User validation ───────────────────────────────────────────
function _validateUserId(userId) {
  var allowed = _getAllowedUsers();
  if (!userId || allowed.indexOf(userId) === -1) {
    throw new Error("userId inválido: '" + userId + "'. Valores permitidos: " + allowed.join(", "));
  }
}

// ── Admin check ───────────────────────────────────────────────
function _getAdminUser() {
  return PropertiesService.getScriptProperties().getProperty("ADMIN_USER") || ADMIN_USER;
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

    // Ensure Fuente column exists (cached — runs once per user per 6h)
    _migrateSheetHeaders(userId);

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
        nota:         payload.nota     || "",
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

    // ── Gestión de usuarios (solo admin) ─────────────────────────

    // Listar usuarios registrados
    if (type === "listUsers") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede listar usuarios" });
      return jsonResponse({ ok: true, data: _getAllowedUsers() });
    }

    // Crear un nuevo usuario (admin only)
    if (type === "createUser") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede crear usuarios" });
      var newId   = String(payload.newUserId || "").toLowerCase().trim();
      var newName = String(payload.displayName || newId);
      var initPin = String(payload.initialPin || "");
      if (!newId) return jsonResponse({ ok: false, error: "newUserId requerido" });
      if (!/^[a-z0-9]{2,20}$/.test(newId)) return jsonResponse({ ok: false, error: "userId debe tener 2-20 caracteres alfanuméricos en minúsculas" });
      if (initPin && !/^\d{4,6}$/.test(initPin)) return jsonResponse({ ok: false, error: "PIN debe tener 4-6 dígitos" });
      var currentUsers = _getAllowedUsers();
      if (currentUsers.indexOf(newId) !== -1) return jsonResponse({ ok: false, error: "El usuario '" + newId + "' ya existe" });
      currentUsers.push(newId);
      var props = PropertiesService.getScriptProperties();
      props.setProperty("USERS_LIST", JSON.stringify(currentUsers));
      if (initPin) props.setProperty("APP_PIN_" + newId, initPin);
      _getSheet(newId); // auto-crea el tab en el Sheet
      return jsonResponse({ ok: true, created: newId });
    }

    // Eliminar un usuario (admin only) — borra PIN, lo remueve de USERS_LIST y elimina su tab en Sheets
    if (type === "deleteUser") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede eliminar usuarios" });
      var targetId = String(payload.targetId || "").toLowerCase().trim();
      if (!targetId) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (targetId === _getAdminUser()) return jsonResponse({ ok: false, error: "No puedes eliminar al administrador" });
      var allUsers = _getAllowedUsers();
      if (allUsers.indexOf(targetId) === -1) return jsonResponse({ ok: false, error: "El usuario '" + targetId + "' no existe" });
      var delProps = PropertiesService.getScriptProperties();
      delProps.setProperty("USERS_LIST", JSON.stringify(allUsers.filter(function(u) { return u !== targetId; })));
      delProps.deleteProperty("APP_PIN_" + targetId);
      try {
        var delSs = SpreadsheetApp.openById(delProps.getProperty("SHEET_ID"));
        var sheetName = targetId.charAt(0).toUpperCase() + targetId.slice(1);
        var delSheet = delSs.getSheetByName(sheetName);
        if (delSheet) delSs.deleteSheet(delSheet);
      } catch(delErr) { /* hoja no existe — continuar */ }
      return jsonResponse({ ok: true, deleted: targetId });
    }

    // Resetear el PIN de un usuario (admin only)
    if (type === "resetPin") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede resetear PINs" });
      var resetTarget = String(payload.targetId || "").toLowerCase().trim();
      var resetPin = String(payload.newPin || "");
      if (!resetTarget) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (!resetPin || !/^\d{4,6}$/.test(resetPin)) return jsonResponse({ ok: false, error: "PIN debe tener 4-6 dígitos" });
      PropertiesService.getScriptProperties().setProperty("APP_PIN_" + resetTarget, resetPin);
      return jsonResponse({ ok: true, reset: resetTarget });
    }

    // Verificar si el usuario ya tiene PIN configurado (para detectar primer login)
    if (type === "hasPin") {
      var p = PropertiesService.getScriptProperties().getProperty("APP_PIN_" + userId);
      return jsonResponse({ ok: true, exists: !!p && p.length > 0 });
    }

    // Configurar PIN por primera vez (solo si no existe aún)
    if (type === "setupPin") {
      var newPin = String(payload.pin || "");
      if (!newPin || !/^\d{4,6}$/.test(newPin)) return jsonResponse({ ok: false, error: "PIN debe tener 4-6 dígitos" });
      var existing = PropertiesService.getScriptProperties().getProperty("APP_PIN_" + userId);
      if (existing) return jsonResponse({ ok: false, error: "Este usuario ya tiene PIN. Usa changePin para cambiarlo." });
      PropertiesService.getScriptProperties().setProperty("APP_PIN_" + userId, newPin);
      return jsonResponse({ ok: true });
    }

    // ─────────────────────────────────────────────────────────────

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

    // Cambiar PIN del usuario
    if (type === "changePin") {
      var currentPin = String(payload.currentPin || "");
      var newPin     = String(payload.newPin     || "");
      if (!currentPin || !newPin) return jsonResponse({ ok: false, error: "Faltan campos" });
      var pinKey    = "APP_PIN_" + userId;
      var storedPin = PropertiesService.getScriptProperties().getProperty(pinKey);
      if (!storedPin) return jsonResponse({ ok: false, error: "APP_PIN_" + userId + " no configurado" });
      if (currentPin !== storedPin) return jsonResponse({ ok: false, error: "PIN incorrecto" });
      if (!/^\d{4,6}$/.test(newPin)) return jsonResponse({ ok: false, error: "El nuevo PIN debe tener 4–6 dígitos" });
      PropertiesService.getScriptProperties().setProperty(pinKey, newPin);
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

    // ── Notificación push desde iOS Shortcut (type:"notification") ──
    if (type === "notification") {
      var title = (payload.title || "").trim();
      var body  = (payload.body  || "").trim();

      if (!body && !title) return jsonResponse({ ok: false, error: "empty notification" });

      var parsedNotif = parseNotification(bank, title, body);

      if (!parsedNotif) {
        // Unknown format — save raw so you can build the parser later
        appendToSheet({
          timestamp:    new Date(),
          fecha:        new Date(),
          banco:        bank || "Desconocido",
          tipo:         "NO RECONOCIDO",
          monto:        0,
          comercio:     title,
          tarjeta:      "",
          categoria:    "",
          sms_original: "PUSH | " + title + " | " + body,
          fuente:       "notification"
        }, userId);
        return jsonResponse({ ok: true, skipped: true, reason: "unrecognized_format", raw: body });
      }

      if (parsedNotif.reversal) {
        var removedNotif = reverseTransaction(parsedNotif, userId);
        return jsonResponse({ ok: true, reversed: true, found: removedNotif });
      }

      parsedNotif.timestamp    = new Date();
      parsedNotif.categoria    = detectCategory(parsedNotif.comercio);
      parsedNotif.sms_original = "PUSH | " + title + " | " + body;
      parsedNotif.fuente       = "notification";

      appendToSheet(parsedNotif, userId);
      return jsonResponse({ ok: true, data: parsedNotif });
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
// Primary match: banco + tarjeta last-4 + monto within 30 days.
// Fallback (push notifications without card digits): banco + monto + 5-min timestamp window.
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

  var last4match = parsed.tarjeta ? parsed.tarjeta.match(/(\d{4})$/) : null;
  var last4      = last4match ? last4match[1] : null;
  var fiveMinMs  = 5 * 60 * 1000;

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (String(row[bancoCol]).trim() !== parsed.banco) continue;
    if (String(row[tipoCol]).trim() !== "Compra") continue;
    if (Math.abs(parseFloat(row[montoCol]) - parsed.monto) > 0.01) continue;

    if (last4) {
      // Primary: tarjeta digits available
      if (String(row[tarjetaCol]).indexOf(last4) === -1) continue;
    } else if (parsed.fecha) {
      // Fallback: no tarjeta (e.g. Nequi push) — match within 5-minute window
      var rowDate = row[fechaCol] instanceof Date ? row[fechaCol] : new Date(String(row[fechaCol]));
      if (isNaN(rowDate.getTime())) continue;
      if (Math.abs(rowDate.getTime() - parsed.fecha.getTime()) > fiveMinMs) continue;
    } else {
      continue; // no tarjeta and no fecha — skip to avoid false positives
    }

    var rowDate2 = row[fechaCol] instanceof Date ? row[fechaCol] : new Date(String(row[fechaCol]));
    if (!isNaN(rowDate2.getTime()) && rowDate2 < cutoff) continue;
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
    // ── Comida — restaurantes, cafés, delivery, fast food ──────────────────
    { cat: "Comida", keywords: [
      "RAPPI", "UBER EATS", "IFOOD", "DOMICILIOS", "OSAKI",
      "MCDONALDS", "MC DONALD", "BURGER", "PIZZA", "SUBWAY", "KFC",
      "TACO BELL", "POLLO CAMPERO", "CORRAL",
      "CREPES", "WAFFLES", "RESTAURAN", "SUSHI", "BISTRO", "BRASSERIE",
      "CAFE", "COFFEE", "CAFECULTOR", "TOSTAO", "AZAHAR", "TRIGO Y MIEL",
      "CREPESYWAFFLES", "FOGON", "ASADERO", "CHIGUI", "FORTEZZA",
      "TANUKI", "UKIYO", "WATAKUSHI", "RITMO Y AROMA", "LA AZOTEA",
      "SALA DE", "HECTOR", "CASA MAGDALENA", "PURA SABROSURA",
      "VENUES", "YOGEN FRUZ", "GELARTO", "HELADO",
      "SELAMLIQUE", "SUSAM", "MESOPOTAMIA", "OLIVE GARDEN", "VERITY FOOD",
      "KONTRBUS", "MELISSZA", "CARNESJREINA", "MERCADO PAGO*FCT",
      "COMPRA MERCADO PAGO*CRO", "LA CESTA", "BIRRERIA", "SEOUL POCHA",
      "HALVAANDNUTS", "SPAR PARTNER", "BARION"
    ]},
    // ── Mercado — supermercados y tiendas de alimentos ─────────────────────
    { cat: "Mercado", keywords: [
      "JUMBO", "CARREFOUR", "CARREFOURSA", "EXITO", "OLE", "ALMACENES",
      "SUPERTIENDA", "MERQUEO", "FRUVER", "CARULLA", "OXXO",
      "LIDL", "SPAR MAGYARORSZAG", "CSEMEGE", "METRO BARCELON"
    ]},
    // ── Transporte — taxis, apps, gasolina, metro ──────────────────────────
    { cat: "Transporte", keywords: [
      "UBER", "CABIFY", "DIDI", "TAXI", "TRANSMILENIO", "SITP",
      "TAXIS LIBRES", "DOGGER AERO", "BELBIM", "BKK AUTOMATA",
      "METRO BARCELON", "SAGALES", "ESTACION DE SERVICIO",
      "ACARLAR PETROL", "TEMBICI"
    ]},
    // ── Alojamiento — hoteles, hostales, Airbnb ────────────────────────────
    { cat: "Alojamiento", keywords: [
      "HOTEL", "AIRBNB", "BOOKING", "HOSPEDAJE", "HOSTAL",
      "HOSTELWORLD", "HAMARAT OTEL", "MARRIOT", "MARRIOTT",
      "AVENUE HOSTEL", "HOTEL PALACIO", "HOTEL INMACULADA",
      "HOTEL PALACIO DE"
    ]},
    // ── Viajes — vuelos, transporte interurbano, agencias ──────────────────
    { cat: "Viajes", keywords: [
      "AVIANCA", "LATAM", "COPA", "AMERICAN AIRLINES", "VUELO",
      "FLIGHTS", "TRIP.COM", "BOOKING.COM", "SULTAN", "NURDEM TURIZM",
      "SELDAR ISTANBUL", "IZMIR 1888", "KAPADOKYA", "VOYNN GIDA",
      "MAVERICKCENTRALMAR", "DUFRY", "WAN TANACSADO"
    ]},
    // ── Compras — tiendas, online, regalos ────────────────────────────────
    { cat: "Compras", keywords: [
      "AMAZON", "MERCADOLIBRE", "FALABELLA", "HOMECENTER", "EASY",
      "IKEA", "SAMSUNG", "TEMU", "OFFICE DEPOT", "LIBRERIA",
      "TIENDA RAMBLAS", "FOLKART", "BOMO ART", "PROEXSAL", "MAYAN GIFTS",
      "KAPADOKYA OTTOMAN", "YEMENICILER", "SOV MAGAZACILIK",
      "DOLLARTICTY", "HELOPAY", "COMPRA PASARELA", "MERCADO PAGO"
    ]},
    // ── Ropa — ropa y accesorios ───────────────────────────────────────────
    { cat: "Ropa", keywords: [
      "ADIDAS", "UNIQLO", "BROOKS BROTHERS", "DECATHLON",
      "TIENDA ADIDAS", "ALSANCAK MACROCENTER", "ALSANCAK COLOMBIA"
    ]},
    // ── Suscripciones — servicios digitales recurrentes ───────────────────
    { cat: "Suscripciones", keywords: [
      "NETFLIX", "SPOTIFY", "YOUTUBE", "PRIME", "DISNEY", "HBO",
      "APPLE TV", "APPLE.COM", "APPLE COM",
      "NEW YORK TIMES", "THE NEW YORK TIMES"
    ]},
    // ── Salud — farmacias, médicos, clínicas ──────────────────────────────
    { cat: "Salud", keywords: [
      "FARMACIA", "DROGUER", "FARMATODO", "COLSUBSIDIO",
      "CAFAM", "COMPENSAR", "UNID MED", "DIAGNOSTICO", "MEDIC"
    ]},
    // ── Deporte — gimnasios, clubes, implementos ──────────────────────────
    { cat: "Deporte", keywords: [
      "COUNTRY CLUB", "GYM", "GIMNASIO", "SPORT", "GOLF",
      "TENIS", "PADEL", "FITNESS", "RUNNING", "ATLETISMO",
      "CLUB LOS LAGARTOS", "ANKARA DEMIRSPOR"
    ]},
    // ── Entretenimiento — espectáculos, museos, ocio ──────────────────────
    { cat: "Entretenimiento", keywords: [
      "NETFLIX", "CINE", "TEATRO", "CONCIERTO", "PARQUE",
      "BUDAPEST JAZZ CLUB", "CORFERIAS", "PONTOON",
      "SUNA VE INAN", "PARK ELITE"
    ]},
    // ── Belleza — peluquerías, estética personal ──────────────────────────
    { cat: "Belleza", keywords: [
      "PELUQUER", "BARBERIA", "BARBERIAS", "LORD", "ESTETICA",
      "ANA MILENA", "ANDERSON GOGREEN", "HF PELUQUERIA"
    ]},
    // ── Software — herramientas y servicios digitales de trabajo ──────────
    { cat: "Software", keywords: [
      "GOOGLE", "MICROSOFT", "ADOBE", "CANVA", "NOTION",
      "AMAZON DIGI", "FOTOP"
    ]},
    // ── Hogar — artículos del hogar y servicios domésticos ────────────────
    { cat: "Hogar", keywords: [
      "HOMECENTER", "HOME SENTRY", "HOME DEPOT", "EASY HOME"
    ]},
    // ── Trámites — pagos oficiales, visas, impuestos ──────────────────────
    { cat: "Trámites", keywords: [
      "USEMBASSY", "MRVFEE", "GDIT"
    ]}
  ];

  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i].keywords.length; j++) {
      if (m.indexOf(rules[i].keywords[j]) !== -1) return rules[i].cat;
    }
  }
  return "Otro";
}

// ── Recategorizar todas las filas con categoría vacía ─────────────
// Ejecutar una vez desde el editor de Apps Script después de ampliar detectCategory().
// Solo toca filas donde la columna Categoría está vacía.
function recategorizeAll() {
  var users = _getAllowedUsers();
  var total = 0;
  var updated = 0;

  for (var u = 0; u < users.length; u++) {
    var ref   = _getSheet(users[u]);
    var sheet = ref.sheet;
    if (!sheet) continue;

    var data  = sheet.getDataRange().getValues();
    var hdrs  = data[0];
    var catCol     = hdrs.indexOf("Categoría");
    var comercioCol = hdrs.indexOf("Comercio");
    if (catCol < 0 || comercioCol < 0) continue;

    for (var i = 1; i < data.length; i++) {
      total++;
      var cat      = String(data[i][catCol] || "").trim();
      var comercio = String(data[i][comercioCol] || "").trim();
      if (cat !== "" || !comercio) continue;

      var newCat = detectCategory(comercio);
      if (newCat) {
        sheet.getRange(i + 1, catCol + 1).setValue(newCat);
        updated++;
      }
    }
  }

  Logger.log("recategorizeAll: " + updated + " de " + total + " filas actualizadas.");
  return { total: total, updated: updated };
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
      if (payload.nota !== undefined) {
        var notaCol = hdrs.indexOf("Nota");
        if (notaCol === -1) {
          notaCol = hdrs.length;
          sheet.getRange(1, notaCol + 1).setValue("Nota").setFontWeight("bold").setBackground("#f3f3f3");
        }
        sheet.getRange(row, notaCol + 1).setValue(payload.nota);
      }
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
      "Comercio", "Tarjeta/Cuenta", "Categoría", "SMS_Original", "Fuente", "Nota"
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
  }

  // Ensure Nota column exists on sheets created before this update
  var hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (hdrs.indexOf("Nota") === -1) {
    var notaCol = hdrs.length + 1;
    sheet.getRange(1, notaCol).setValue("Nota").setFontWeight("bold").setBackground("#f3f3f3");
  }

  var fecha = data.fecha ? Utilities.formatDate(data.fecha, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss") : "";

  sheet.appendRow([
    Utilities.formatDate(data.timestamp, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
    fecha,
    data.banco        || "",
    data.tipo         || "",
    data.monto        || "",
    data.comercio     || "",
    data.tarjeta      || "",
    data.categoria    || "",
    data.sms_original || "",
    data.fuente       || "sms",
    data.nota         || ""
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

// ═══════════════════════════════════════════════════════════════
// GMAIL EMAIL CAPTURE — canal para Nequi, Rappi, dale!
// ═══════════════════════════════════════════════════════════════
//
// Requiere: activar el servicio "Gmail" en Apps Script
// (Servicios → Gmail API → Agregar)
//
// Setup:
//   1. Ejecuta setupGmailTrigger() UNA VEZ desde el editor.
//   2. GAS procesará el Gmail del propietario del script (Jose) cada 5 min.
//   3. Dani necesita una copia del script en su propia cuenta de Google.
//
// Senders conocidos (actualizar con direcciones reales verificadas):
var GMAIL_SENDERS = {
  nequi:    ["no-reply@nequi.com", "noreply@nequi.com"],
  rappi:    ["noreply@rappi.com", "no-reply@rappi.com", "soporte@rappi.com"],
  dale:     ["notificaciones@dale.com.co", "noreply@dale.com.co"],
  davivienda: ["notificacionesdigitales@davivienda.com"],
  bancolombia: ["noreply@notificaciones.bancolombia.com.co"],
};

// ── Procesar emails bancarios nuevos ──────────────────────────
// Llamado por el trigger cada 5 minutos.
function processGmailTransactions() {
  var props   = PropertiesService.getScriptProperties();
  var userId  = props.getProperty("GMAIL_USER_ID") || "jose";

  // Build sender filter from all known senders
  var allSenders = [];
  Object.keys(GMAIL_SENDERS).forEach(function(bank) {
    allSenders = allSenders.concat(GMAIL_SENDERS[bank]);
  });
  var fromFilter = "from:(" + allSenders.join(" OR ") + ")";

  // Only look at emails from the last 24 hours to keep it fast
  var query = fromFilter + " newer_than:1d";

  var threads;
  try {
    threads = GmailApp.search(query, 0, 50);
  } catch(e) {
    Logger.log("Gmail error: " + e.message);
    return;
  }

  // Label for processed emails — create if not exists
  var labelName = "Finanzas/Procesado";
  var label;
  try {
    label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  } catch(e) {
    label = null; // non-fatal
  }

  var count = 0;
  for (var i = 0; i < threads.length; i++) {
    var thread = threads[i];
    // Skip already-labeled threads
    if (label && thread.getLabels().some(function(l) { return l.getName() === labelName; })) continue;

    var messages = thread.getMessages();
    for (var j = 0; j < messages.length; j++) {
      var msg     = messages[j];
      var from    = msg.getFrom().toLowerCase();
      var subject = msg.getSubject();
      var body    = msg.getPlainBody() || msg.getBody().replace(/<[^>]+>/g, " ");

      // Determine bank from sender
      var bank = _detectBankFromEmail(from);
      if (!bank) continue;

      var parsed = _parseEmailTransaction(bank, subject, body);
      if (!parsed) {
        // Save raw for parser improvement
        appendToSheet({
          timestamp:    new Date(),
          fecha:        new Date(),
          banco:        bank.charAt(0).toUpperCase() + bank.slice(1),
          tipo:         "NO RECONOCIDO",
          monto:        0,
          comercio:     subject.slice(0, 50),
          tarjeta:      "",
          categoria:    "",
          sms_original: "EMAIL | " + subject + " | " + body.slice(0, 300),
          fuente:       "email"
        }, userId);
        count++;
        continue;
      }

      if (parsed.reversal) {
        reverseTransaction(parsed, userId);
      } else {
        parsed.timestamp    = new Date();
        parsed.categoria    = detectCategory(parsed.comercio);
        parsed.sms_original = "EMAIL | " + subject + " | " + body.slice(0, 300);
        parsed.fuente       = "email";
        appendToSheet(parsed, userId);
      }
      count++;
    }

    if (label) thread.addLabel(label);
  }

  Logger.log("processGmailTransactions: " + count + " emails procesados.");
}

// ── Detectar banco desde el campo From ───────────────────────
function _detectBankFromEmail(from) {
  var keys = Object.keys(GMAIL_SENDERS);
  for (var i = 0; i < keys.length; i++) {
    var senders = GMAIL_SENDERS[keys[i]];
    for (var j = 0; j < senders.length; j++) {
      if (from.indexOf(senders[j]) !== -1) return keys[i];
    }
  }
  return null;
}

// ── Parsear cuerpo del email según banco ─────────────────────
// Retorna el mismo objeto que los parsers SMS, o null si no matchea.
// Actualizar con patrones reales una vez verificados los emails.
function _parseEmailTransaction(bank, subject, body) {
  var text = (subject + " " + body).replace(/\s+/g, " ");

  if (bank === "nequi") {
    // "Enviaste $23.000 a Juan Pérez" / "Recibiste $50.000 de María"
    var rePago = /[Ee]nviaste\s+\$\s*([\d.,]+)\s+a\s+(.+?)(?:\.|$)/;
    var mp = text.match(rePago);
    if (mp) return { banco: "Nequi", tipo: "Transferencia", monto: _parseCopEmail(mp[1]), comercio: mp[2].trim(), tarjeta: "", fecha: new Date() };

    var reRecibio = /[Rr]ecibiste\s+\$\s*([\d.,]+)\s+de\s+(.+?)(?:\.|$)/;
    var mr = text.match(reRecibio);
    if (mr) return { banco: "Nequi", tipo: "Ingreso", monto: _parseCopEmail(mr[1]), comercio: mr[2].trim(), tarjeta: "", fecha: new Date() };

    var reCompra = /[Cc]ompraste?\s+(?:en\s+)?(.+?)\s+por\s+\$\s*([\d.,]+)/;
    var mc = text.match(reCompra);
    if (mc) return { banco: "Nequi", tipo: "Compra", monto: _parseCopEmail(mc[2]), comercio: normalizeComercio(mc[1].trim()), tarjeta: "", fecha: new Date() };
  }

  if (bank === "rappi") {
    // "Tu pedido de $45.900 fue pagado" / "Pagaste $45.900 en Rappi"
    var reRappi = /\$\s*([\d.,]+)/;
    var mr2 = text.match(reRappi);
    if (mr2) return { banco: "Rappi", tipo: "Compra", monto: _parseCopEmail(mr2[1]), comercio: "Rappi", tarjeta: "", fecha: new Date() };
  }

  if (bank === "dale") {
    var reDale = /[Ee]nviaste\s+\$\s*([\d.,]+)\s+a\s+(.+?)(?:\.|$)/;
    var md = text.match(reDale);
    if (md) return { banco: "dale!", tipo: "Transferencia", monto: _parseCopEmail(md[1]), comercio: md[2].trim(), tarjeta: "", fecha: new Date() };
  }

  if (bank === "davivienda") {
    var reDAV = /[Cc]ompra.*?\$([\d,.]+).*?[Tt]arjeta\s+\*(\d+).*?[Ll]ugar\s+(.+?)(?:\.|$)/;
    var mdav = text.match(reDAV);
    if (mdav) return { banco: "Davivienda", tipo: "Compra", monto: _parseCopEmail(mdav[1]), tarjeta: "Tarjeta *" + mdav[2], comercio: normalizeComercio(mdav[3].trim()), fecha: new Date() };
  }

  if (bank === "bancolombia") {
    var reBCO = /\$\s*([\d,.]+)/;
    var mbco = text.match(reBCO);
    if (mbco) {
      var monto = _parseCopEmail(mbco[1]);
      if (monto > 0) return { banco: "Bancolombia", tipo: "Compra", monto: monto, comercio: "", tarjeta: "", fecha: new Date() };
    }
  }

  return null;
}

// ── Parser de montos desde email (formato colombiano) ─────────
function _parseCopEmail(str) {
  if (!str) return 0;
  var s = String(str).replace(/\s/g, "");
  // "1.234.567,89" → European; "1,234.56" → US
  if (s.indexOf(",") !== -1 && s.indexOf(".") !== -1) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // European: 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // US: 1,234.56
      s = s.replace(/,/g, "");
    }
  } else {
    s = s.replace(/[.,]/g, "");
  }
  return parseFloat(s) || 0;
}

// ── Configurar trigger de Gmail (ejecutar UNA VEZ) ────────────
function setupGmailTrigger() {
  // Eliminar triggers existentes de la misma función
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "processGmailTransactions") {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Crear trigger cada 5 minutos
  ScriptApp.newTrigger("processGmailTransactions")
    .timeBased()
    .everyMinutes(5)
    .create();
  Logger.log("Trigger Gmail configurado: cada 5 minutos.");
}

// ── Desactivar trigger de Gmail ───────────────────────────────
function removeGmailTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "processGmailTransactions") {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  Logger.log("Triggers Gmail eliminados: " + removed);
}

// ═══════════════════════════════════════════════════════════════
// PUSH NOTIFICATION CAPTURE — nuevo canal, no modifica SMS path
// ═══════════════════════════════════════════════════════════════

// ── Schema migration: add Fuente column to existing sheets ────
// Uses 6-hour Script Cache to avoid re-checking on every request.
function _migrateSheetHeaders(userId) {
  var cache = CacheService.getScriptCache();
  var key   = "migrated_fuente_" + userId;
  if (cache.get(key)) return;

  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) return;

  var lastCol = sheet.getLastColumn();
  var hdrs    = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (hdrs.indexOf("Fuente") === -1) {
    sheet.getRange(1, lastCol + 1).setValue("Fuente");
    sheet.getRange(1, lastCol + 1).setFontWeight("bold").setBackground("#f3f3f3");
  }
  cache.put(key, "1", 21600); // 6 hours
}

// ── Push notification dispatcher ──────────────────────────────
// Called from doPost() when type === "notification".
// bank is set explicitly in the iOS Shortcut — no auto-detection needed.
// Returns null if the body doesn't match any known pattern → NO_RECONOCIDO fallback.
function parseNotification(bank, title, body) {
  switch (bank) {
    case "bancolombia":  return parseNotifBancolombia(title, body);
    case "davivienda":   return parseNotifDavivienda(title, body);
    case "bogota":       return parseNotifBogota(title, body);
    case "itau":         return parseNotifItau(title, body);
    case "nequi":        return parseNotifNequi(title, body);
    case "daviplata":    return parseNotifDaviplata(title, body);
    case "occidente":    return parseNotifOccidente(title, body);
    case "popular":      return parseNotifPopular(title, body);
    case "avvillas":     return parseNotifAvVillas(title, body);
    case "dale":         return parseNotifDale(title, body);
    case "rappi":        return parseNotifRappi(title, body);
    default:             return null;
  }
}

// ── Bancolombia push ──────────────────────────────────────────
// Known formats (update with real samples from tools/notification_samples/BCO.txt):
//   "Compra $45,900 Éxito Chapinero • *4521"
//   "Aprobamos tu compra de $45,900.00 en Éxito • *4521"
//   "Transferencia $137,500.00 a Natalia Karaman • *0018"
function parseNotifBancolombia(title, body) {
  var text = body || title;

  // Compra con tarjeta: "$monto comercio • *digits" or "Compra $monto en comercio"
  var reCompra = /(?:compra(?:\s+aprobada)?(?:\s+de)?\s+)?\$\s*([\d,.]+)\s+(?:en\s+)?(.+?)\s*[•·]\s*\*(\d+)/i;
  var mc = text.match(reCompra);
  if (mc) {
    return {
      banco:   "Bancolombia",
      tipo:    "Compra",
      monto:   parseMontoUS(mc[1].replace(/\./g, "")),
      comercio: normalizeComercio(mc[2].trim()),
      tarjeta: "Tarjeta *" + mc[3],
      fecha:   new Date()
    };
  }

  // Transferencia / Bre-B
  var reTransfer = /transferencia\s+\$\s*([\d,.]+)/i;
  var mt = text.match(reTransfer);
  if (mt) {
    return {
      banco:   "Bancolombia",
      tipo:    "Transferencia",
      monto:   parseMontoUS(mt[1].replace(/\./g, "")),
      comercio: "",
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
}

// ── Davivienda push ───────────────────────────────────────────
// Known formats (update with real samples from tools/notification_samples/DAV.txt):
//   "Compra Aprobada, $5,550, *8863, TEMBICI"
//   "Compra $5,550 con *8863 en TEMBICI"
function parseNotifDavivienda(title, body) {
  var text = body || title;

  // "Compra [Aprobada,] $monto, *tarjeta, comercio"
  var re = /Compra(?:\s+Aprobad[ao])?\s*[,.]?\s*\$\s*([\d,.]+)\s*[,.]?\s*[*](\d+)\s*[,.]?\s*(.+)/i;
  var m  = text.match(re);
  if (m) {
    return {
      banco:   "Davivienda",
      tipo:    "Compra",
      monto:   parseMonto(m[1]),
      tarjeta: "Tarjeta *" + m[2],
      comercio: normalizeComercio(m[3].replace(/\.$/, "").trim()),
      fecha:   new Date()
    };
  }

  return null;
}

// ── Banco de Bogotá push ──────────────────────────────────────
// Push format mirrors SMS (update with tools/notification_samples/BDB.txt):
//   "Tu compra por 130,456 fue aprobada con Tarjeta Crédito 8645 en COUNTRY CLUB"
function parseNotifBogota(title, body) {
  var text = body || title;
  // Reuse SMS regex — push body is typically the same sentence
  var parsed = parseBogota("Banco de Bogota: " + text);
  return parsed;
}

// ── Banco Itaú push ───────────────────────────────────────────
// Push format mirrors SMS (update with tools/notification_samples/ITA.txt):
//   "Compra en THE NEW YORK TIMES $7,293 Tarjeta ****8439"
function parseNotifItau(title, body) {
  var text = body || title;
  // Reuse SMS regex — Itaú push body matches the SMS structure
  var parsed = parseItau(text);
  if (parsed) return parsed;

  // Short format: "$monto en comercio ****digits"
  var reShort = /\$\s*([\d,.]+)\s+en\s+(.+?)\s+(?:Tarjeta\s+)?\*+(\d+)/i;
  var ms = text.match(reShort);
  if (ms) {
    return {
      banco:   "Itaú",
      tipo:    "Compra",
      monto:   parseMonto(ms[1]),
      comercio: normalizeComercio(ms[2].trim()),
      tarjeta: "Tarjeta ****" + ms[3],
      fecha:   new Date()
    };
  }

  return null;
}

// ── Nequi push ────────────────────────────────────────────────
// Nequi is account-based (no card digits). No SMS alerts.
// Typical formats (update with tools/notification_samples/NEQ.txt):
//   "Pagaste $23,000 a Juan Pérez"
//   "Recibiste $50,000 de María López"
//   "Compraste $15,900 en Rappi"
function parseNotifNequi(title, body) {
  var text = body || title;

  var rePago = /Pagaste\s+\$\s*([\d,.]+)\s+a\s+(.+)/i;
  var mp = text.match(rePago);
  if (mp) {
    return {
      banco:   "Nequi",
      tipo:    "Transferencia",
      monto:   parseMonto(mp[1]),
      comercio: mp[2].trim(),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  var reRecibio = /Recibiste\s+\$\s*([\d,.]+)\s+de\s+(.+)/i;
  var mr = text.match(reRecibio);
  if (mr) {
    return {
      banco:   "Nequi",
      tipo:    "Ingreso",
      monto:   parseMonto(mr[1]),
      comercio: mr[2].trim(),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  var reCompra = /Compraste\s+\$\s*([\d,.]+)\s+en\s+(.+)/i;
  var mc = text.match(reCompra);
  if (mc) {
    return {
      banco:   "Nequi",
      tipo:    "Compra",
      monto:   parseMonto(mc[1]),
      comercio: normalizeComercio(mc[2].trim()),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
}

// ── Daviplata push ────────────────────────────────────────────
// Update with tools/notification_samples/DPL.txt
function parseNotifDaviplata(title, body) {
  var text = body || title;

  // "Transferencia de $monto recibida de Nombre"
  var reRecibio = /\$\s*([\d,.]+)\s+recibid[ao]\s+de\s+(.+)/i;
  var mr = text.match(reRecibio);
  if (mr) {
    return {
      banco:   "Daviplata",
      tipo:    "Ingreso",
      monto:   parseMonto(mr[1]),
      comercio: mr[2].trim(),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  var rePago = /Pagaste\s+\$\s*([\d,.]+)/i;
  var mp = text.match(rePago);
  if (mp) {
    return {
      banco:   "Daviplata",
      tipo:    "Transferencia",
      monto:   parseMonto(mp[1]),
      comercio: "",
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
}

// ── Grupo Aval banks (Occidente, Popular, AV Villas) push ─────
// All share Aval infrastructure — likely same notification format as Bogotá.
// Update with tools/notification_samples/OCC.txt, POP.txt, AVV.txt.
function parseNotifOccidente(title, body) {
  return _parseNotifAval("Occidente", title, body);
}
function parseNotifPopular(title, body) {
  return _parseNotifAval("Popular", title, body);
}
function parseNotifAvVillas(title, body) {
  return _parseNotifAval("AV Villas", title, body);
}

function _parseNotifAval(nombreBanco, title, body) {
  var text = body || title;

  // Same pattern as Bogotá SMS — Aval banks share transaction notification wording
  var re = /(?:Tu\s+)?(\w+)\s+por\s+([\d,.]+)\s+(?:fue\s+\w+\s+)?con\s+(?:Tarjeta\s+(?:Cr[eé]dito|D[eé]bito)|Cuenta)\s+(\d+)\s+(?:el\s+[\d/]+\s+[\d:]+\s+)?en\s+(.+?)(?:\s*[¿?]|$)/i;
  var m = text.match(re);
  if (m) {
    return {
      banco:   nombreBanco,
      tipo:    normalizeTipo(m[1]),
      monto:   parseMonto(m[2]),
      tarjeta: m[3],
      comercio: normalizeComercio(m[4].trim()),
      fecha:   new Date()
    };
  }

  // Generic fallback: extract monto if present
  var reGeneric = /\$?\s*([\d,.]+)\s+en\s+(.+)/i;
  var mg = text.match(reGeneric);
  if (mg) {
    return {
      banco:   nombreBanco,
      tipo:    "Compra",
      monto:   parseMonto(mg[1]),
      comercio: normalizeComercio(mg[2].trim()),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
}

// ── dale! (Grupo Aval digital wallet) push ────────────────────
// Update with tools/notification_samples/DAL.txt
function parseNotifDale(title, body) {
  var text = body || title;

  var rePago = /(?:Enviaste|Pagaste)\s+\$\s*([\d,.]+)\s+(?:a\s+)?(.+)/i;
  var mp = text.match(rePago);
  if (mp) {
    return {
      banco:   "dale!",
      tipo:    "Transferencia",
      monto:   parseMonto(mp[1]),
      comercio: mp[2].replace(/\.$/, "").trim(),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  var reRecibio = /Recibiste\s+\$\s*([\d,.]+)\s+de\s+(.+)/i;
  var mr = text.match(reRecibio);
  if (mr) {
    return {
      banco:   "dale!",
      tipo:    "Ingreso",
      monto:   parseMonto(mr[1]),
      comercio: mr[2].replace(/\.$/, "").trim(),
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
}

// ── Rappi Pay push ────────────────────────────────────────────
// Update with tools/notification_samples/RAP.txt
function parseNotifRappi(title, body) {
  var text = body || title;

  // "Tu pedido de $XX,XXX fue pagado" or "Pagaste $XX,XXX en Rappi"
  var re = /(?:pedido de\s+|Pagaste\s+)\$\s*([\d,.]+)/i;
  var m  = text.match(re);
  if (m) {
    return {
      banco:   "Rappi",
      tipo:    "Compra",
      monto:   parseMonto(m[1]),
      comercio: "Rappi",
      tarjeta: "",
      fecha:   new Date()
    };
  }

  return null;
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

  // ── Push notification parser tests ────────────────────────────
  // Update these with real samples once tools/notification_samples/ is filled.
  Logger.log("\n── Push notification parsers ──");

  // Bancolombia push (format TBD — update after capturing BCO.txt)
  var pushBco = "Compra $45,900 Éxito Chapinero • *4521";
  Logger.log("Notif BCO compra: " + JSON.stringify(parseNotifBancolombia("Bancolombia", pushBco)));

  var pushBcoTransfer = "Transferencia $137,500.00 a Natalia Karaman • *0018";
  Logger.log("Notif BCO transfer:" + JSON.stringify(parseNotifBancolombia("Bancolombia", pushBcoTransfer)));

  // Davivienda push
  var pushDav = "Compra Aprobada, $5,550, *8863, TEMBICI";
  Logger.log("Notif DAV compra: " + JSON.stringify(parseNotifDavivienda("Davivienda", pushDav)));

  // Bogotá push (reuses SMS parser)
  var pushBdb = "Tu compra por 130,456 fue aprobada con Tarjeta Crédito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA";
  Logger.log("Notif BDB compra: " + JSON.stringify(parseNotifBogota("Banco de Bogotá", pushBdb)));

  // Itaú push (reuses SMS parser)
  var pushIta = "Se realizo una compra en THE NEW YORK TIMES desde tu Tarjeta Credito ****8439 por $7,293  el 2026/05/30 02:04:18 ITAU";
  Logger.log("Notif ITA compra: " + JSON.stringify(parseNotifItau("Itaú", pushIta)));

  // Nequi push (no tarjeta)
  var pushNeqPago   = "Pagaste $23,000 a Juan Pérez";
  var pushNeqRecibio = "Recibiste $50,000 de María López";
  var pushNeqCompra = "Compraste $15,900 en Rappi";
  Logger.log("Notif NEQ pago:   " + JSON.stringify(parseNotifNequi("Nequi", pushNeqPago)));
  Logger.log("Notif NEQ recibio:" + JSON.stringify(parseNotifNequi("Nequi", pushNeqRecibio)));
  Logger.log("Notif NEQ compra: " + JSON.stringify(parseNotifNequi("Nequi", pushNeqCompra)));

  // Daviplata push
  var pushDpl = "$30,000 recibida de Carlos Torres";
  Logger.log("Notif DPL recibio:" + JSON.stringify(parseNotifDaviplata("Daviplata", pushDpl)));

  // Aval banks push
  var pushAval = "Tu compra por 45,000 fue aprobada con Tarjeta Crédito 1234 en JUMP FITNESS";
  Logger.log("Notif OCC compra: " + JSON.stringify(parseNotifOccidente("Occidente", pushAval)));
  Logger.log("Notif POP compra: " + JSON.stringify(parseNotifPopular("Popular", pushAval)));
  Logger.log("Notif AVV compra: " + JSON.stringify(parseNotifAvVillas("AV Villas", pushAval)));

  // dale! push
  var pushDal = "Enviaste $15,000 a Pedro González";
  Logger.log("Notif DAL envio:  " + JSON.stringify(parseNotifDale("dale!", pushDal)));

  // Rappi push
  var pushRap = "Tu pedido de $45,900 fue pagado";
  Logger.log("Notif RAP pedido: " + JSON.stringify(parseNotifRappi("Rappi", pushRap)));

  // NO_RECONOCIDO fallback
  var pushUnknown = "Tienes una nueva notificación";
  Logger.log("Notif UNKNOWN:    " + JSON.stringify(parseNotification("bancolombia", "Bancolombia", pushUnknown)));

  // dispatcher routing check
  Logger.log("Dispatch BCO:     " + JSON.stringify(parseNotification("bancolombia", "Bancolombia", pushBco)));
  Logger.log("Dispatch NEQ:     " + JSON.stringify(parseNotification("nequi", "Nequi", pushNeqPago)));
}
