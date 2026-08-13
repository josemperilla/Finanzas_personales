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

// ── Configuración global compartida ────────────────────────────
var TIMEZONE = 'America/Bogota'; // usado en todos los Utilities.formatDate() del archivo

// Tolerancia para matchear una fila por Timestamp (updateCategoryInSheet,
// deleteTransactionFromSheet, updateTransactionFields). Timestamp ahora tiene
// precisión de milisegundo (ver appendToSheet), así que esta ventana solo
// necesita cubrir el redondeo de Google Sheets al convertir el string a un
// valor de fecha interno — no debe acercarse al espaciado real entre
// transacciones distintas (~300ms+ en importaciones en lote), o dos filas
// vecinas podrían matchear entre sí y editarse/borrarse por error.
var TIMESTAMP_MATCH_TOLERANCE_MS = 50;

// ── Idempotencia de ingesta ────────────────────────────────────
// El iPhone reenvía el MISMO SMS más de una vez: en los datos reales aparecen
// pares con `SMS_Original` idéntico byte por byte separados por 6 ms a 5 s
// (AV Villas ****3403 y Banco de Bogotá ****8439, entre otros). Cada envío creaba
// su propia fila. No es un problema de parseo: el texto crudo es el mismo, así que
// el servidor tiene que ser idempotente aunque el teléfono no lo sea.
//
// Por qué el texto crudo y no los campos parseados: el fallback de IA no es
// determinista — el mismo SMS produjo "DIDI RIDES*DL" en una fila y "DIDI RIDES"
// en la otra. Comparar campos parseados no habría detectado ese par.
//
// Por qué es seguro: el texto del banco incluye SU PROPIA marca de tiempo
// ("el 2026/08/10 06:01:38", "01/08/26 01:03"), así que dos compras reales
// distintas nunca producen el mismo texto. El único choque teórico es el mismo
// comercio, mismo monto y mismo minuto en bancos con precisión de minuto —
// mucho más raro que el duplicado que esto elimina, y la ventana corta lo acota.
var INGEST_DEDUP_TTL_S = 300;   // 5 min: cubre reintentos y reenvíos del teléfono
var INGEST_DEDUP_LOCK_MS = 5000;
var SHEET_HEADERS = ["Timestamp","Fecha","Banco","Tipo","Monto (COP)","Comercio","Tarjeta/Cuenta","Categoría","SMS_Original","Fuente","Nota"];
var MAX_USERS = 10; // límite del plan de Sheets — migrar al backend FastAPI para levantarlo
var MAX_USERS_ERROR = "Límite de " + MAX_USERS + " usuarios alcanzado en el plan de Sheets. Migra al backend FastAPI antes de agregar más.";
var CACHE_TTL_6H = 21600; // máximo permitido por CacheService
var CACHE_TTL_1H = 3600;

// Dominio de la PWA en producción — configurable vía Script Property PWA_URL
// (mismo patrón que CLAUDE_*_MODEL: fallback al valor actual si no está seteada).
function _getPwaUrl() {
  return PropertiesService.getScriptProperties().getProperty('PWA_URL') || 'https://finanzas-abiertas.pages.dev';
}

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
    throw new Error("userId inválido o no registrado");
  }
  if (PropertiesService.getScriptProperties().getProperty("APP_USER_DISABLED_" + userId) === "true") {
    throw new Error("Usuario deshabilitado");
  }
}

// ── Admin check ───────────────────────────────────────────────
function _getAdminUser() {
  return PropertiesService.getScriptProperties().getProperty("ADMIN_USER") || ADMIN_USER;
}

// ── Provisioning helpers (compartidos por createUser/createInvite) ────
// Crea el usuario: lo agrega a USERS_LIST, fija PIN opcional y crea su tab en Sheets.
function _provisionUser(newId, displayName, initPin) {
  var currentUsers = _getAllowedUsers();
  if (currentUsers.indexOf(newId) !== -1) {
    throw new Error("El usuario '" + newId + "' ya existe");
  }
  // Crear/verificar tab ANTES de escribir USERS_LIST para evitar dejar el
  // usuario a medias si falla Sheets (SHEET_ID ausente, cuota, etc.).
  var newRef = _getSheet(newId);
  if (!newRef.sheet) {
    var newSheet = newRef.ss.insertSheet(newRef.tabName);
    newSheet.appendRow(SHEET_HEADERS);
    newSheet.getRange(1,1,1,SHEET_HEADERS.length).setFontWeight("bold").setBackground("#f3f3f3");
    newSheet.setFrozenRows(1);
  }
  currentUsers.push(newId);
  var props = PropertiesService.getScriptProperties();
  props.setProperty("USERS_LIST", JSON.stringify(currentUsers));
  if (initPin) props.setProperty("APP_PIN_" + newId, _hashPin(newId, initPin));
}

// Elimina el usuario: lo quita de USERS_LIST, borra su PIN y opcionalmente su tab en Sheets.
// deleteData: si es true (por defecto) borra el tab; si es false conserva los datos.
function _deprovisionUser(targetId, deleteData) {
  var delProps = PropertiesService.getScriptProperties();
  var allUsers = _getAllowedUsers();
  delProps.setProperty("USERS_LIST", JSON.stringify(allUsers.filter(function(u) { return u !== targetId; })));
  delProps.deleteProperty("APP_PIN_" + targetId);
  delProps.deleteProperty("APP_PIN_SALT_" + targetId);
  delProps.deleteProperty("APP_USER_DISABLED_" + targetId);
  if (deleteData !== false) {
    try {
      var delSs = SpreadsheetApp.openById(delProps.getProperty("SHEET_ID"));
      var sheetName = targetId.charAt(0).toUpperCase() + targetId.slice(1);
      var delSheet = delSs.getSheetByName(sheetName);
      if (delSheet) delSs.deleteSheet(delSheet);
    } catch(delErr) { /* hoja no existe — continuar */ }
  }
}

// ── Admin stats helpers ───────────────────────────────────────

// Número de transacciones y fecha de última actividad para un usuario.
function _getUserStats(userId) {
  var ref = _getSheet(userId);
  if (!ref.sheet) return { txCount: 0, lastActivity: null };
  var last = ref.sheet.getLastRow();
  var txCount = Math.max(0, last - 1);
  var lastActivity = null;
  if (txCount > 0) {
    var ts = ref.sheet.getRange(last, 1).getValue();
    if (ts) lastActivity = String(ts).substring(0, 10);
  }
  return { txCount: txCount, lastActivity: lastActivity };
}

// Lista completa de usuarios + invitaciones pendientes para el panel admin.
function _adminListUsersData() {
  var userIds = _getAllowedUsers();
  var props   = PropertiesService.getScriptProperties();
  var result  = [];
  for (var i = 0; i < userIds.length; i++) {
    var uid   = userIds[i];
    var stats = _getUserStats(uid);
    result.push({
      id:           uid,
      status:       props.getProperty("APP_USER_DISABLED_" + uid) === "true" ? "disabled" : "active",
      txCount:      stats.txCount,
      lastActivity: stats.lastActivity
    });
  }
  var invMap  = _getInvites();
  var nowMs   = Date.now();
  var pending = Object.keys(invMap)
    .filter(function(c) { return !invMap[c].used; })
    .map(function(c) {
      return {
        code:        _formatInviteCode(c),
        userId:      invMap[c].userId,
        displayName: invMap[c].displayName,
        expiresAt:   new Date(invMap[c].expiry).toISOString(),
        expired:     nowMs >= invMap[c].expiry
      };
    })
    .sort(function(a, b) { return a.expiresAt > b.expiresAt ? 1 : -1; });
  return { users: result, pendingInvites: pending };
}

// ── Invitaciones de un solo uso (persistidas en Script Properties) ────
function _getInvites() {
  var raw = PropertiesService.getScriptProperties().getProperty("INVITES");
  if (raw) { try { return JSON.parse(raw); } catch(e) {} }
  return {};
}
function _saveInvites(map) {
  PropertiesService.getScriptProperties().setProperty("INVITES", JSON.stringify(map));
}
// 8 chars de alfabeto sin ambigüedad (sin 0/O/1/I/L). Se guarda sin guion.
// Usa SHA-256(UUID) como fuente CSPRNG — Math.random() es predecible en V8.
function _genInviteCode() {
  var alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  var code = "";
  for (var i = 0; i < 8; i++) code += alphabet.charAt((bytes[i] & 0xff) % alphabet.length);
  return code;
}
function _formatInviteCode(code) {
  return code.length === 8 ? code.slice(0,4) + "-" + code.slice(4) : code;
}
function _normalizeCode(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
// Deriva un userId válido y único desde el nombre visible.
function _deriveUserId(displayName) {
  var base = String(displayName || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // quita acentos (María → maria)
    .replace(/[^a-z0-9]/g, "").slice(0, 18);
  if (base.length < 2) base = "user";
  var users = _getAllowedUsers();
  var candidate = base, n = 1;
  while (users.indexOf(candidate) !== -1) { candidate = (base + n).slice(0, 20); n++; }
  return candidate;
}
// ── PIN hashing (SHA-256 + salt por usuario) ─────────────────
function _byteToHex(b) {
  var h = (b < 0 ? b + 256 : b).toString(16);
  return h.length === 1 ? "0" + h : h;
}

function _computePinHash(userId, salt, pin) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    userId + ":" + salt + ":" + pin
  );
  return bytes.map(_byteToHex).join("");
}

// Retorna "sha256:<salt>:<hex>". Genera y persiste el salt si no existe.
function _hashPin(userId, pin) {
  var props   = PropertiesService.getScriptProperties();
  var saltKey = "APP_PIN_SALT_" + userId;
  var salt    = props.getProperty(saltKey);
  if (!salt) {
    salt = Utilities.getUuid().replace(/-/g, "");
    props.setProperty(saltKey, salt);
  }
  return "sha256:" + salt + ":" + _computePinHash(userId, salt, pin);
}

// Compara dos strings en tiempo constante (evita filtrar por timing en qué carácter difieren).
// Requiere longitudes iguales; una longitud distinta se trata como no-match sin comparar más
// (la longitud de un digest SHA-256 hex es fija y pública, así que esto no agrega superficie nueva).
function _timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Verifica PIN contra el valor almacenado. Acepta formato hasheado Y texto plano (legado).
function _verifyPin(userId, pin, stored) {
  if (!stored || !pin) return false;
  if (stored.indexOf("sha256:") === 0) {
    var parts = stored.split(":");
    if (parts.length !== 3) return false;
    return _timingSafeEqual(_computePinHash(userId, parts[1], pin), parts[2]);
  }
  return pin === stored; // legado: texto plano
}

// Poda invitaciones usadas/expiradas con más de 24h de antigüedad. Devuelve true si cambió.
function _pruneInvites(map) {
  var now = Date.now(), changed = false;
  Object.keys(map).forEach(function(code) {
    var inv = map[code];
    var staleExpired = !inv.used && now > inv.expiry + 86400000;
    var staleUsed    =  inv.used && inv.usedAt && now > inv.usedAt + 86400000;
    if (staleExpired || staleUsed) { delete map[code]; changed = true; }
  });
  return changed;
}

// ── Redención de invitación (público, sin userId) ────────────────────
// NOTA: WEBHOOK_SECRET viaja al cliente, así que no es barrera por-usuario.
// El código de invitación es la barrera real: un solo uso + expiración +
// "usuario aún sin PIN" + límite anti-fuerza-bruta vía CacheService.
function _handleRedeemInvite(payload) {
  var cache = CacheService.getScriptCache();
  var hour = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd-HH");
  var rlKey = "rl_redeem_" + hour;
  var n = parseInt(cache.get(rlKey) || "0", 10);
  if (n >= 30) return jsonResponse({ ok: false, error: "Demasiados intentos. Intenta más tarde." });
  cache.put(rlKey, String(n + 1), CACHE_TTL_1H);

  var key = _normalizeCode(payload.code);
  if (!key) return jsonResponse({ ok: false, error: "Código requerido" });

  var codeRlKey = "rl_redeem_code_" + key;
  var cn = parseInt(cache.get(codeRlKey) || "0", 10);
  if (cn >= 8) return jsonResponse({ ok: false, error: "Demasiados intentos. Intenta más tarde." });
  cache.put(codeRlKey, String(cn + 1), CACHE_TTL_1H);

  var inv = _getInvites()[key];
  if (!inv) return jsonResponse({ ok: false, error: "Código inválido o expirado" });
  if (inv.used) return jsonResponse({ ok: false, error: "Esta invitación ya fue usada" });
  if (Date.now() >= inv.expiry) return jsonResponse({ ok: false, error: "Código inválido o expirado" });
  if (PropertiesService.getScriptProperties().getProperty("APP_PIN_" + inv.userId)) {
    return jsonResponse({ ok: false, error: "Esta invitación ya fue completada" });
  }
  // No se marca usada aquí: el consumo ocurre al fijar el PIN (setupPin),
  // permitiendo reanudar si el usuario abandona antes de crear el PIN.
  return jsonResponse({ ok: true, userId: inv.userId, displayName: inv.displayName });
}

// ── Per-user Sheet accessor ───────────────────────────────────
// Single spreadsheet; each user gets a tab named after them (e.g. "Jose", "Dani").
// "jose" → "Jose" — nombre de tab correspondiente a un userId (mismo criterio
// en todo el archivo: la pestaña de cada usuario está capitalizada en el Sheet).
function _tabNameForUser(userId) {
  return userId.charAt(0).toUpperCase() + userId.slice(1);
}

function _getSheet(userId) {
  var props   = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID no configurado en Script Properties");
  var ss       = SpreadsheetApp.openById(sheetId);
  var tabName  = _tabNameForUser(userId);
  var sheet    = ss.getSheetByName(tabName);
  return { ss: ss, sheet: sheet, sheetId: sheetId, tabName: tabName };
}

// ── Rate limiting (per-user daily cap via CacheService) ───────
function _checkRateLimit(action, userId) {
  var cache = CacheService.getScriptCache();
  var today = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");
  var key = "rate_" + action + "_" + (userId || "global") + "_" + today;
  var count = parseInt(cache.get(key) || "0", 10);
  // Cuotas configurables vía Script Properties (mismo patrón que CLAUDE_*_MODEL); fallback al valor actual.
  var rlProps = PropertiesService.getScriptProperties();
  var limits = {
    chat:  parseInt(rlProps.getProperty('AI_QUOTA_CHAT')  || '100', 10),
    voice: parseInt(rlProps.getProperty('AI_QUOTA_VOICE') || '50', 10),
    admin: parseInt(rlProps.getProperty('AI_QUOTA_ADMIN') || '100', 10)
  };
  var limit = limits[action] !== undefined ? limits[action] : 100;
  if (count >= limit) {
    var msg = (action === "chat" || action === "voice")
      ? "Límite diario de llamadas de IA alcanzado. Intenta mañana."
      : "Límite diario de operaciones alcanzado. Intenta mañana.";
    throw new Error(msg);
  }
  cache.put(key, String(count + 1), CACHE_TTL_6H);
}

// ── Auth check ───────────────────────────────────────────────
// Verifica el secreto y devuelve el CANAL de la llamada:
//   "shortcut" -> iOS Shortcuts / dispositivo de confianza (WEBHOOK_SECRET).
//   "web"      -> trafico del proxy de la PWA (WEB_SECRET). Requiere token de sesion.
// Migracion segura: si WEB_SECRET no esta configurado, el proxy sigue enviando
// WEBHOOK_SECRET -> canal "shortcut" -> la app funciona sin tokens hasta que se
// configure WEB_SECRET y se actualice el proxy para enviarlo.
function _checkSecret(e) {
  var props = PropertiesService.getScriptProperties();
  var shortcutSecret = props.getProperty("WEBHOOK_SECRET");
  if (!shortcutSecret) throw new Error("WEBHOOK_SECRET no configurado en Script Properties");
  var webSecret = props.getProperty("WEB_SECRET");
  // Secret travels as _secret query param (GET) or _secret body field (POST).
  var fromParam = e && e.parameter && e.parameter["_secret"];
  var fromBody = null;
  if (!fromParam && e && e.postData) {
    try { fromBody = JSON.parse(e.postData.contents || "{}")["_secret"]; } catch(err) {}
  }
  var incoming = fromParam || fromBody;
  if (webSecret && incoming === webSecret) return "web";
  if (incoming === shortcutSecret) return "shortcut";
  throw new Error("Unauthorized");
}

// -- Tokens de sesion (emitidos tras validar PIN; viven 6h en CacheService) --
function _issueToken(userId) {
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  CacheService.getScriptCache().put("tok_" + token, String(userId), CACHE_TTL_6H);
  return token;
}
function _userFromToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var uid = cache.get("tok_" + token);
  if (!uid) return null;
  cache.put("tok_" + token, uid, CACHE_TTL_6H); // refresco deslizante mientras este activo
  return uid;
}
// Token de larga duración para la extensión de navegador (persistente en Script
// Properties, no expira como el de sesión). Rotación: emitir invalida el anterior.
function _issueExtToken(userId) {
  var props = PropertiesService.getScriptProperties();
  var old = props.getProperty("EXT_TOKEN_" + userId);
  if (old) props.deleteProperty("EXT_TOK_" + old);
  var token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  props.setProperty("EXT_TOKEN_" + userId, token);
  props.setProperty("EXT_TOK_" + token, String(userId));
  return token;
}
function _userFromExtToken(token) {
  if (!token) return null;
  return PropertiesService.getScriptProperties().getProperty("EXT_TOK_" + token) || null;
}
// Resuelve el userId AUTENTICADO. Token valido -> ese usuario. Sin token pero
// canal "shortcut" (dispositivo de confianza) -> se acepta el userId
// auto-declarado. Canal "web" sin token -> null (no autenticado).
function _authUserId(e, channel, payload) {
  var token = (payload && payload.token) || (e && e.parameter && e.parameter.token);
  var uid = _userFromToken(token);
  if (uid) return uid;
  if (channel === "shortcut") {
    return String((payload && payload.userId) || (e && e.parameter && e.parameter.userId) || "").toLowerCase();
  }
  return null;
}

// ── GET endpoint — leer transacciones (usado por la PWA) ─────
function doGet(e) {
  var channel;
  try {
    channel = _checkSecret(e);
  } catch(err) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  var userId = _authUserId(e, channel, {});
  if (!userId) return jsonResponse({ ok: false, error: "Unauthorized" });
  try { _validateUserId(userId); } catch(err) {
    return jsonResponse({ ok: false, error: err.message });
  }

  var action = e && e.parameter && e.parameter.action;

  if (action === "transactions") {
    var months   = parseInt(e.parameter.months || "12", 10);
    var search   = (e.parameter.search || "").trim().toUpperCase();
    var startDate = e.parameter.startDate || "";
    var endDate   = e.parameter.endDate   || "";
    var cardFilter = (e.parameter.card || "").trim();
    var txns = _getTxnsRange(userId, months);
    if (search)    txns = txns.filter(function(t){ return String(t.Comercio || "").toUpperCase().indexOf(search) !== -1; });
    if (startDate) txns = txns.filter(function(t){ return String(t.Fecha || "").slice(0,10) >= startDate; });
    if (endDate)   txns = txns.filter(function(t){ return String(t.Fecha || "").slice(0,10) <= endDate; });
    if (cardFilter) txns = txns.filter(function(t){ return String(t["Tarjeta/Cuenta"] || "").indexOf(cardFilter) !== -1; });
    return jsonResponse({ ok: true, data: txns });
  }

  if (action === "cards") {
    return jsonResponse({ ok: true, data: _getCards(userId) });
  }

  if (action === "analytics") {
    return jsonResponse(_buildAnalytics(userId, e.parameter));
  }

  if (action === "widgetData") {
    return jsonResponse(_buildWidgetData(userId));
  }

  return jsonResponse({ ok: true, message: "Finance Webhook v2 — usa ?action=transactions&userId=jose para leer datos" });
}

// ── POST endpoint — recibir SMS del iPhone o entrada manual ──
function doPost(e) {
  var channel;
  try {
    channel = _checkSecret(e);
  } catch(err) {
    return jsonResponse({ ok: false, error: "Unauthorized" });
  }

  try {
    var payload = JSON.parse(e.postData.contents);
    var type    = payload.type || "";
    var bank    = (payload.bank || "").toLowerCase();
    var claimedUserId = (payload.userId || "").toLowerCase();

    // Redencion de invitacion: el redentor aun no tiene userId, asi que se
    // resuelve antes de cualquier validacion de userId.
    if (type === "redeemInvite") return _handleRedeemInvite(payload);

    // -- Acciones de arranque: DEFINEN la autenticacion, usan userId auto-declarado --

    // Verificar si el usuario ya tiene PIN configurado (para detectar primer login)
    if (type === "hasPin") {
      var hp = PropertiesService.getScriptProperties().getProperty("APP_PIN_" + claimedUserId);
      return jsonResponse({ ok: true, exists: !!hp && hp.length > 0 });
    }

    // Validar un token de sesion sin ejecutar ninguna accion. Lo usa el endpoint
    // /api/ocr (Cloudflare) para autenticar al llamante antes de gastar la API de
    // Anthropic: resuelve el token a un userId o devuelve ok:false.
    if (type === "validateToken") {
      var tkUser = _userFromToken(payload.token);
      if (!tkUser) return jsonResponse({ ok: false, error: "Unauthorized" });
      return jsonResponse({ ok: true, userId: tkUser });
    }

    // Validar PIN del usuario -- emite token de sesion al acertar
    if (type === "validatePin") {
      var pin = String(payload.pin || "");
      if (!pin) return jsonResponse({ ok: false, error: "PIN requerido" });
      _validateUserId(claimedUserId);
      // Anti fuerza-bruta de red: como el token emitido aqui es la barrera de
      // autenticacion, se limita el numero de fallos por usuario/hora.
      var pinCache = CacheService.getScriptCache();
      var pinRlKey = "rl_pin_" + claimedUserId + "_" + Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd-HH");
      if (parseInt(pinCache.get(pinRlKey) || "0", 10) >= 20) {
        return jsonResponse({ ok: false, error: "Demasiados intentos. Intenta mas tarde." });
      }
      var vProps = PropertiesService.getScriptProperties();
      var storedPin = vProps.getProperty("APP_PIN_" + claimedUserId);
      if (!storedPin) return jsonResponse({ ok: false, error: "APP_PIN_" + claimedUserId + " no configurado en Script Properties" });
      if (_verifyPin(claimedUserId, pin, storedPin)) {
        // Auto-upgrade: si el PIN era texto plano, hashearlo en el primer login exitoso.
        if (storedPin.indexOf("sha256:") !== 0) {
          vProps.setProperty("APP_PIN_" + claimedUserId, _hashPin(claimedUserId, pin));
        }
        return jsonResponse({ ok: true, token: _issueToken(claimedUserId) });
      }
      // Check emergency PIN (single-use, 24h TTL)
      var emergRaw = vProps.getProperty("EMERGENCY_PIN_" + claimedUserId);
      if (emergRaw) {
        try {
          var ep = JSON.parse(emergRaw);
          if (ep.code === pin && Date.now() < ep.expiry) {
            vProps.deleteProperty("EMERGENCY_PIN_" + claimedUserId);
            return jsonResponse({ ok: true, emergency: true, token: _issueToken(claimedUserId) });
          }
        } catch(e) {}
      }
      // Contar el intento fallido (TTL 1h).
      pinCache.put(pinRlKey, String(parseInt(pinCache.get(pinRlKey) || "0", 10) + 1), CACHE_TTL_1H);
      return jsonResponse({ ok: false, error: "PIN incorrecto" });
    }

    // Configurar PIN por primera vez (solo si no existe aun) -- emite token de sesion
    if (type === "setupPin") {
      var newPin = String(payload.pin || "");
      if (!newPin || !/^\d{4,6}$/.test(newPin)) return jsonResponse({ ok: false, error: "PIN debe tener 4-6 digitos" });
      _validateUserId(claimedUserId);
      var spProps = PropertiesService.getScriptProperties();
      var existing = spProps.getProperty("APP_PIN_" + claimedUserId);
      if (existing) return jsonResponse({ ok: false, error: "Este usuario ya tiene PIN. Usa changePin para cambiarlo." });
      // H1: vincular setupPin a la posesion del codigo. Si hay una invitacion
      // pendiente para este userId, exige el codigo que la redime; impide que un
      // atacante fije el PIN antes que el invitado real reclame su perfil.
      var invMap = _getInvites(), nowMs = Date.now();
      var reqCode = _normalizeCode(payload.code || "");
      var matchCode = (reqCode && invMap[reqCode] && invMap[reqCode].userId === claimedUserId &&
                       !invMap[reqCode].used && nowMs < invMap[reqCode].expiry) ? reqCode : null;
      var hasPendingInvite = Object.keys(invMap).some(function(c) {
        return invMap[c].userId === claimedUserId && !invMap[c].used && nowMs < invMap[c].expiry;
      });
      // Siempre exige un código de invitación válido para fijar PIN por primera vez.
      // Cierra el hueco donde una invitación expirada permitía setupPin sin código.
      if (!matchCode) {
        return jsonResponse({ ok: false, error: "Codigo de invitacion invalido o expirado" });
      }
      spProps.setProperty("APP_PIN_" + claimedUserId, _hashPin(claimedUserId, newPin));
      // Consumir la invitacion redimida (un solo uso).
      if (matchCode) { invMap[matchCode].used = true; invMap[matchCode].usedAt = nowMs; _saveInvites(invMap); }
      return jsonResponse({ ok: true, token: _issueToken(claimedUserId) });
    }

    // ── Ingesta de factura desde la extensión de navegador ───────────────
    // Corre en la sesión autenticada del usuario en el portal; se autentica con
    // su propio token de larga duración (no el de sesión). Por eso va antes del gate.
    if (type === "ingestFactura") {
      var extUid = _userFromExtToken(payload.extToken);
      if (!extUid) return jsonResponse({ ok: false, error: "Token de extensión inválido" });
      _validateUserId(extUid);
      return jsonResponse(_ingestFactura(extUid, payload));
    }

    // -- A partir de aqui toda accion exige autenticacion real --
    var userId = _authUserId(e, channel, payload);
    if (!userId) return jsonResponse({ ok: false, error: "Unauthorized" });
    _validateUserId(userId);

    // Rate-limit admin write operations para mitigar abuso incluso con token válido.
    var ADMIN_TYPES = ["generateEmergencyPin","listUsers","createUser","createInvite","listInvites","listUsersData","disableUser","enableUser","revokeInvite","resetPin","deleteUser","migrarProductos"];
    if (ADMIN_TYPES.indexOf(type) !== -1) _checkRateLimit("admin", userId);

    // Prueba en vivo del onboarding: devuelve el timestamp (ms) del último SMS que el
    // iPhone reenvió al servidor. La PWA hace polling para confirmar que la
    // Automatización de iOS dispara, sin depender de que el SMS se parsee.
    if (type === "lastSmsSeen") {
      var lastSms = PropertiesService.getScriptProperties().getProperty("LAST_SMS_AT_" + userId);
      return jsonResponse({ ok: true, at: lastSms ? parseInt(lastSms, 10) : 0 });
    }

    // Ensure Fuente column exists (cached -- runs once per user per 6h)
    _migrateSheetHeaders(userId);

    // Migración puntual de productos/duplicados (ver migrarProductosYDuplicados).
    // Solo el admin, y por omisión SIMULA: hay que mandar aplicar:true a propósito.
    if (type === "migrarProductos") {
      // Esta acción BORRA filas, así que exige un token de sesión real y no el
      // userId auto-declarado que `_authUserId` acepta en el canal "shortcut":
      // ahí basta con tener WEBHOOK_SECRET para hacerse pasar por cualquiera.
      // (Las demás acciones admin comparten esa debilidad; aquí no se hereda
      // porque el daño sería irreversible.)
      var migUid = _userFromToken(payload.token);
      if (!migUid || migUid !== ADMIN_USER) {
        return jsonResponse({ ok: false, error: "requiere token de sesión de admin" });
      }
      return jsonResponse(migrarProductosYDuplicados(migUid, payload.aplicar === true));
    }

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
        categoria:    payload.categoria || detectCategoryIngesta(payload.comercio || "", userId),
        nota:         payload.nota     || "",
        sms_original: "MANUAL"
      };
      appendToSheet(data, userId);
      var manualResp = { ok: true, data: data };
      if (data.categoria && data.categoria !== 'Ingreso') {
        var mba = _checkBudgetAlert(userId, data.categoria);
        if (mba) manualResp.budgetAlert = mba;
      }
      return jsonResponse(manualResp);
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
      var comercioAprendido = updateCategoryInSheet(ts, cat, userId);
      if (comercioAprendido) {
        var ucProps = PropertiesService.getScriptProperties();
        // Legacy learning map
        var learnKey = "CATEGORY_LEARN_" + userId;
        var learned = JSON.parse(ucProps.getProperty(learnKey) || "{}");
        learned[normalizeComercio(comercioAprendido).toUpperCase()] = cat;
        ucProps.setProperty(learnKey, JSON.stringify(learned));
        // New rules engine: auto-save rule for this merchant → category
        var rulesKey = "RULES_" + userId;
        var userRulesUC = JSON.parse(ucProps.getProperty(rulesKey) || "[]");
        var pattern = comercioAprendido.trim().toUpperCase().replace(/\s+/g, ' ');
        var existIdx = userRulesUC.findIndex ? userRulesUC.findIndex(function(r){ return r.pattern === pattern; })
          : (function(){ for(var i=0;i<userRulesUC.length;i++){ if(userRulesUC[i].pattern===pattern) return i; } return -1; })();
        if (existIdx >= 0) { userRulesUC[existIdx].category = cat; userRulesUC[existIdx].updatedAt = new Date().toISOString(); }
        else { userRulesUC.push({ pattern: pattern, category: cat, priority: userRulesUC.length + 1, createdAt: new Date().toISOString() }); }
        if (userRulesUC.length > 200) userRulesUC = userRulesUC.slice(-200);
        ucProps.setProperty(rulesKey, JSON.stringify(userRulesUC));
      }
      return jsonResponse({ ok: true });
    }

    // Generar PIN de emergencia de un solo uso (24h) — solo admin
    if (type === "generateEmergencyPin") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "No autorizado" });
      var targetId = (payload.targetId || "").toLowerCase().trim();
      if (!targetId) return jsonResponse({ ok: false, error: "targetId requerido" });
      var epBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
      var epN = ((epBytes[0] & 0xff) * 16777216 + (epBytes[1] & 0xff) * 65536 + (epBytes[2] & 0xff) * 256 + (epBytes[3] & 0xff)) >>> 0;
      var code = String(100000 + (epN % 900000));
      var expiry = Date.now() + 24 * 60 * 60 * 1000;
      PropertiesService.getScriptProperties().setProperty("EMERGENCY_PIN_" + targetId, JSON.stringify({ code: code, expiry: expiry }));
      return jsonResponse({ ok: true, code: code, expiresAt: new Date(expiry).toISOString() });
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
      if (_getAllowedUsers().length >= MAX_USERS) return jsonResponse({ ok: false, error: MAX_USERS_ERROR });
      try {
        _provisionUser(newId, newName, initPin);
      } catch (provErr) {
        return jsonResponse({ ok: false, error: provErr.message });
      }
      return jsonResponse({ ok: true, created: newId });
    }

    // Crear una invitación de un solo uso (admin only)
    if (type === "createInvite") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede crear invitaciones" });
      var invName = String(payload.displayName || "").trim();
      if (!invName) return jsonResponse({ ok: false, error: "displayName requerido" });
      if (_getAllowedUsers().length >= MAX_USERS) return jsonResponse({ ok: false, error: MAX_USERS_ERROR });
      var invId;
      if (payload.newUserId) {
        invId = String(payload.newUserId).toLowerCase().trim();
        if (!/^[a-z0-9]{2,20}$/.test(invId)) return jsonResponse({ ok: false, error: "userId debe tener 2-20 caracteres alfanuméricos en minúsculas" });
      } else {
        invId = _deriveUserId(invName);
      }
      try {
        _provisionUser(invId, invName, "");  // sin PIN — lo fija el usuario al redimir
      } catch (provErr) {
        return jsonResponse({ ok: false, error: provErr.message });
      }
      var invMap = _getInvites();
      var code = _genInviteCode();
      while (invMap[code]) code = _genInviteCode();
      var nowMs = Date.now();
      var expMs = nowMs + 7 * 86400000;
      invMap[code] = { userId: invId, displayName: invName, createdAt: nowMs, expiry: expMs, used: false, usedAt: null };
      _saveInvites(invMap);
      return jsonResponse({ ok: true, code: _formatInviteCode(code), userId: invId, displayName: invName, expiresAt: new Date(expMs).toISOString() });
    }

    // Listar invitaciones pendientes (admin only)
    if (type === "listInvites") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede ver invitaciones" });
      var liMap = _getInvites();
      if (_pruneInvites(liMap)) _saveInvites(liMap);
      var liNow = Date.now();
      var pending = Object.keys(liMap)
        .filter(function(c) { return !liMap[c].used && liNow < liMap[c].expiry; })
        .map(function(c) {
          return {
            code: _formatInviteCode(c),
            userId: liMap[c].userId,
            displayName: liMap[c].displayName,
            createdAt: liMap[c].createdAt,
            expiresAt: new Date(liMap[c].expiry).toISOString()
          };
        })
        .sort(function(a, b) { return b.createdAt - a.createdAt; });
      return jsonResponse({ ok: true, data: pending });
    }

    // Revocar una invitación (admin only) — borra el código y, si el usuario nunca
    // fijó PIN, también elimina el usuario fantasma y su tab.
    if (type === "revokeInvite") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede revocar invitaciones" });
      var rvKey = _normalizeCode(payload.code);
      var rvMap = _getInvites();
      if (!rvMap[rvKey]) return jsonResponse({ ok: false, error: "Invitación no encontrada" });
      var rvTarget = rvMap[rvKey].userId;
      delete rvMap[rvKey];
      _saveInvites(rvMap);
      var userDeleted = false;
      if (rvTarget && rvTarget !== _getAdminUser() &&
          !PropertiesService.getScriptProperties().getProperty("APP_PIN_" + rvTarget)) {
        _deprovisionUser(rvTarget);
        userDeleted = true;
      }
      return jsonResponse({ ok: true, revoked: rvKey, userDeleted: userDeleted });
    }

    // Eliminar un usuario (admin only).
    // payload.deleteData = true  → borra también su tab de transacciones (por defecto: true)
    // payload.deleteData = false → conserva los datos históricos en Sheets
    if (type === "deleteUser") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede eliminar usuarios" });
      var targetId = String(payload.targetId || "").toLowerCase().trim();
      if (!targetId) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (targetId === _getAdminUser()) return jsonResponse({ ok: false, error: "No puedes eliminar al administrador" });
      var allUsers = _getAllowedUsers();
      if (allUsers.indexOf(targetId) === -1) return jsonResponse({ ok: false, error: "El usuario '" + targetId + "' no existe" });
      _deprovisionUser(targetId, payload.deleteData !== false);
      return jsonResponse({ ok: true, deleted: targetId });
    }

    // Listar usuarios con stats completos para el panel admin
    if (type === "listUsersData") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede ver datos de usuarios" });
      return jsonResponse({ ok: true, data: _adminListUsersData() });
    }

    // Deshabilitar un usuario (bloquea login sin borrar datos)
    if (type === "disableUser") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede deshabilitar usuarios" });
      var disTarget = String(payload.targetId || "").toLowerCase().trim();
      if (!disTarget) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (disTarget === _getAdminUser()) return jsonResponse({ ok: false, error: "No puedes deshabilitar al administrador" });
      if (_getAllowedUsers().indexOf(disTarget) === -1) return jsonResponse({ ok: false, error: "Usuario no existe" });
      PropertiesService.getScriptProperties().setProperty("APP_USER_DISABLED_" + disTarget, "true");
      return jsonResponse({ ok: true, disabled: disTarget });
    }

    // Habilitar un usuario previamente deshabilitado
    if (type === "enableUser") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede habilitar usuarios" });
      var enTarget = String(payload.targetId || "").toLowerCase().trim();
      if (!enTarget) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (_getAllowedUsers().indexOf(enTarget) === -1) return jsonResponse({ ok: false, error: "Usuario no existe" });
      PropertiesService.getScriptProperties().deleteProperty("APP_USER_DISABLED_" + enTarget);
      return jsonResponse({ ok: true, enabled: enTarget });
    }

    // Migración masiva de categorías (admin only) — renombra obsoletas y re-detecta
    if (type === "migrateCategories") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede ejecutar migraciones" });
      var migResult = migrateCategories();
      return jsonResponse(migResult);
    }

    // Resetear el PIN de un usuario (admin only)
    if (type === "resetPin") {
      if (userId !== _getAdminUser()) return jsonResponse({ ok: false, error: "Solo el admin puede resetear PINs" });
      var resetTarget = String(payload.targetId || "").toLowerCase().trim();
      var resetPin = String(payload.newPin || "");
      if (!resetTarget) return jsonResponse({ ok: false, error: "targetId requerido" });
      if (!resetPin || !/^\d{4,6}$/.test(resetPin)) return jsonResponse({ ok: false, error: "PIN debe tener 4-6 dígitos" });
      PropertiesService.getScriptProperties().setProperty("APP_PIN_" + resetTarget, _hashPin(resetTarget, resetPin));
      return jsonResponse({ ok: true, reset: resetTarget });
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

    // ── Gestión de tarjetas/cuentas ──────────────────────────────
    if (type === "saveCard") {
      var cardData = payload.card;
      if (!cardData || !cardData.id || !cardData.banco || !cardData.ultimos4) {
        return jsonResponse({ ok: false, error: "Faltan campos requeridos en la tarjeta" });
      }
      var existingCards = _getCards(userId);
      var cardIdx = -1;
      for (var ci = 0; ci < existingCards.length; ci++) {
        if (existingCards[ci].id === cardData.id) { cardIdx = ci; break; }
      }
      if (cardIdx >= 0) existingCards[cardIdx] = cardData;
      else existingCards.push(cardData);
      _saveCards(userId, existingCards);
      return jsonResponse({ ok: true });
    }

    if (type === "deleteCard") {
      var cardId = payload.cardId || "";
      if (!cardId) return jsonResponse({ ok: false, error: "cardId requerido" });
      var filteredCards = _getCards(userId).filter(function(c) { return c.id !== cardId; });
      _saveCards(userId, filteredCards);
      return jsonResponse({ ok: true });
    }

    // Cambiar PIN del usuario
    if (type === "changePin") {
      var currentPin = String(payload.currentPin || "");
      var newPin     = String(payload.newPin     || "");
      if (!currentPin || !newPin) return jsonResponse({ ok: false, error: "Faltan campos" });
      var pinKey    = "APP_PIN_" + userId;
      var cpProps   = PropertiesService.getScriptProperties();
      var storedPin = cpProps.getProperty(pinKey);
      if (!storedPin) return jsonResponse({ ok: false, error: "APP_PIN_" + userId + " no configurado" });
      if (!_verifyPin(userId, currentPin, storedPin)) return jsonResponse({ ok: false, error: "PIN incorrecto" });
      if (!/^\d{4,6}$/.test(newPin)) return jsonResponse({ ok: false, error: "El nuevo PIN debe tener 4–6 dígitos" });
      cpProps.setProperty(pinKey, _hashPin(userId, newPin));
      return jsonResponse({ ok: true });
    }

    // Actualizar perfil (nombre visible, avatar, alertas) — cualquier usuario autenticado
    if (type === "updateProfile") {
      var profName   = String(payload.displayName || "").trim().slice(0, 60);
      var profAvatar = String(payload.avatar || "").slice(0, 200000);
      var profProps  = PropertiesService.getScriptProperties();
      if (profName)   profProps.setProperty("APP_PROFILE_NAME_" + userId, profName);
      if (profAvatar) profProps.setProperty("APP_PROFILE_AVATAR_" + userId, profAvatar);
      if (payload.alertEmail !== undefined)    profProps.setProperty("APP_ALERT_EMAIL_" + userId, String(payload.alertEmail || ""));
      if (payload.alertThreshold !== undefined) profProps.setProperty("APP_ALERT_THRESHOLD_" + userId, String(Number(payload.alertThreshold) || "0"));
      if (payload.weeklyDigest !== undefined)  profProps.setProperty("APP_WEEKLY_DIGEST_" + userId, payload.weeklyDigest ? "true" : "false");
      return jsonResponse({ ok: true });
    }

    // Obtener perfil guardado en servidor — permite sincronizar en dispositivos nuevos
    if (type === "getProfile") {
      var gpProps = PropertiesService.getScriptProperties();
      var threshold = gpProps.getProperty("APP_ALERT_THRESHOLD_" + userId);
      return jsonResponse({ ok: true, data: {
        displayName:    gpProps.getProperty("APP_PROFILE_NAME_" + userId) || "",
        avatar:         gpProps.getProperty("APP_PROFILE_AVATAR_" + userId) || "",
        alertEmail:     gpProps.getProperty("APP_ALERT_EMAIL_" + userId) || "",
        alertThreshold: threshold ? Number(threshold) : 0,
        weeklyDigest:   gpProps.getProperty("APP_WEEKLY_DIGEST_" + userId) === "true"
      }});
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

      // Mismo problema que en la ruta de SMS: el teléfono reenvía la misma
      // notificación más de una vez (ver INGEST_DEDUP_TTL_S).
      if (_isDuplicateIngest(userId, "PUSH|" + title + "|" + body)) {
        return jsonResponse({ ok: true, skipped: true, reason: "duplicate" });
      }

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
      parsedNotif.categoria    = detectCategoryIngesta(parsedNotif.comercio, userId);
      parsedNotif.sms_original = "PUSH | " + title + " | " + body;
      var ntxt = title + ' ' + body;
      parsedNotif.fuente       = /apple\s*pay/i.test(ntxt) ? 'apple_pay'
                               : /google\s*pay/i.test(ntxt) ? 'google_pay'
                               : 'notification';

      // Ver comentario en el handler de type:"sms" — Itaú manda dos avisos
      // (genérico + con llave Bre-B) para la misma transferencia.
      if (parsedNotif._bankKey === "itau" && isBrebMergeCandidate(parsedNotif)) {
        var mergedNotif = mergeBrebDuplicate(parsedNotif, userId);
        if (mergedNotif) return jsonResponse({ ok: true, merged: true, data: parsedNotif });
      }

      appendToSheet(parsedNotif, userId);
      return jsonResponse({ ok: true, data: parsedNotif });
    }

    // Cuenta transacciones sin categorizar (tipo: "uncategorizedCount")
    if (type === "uncategorizedCount") {
      var ref2   = _getSheet(userId);
      var ss2    = ref2.ss;
      var tab2   = ref2.sheet;
      if (!tab2) return jsonResponse({ ok: true, count: 0 });
      var data2    = tab2.getDataRange().getValues();
      var headers2 = data2[0];
      var catIdx2  = headers2.indexOf('Categoría');
      if (catIdx2 < 0) return jsonResponse({ ok: true, count: 0 });
      var count2 = data2.slice(1).filter(function(row) {
        var cat = row[catIdx2];
        return !cat || cat === '' || cat === 'Otro';
      }).length;
      return jsonResponse({ ok: true, count: count2 });
    }

    // Resumen del mes (type: "monthSummary") — para widget iOS Shortcut
    if (type === "monthSummary") {
      var ref3   = _getSheet(userId);
      var tab3   = ref3.sheet;
      if (!tab3) return jsonResponse({ ok: true, data: { total: 0, topCategory: null, projection: 0 } });
      var data3    = tab3.getDataRange().getValues();
      var headers3 = data3[0];
      var fechaIdx = headers3.indexOf('Fecha');
      var montoIdx = headers3.indexOf('Monto (COP)');
      var catIdx3  = headers3.indexOf('Categoría');
      var now3     = new Date();
      var y3 = now3.getFullYear(), m3 = now3.getMonth();
      var startM = new Date(y3, m3, 1);
      var endM   = new Date(y3, m3 + 1, 0, 23, 59, 59);
      var byCat3 = {};
      var total3 = 0;
      data3.slice(1).forEach(function(row) {
        var d = new Date(row[fechaIdx]);
        if (d < startM || d > endM) return;
        var monto = Number(row[montoIdx]) || 0;
        if (monto <= 0) return;
        total3 += monto;
        var cat = row[catIdx3] || 'Otro';
        byCat3[cat] = (byCat3[cat] || 0) + monto;
      });
      var topCat3  = Object.keys(byCat3).sort(function(a,b){ return byCat3[b]-byCat3[a]; })[0] || null;
      var dayOfMonth = now3.getDate();
      var daysInMonth = new Date(y3, m3 + 1, 0).getDate();
      var projection = dayOfMonth > 0 ? Math.round(total3 / dayOfMonth * daysInMonth) : 0;
      return jsonResponse({ ok: true, data: { total: total3, topCategory: topCat3, projection: projection, daysLeft: daysInMonth - dayOfMonth } });
    }

    // ── CLUSTER 2: Calendario de Pagos Fijos (PRIORIDAD 1) ───────────────
    if (type === "getFixedCalendar") {
      var month = (payload.month || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM'));
      return jsonResponse(_getFixedCalendar(userId, month));
    }
    if (type === "saveFixedPayment") {
      var fp = payload.payment || {};
      // Las facturas de servicios ('utility') pueden no tener monto hasta consultarlo.
      if (!fp.nombre || !fp.diaDelMes) return jsonResponse({ ok: false, error: "nombre y diaDelMes requeridos" });
      if (fp.tipo !== "utility" && !fp.monto) return jsonResponse({ ok: false, error: "monto requerido" });
      return jsonResponse(_saveFixedPayment(userId, fp));
    }
    if (type === "deleteFixedPayment") {
      if (!payload.id) return jsonResponse({ ok: false, error: "id requerido" });
      return jsonResponse(_deleteFixedPayment(userId, payload.id));
    }
    // Consulta automática (scraping) de un pago tipo 'utility' por su número de cuenta.
    if (type === "refreshFixedPayment") {
      if (!payload.id) return jsonResponse({ ok: false, error: "id requerido" });
      return jsonResponse(_refreshFixedPayment(userId, payload.id));
    }
    // Emite el token de larga duración para emparejar la extensión de navegador.
    if (type === "issueExtToken") {
      return jsonResponse({ ok: true, extToken: _issueExtToken(userId) });
    }
    if (type === "autoDetectFixed") {
      var detected = _detectRecurring(_getTxnsRange(userId, 6));
      return jsonResponse({ ok: true, suggestions: detected });
    }

    // ── CLUSTER 3: Rules Engine ───────────────────────────────────────────
    if (type === "getRules") {
      var sp3 = PropertiesService.getScriptProperties();
      var rules3 = JSON.parse(sp3.getProperty("RULES_" + userId) || "[]");
      return jsonResponse({ ok: true, rules: rules3 });
    }
    if (type === "deleteRule") {
      if (!payload.pattern) return jsonResponse({ ok: false, error: "pattern requerido" });
      var sp3b = PropertiesService.getScriptProperties();
      var rules3b = JSON.parse(sp3b.getProperty("RULES_" + userId) || "[]");
      rules3b = rules3b.filter(function(r){ return r.pattern !== payload.pattern; });
      sp3b.setProperty("RULES_" + userId, JSON.stringify(rules3b));
      return jsonResponse({ ok: true });
    }

    // ── CLUSTER 3: Category Budgets ───────────────────────────────────────
    if (type === "getCategoryBudgets") {
      var bMonth = payload.month || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
      return jsonResponse(_getCategoryStatus(userId, bMonth));
    }
    if (type === "setCategoryBudget") {
      if (!payload.category || payload.amount === undefined) return jsonResponse({ ok: false, error: "category y amount requeridos" });
      var bMonth2 = payload.month || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
      var sp4 = PropertiesService.getScriptProperties();
      var budgets = JSON.parse(sp4.getProperty("CAT_BUDGETS_" + userId + "_" + bMonth2) || "{}");
      budgets[payload.category] = Number(payload.amount) || 0;
      sp4.setProperty("CAT_BUDGETS_" + userId + "_" + bMonth2, JSON.stringify(budgets));
      return jsonResponse({ ok: true });
    }
    if (type === "deleteCategoryBudget") {
      if (!payload.category) return jsonResponse({ ok: false, error: "category requerido" });
      var bMonth3 = payload.month || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
      var sp4b = PropertiesService.getScriptProperties();
      var budgets2 = JSON.parse(sp4b.getProperty("CAT_BUDGETS_" + userId + "_" + bMonth3) || "{}");
      delete budgets2[payload.category];
      sp4b.setProperty("CAT_BUDGETS_" + userId + "_" + bMonth3, JSON.stringify(budgets2));
      return jsonResponse({ ok: true });
    }

    // ── CLUSTER 3: Net Worth ──────────────────────────────────────────────
    if (type === "getNetWorth") {
      var nwRaw = PropertiesService.getScriptProperties().getProperty("NET_WORTH_" + userId);
      var nw = nwRaw ? JSON.parse(nwRaw) : { assets: [], debts: [] };
      var totalAssets = (nw.assets || []).reduce(function(s,a){ return s + (Number(a.valor) || 0); }, 0);
      var totalDebts  = (nw.debts  || []).reduce(function(s,d){ return s + (Number(d.saldo) || 0); }, 0);
      return jsonResponse({ ok: true, assets: nw.assets || [], debts: nw.debts || [],
        totalAssets: totalAssets, totalDebts: totalDebts, netWorth: totalAssets - totalDebts,
        lastUpdated: nw.lastUpdated || null });
    }
    if (type === "saveNetWorthEntry") {
      if (!payload.tipo || !payload.nombre) return jsonResponse({ ok: false, error: "tipo y nombre requeridos" });
      var sp5 = PropertiesService.getScriptProperties();
      var nw2Raw = sp5.getProperty("NET_WORTH_" + userId);
      var nw2 = nw2Raw ? JSON.parse(nw2Raw) : { assets: [], debts: [] };
      var entryId = payload.id || Utilities.getUuid();
      var entry = { id: entryId, tipo: payload.tipo, nombre: payload.nombre,
        valor: Number(payload.valor || payload.saldo) || 0,
        moneda: payload.moneda || "COP", tasaAnual: payload.tasaAnual || null,
        cuotaMensual: payload.cuotaMensual || null, fecha: new Date().toISOString().slice(0,10) };
      if (payload.tipo === "debt") {
        entry.saldo = entry.valor; delete entry.valor;
        var dIdx = (nw2.debts || []).findIndex(function(d){ return d.id === entryId; });
        if (dIdx >= 0) nw2.debts[dIdx] = entry; else nw2.debts.push(entry);
      } else {
        var aIdx = (nw2.assets || []).findIndex(function(a){ return a.id === entryId; });
        if (aIdx >= 0) nw2.assets[aIdx] = entry; else nw2.assets.push(entry);
      }
      nw2.lastUpdated = new Date().toISOString().slice(0,10);
      sp5.setProperty("NET_WORTH_" + userId, JSON.stringify(nw2));
      return jsonResponse({ ok: true, id: entryId });
    }
    if (type === "deleteNetWorthEntry") {
      if (!payload.tipo || !payload.id) return jsonResponse({ ok: false, error: "tipo y id requeridos" });
      var sp5b = PropertiesService.getScriptProperties();
      var nw3Raw = sp5b.getProperty("NET_WORTH_" + userId);
      if (!nw3Raw) return jsonResponse({ ok: true });
      var nw3 = JSON.parse(nw3Raw);
      if (payload.tipo === "debt") nw3.debts = (nw3.debts || []).filter(function(d){ return d.id !== payload.id; });
      else nw3.assets = (nw3.assets || []).filter(function(a){ return a.id !== payload.id; });
      nw3.lastUpdated = new Date().toISOString().slice(0,10);
      sp5b.setProperty("NET_WORTH_" + userId, JSON.stringify(nw3));
      return jsonResponse({ ok: true });
    }

    // ── CLUSTER 3: Cashback Tracker ───────────────────────────────────────
    if (type === "getCashback") {
      var cbRaw = PropertiesService.getScriptProperties().getProperty("CASHBACK_" + userId);
      var cb = cbRaw ? JSON.parse(cbRaw) : {};
      var totalValueCOP = Object.keys(cb).reduce(function(s,k){
        var c = cb[k]; return s + Math.round((Number(c.puntos)||0) * (Number(c.tasaPuntosCOP)||0));
      }, 0);
      var cards = {};
      Object.keys(cb).forEach(function(k){
        var c = cb[k];
        cards[k] = { banco: c.banco, programa: c.programa, puntos: c.puntos || 0,
          tasaPuntosCOP: c.tasaPuntosCOP || 0, valorEnCOP: Math.round((c.puntos||0)*(c.tasaPuntosCOP||0)) };
      });
      return jsonResponse({ ok: true, cards: cards, totalValueCOP: totalValueCOP });
    }
    if (type === "updateCashback") {
      if (!payload.card) return jsonResponse({ ok: false, error: "card requerido" });
      var sp6 = PropertiesService.getScriptProperties();
      var cb2 = JSON.parse(sp6.getProperty("CASHBACK_" + userId) || "{}");
      cb2[payload.card] = { banco: payload.banco || "", programa: payload.programa || "",
        puntos: Number(payload.puntos) || 0, tasaPuntosCOP: Number(payload.tasaPuntosCOP) || 0 };
      sp6.setProperty("CASHBACK_" + userId, JSON.stringify(cb2));
      return jsonResponse({ ok: true });
    }
    if (type === "deleteCashback") {
      if (!payload.card) return jsonResponse({ ok: false, error: "card requerido" });
      var sp6d = PropertiesService.getScriptProperties();
      var cb4 = JSON.parse(sp6d.getProperty("CASHBACK_" + userId) || "{}");
      delete cb4[payload.card];
      sp6d.setProperty("CASHBACK_" + userId, JSON.stringify(cb4));
      return jsonResponse({ ok: true });
    }
    if (type === "recordCashbackEarned") {
      if (!payload.card || !payload.puntosGanados) return jsonResponse({ ok: false, error: "card y puntosGanados requeridos" });
      var sp6b = PropertiesService.getScriptProperties();
      var cb3 = JSON.parse(sp6b.getProperty("CASHBACK_" + userId) || "{}");
      if (!cb3[payload.card]) return jsonResponse({ ok: false, error: "Tarjeta no registrada en cashback" });
      cb3[payload.card].puntos = (cb3[payload.card].puntos || 0) + Number(payload.puntosGanados);
      sp6b.setProperty("CASHBACK_" + userId, JSON.stringify(cb3));
      return jsonResponse({ ok: true, totalPuntos: cb3[payload.card].puntos });
    }

    // ── CLUSTER 4: Mood Tracker ───────────────────────────────────────────
    if (type === "saveMood") {
      if (!payload.mood || payload.mood < 1 || payload.mood > 5) return jsonResponse({ ok: false, error: "mood debe ser 1-5" });
      var sp7 = PropertiesService.getScriptProperties();
      var moodHistory = JSON.parse(sp7.getProperty("MOOD_HISTORY_" + userId) || "[]");
      var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
      moodHistory = moodHistory.filter(function(m){ return m.date !== today; });
      moodHistory.push({ date: today, mood: Number(payload.mood), note: payload.note || "" });
      moodHistory.sort(function(a,b){ return a.date > b.date ? 1 : -1; });
      if (moodHistory.length > 52) moodHistory = moodHistory.slice(-52);
      sp7.setProperty("MOOD_HISTORY_" + userId, JSON.stringify(moodHistory));
      return jsonResponse({ ok: true });
    }
    if (type === "getMoodHistory") {
      var mhRaw = PropertiesService.getScriptProperties().getProperty("MOOD_HISTORY_" + userId);
      var moodHist = mhRaw ? JSON.parse(mhRaw) : [];
      var txnsForMood = _getTxnsRange(userId, 3);
      var moodWithSpend = moodHist.map(function(entry){
        var weekStart = entry.date;
        var d = new Date(weekStart);
        var d2 = new Date(d); d2.setDate(d2.getDate() + 6);
        var ws = weekStart.slice(0,10);
        var we = d2.toISOString().slice(0,10);
        var spentThatWeek = txnsForMood
          .filter(function(t){ var f = String(t.Fecha||"").slice(0,10); return f >= ws && f <= we && (Number(t["Monto (COP)"])||0) > 0; })
          .reduce(function(s,t){ return s + (Number(t["Monto (COP)"])||0); }, 0);
        return { date: entry.date, mood: entry.mood, note: entry.note, spentThatWeek: spentThatWeek };
      });
      var lowMood = moodWithSpend.filter(function(m){ return m.mood <= 2; });
      var highMood = moodWithSpend.filter(function(m){ return m.mood >= 4; });
      var avgLow  = lowMood.length  ? Math.round(lowMood.reduce(function(s,m){ return s+m.spentThatWeek; },0)/lowMood.length) : null;
      var avgHigh = highMood.length ? Math.round(highMood.reduce(function(s,m){ return s+m.spentThatWeek; },0)/highMood.length) : null;
      var insight = null;
      if (avgLow !== null && avgHigh !== null && avgHigh > 0) {
        var diff = Math.round((avgLow - avgHigh) / avgHigh * 100);
        if (diff > 20) insight = "Gastas " + diff + "% más en semanas con mood bajo (≤2) vs semanas con mood alto (≥4)";
        else if (diff < -20) insight = "Curiosamente gastas " + Math.abs(diff) + "% menos cuando tu mood es bajo — ¡bien!";
      }
      return jsonResponse({ ok: true, history: moodWithSpend, correlation: { lowMoodAvgSpend: avgLow, highMoodAvgSpend: avgHigh, insight: insight }});
    }

    // ── CLUSTER 5: AI Intelligence ────────────────────────────────────────
    if (type === "spendingCoach") {
      // Cuota configurable vía Script Property AI_QUOTA_COACH (mismo patrón que CLAUDE_*_MODEL).
      var coachLimit = parseInt(PropertiesService.getScriptProperties().getProperty('AI_QUOTA_COACH') || '5', 10);
      var rlCoach = _checkRate(userId, "coach", coachLimit);
      if (!rlCoach.ok) return jsonResponse({ ok: false, error: rlCoach.error });
      return jsonResponse(_spendingCoach(userId, Number(payload.months || 3)));
    }
    if (type === "getRetoSuggestion") {
      var retoLimit = parseInt(PropertiesService.getScriptProperties().getProperty('AI_QUOTA_RETO') || '10', 10);
      var rlReto = _checkRate(userId, "reto", retoLimit);
      if (!rlReto.ok) return jsonResponse({ ok: false, error: rlReto.error });
      var coachData = _spendingCoach(userId, 3);
      return jsonResponse({ ok: coachData.ok, suggestedReto: coachData.suggestedReto || null });
    }
    if (type === "generateHealthReport") {
      var reportLimit = parseInt(PropertiesService.getScriptProperties().getProperty('AI_QUOTA_REPORT') || '3', 10);
      var rlReport = _checkRate(userId, "report", reportLimit);
      if (!rlReport.ok) return jsonResponse({ ok: false, error: rlReport.error });
      return jsonResponse(_generateHealthReport(userId, payload.month || null));
    }

    // SMS automático desde iOS Shortcut
    var sms    = (payload.sms    || "").trim();
    var sentAt = payload.timestamp || new Date().toISOString();

    if (!sms) return jsonResponse({ ok: false, error: "empty sms" });

    // Registra que llegó un SMS desde el iPhone, ANTES del veto/parseo. Confirma que
    // la Automatización de iOS está disparando (lo consulta la prueba en vivo del
    // onboarding vía type:"lastSmsSeen"), aunque el mensaje no sea transaccional.
    try { PropertiesService.getScriptProperties().setProperty("LAST_SMS_AT_" + userId, String(Date.now())); } catch (eStamp) {}

    // Silently drop vetoed messages (never reach the Sheet)
    if (isVetoed(sms)) {
      return jsonResponse({ ok: true, skipped: true, reason: "vetoed" });
    }

    // El teléfono reenvía el mismo SMS más de una vez (ver INGEST_DEDUP_TTL_S).
    // Va ANTES del parseo a propósito: además de evitar la fila duplicada, ahorra
    // la llamada al fallback de IA, que el duplicado pagaba dos veces.
    if (_isDuplicateIngest(userId, sms)) {
      return jsonResponse({ ok: true, skipped: true, reason: "duplicate" });
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
    } else if (resolvedBank === "avvillas") {
      parsed = parseAvVillas(sms);
    } else {
      // Banco no reconocido → solo invocar Haiku si el SMS parece transaccional.
      // Requiere monto en contexto transaccional ("por $X", "débito de $X") para
      // evitar llamadas innecesarias por SMS promocionales ("cupo de $50,000,000").
      var txSignal = /\bpor\s+\$[\d,.]|(?:compra|d[eé]bito|retiro|transferencia|cobro)\s+(?:de\s+)?\$[\d,.]|\bNequi\b|\bDaviplata\b/i;
      if (!txSignal.test(sms)) {
        return jsonResponse({ ok: true, skipped: true, reason: "no bank signal" });
      }
      var fallback = parseSmsFallback(sms);
      if (!fallback) {
        return jsonResponse({ ok: false, error: "unknown bank: " + (bank || "could not detect") });
      }
      if (fallback.skipped) {
        return jsonResponse({ ok: true, skipped: true, reason: "not a transaction (AI)" });
      }
      parsed = fallback;
    }

    // Antes de gastar IA: probar los parsers de los OTROS bancos. Un banco puede
    // cambiar el encabezado o el pie del SMS sin cambiar la estructura — pasó con
    // la compra de Itaú por Banco de Bogotá, y mandó meses de transacciones al
    // fallback de IA con la tarjeta mal transcrita.
    if (!parsed) {
      parsed = parseAnyBank(sms, resolvedBank);
      if (parsed) {
        Logger.log("parseAnyBank rescató un SMS de '" + resolvedBank +
                   "' con formato de otro banco (usuario " + userId + ")");
      }
    }

    if (!parsed) {
      // Formato no reconocido por NINGÚN parser — intenta AI fallback.
      // VETO_RULES ya descartó promocionales/OTP, así que es probable un nuevo
      // formato transaccional que el banco introdujo.
      var aiFallback = parseSmsFallback(sms);
      if (!aiFallback) {
        // No se guardó nada y puede ser transitorio (la IA falló o no respondió):
        // soltar la reserva para que un reenvío pueda reintentar.
        _releaseIngest(userId, sms);
        return jsonResponse({ ok: false, error: "parse failed", bank: resolvedBank });
      }
      if (aiFallback.skipped) return jsonResponse({ ok: true, skipped: true, reason: "not a transaction (AI)" });
      // El banco ya se detectó por regex antes de caer al fallback de IA — usa el
      // nombre canónico en vez de confiar en cómo la IA transcribió el texto del SMS.
      if (CANONICAL_BANCO[resolvedBank]) aiFallback.banco = CANONICAL_BANCO[resolvedBank];
      parsed = aiFallback;
    }

    // Reversal: find and delete the original transaction instead of adding a new row
    if (parsed.reversal) {
      var removed = reverseTransaction(parsed, userId);
      return jsonResponse({ ok: true, reversed: true, found: removed });
    }

    parsed.timestamp    = new Date();
    parsed.categoria    = parsed.income ? 'Ingreso' : detectCategoryIngesta(parsed.comercio, userId);
    delete parsed.income;
    parsed.sms_original = sms;
    parsed.fuente       = /apple\s*pay/i.test(sms) ? 'apple_pay'
                        : /google\s*pay/i.test(sms) ? 'google_pay'
                        : 'sms';

    // Itaú manda dos SMS para UNA misma transferencia Bre-B: uno genérico
    // ("débito de tu Cuenta de Ahorros...") y otro con la llave del
    // destinatario ("...a la llave Bre-B <llave>..."). Sin esto cada uno
    // crea su propia fila y la transferencia queda duplicada — ver
    // mergeBrebDuplicate() (junto a reverseTransaction()).
    if (parsed._bankKey === "itau" && isBrebMergeCandidate(parsed)) {
      var mergedSms = mergeBrebDuplicate(parsed, userId);
      if (mergedSms) return jsonResponse({ ok: true, merged: true, data: parsed });
    }

    appendToSheet(parsed, userId);
    var smsResponse = { ok: true, data: parsed };
    // Check category budget alert after saving
    if (parsed.categoria && parsed.categoria !== 'Ingreso') {
      var ba = _checkBudgetAlert(userId, parsed.categoria);
      if (ba) smsResponse.budgetAlert = ba;
    }
    return jsonResponse(smsResponse);

  } catch (err) {
    // Falló a mitad de camino: si ya se había reservado la huella, soltarla.
    // Si no, un reintento del teléfono dentro de la ventana se descartaría y
    // la transacción se perdería.
    try { _releaseIngest(userId, sms); } catch (e2) {}
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
  // FIX: user input goes in the user message (not concatenated into system prompt)
  // This prevents prompt injection via voice input.
  var systemPrompt = "Extrae la informaci\u00f3n de una transacci\u00f3n financiera en pesos colombianos. " +
    "Responde ÚNICAMENTE con un objeto JSON v\u00e1lido con exactamente estos campos: " +
    "monto (n\u00famero sin s\u00edmbolos ni puntos de miles, ej: 50000), " +
    "comercio (nombre del lugar o descripci\u00f3n, string), " +
    "categoria (una de: Restaurantes, Domicilios, Mercado, Transporte, Hogar, Salud, Deporte, Compras, Suscripciones, Viajes, Software, Bre-B, Entretenimiento, Otro), " +
    "banco (Bogot\u00e1 o Ita\u00fa u Otro), " +
    "tipo (Compra, D\u00e9bito, Transferencia u Otro). " +
    "Si alg\u00fan campo no est\u00e1 claro en el texto, usa el valor m\u00e1s probable.";

  // Modelo configurable vía Script Properties (ver docs/CONVENTIONS.md); fallback al actual.
  var voiceModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_VOICE_MODEL') || 'claude-haiku-4-5-20251001';
  var content = _callClaudeAI(systemPrompt, text, 300, voiceModel);

  var jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude no devolvió JSON válido: " + content);

  return JSON.parse(jsonMatch[0]);
}

// ── Chat con asistente financiero ────────────────────────────
function handleChat(question, context) {
  // System prompt contains server-generated context (safe). User question is isolated in the user turn.
  var systemPrompt = "Eres un asistente financiero personal del usuario. El usuario habla espa\u00f1ol colombiano. " +
    "Responde siempre en espa\u00f1ol. Puedes responder cualquier pregunta sobre los datos financieros del usuario, " +
    "sin importar qu\u00e9 tan espec\u00edfica o abierta sea. " +
    "Cuando el an\u00e1lisis lo requiera, s\u00e9 detallado y usa listas o vi\u00f1etas para mayor claridad. " +
    "Tienes acceso a la lista completa de transacciones en 'transacciones' y tambi\u00e9n a res\u00famenes pre-calculados " +
    "como 'comerciosPorCategoria' que ya agrupa los comercios por categor\u00eda con monto y n\u00famero de compras. " +
    "Usa los datos m\u00e1s convenientes para responder con precisi\u00f3n. " +
    "Datos financieros del usuario (\u00faltimos 6 meses): " + JSON.stringify(context);

  // Prompt caching (GA, sin beta header): el bloque system (instrucciones + contexto
  // de 6 meses) es idéntico entre mensajes de la misma sesión de chat — cachearlo
  // evita reprocesar esos tokens en cada pregunta nueva del usuario. _callClaudeAI
  // soporta system como array de bloques con cache_control.
  // Modelo configurable vía Script Properties; fallback al actual.
  var chatModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_CHAT_MODEL') || 'claude-haiku-4-5-20251001';
  var systemBlocks = [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }];
  var content = _callClaudeAI(systemBlocks, question, 1024, chatModel);
  if (!content) throw new Error("Respuesta inesperada de Anthropic: vacía");
  return content;
}

// ── Veto rules — messages silently ignored, never written to Sheet ────────────
// Add a regex per pattern you want to exclude.
var VETO_RULES = [
  // AV Villas — login / security notifications (not transactions)
  /AVVillas\..*iniciado\s+sesion/i,
  /AVVillas\..*Audiovillas/i,

  // Credit offers / pre-approved quota — all banks
  /cupo\s+(?:pre)?aprobad/i,
  /cr[eé]dito\s+pre(?:-?\s*)?aprobad/i,
  /tienes\s+(?:disponible\s+)?\$[\d,.].*(?:aprobad|cupo|cr[eé]dito)/i,

  // Balance alerts (NOT a debit/credit event)
  /saldo\s+disponible\s+(?:es|de)\s+\$/i,
  /tu\s+saldo\s+(?:actual|disponible)/i,

  // Payment-due reminders (advisory, not a real debit)
  /(?:cuota|pago)\s+(?:de\s+)?\$[\d,.]+\s+vence/i,

  // OTP / one-time codes / security PINs
  /\bOTP\b/,
  /clave\s+(?:temp|din[aá]mic)/i,
  /c[oó]digo\s+(?:de\s+)?verificaci[oó]n/i,

  // Welcome / onboarding messages from banks
  /bienvenid[ao]\s+a\b/i,

  // dale! — publicidad de combos escrita como si fuera una compra ("Compra tu
  // combo dale! por $14.900 en Cafe Quindio con tu Tarjeta Debito dale!").
  // Entraban como transacciones reales, con fecha inventada (2024-01-01) porque
  // el mensaje no trae ninguna. El delator es el enlace promocional y el
  // imperativo/futuro: una compra real ya ocurrió, no se anuncia.
  /smsdale\.com\.co/i,
  /\bAplicaTyC\b/i,
  /dale!:.*\b(?:es hora del|tu cafe de la tarde|compra tu combo)\b/i,
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
  if (/^AVVillas\./i.test(sms))          return "avvillas";

  // Banco de Bogotá compró a Itaú (2026). El pie del SMS cambió de
  // "ITAU Tel: 5818181..." a "Si no fuiste tu, comunicate con la Servilinea de
  // Banco de Bogota.", pero la ESTRUCTURA del mensaje sigue siendo la de Itaú
  // ("Se realizo una compra en X desde tu Tarjeta Credito ****NNNN por $N el ...").
  // Sin esta regla el mensaje no detectaba banco, caía al fallback de IA y la
  // tarjeta quedaba como "8439" pelado en vez de "Tarjeta Credito ****8439"
  // — fragmentando el producto. Se detecta por la forma, no por el pie.
  if (/Se\s+realiz[oó]\s+.{0,60}?\s(?:desde|de|a)\s+tu\s+(?:Tarjeta|Cuenta)/i.test(sms)) return "itau";
  if (/has\s+recibido\s+una\s+transferencia\s+a\s+tu\s+cuenta/i.test(sms))               return "itau";

  return null;
}

// Orden de intentos cuando el parser del banco declarado no reconoce el mensaje.
// Existe porque un banco puede cambiar el pie/encabezado de su SMS sin cambiar la
// estructura (pasó con la compra de Itaú por Banco de Bogotá): antes eso mandaba el
// mensaje al fallback de IA, que cuesta cuota y devuelve campos inconsistentes
// (el mismo SMS produjo "DIDI RIDES*DL" y "DIDI RIDES" en dos filas distintas).
var SMS_PARSERS = [
  { key: "itau",        fn: function(s) { return parseItau(s); } },
  { key: "bogota",      fn: function(s) { return parseBogota(s); } },
  { key: "davivienda",  fn: function(s) { return parseDavivienda(s); } },
  { key: "bancolombia", fn: function(s) { return parseBancolombia(s); } },
  { key: "avvillas",    fn: function(s) { return parseAvVillas(s); } }
];

// Prueba todos los parsers de formato y devuelve el primero que reconozca el
// mensaje. `saltar` evita repetir el que ya falló.
function parseAnyBank(sms, saltar) {
  for (var i = 0; i < SMS_PARSERS.length; i++) {
    if (SMS_PARSERS[i].key === saltar) continue;
    var r = null;
    try { r = SMS_PARSERS[i].fn(sms); } catch (e) { r = null; }
    if (r) return r;
  }
  return null;
}

// Nombre de banco canónico por resolvedBank — evita que el fallback de IA devuelva
// el nombre tal cual aparece en el SMS (ej. "ITAU" en mayúsculas sin tilde).
// Nombre VISIBLE de cada banco en el Sheet y la PWA. La llave es el origen
// técnico del parser (`_bankKey`), que no cambia; el valor es lo que ve el usuario.
//
// Banco de Bogotá compró a Itaú (2026): las tarjetas ****8439 y ****8448 pasaron
// a ser productos de Banco de Bogotá. Por eso `bogota` e `itau` comparten nombre
// visible — es una sola entidad con varios productos. Lo que distingue los
// productos es la columna "Tarjeta/Cuenta", no el banco. Cualquier lógica que
// necesite saber que un mensaje vino con formato Itaú usa `_bankKey`, nunca el
// nombre visible (ver las guardas de mergeBrebDuplicate).
var BANCO_BOGOTA = "Banco de Bogotá";
var CANONICAL_BANCO = {
  davivienda:  "Davivienda",
  bancolombia: "Bancolombia",
  bogota:      BANCO_BOGOTA,
  itau:        BANCO_BOGOTA,
  avvillas:    "AV Villas",
  nequi:       "Nequi",
  daviplata:   "Daviplata",
  dale:        "dale!",
  rappi:       "Rappi",
  occidente:   "Occidente",
  popular:     "Popular"
};

// ── AV Villas ─────────────────────────────────────────────────
// "AVVillas. 11/06/26 20:38 COMPRA CON TU TARJETA CREDITO 3403 POR $ 30,000 EN NICK HAVANA MUSIC HALL"
function parseAvVillas(sms) {
  var re = /AVVillas\.\s+(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})\s+COMPRA\s+CON\s+TU\s+TARJETA\s+(\w+)\s+(\d{4})\s+POR\s+\$\s*([\d,.]+)\s+EN\s+(.+)/i;
  var m = sms.match(re);
  if (!m) return null;

  var day   = parseInt(m[1]);
  var mon   = parseInt(m[2]) - 1;
  var year  = 2000 + parseInt(m[3]);
  var hp    = m[4].split(':');
  var tipo  = /credito/i.test(m[5]) ? 'Compra' : 'Débito';
  var tarj  = m[6];
  var monto = parseMonto(m[7]);
  var comerc = normalizeComercio(m[8].trim());

  return {
    banco:    CANONICAL_BANCO.avvillas,
    tipo:     tipo,
    monto:    monto,
    tarjeta:  "Tarjeta " + tarj,
    fecha:    new Date(year, mon, day, parseInt(hp[0]), parseInt(hp[1]), 0),
    comercio: comerc,
    reversal: false
  };
}

// ── Haiku fallback — bancos no reconocidos ────────────────────
// Usa Claude Haiku para parsear cualquier SMS bancario colombiano
// cuyo formato no esté cubierto por los parsers anteriores.
function parseSmsFallback(sms) {
  var systemPrompt =
    "Eres un extractor de datos de SMS bancarios colombianos. " +
    "Dado un SMS, responde SOLO con JSON válido (sin texto adicional) con estos campos: " +
    "esTransaccion (boolean, false si es notificación de seguridad, login, OTP o saldo), " +
    "esIngreso (boolean, true si el dinero ENTRA a la cuenta del titular: depósito, abono, consignación, transferencia recibida), " +
    "banco (nombre del banco, string), " +
    "tipo (Compra, Débito, Transferencia, Depósito, Abono, Consignación, u Otro), " +
    "monto (número entero en COP sin puntos ni comas, ej: 30000), " +
    "comercio (nombre del establecimiento, descripción del movimiento, o remitente para ingresos, string), " +
    "tarjeta (4 últimos dígitos o identificador de cuenta, string), " +
    "fecha (string formato YYYY-MM-DDTHH:MM:SS hora Colombia). " +
    "Si no es transacción, devuelve solo {\"esTransaccion\": false}.";

  // Modelo configurable vía Script Properties; fallback al actual.
  var smsModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_SMS_MODEL') || 'claude-haiku-4-5-20251001';
  try {
    var content = _callClaudeAI(systemPrompt, sms, 200, smsModel);
    if (!content) return null;

    var jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    var p = JSON.parse(jsonMatch[0]);
    if (!p.esTransaccion) return { skipped: true };
    if (!p.monto || p.monto <= 0) return null;

    var fecha = new Date(p.fecha || '');
    if (isNaN(fecha.getTime())) fecha = new Date();

    return {
      banco:    p.banco    || "Otro",
      tipo:     p.tipo     || "Compra",
      monto:    parseInt(p.monto) || 0,
      comercio: normalizeComercio(p.comercio || ""),
      tarjeta:  String(p.tarjeta || ""),
      fecha:    fecha,
      reversal: false,
      income:   p.esIngreso === true
    };
  } catch(e) {
    // Fallback no-fatal: el flujo principal de SMS sigue con los parsers regex.
    // Pero logueamos el error para que cuota/auth/WAF no queden opacos.
    Logger.log('parseSmsFallback falló: ' + e.message);
    return null;
  }
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
    banco:    CANONICAL_BANCO.davivienda,
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
      banco:    CANONICAL_BANCO.bancolombia,
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
      banco:    CANONICAL_BANCO.bancolombia,
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

// ── Migración: unificar productos y limpiar duplicados históricos ─────
// Se corre UNA vez (es idempotente: correrla de nuevo no hace nada) después de
// desplegar los arreglos de parseo. Repara lo que ya quedó mal escrito:
//
//   1. Banco: "Itaú" y "Bogotá" → "Banco de Bogotá". Banco de Bogotá compró a
//      Itaú, así que ****8439/****8448 son productos suyos. Se conservan los
//      cuatro últimos dígitos: lo que identifica el producto es la tarjeta.
//   2. Tarjeta pelada: las filas que pasaron por el fallback de IA quedaron con
//      "8439"/"8448" en vez de la etiqueta completa, partiendo el producto en dos.
//      Se resuelve buscando en el propio Sheet la etiqueta completa que más se
//      repite para esos mismos cuatro dígitos — sin números cableados.
//   3. Duplicados: filas con SMS_Original idéntico (el teléfono reenviando).
//      Se conserva la más antigua.
//   4. Promos de dale! que entraron como compras (ver VETO_RULES).

// Se comparan en minúsculas y sin tildes: en la hoja conviven "Itaú", "Itau",
// "ITAU" y "Bogotá" según de qué época y de qué parser venga la fila.
var BANCO_RENOMBRES_CLAVES = ["itau", "bogota", "banco de bogota"];

function _normalizaNombreBanco(nombre) {
  return String(nombre == null ? "" : nombre)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .trim().toLowerCase();
}

// Devuelve el nombre unificado, o null si la fila ya está bien.
function _renombreBanco(actual) {
  var clave = _normalizaNombreBanco(actual);
  if (BANCO_RENOMBRES_CLAVES.indexOf(clave) === -1) return null;
  return String(actual).trim() === BANCO_BOGOTA ? null : BANCO_BOGOTA;
}

// Decisión pura, sin tocar Sheets — testeable fuera de GAS
// (scripts/test-migracion-productos.mjs). `data` es la matriz completa de
// getDataRange().getValues(). Devuelve { updates:[{row1,col1,valor}], deletes:[row1...], resumen }.
function _planMigracionProductos(data, hdrs) {
  var plan = { updates: [], deletes: [], resumen: { banco: 0, tarjeta: 0, duplicados: 0, promos: 0 } };
  if (!data || data.length <= 1) return plan;

  var cBanco = hdrs.indexOf("Banco");
  var cTarj  = hdrs.indexOf("Tarjeta/Cuenta");
  var cSms   = hdrs.indexOf("SMS_Original");
  var cTs    = hdrs.indexOf("Timestamp");

  // Paso A — catálogo de etiquetas completas por últimos-4, tomado del propio Sheet.
  // "Tarjeta Credito ****8439" aporta 8439; "8439" pelado no aporta nada.
  var porUlt4 = {};
  for (var i = 1; i < data.length; i++) {
    var etiqueta = String(data[i][cTarj] == null ? "" : data[i][cTarj]).trim();
    if (!etiqueta || /^\d{3,4}$/.test(etiqueta)) continue; // pelada: no es fuente
    var m4 = etiqueta.match(/(\d{4})\s*$/);
    if (!m4) continue;
    porUlt4[m4[1]] = porUlt4[m4[1]] || {};
    porUlt4[m4[1]][etiqueta] = (porUlt4[m4[1]][etiqueta] || 0) + 1;
  }
  var canonUlt4 = {};
  for (var d4 in porUlt4) {
    var mejor = null, mejorN = -1;
    for (var et in porUlt4[d4]) {
      if (porUlt4[d4][et] > mejorN) { mejor = et; mejorN = porUlt4[d4][et]; }
    }
    canonUlt4[d4] = mejor;
  }

  // Paso B — recorrido único: renombres, tarjetas peladas, duplicados y promos.
  var vistos = {};   // texto normalizado -> primera fila (1-based)
  var aBorrar = {};

  for (var r = 1; r < data.length; r++) {
    var fila1 = r + 1;
    var sms = String(data[r][cSms] == null ? "" : data[r][cSms]);

    // Promos de dale! que ya entraron como compras
    if (/smsdale\.com\.co/i.test(sms) || /\bAplicaTyC\b/i.test(sms)) {
      aBorrar[fila1] = true; plan.resumen.promos++;
      continue; // no vale la pena corregirle campos a una fila que se borra
    }

    // Duplicados por reenvío: SMS_Original idéntico. Se excluyen las entradas
    // manuales/importadas ("MANUAL...", vacías): ahí el texto no es único por
    // transacción y dos filas iguales pueden ser dos gastos reales.
    var norm = _normalizeIngestText(sms);
    if (norm && sms.indexOf("MANUAL") !== 0) {
      if (vistos[norm]) { aBorrar[fila1] = true; plan.resumen.duplicados++; continue; }
      vistos[norm] = fila1;
    }

    // Banco → nombre unificado
    var nuevoBanco = _renombreBanco(data[r][cBanco]);
    if (nuevoBanco) {
      plan.updates.push({ row1: fila1, col1: cBanco + 1, valor: nuevoBanco });
      plan.resumen.banco++;
    }

    // Tarjeta pelada → etiqueta completa del mismo producto
    var tarj = String(data[r][cTarj] == null ? "" : data[r][cTarj]).trim();
    if (/^\d{3,4}$/.test(tarj) && canonUlt4[tarj]) {
      plan.updates.push({ row1: fila1, col1: cTarj + 1, valor: canonUlt4[tarj] });
      plan.resumen.tarjeta++;
    }
  }

  plan.deletes = Object.keys(aBorrar).map(Number).sort(function(a, b) { return b - a; }); // desc: borrar de abajo hacia arriba
  return plan;
}

// Aplica (o simula) la migración sobre el Sheet del usuario.
// `aplicar=false` → solo reporta. Correr primero en simulación.
function migrarProductosYDuplicados(userId, aplicar) {
  var ref = _getSheet(userId);
  if (!ref.sheet) return { ok: false, error: "sin hoja para " + userId };

  var data = ref.sheet.getDataRange().getValues();
  var plan = _planMigracionProductos(data, data[0]);

  if (aplicar) {
    // Una escritura por COLUMNA, no una por celda: son ~900 cambios y 900
    // llamadas sueltas a setValue tardan minutos y arriesgan el límite de
    // ejecución. Se agrupan y se escribe cada columna afectada de una vez.
    var porColumna = {};
    for (var i = 0; i < plan.updates.length; i++) {
      var u = plan.updates[i];
      (porColumna[u.col1] = porColumna[u.col1] || []).push(u);
    }
    for (var col in porColumna) {
      var c = parseInt(col, 10);
      var columna = ref.sheet.getRange(2, c, data.length - 1, 1).getValues(); // sin encabezado
      for (var k = 0; k < porColumna[col].length; k++) {
        columna[porColumna[col][k].row1 - 2][0] = porColumna[col][k].valor;
      }
      ref.sheet.getRange(2, c, data.length - 1, 1).setValues(columna);
    }
    // Descendente: borrar de abajo hacia arriba no corre los índices restantes.
    for (var j = 0; j < plan.deletes.length; j++) ref.sheet.deleteRow(plan.deletes[j]);
    SpreadsheetApp.flush();
  }

  // Los productos NO viven solo en la hoja: hay un catálogo aparte en Script
  // Properties ('cards_<userId>') que alimenta action=cards y la pantalla de
  // Productos. La PWA agrupa por `banco|ultimos4`, así que si la hoja dice
  // "Banco de Bogotá" y el catálogo sigue diciendo "Itaú", el mismo plástico
  // aparece DOS veces. Hay que renombrar en los dos lados o en ninguno.
  var tarjetas = _getCards(userId), tarjetasRenombradas = 0;
  for (var t = 0; t < tarjetas.length; t++) {
    var nuevo = _renombreBanco(tarjetas[t].banco);
    if (nuevo) { if (aplicar) tarjetas[t].banco = nuevo; tarjetasRenombradas++; }
  }
  if (aplicar && tarjetasRenombradas) _saveCards(userId, tarjetas);

  var out = {
    ok: true, aplicado: !!aplicar, usuario: userId,
    filasRevisadas: data.length - 1,
    productosRenombrados: tarjetasRenombradas,
    bancoRenombrado: plan.resumen.banco,
    tarjetaUnificada: plan.resumen.tarjeta,
    duplicadosBorrados: plan.resumen.duplicados,
    promosBorradas: plan.resumen.promos
  };
  Logger.log("migrarProductosYDuplicados: " + JSON.stringify(out));
  return out;
}

// Atajos para correr a mano desde el editor de Apps Script.
function migracionSimular() { return migrarProductosYDuplicados(ADMIN_USER, false); }
function migracionAplicar() { return migrarProductosYDuplicados(ADMIN_USER, true); }

// ── Idempotencia: el mismo mensaje crudo no se guarda dos veces ───────
// Ver el comentario de INGEST_DEDUP_TTL_S para el porqué y la evidencia.

// Normaliza el texto crudo para comparar. Pura y testeable fuera de GAS
// (ver scripts/test-ingest-dedup.mjs). Colapsa espacios porque el mismo SMS
// puede llegar con espaciado distinto según cómo lo serialice el Atajo — los
// mensajes reales traen doble espacio antes de "el" ("por $32,990  el ...").
function _normalizeIngestText(text) {
  return String(text == null ? "" : text).replace(/\s+/g, " ").trim().toLowerCase();
}

// Huella estable de (usuario, mensaje). MD5 basta: no es un control de
// seguridad, solo una llave de caché.
function _ingestFingerprint(userId, rawText) {
  var norm = _normalizeIngestText(rawText);
  if (!norm) return null;
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, String(userId) + "|" + norm, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < bytes.length; i++) {
    hex += ("0" + (bytes[i] & 0xFF).toString(16)).slice(-2);
  }
  return "ing_" + hex;
}

// Suelta la reserva de una huella. Se llama cuando la petición terminó SIN
// guardar nada por un fallo transitorio (no parseó, excepción): si la huella
// se quedara marcada, el reenvío del teléfono —que es justo lo que recuperaría
// la transacción— se descartaría y el gasto se perdería para siempre.
//
// OJO: no se suelta cuando la petición resolvió a propósito sin appendear
// (reversa, fusión Bre-B, mensaje no transaccional). Ahí el reenvío SÍ debe
// descartarse, o una reversa reenviada borraría dos filas.
function _releaseIngest(userId, rawText) {
  var key = _ingestFingerprint(userId, rawText);
  if (!key) return;
  try { CacheService.getScriptCache().remove(key); } catch (e) {}
}

// true si este mensaje ya se ingirió hace poco (y NO debe volver a guardarse).
// Marca la huella al mismo tiempo, bajo lock, porque los dos envíos llegan con
// milisegundos de diferencia: sin serializar, ambos leerían "no visto" antes de
// que cualquiera escriba, que es exactamente el caso que esto evita
// (par observado a 6 ms). Si el lock no se obtiene, se deja pasar: un duplicado
// es preferible a perder una transacción real.
function _isDuplicateIngest(userId, rawText) {
  var key = _ingestFingerprint(userId, rawText);
  if (!key) return false;

  var cache = CacheService.getScriptCache();
  var lock  = LockService.getScriptLock();
  var locked = false;
  try { locked = lock.tryLock(INGEST_DEDUP_LOCK_MS); } catch (e) { locked = false; }
  try {
    if (cache.get(key)) {
      Logger.log("ingesta duplicada descartada (usuario " + userId + ", huella " + key + ")");
      return true;
    }
    cache.put(key, "1", INGEST_DEDUP_TTL_S);
    return false;
  } catch (e) {
    return false; // ante cualquier fallo de caché, no bloquear la ingesta
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (e2) {} }
  }
}

// ── Bre-B (Itaú) — evitar duplicado entre las dos notificaciones ──────
// Itaú envía DOS notificaciones separadas para UNA misma transferencia Bre-B:
// una genérica ("Se realizo un/a débito/retiro/Transferencia de tu Cuenta de
// Ahorros...", comercio = "Cuenta de Ahorros"/"Cuenta Corriente" vía reDebit)
// y otra específica con la llave del destinatario ("...a la llave Bre-B
// <llave>...", comercio = "Llave Bre-B <llave>" vía reBreBDebit). Sin esto,
// cada una crea su propia fila y la transferencia queda duplicada.
//
// isBrebMergeCandidate() marca los parses de cualquiera de las dos formas.
// mergeBrebDuplicate() busca, dentro de una ventana corta de tiempo, una fila
// ya registrada para el mismo banco+monto+cuenta:
//   - si la notificación que llega trae la llave (brebKey) y la fila existente
//     es la genérica → la enriquece con la llave y la recategoriza (fusión).
//   - si la notificación que llega es la genérica y la fila existente ya tiene
//     la llave → se descarta (la fila específica ya es la versión completa).
// Devuelve true si resolvió (fusionó o descartó) — el caller NO debe appendear.
// Devuelve false si no encontró nada que fusionar — el caller debe appendear normal.
function isBrebMergeCandidate(parsed) {
  return !!parsed.brebKey || /^Cuenta de (Ahorros|Corriente)$/i.test(String(parsed.comercio || "").trim());
}

// Lógica pura de decisión (sin llamadas a Sheets) — testeable fuera de GAS,
// ver scripts/test-itau-breb-merge.mjs. `data` es la matriz completa devuelta
// por sheet.getDataRange().getValues() (data[0] son los headers).
// Devuelve null si no hay match, o { rowIndex1Based, action: 'enrich'|'discard' }.
function _findBrebMergeMatch(parsed, data, hdrs) {
  if (!data || data.length <= 1) return null;

  var bancoCol     = hdrs.indexOf("Banco");
  var montoCol     = hdrs.indexOf("Monto (COP)");
  var tarjetaCol   = hdrs.indexOf("Tarjeta/Cuenta");
  var fechaCol     = hdrs.indexOf("Fecha");
  var comercioCol  = hdrs.indexOf("Comercio");

  var last4match = parsed.tarjeta ? parsed.tarjeta.match(/(\d{4})$/) : null;
  var last4      = last4match ? last4match[1] : null;
  if (!last4) return null;

  // 90s: la evidencia real (ver PR cerrado #39 y los fixtures de
  // scripts/test-itau-breb-merge.mjs) muestra que las dos notificaciones de
  // Itaú llegan con 3-18s de diferencia. Una ventana angosta reduce el riesgo
  // de fusionar dos transferencias reales distintas que coincidan en monto
  // (ej. pagarle lo mismo a dos personas seguido) sin perder margen para el
  // delay real de red/procesamiento entre las dos notificaciones.
  var windowMs   = 90 * 1000;
  var parsedTime = parsed.fecha ? parsed.fecha.getTime() : Date.now();
  if (isNaN(parsedTime)) return null; // fecha inválida — nunca fusionar a ciegas

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    if (String(row[bancoCol]).trim() !== parsed.banco) continue;
    if (Math.abs(parseFloat(row[montoCol]) - parsed.monto) > 0.01) continue;
    if (String(row[tarjetaCol]).indexOf(last4) === -1) continue;

    var rowDate = row[fechaCol] instanceof Date ? row[fechaCol] : new Date(String(row[fechaCol]));
    if (isNaN(rowDate.getTime()) || Math.abs(rowDate.getTime() - parsedTime) > windowMs) continue;

    var existingComercio = String(row[comercioCol] || "").trim();
    var isGenericRow = /^Cuenta de (Ahorros|Corriente)$/i.test(existingComercio);
    var isBrebRow    = /^Llave Bre-?B\b/i.test(existingComercio) || /^Bre-?B$/i.test(existingComercio);

    if (parsed.brebKey && isGenericRow) {
      // Llegó la notificación con la llave y ya existía la fila genérica → enriquecerla.
      return { rowIndex1Based: i + 1, action: 'enrich' };
    }
    if (!parsed.brebKey && isBrebRow) {
      // Llegó la notificación genérica pero ya existía la fila con la llave → descartar.
      return { rowIndex1Based: i + 1, action: 'discard' };
    }
  }
  return null;
}

// Wrapper que lee el Sheet del usuario, delega la decisión a _findBrebMergeMatch()
// y ejecuta el efecto (escritura o no-op). Devuelve true si resolvió (fusionó o
// descartó) — el caller NO debe appendear. Devuelve false si no encontró nada que
// fusionar — el caller debe appendear normal.
//
// LockService: las dos notificaciones de Itaú llegan casi al mismo tiempo, que es
// exactamente la ventana donde dos ejecuciones concurrentes de doPost podrían leer
// el Sheet antes de que cualquiera escriba y ambas concluyan "no hay match" —
// duplicando la fila que esta función existe para evitar. Se serializa con un lock
// corto (5s) alrededor del read-decide-write; si no se obtiene a tiempo, se procede
// sin fusionar (aparece un duplicado en vez de trabar el request — no es peor que
// el comportamiento sin esta función).
function mergeBrebDuplicate(parsed, userId) {
  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  if (!sheet) return false;

  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(5000);
  try {
    var data = sheet.getDataRange().getValues();
    var hdrs = data[0];

    var match = _findBrebMergeMatch(parsed, data, hdrs);
    if (!match) return false;

    if (match.action === 'enrich') {
      var comercioCol  = hdrs.indexOf("Comercio");
      var categoriaCol = hdrs.indexOf("Categoría");
      sheet.getRange(match.rowIndex1Based, comercioCol + 1).setValue(parsed.comercio);
      sheet.getRange(match.rowIndex1Based, categoriaCol + 1).setValue(parsed.categoria);
    }
    Logger.log('mergeBrebDuplicate: ' + match.action + ' fila ' + match.rowIndex1Based +
      ' (usuario ' + userId + ', monto ' + parsed.monto + ', locked=' + locked + ')');
    return true;
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ── Banco de Bogotá ──────────────────────────────────────────
// "Banco de Bogota: Tu compra por 130,456 fue aprobada con
//  Tarjeta Crédito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB ¿Dudas?..."
function parseBogota(sms) {
  var re = /Tu\s+(\w+)\s+por\s+([\d,.]+)\s+fue\s+\w+\s+con\s+(Tarjeta\s+(?:Cr[e\u00e9]dito|D[e\u00e9]bito)|Cuenta)\s+(\d+)\s+el\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+en\s+(.+?)(?:\s*[¿?]Dudas|$)/i;
  var m = sms.match(re);
  if (!m) return null;

  return {
    banco:    CANONICAL_BANCO.bogota,
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
      banco:    CANONICAL_BANCO.itau,
      _bankKey: "itau",
      tipo:     normalizeTipo(mp[1]),
      comercio: normalizeComercio(mp[2].trim()),
      tarjeta:  mp[3].trim() + " ****" + mp[4],
      monto:    parseMonto(mp[5]),
      fecha:    parseFechaItau(mp[6], mp[7])
    };
  }

  // Acepta "un debito", "un retiro" y "una Transferencia" desde la cuenta.
  // El artículo es OPCIONAL: el banco también manda "Se realizo Transferencia de
  // tu Cuenta de Ahorros ****8448 por $205,966 ..." (sin "una"). Cuando exigía el
  // artículo, esos mensajes caían al fallback de IA y la cuenta quedaba como
  // "8448" pelado en vez de "Cuenta de Ahorros ****8448".
  var reDebit = /Se realizo\s+(?:una?\s+)?(\w+)\s+de tu\s+(Cuenta de (?:Ahorros|Corriente))\s+\*+(\d+)\s+por\s+\$([\d,.]+)\s+el\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})/i;
  var md = sms.match(reDebit);
  if (md) {
    return {
      banco:    CANONICAL_BANCO.itau,
      _bankKey: "itau",
      tipo:     normalizeTipo(md[1]),
      comercio: md[2].trim(),
      tarjeta:  md[2].trim() + " ****" + md[3],
      monto:    parseMonto(md[4]),
      fecha:    parseFechaItau(md[5], md[6]),
      reversal: false
    };
  }

  // Patrón 2b — débito Bre-B (formato abreviado con prefijo ITAU: y cuenta corta).
  // "ITAU: se realizó un débito a tu cuenta AHO 8448 a la llave Bre-B 1234567890
  //  por $ 1000.00 el 2026-07-01 a las 20:50:00."
  // Diferencias vs patrón 2: prefijo "ITAU:", tildes ("se realizó"), cuenta abreviada
  // (AHO/CTE sin ****), monto en formato US ("$ 1000.00" con decimales), fecha con
  // guiones y separador "a las". La llave Bre-B puede ser numérica (1234567890) o un
  // alias con @ (@usuario9237) — se captura (grupo 4) para registrarla en el comercio
  // en vez de descartarla; también se usa para fusionar con la notificación genérica
  // de la misma transferencia (ver mergeBrebDuplicate).
  var reBreBDebit = /(?:ITAU:?\s*)?se\s+realiz[oó]\s+un\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)\s+a tu cuenta\s+(\w+)\s+(\d+)\s+a la llave\s+Bre-?B\s+(\S+)\s+por\s+\$\s*([\d,.]+)\s+el\s+(\d{4}[-\/]\d{2}[-\/]\d{2})\s+a las\s+(\d{2}:\d{2}:\d{2})/i;
  var mbreb = sms.match(reBreBDebit);
  if (mbreb) {
    var acctType = /AHO/i.test(mbreb[2]) ? "Cuenta de Ahorros"
                 : /CTE/i.test(mbreb[2]) ? "Cuenta Corriente"
                 : "Cuenta " + mbreb[2];
    return {
      banco:    CANONICAL_BANCO.itau,
      _bankKey: "itau",
      tipo:     normalizeTipo(mbreb[1]),
      comercio: "Llave Bre-B " + mbreb[4],
      tarjeta:  acctType + " ****" + mbreb[3],
      monto:    parseMontoUS(mbreb[5]),
      fecha:    parseFechaItau(mbreb[6], mbreb[7]),
      reversal: false,
      brebKey:  mbreb[4]
    };
  }

  // Inbound Bre-B: transferencia RECIBIDA por llave.
  // "ITAU: has recibido una transferencia a tu cuenta AHO 8448 asociada a la
  //  llave Bre-B 3007183487 por $ 61000.00 el 2026-07-30 a las 21:12:02."
  // Es el espejo entrante de reBreBDebit (cuenta abreviada AHO/CTE sin ****,
  // monto en formato US, fecha con guiones). Sin este patrón caía a la IA y la
  // cuenta quedaba como "8448" pelado.
  var reBreBCredit = /(?:ITAU:?\s*)?has\s+recibido\s+una\s+transferencia\s+a\s+tu\s+cuenta\s+(\w+)\s+(\d+)\s+asociada\s+a\s+la\s+llave\s+Bre-?B\s+(\S+)\s+por\s+\$\s*([\d,.]+)\s+el\s+(\d{4}[-\/]\d{2}[-\/]\d{2})\s+a las\s+(\d{2}:\d{2}:\d{2})/i;
  var mbc = sms.match(reBreBCredit);
  if (mbc) {
    var acctIn = /AHO/i.test(mbc[1]) ? "Cuenta de Ahorros"
               : /CTE/i.test(mbc[1]) ? "Cuenta Corriente"
               : "Cuenta " + mbc[1];
    return {
      banco:    CANONICAL_BANCO.itau,
      _bankKey: "itau",
      tipo:     "Transferencia",
      comercio: "Llave Bre-B " + mbc[3],
      tarjeta:  acctIn + " ****" + mbc[2],
      monto:    parseMontoUS(mbc[4]),
      fecha:    parseFechaItau(mbc[5], mbc[6]),
      reversal: false,
      income:   true
    };
  }

  // Inbound: deposit / abono TO account ("a tu Cuenta")
  // "Se realizo un Deposito en Efectivo a tu Cuenta de Ahorros ****8448 por $1,000 el 2026/06/14 06:27:00"
  var reCredit = /Se realizo\s+u?n?\s+(Deposito\s+en\s+Efectivo|Abono|Consignaci[o\u00f3]n|Ingreso)\s+a\s+tu\s+(Cuenta de (?:Ahorros|Corriente))\s+\*+(\d+)\s+por\s+\$([\d,.]+)\s+el\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})/i;
  var mc = sms.match(reCredit);
  if (mc) {
    return {
      banco:    CANONICAL_BANCO.itau,
      _bankKey: "itau",
      tipo:     normalizeTipo(mc[1]),
      comercio: mc[2].trim(),
      tarjeta:  mc[2].trim() + " ****" + mc[3],
      monto:    parseMonto(mc[4]),
      fecha:    parseFechaItau(mc[5], mc[6]),
      reversal: false,
      income:   true
    };
  }

  return null;
}

function parseFechaItau(fechaStr, horaStr) {
  // Acepta tanto "2026/06/22" como "2026-06-22" (formatos legacy y Bre-B).
  var p  = fechaStr.split(/[\/\-]/);
  var hp = horaStr.split(":");
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]),
                  parseInt(hp[0]), parseInt(hp[1]), parseInt(hp[2]));
}

// ── Helpers ───────────────────────────────────────────────────
function parseMonto(str) {
  return parseFloat(str.replace(/\./g, "").replace(/,/g, ""));
}

function normalizeTipo(raw) {
  var r = (raw || '').trim().toLowerCase();
  var map = {
    compra: "Compra", debito: "D\u00e9bito", retiro: "Retiro",
    transferencia: "Transferencia", credito: "Cr\u00e9dito", abono: "Abono",
    deposito: "Dep\u00f3sito", consignacion: "Consignaci\u00f3n", ingreso: "Ingreso"
  };
  // "Deposito en Efectivo" and other multi-word deposit variants
  if (r.indexOf("deposit") === 0) return "Dep\u00f3sito";
  return map[r] || (raw.charAt(0).toUpperCase() + raw.slice(1));
}

function detectCategory(merchant, userId) {
  if (!merchant) return "";
  var m = merchant.toUpperCase();

  if (userId) {
    var sp = PropertiesService.getScriptProperties();
    // Check explicit rules (RULES_<userId>) with pattern matching — highest priority
    var userRules = JSON.parse(sp.getProperty("RULES_" + userId) || "[]");
    var mNorm = merchant.trim().toUpperCase().replace(/\s+/g, ' ');
    userRules.sort(function(a,b){ return (b.priority||0)-(a.priority||0); });
    for (var ri = 0; ri < userRules.length; ri++) {
      if (mNorm.indexOf(userRules[ri].pattern) !== -1) return userRules[ri].category;
    }
    // Check legacy learned mappings (from manual corrections)
    var learned = JSON.parse(sp.getProperty("CATEGORY_LEARN_" + userId) || "{}");
    var normalized = normalizeComercio(merchant).toUpperCase();
    if (learned[normalized]) return learned[normalized];
    if (learned[m]) return learned[m];
  }

  var rules = [
    // ── Bre-B — transferencias por llave (Itaú/Bancolombia) ────────────────
    { cat: "Bre-B", keywords: ["BRE-B", "BREB"] },
    // ── Domicilios — plataformas de delivery ──────────────────────────────
    { cat: "Domicilios", keywords: [
      "RAPPI", "IFOOD", "UBER EATS", "UBEREATS", "PEDIDOSYA",
      "DOMICILIOS.COM", "MERCADO LIBRE DOMICILIOS"
    ]},
    // ── Restaurantes — comida directa, cafés, fast food ──────────────────
    { cat: "Restaurantes", keywords: [
      "MCDONALDS", "MC DONALD", "BURGER", "PIZZA", "SUBWAY", "KFC",
      "TACO BELL", "POLLO CAMPERO", "CORRAL", "OSAKI",
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
    // ── Hogar — alojamiento, arriendo, servicios públicos, artículos del hogar
    { cat: "Hogar", keywords: [
      "HOTEL", "AIRBNB", "BOOKING", "HOSPEDAJE", "HOSTAL",
      "HOSTELWORLD", "HAMARAT OTEL", "MARRIOT", "MARRIOTT",
      "AVENUE HOSTEL", "HOTEL PALACIO", "HOTEL INMACULADA",
      "HOTEL PALACIO DE",
      "ARRIENDO", "ARRENDAMIENTO", "ADMINISTRACION", "ADMINISTRACIÓN",
      "SERVICIOS PUBLICOS", "GAS NATURAL", "ACUEDUCTO", "ENERGIA",
      "EPM", "ETB", "CLARO HOGAR",
      "HOME SENTRY", "HOME DEPOT", "EASY HOME"
    ]},
    // ── Viajes — vuelos, transporte interurbano, agencias ──────────────────
    { cat: "Viajes", keywords: [
      "AVIANCA", "LATAM", "COPA", "AMERICAN AIRLINES", "VUELO",
      "FLIGHTS", "TRIP.COM", "BOOKING.COM", "SULTAN", "NURDEM TURIZM",
      "SELDAR ISTANBUL", "IZMIR 1888", "KAPADOKYA", "VOYNN GIDA",
      "MAVERICKCENTRALMAR", "DUFRY", "WAN TANACSADO"
    ]},
    // ── Compras — tiendas, online, ropa, regalos ──────────────────────────
    { cat: "Compras", keywords: [
      "AMAZON", "MERCADOLIBRE", "FALABELLA", "HOMECENTER", "EASY",
      "IKEA", "SAMSUNG", "TEMU", "OFFICE DEPOT", "LIBRERIA",
      "TIENDA RAMBLAS", "FOLKART", "BOMO ART", "PROEXSAL", "MAYAN GIFTS",
      "KAPADOKYA OTTOMAN", "YEMENICILER", "SOV MAGAZACILIK",
      "DOLLARTICTY", "HELOPAY", "COMPRA PASARELA", "MERCADO PAGO",
      "ADIDAS", "UNIQLO", "BROOKS BROTHERS", "DECATHLON",
      "TIENDA ADIDAS", "ALSANCAK MACROCENTER", "ALSANCAK COLOMBIA",
      "PELUQUER", "BARBERIA", "BARBERIAS", "ESTETICA",
      "ANA MILENA", "ANDERSON GOGREEN", "HF PELUQUERIA"
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
    // ── Entretenimiento — espectáculos, cine, museos, ocio ───────────────
    { cat: "Entretenimiento", keywords: [
      "CINE", "TEATRO", "CONCIERTO", "PARQUE",
      "BUDAPEST JAZZ CLUB", "CORFERIAS", "PONTOON",
      "SUNA VE INAN", "PARK ELITE"
    ]},
    // ── Software — herramientas y servicios digitales de trabajo ──────────
    { cat: "Software", keywords: [
      "GOOGLE", "MICROSOFT", "ADOBE", "CANVA", "NOTION",
      "AMAZON DIGI", "FOTOP"
    ]}
  ];

  for (var i = 0; i < rules.length; i++) {
    for (var j = 0; j < rules[i].keywords.length; j++) {
      if (m.indexOf(rules[i].keywords[j]) !== -1) return rules[i].cat;
    }
  }

  // Diccionario web (`procesarColaCategorias`): comercios que ninguna keyword
  // reconoce pero que una búsqueda en internet ya identificó. Va de último,
  // así que las reglas del usuario y los aprendizajes siempre le ganan.
  // Es lectura de un memo en memoria — no hace red, así que recategorizeAll()
  // sigue siendo seguro de correr sobre miles de filas.
  var web = _webcatGet(merchant);
  if (web) return web;

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
      if (cat !== "") continue; // ya tiene categoría — no tocar

      var newCat = comercio ? detectCategory(comercio) : "Otro";
      sheet.getRange(i + 1, catCol + 1).setValue(newCat);
      updated++;
    }
  }

  Logger.log("recategorizeAll: " + updated + " de " + total + " filas actualizadas.");
  return { total: total, updated: updated };
}

// ── Migración masiva de categorías (v2 → nombres aprobados) ──────────────
// Renombra categorías obsoletas y re-detecta Domicilios, Bre-B y Restaurantes.
// Ejecutar una vez desde el editor de Apps Script o via webhook type=migrateCategories.
function migrateCategories() {
  var users = _getAllowedUsers();
  var statsAll = {};

  // Mapa de renombrado directo: antiguo → nuevo
  var renameMap = {
    "Alojamiento": "Hogar",
    "Ropa":        "Compras",
    "Belleza":     "Compras",
    "Tr\u00e1mites":    "Otro"
  };

  for (var u = 0; u < users.length; u++) {
    var ref   = _getSheet(users[u]);
    var sheet = ref.sheet;
    if (!sheet) continue;

    var data  = sheet.getDataRange().getValues();
    var hdrs  = data[0];
    var catCol      = hdrs.indexOf("Categoría");
    var comercioCol = hdrs.indexOf("Comercio");
    var tipoCol     = hdrs.indexOf("Tipo");
    if (catCol < 0) continue;

    var updated = 0;
    for (var i = 1; i < data.length; i++) {
      var cat      = String(data[i][catCol]      || "").trim();
      var comercio = comercioCol >= 0 ? String(data[i][comercioCol] || "").trim() : "";
      var tipo     = tipoCol     >= 0 ? String(data[i][tipoCol]     || "").trim() : "";

      var newCat = null;

      // Bre-B: detectar por campo Tipo (máxima prioridad)
      if (/bre-?b/i.test(tipo) && cat !== "Bre-B") {
        newCat = "Bre-B";
      }
      // "Comida" se re-detecta para separar en Restaurantes / Domicilios
      else if (cat === "Comida") {
        var detected = detectCategory(comercio, users[u]);
        // Si detectCategory no lo reconoce, default a Restaurantes (era "Comida")
        newCat = (detected !== "Otro") ? detected : "Restaurantes";
      }
      // Renombrados directos
      else if (renameMap[cat] !== undefined) {
        newCat = renameMap[cat];
      }
      // Re-detectar "Otro" por si ahora encaja en Domicilios u otro
      else if (cat === "Otro" && comercio) {
        var redetected = detectCategory(comercio, users[u]);
        if (redetected !== "Otro") newCat = redetected;
      }
      // Categoría vacía → detectar o asignar "Otro"
      else if (cat === "") {
        newCat = comercio ? detectCategory(comercio, users[u]) : "Otro";
      }

      if (newCat && newCat !== cat) {
        sheet.getRange(i + 1, catCol + 1).setValue(newCat);
        updated++;
      }
    }
    statsAll[users[u]] = updated;
    Logger.log("migrateCategories [" + users[u] + "]: " + updated + " filas actualizadas.");
  }

  return { ok: true, stats: statsAll };
}

// ── Reparar categorización mal migrada a "Restaurantes" ──────────────
// migrateCategories() (arriba) defaulteaba a "Restaurantes" cualquier fila
// "Comida" que detectCategory() no reconociera — en vez de "Otro". Eso dejó
// transacciones no-restaurante (intereses, transferencias, comercios
// genéricos) con Categoría="Restaurantes" en el Sheet.
//
// v1 de esta función re-corría detectCategory() sobre cada fila y movía
// cualquier cosa que no reconociera a "Otro" — pero eso es demasiado
// agresivo: detectCategory() tiene una lista de keywords limitada, así que
// un restaurante real con un nombre poco común (ej. "Izakaya", "Mistral
// Panadería") también se reclasificaba incorrectamente. "No reconocido" no
// es lo mismo que "no es un restaurante".
//
// v2: solo reclasifica con confianza las filas donde el campo Tipo indica
// que ni siquiera es una compra (intereses, transferencias, retiros) — un
// consumo real en un restaurante siempre tiene Tipo="Compra", así que este
// criterio nunca puede tocar un restaurante legítimo. Para filas Tipo=Compra
// que detectCategory() no reconoce, NO se tocan — solo se listan para
// revisión manual, porque distinguir "comercio real que falta en la lista
// de keywords" de "comercio genérico que nunca debió ser Restaurantes"
// requiere criterio humano.
//
// Ejecutar primero con dryRun=true (solo loguea, no escribe), revisar el
// registro de ejecución (los cambios automáticos Y la lista para revisión
// manual) y solo entonces correr con dryRun=false.
function fixMisassignedRestaurantes(dryRun) {
  var users = _getAllowedUsers();
  var statsAll = {};

  for (var u = 0; u < users.length; u++) {
    var ref   = _getSheet(users[u]);
    var sheet = ref.sheet;
    if (!sheet) continue;

    var data  = sheet.getDataRange().getValues();
    var hdrs  = data[0];
    var catCol      = hdrs.indexOf("Categoría");
    var comercioCol = hdrs.indexOf("Comercio");
    var tipoCol     = hdrs.indexOf("Tipo");
    if (catCol < 0 || comercioCol < 0) continue;

    var changes = [];
    var review  = [];
    for (var i = 1; i < data.length; i++) {
      var cat = String(data[i][catCol] || "").trim();
      if (cat !== "Restaurantes") continue;

      var comercio = String(data[i][comercioCol] || "").trim();
      var tipo     = tipoCol >= 0 ? String(data[i][tipoCol] || "").trim() : "";

      // Señal fuerte y sin ambigüedad: si no es una Compra, no puede ser un
      // consumo real en un restaurante.
      if (tipo && tipo.toLowerCase() !== "compra") {
        var newCat = /bre-?b/i.test(tipo) ? "Bre-B" : "Otro";
        changes.push({ row: i + 1, comercio: comercio, tipo: tipo, to: newCat });
        if (!dryRun) sheet.getRange(i + 1, catCol + 1).setValue(newCat);
        continue;
      }

      // Es una Compra: solo reclasificar si detectCategory() reconoce el
      // comercio en OTRA categoría específica. Si no lo reconoce (= "Otro"),
      // se deja tal cual y se lista para que un humano decida.
      var redetected = comercio ? detectCategory(comercio, users[u]) : "Otro";
      if (redetected !== "Restaurantes" && redetected !== "Otro") {
        changes.push({ row: i + 1, comercio: comercio, tipo: tipo, to: redetected });
        if (!dryRun) sheet.getRange(i + 1, catCol + 1).setValue(redetected);
      } else if (redetected === "Otro") {
        review.push({ row: i + 1, comercio: comercio, tipo: tipo });
      }
    }
    statsAll[users[u]] = { changes: changes.length, review: review.length };
    Logger.log("fixMisassignedRestaurantes [" + users[u] + "] (dryRun=" + !!dryRun + "): "
      + changes.length + " filas " + (dryRun ? "cambiarían" : "actualizadas") + ", "
      + review.length + " quedan para revisión manual (no se tocan).");
    changes.forEach(function(c) {
      Logger.log("  cambio  fila " + c.row + " [" + c.tipo + "]: \"" + c.comercio + "\" → " + c.to);
    });
    review.forEach(function(r) {
      Logger.log("  revisar fila " + r.row + " [" + r.tipo + "]: \"" + r.comercio + "\" (no reconocido, se deja como Restaurantes)");
    });
  }

  return { ok: true, dryRun: !!dryRun, stats: statsAll };
}

// El editor de Apps Script solo permite correr funciones sin argumentos desde
// el botón "Run" — estos wrappers hacen que fixMisassignedRestaurantes() sea
// ejecutable ahí sin tener que tocar código. Correr primero el dry-run,
// revisar Ver > Registros, y solo luego correr el apply.
function fixMisassignedRestaurantes_dryRun() {
  return fixMisassignedRestaurantes(true);
}

function fixMisassignedRestaurantes_apply() {
  return fixMisassignedRestaurantes(false);
}

// ── Actualizar categoría de una fila existente ────────────────
var ALLOWED_CATEGORIES = ["Restaurantes","Domicilios","Mercado","Transporte","Hogar","Salud","Deporte","Compras","Suscripciones","Viajes","Software","Bre-B","Entretenimiento","Otro"];

// Returns the merchant name (Comercio) of the updated row, or null if not found.
function updateCategoryInSheet(timestamp, categoria, userId) {
  // Allowlist check — prevents formula injection (H-03)
  if (ALLOWED_CATEGORIES.indexOf(categoria) === -1) {
    throw new Error("Categoría no válida: " + categoria);
  }

  var ref   = _getSheet(userId);
  var sheet = ref.sheet;
  var data  = sheet.getDataRange().getValues();
  var hdrs  = data[0];
  var tsCol      = hdrs.indexOf("Timestamp");
  var catCol     = hdrs.indexOf("Categoría");
  var comercioCol = hdrs.indexOf("Comercio");
  if (tsCol === -1 || catCol === -1) throw new Error("Columnas Timestamp/Categoría no encontradas");

  var targetMs = new Date(timestamp).getTime();
  for (var i = 1; i < data.length; i++) {
    var cell   = data[i][tsCol];
    var cellMs = cell instanceof Date ? cell.getTime() : new Date(String(cell)).getTime();
    if (Math.abs(cellMs - targetMs) < TIMESTAMP_MATCH_TOLERANCE_MS) {
      sheet.getRange(i + 1, catCol + 1).setValue(categoria);
      return comercioCol >= 0 ? String(data[i][comercioCol] || "") : null;
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
    if (Math.abs(cellMs - targetMs) < TIMESTAMP_MATCH_TOLERANCE_MS) {
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
    if (Math.abs(cellMs - targetMs) < TIMESTAMP_MATCH_TOLERANCE_MS) {
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
          _appendHeaderColumn(sheet, notaCol + 1, "Nota");
        }
        sheet.getRange(row, notaCol + 1).setValue(payload.nota);
      }
      return;
    }
  }
  throw new Error("Transacción no encontrada: " + timestamp);
}

// Agrega una columna nueva al final de la hoja con el mismo estilo de encabezado
// (negrita + fondo gris) que usa el header original — patrón repetido al migrar
// hojas existentes a un esquema con más columnas.
function _appendHeaderColumn(sheet, colIndex1Based, headerName) {
  sheet.getRange(1, colIndex1Based).setValue(headerName).setFontWeight("bold").setBackground("#f3f3f3");
}

// ── Google Sheets writer ──────────────────────────────────────
function appendToSheet(data, userId) {
  var ref   = _getSheet(userId);
  var ss    = ref.ss;
  var sheet = ref.sheet;

  if (!sheet) {
    sheet = ss.insertSheet(ref.tabName);
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
  }

  // Ensure Nota column exists on sheets created before this update
  var hdrs = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (hdrs.indexOf("Nota") === -1) {
    var notaCol = hdrs.length + 1;
    _appendHeaderColumn(sheet, notaCol, "Nota");
  }

  var fecha = data.fecha ? Utilities.formatDate(data.fecha, TIMEZONE, "yyyy-MM-dd HH:mm:ss") : "";

  sheet.appendRow([
    // Milisegundos: Timestamp es el identificador único de la fila (lo usan
    // updateCategoryInSheet/deleteTransactionFromSheet/updateTransactionFields
    // para saber cuál fila tocar). Con precisión de solo segundo, transacciones
    // importadas en lote (extracto PDF/OCR, ~300ms entre cada una) podían
    // compartir el mismo Timestamp — causando filas fantasma en el historial
    // y riesgo real de editar/borrar la transacción vecina equivocada.
    Utilities.formatDate(data.timestamp, TIMEZONE, "yyyy-MM-dd HH:mm:ss.SSS"),
    fecha,
    data.banco        || "",
    data.tipo         || "",
    data.monto        || "",
    data.comercio     || "",
    data.tarjeta      || "",
    data.categoria    || "Otro",
    data.sms_original || "",
    data.fuente       || "sms",
    data.nota         || ""
  ]);

  try { _sendAlertEmail(userId, data); } catch(e) {}
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

// ── Admin PIN reset helper (ejecutar manualmente desde el editor) ─
// Cómo usarlo:
//   1. En Script Properties agrega RECOVERY_USER (userId) y RECOVERY_PIN (nuevo PIN)
//   2. Selecciona "resetAdminPin" en el menú de funciones y clic en ▶ Run
//   3. RECOVERY_PIN se elimina automáticamente tras el reset
function resetAdminPin() {
  var props = PropertiesService.getScriptProperties();
  var userId = props.getProperty("RECOVERY_USER") || _getAdminUser();
  var newPin = props.getProperty("RECOVERY_PIN");
  if (!newPin) { Logger.log("⚠ Define RECOVERY_PIN en Script Properties antes de ejecutar."); return; }
  props.setProperty("APP_PIN_" + userId, _hashPin(userId, newPin));
  props.deleteProperty("RECOVERY_PIN");
  Logger.log("✓ PIN de " + userId + " restablecido. RECOVERY_PIN eliminado.");
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
        parsed.categoria    = detectCategoryIngesta(parsed.comercio, userId);
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
    if (mp) return { banco: CANONICAL_BANCO.nequi, tipo: "Transferencia", monto: _parseCopEmail(mp[1]), comercio: mp[2].trim(), tarjeta: "", fecha: new Date() };

    var reRecibio = /[Rr]ecibiste\s+\$\s*([\d.,]+)\s+de\s+(.+?)(?:\.|$)/;
    var mr = text.match(reRecibio);
    if (mr) return { banco: CANONICAL_BANCO.nequi, tipo: "Ingreso", monto: _parseCopEmail(mr[1]), comercio: mr[2].trim(), tarjeta: "", fecha: new Date() };

    var reCompra = /[Cc]ompraste?\s+(?:en\s+)?(.+?)\s+por\s+\$\s*([\d.,]+)/;
    var mc = text.match(reCompra);
    if (mc) return { banco: CANONICAL_BANCO.nequi, tipo: "Compra", monto: _parseCopEmail(mc[2]), comercio: normalizeComercio(mc[1].trim()), tarjeta: "", fecha: new Date() };
  }

  if (bank === "rappi") {
    // "Tu pedido de $45.900 fue pagado" / "Pagaste $45.900 en Rappi"
    var reRappi = /\$\s*([\d.,]+)/;
    var mr2 = text.match(reRappi);
    if (mr2) return { banco: CANONICAL_BANCO.rappi, tipo: "Compra", monto: _parseCopEmail(mr2[1]), comercio: "Rappi", tarjeta: "", fecha: new Date() };
  }

  if (bank === "dale") {
    var reDale = /[Ee]nviaste\s+\$\s*([\d.,]+)\s+a\s+(.+?)(?:\.|$)/;
    var md = text.match(reDale);
    if (md) return { banco: CANONICAL_BANCO.dale, tipo: "Transferencia", monto: _parseCopEmail(md[1]), comercio: md[2].trim(), tarjeta: "", fecha: new Date() };
  }

  if (bank === "davivienda") {
    var reDAV = /[Cc]ompra.*?\$([\d,.]+).*?[Tt]arjeta\s+\*(\d+).*?[Ll]ugar\s+(.+?)(?:\.|$)/;
    var mdav = text.match(reDAV);
    if (mdav) return { banco: CANONICAL_BANCO.davivienda, tipo: "Compra", monto: _parseCopEmail(mdav[1]), tarjeta: "Tarjeta *" + mdav[2], comercio: normalizeComercio(mdav[3].trim()), fecha: new Date() };
  }

  if (bank === "bancolombia") {
    var reBCO = /\$\s*([\d,.]+)/;
    var mbco = text.match(reBCO);
    if (mbco) {
      var monto = _parseCopEmail(mbco[1]);
      if (monto > 0) return { banco: CANONICAL_BANCO.bancolombia, tipo: "Compra", monto: monto, comercio: "", tarjeta: "", fecha: new Date() };
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
    _appendHeaderColumn(sheet, lastCol + 1, "Fuente");
  }
  cache.put(key, "1", CACHE_TTL_6H);
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
      banco:   CANONICAL_BANCO.bancolombia,
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
      banco:   CANONICAL_BANCO.bancolombia,
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
      banco:   CANONICAL_BANCO.davivienda,
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
      banco:   CANONICAL_BANCO.itau,
      _bankKey: "itau",
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
      banco:   CANONICAL_BANCO.nequi,
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
      banco:   CANONICAL_BANCO.nequi,
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
      banco:   CANONICAL_BANCO.nequi,
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
      banco:   CANONICAL_BANCO.daviplata,
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
      banco:   CANONICAL_BANCO.daviplata,
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
  return _parseNotifAval(CANONICAL_BANCO.occidente, title, body);
}
function parseNotifPopular(title, body) {
  return _parseNotifAval(CANONICAL_BANCO.popular, title, body);
}
function parseNotifAvVillas(title, body) {
  return _parseNotifAval(CANONICAL_BANCO.avvillas, title, body);
}

function _parseNotifAval(nombreBanco, title, body) {
  var text = body || title;

  // Same pattern as Bogotá SMS — Aval banks share transaction notification wording
  var re = /(?:Tu\s+)?(\w+)\s+por\s+([\d,.]+)\s+(?:fue\s+\w+\s+)?con\s+(?:Tarjeta\s+(?:Cr[e\u00e9]dito|D[e\u00e9]bito)|Cuenta)\s+(\d+)\s+(?:el\s+[\d/]+\s+[\d:]+\s+)?en\s+(.+?)(?:\s*[¿?]|$)/i;
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
      banco:   CANONICAL_BANCO.dale,
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
      banco:   CANONICAL_BANCO.dale,
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
      banco:   CANONICAL_BANCO.rappi,
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
  var smsBogota       = "Banco de Bogota: Tu compra por 130,456 fue aprobada con Tarjeta Cr\u00e9dito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA ¿Dudas? Llama a la Servilinea";
  var smsItauCard     = "Se realizo una compra en THE NEW YORK TIMES desde tu Tarjeta Credito ****8439 por $7,293  el 2026/05/30 02:04:18 ITAU Tel: 5818181 Bta o 018000512633 Nal para transacciones con tarjeta";
  var smsItauDebit    = "Se realizo un debito de tu Cuenta de Ahorros ****8448 por $23,400 el 2026/05/29 15:00:00 ITAU Tel: 5818181 Bta o 018000512633 Nal para transfrencias con Bre-B";
  var smsItauTransfer = "Se realizo una Transferencia de tu Cuenta de Ahorros ****8448 por $240,000 el 2026/06/27 18:30:00 ITAU Tel: 5818181 Bta o 018000512633 Nal";
  var smsItauBreB     = "ITAU: se realizó un débito a tu cuenta AHO 8448 a la llave Bre-B 1234567890 por $ 1000.00 el 2026-07-01 a las 20:50:00.";
  var smsItauBreBLlaveAlias = "ITAU: se realizó un débito a tu cuenta AHO 8448 a la llave Bre-B @usuario9237 por $ 220000.00 el 2026-07-02 a las 12:13:03.";
  var smsDaviApproved = "DAVIVIENDA: Compra . Aprobado(a), $5,550, Tarjeta *8863, Hora 07:12,Lugar Mercado Pago*TEMBICI";
  var smsDaviReversed = "DAVIVIENDA: Compra Reversada(o)  , $10,939, Tarjeta *8863, Hora 10:00,Lugar UBER RIDES            .";
  var smsBancoPSE     = "Bancolombia: Pagaste $100,000.00 a Acciones y Valores S A desde tu producto 0018 el 02/06/2026 14:00:19. ¿Dudas? Llamanos al 6045109095. Estamos cerca";
  var smsBancoBreb    = "Bancolombia: DANIELA, transferiste $137,500.00 a la llave 3164707724 desde tu cuenta *0018 a Natalia Karaman Plata el 27/05/26 a las 14:27. Con Bre-b es de una y gratis. Dudas al 018000912345";

  Logger.log("Bogotá:           " + JSON.stringify(parseBogota(smsBogota)));
  Logger.log("Itaú card:        " + JSON.stringify(parseItau(smsItauCard)));
  Logger.log("Itaú debit:       " + JSON.stringify(parseItau(smsItauDebit)));
  Logger.log("Itaú transfer:    " + JSON.stringify(parseItau(smsItauTransfer)));
  Logger.log("Itaú Bre-B débito:" + JSON.stringify(parseItau(smsItauBreB)));
  Logger.log("Itaú Bre-B débito (llave alias):" + JSON.stringify(parseItau(smsItauBreBLlaveAlias)));
  // Regresión: la llave debe quedar en comercio (no el string genérico "Bre-B")
  // y detectCategory debe clasificarla como "Bre-B" (no "Otro"). El fusionado
  // entre las dos notificaciones (mergeBrebDuplicate) requiere un Sheet real —
  // no se puede probar aquí; ver apps_script/webhook.gs mergeBrebDuplicate().
  Logger.log("Itaú Bre-B categoría:" + detectCategory(parseItau(smsItauBreB).comercio));
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
  var pushBdb = "Tu compra por 130,456 fue aprobada con Tarjeta Cr\u00e9dito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA";
  Logger.log("Notif BDB compra: " + JSON.stringify(parseNotifBogota("Banco de Bogotá", pushBdb)));

  // Itaú push (reuses SMS parser)
  var pushIta = "Se realizo una compra en THE NEW YORK TIMES desde tu Tarjeta Credito ****8439 por $7,293  el 2026/05/30 02:04:18 ITAU";
  Logger.log("Notif ITA compra: " + JSON.stringify(parseNotifItau("Itaú", pushIta)));

  // Nequi push (no tarjeta)
  var pushNeqPago   = "Pagaste $23,000 a Juan P\u00e9rez";
  var pushNeqRecibio = "Recibiste $50,000 de Mar\u00eda L\u00f3pez";
  var pushNeqCompra = "Compraste $15,900 en Rappi";
  Logger.log("Notif NEQ pago:   " + JSON.stringify(parseNotifNequi("Nequi", pushNeqPago)));
  Logger.log("Notif NEQ recibio:" + JSON.stringify(parseNotifNequi("Nequi", pushNeqRecibio)));
  Logger.log("Notif NEQ compra: " + JSON.stringify(parseNotifNequi("Nequi", pushNeqCompra)));

  // Daviplata push
  var pushDpl = "$30,000 recibida de Carlos Torres";
  Logger.log("Notif DPL recibio:" + JSON.stringify(parseNotifDaviplata("Daviplata", pushDpl)));

  // Aval banks push
  var pushAval = "Tu compra por 45,000 fue aprobada con Tarjeta Cr\u00e9dito 1234 en JUMP FITNESS";
  Logger.log("Notif OCC compra: " + JSON.stringify(parseNotifOccidente("Occidente", pushAval)));
  Logger.log("Notif POP compra: " + JSON.stringify(parseNotifPopular("Popular", pushAval)));
  Logger.log("Notif AVV compra: " + JSON.stringify(parseNotifAvVillas("AV Villas", pushAval)));

  // dale! push
  var pushDal = "Enviaste $15,000 a Pedro Gonz\u00e1lez";
  Logger.log("Notif DAL envio:  " + JSON.stringify(parseNotifDale("dale!", pushDal)));

  // Rappi push
  var pushRap = "Tu pedido de $45,900 fue pagado";
  Logger.log("Notif RAP pedido: " + JSON.stringify(parseNotifRappi("Rappi", pushRap)));

  // NO_RECONOCIDO fallback
  var pushUnknown = "Tienes una nueva notificaci\u00f3n";
  Logger.log("Notif UNKNOWN:    " + JSON.stringify(parseNotification("bancolombia", "Bancolombia", pushUnknown)));

  // dispatcher routing check
  Logger.log("Dispatch BCO:     " + JSON.stringify(parseNotification("bancolombia", "Bancolombia", pushBco)));
  Logger.log("Dispatch NEQ:     " + JSON.stringify(parseNotification("nequi", "Nequi", pushNeqPago)));
}

// ============================================================
// D5-2: Backup automático semanal a Google Drive
// ============================================================
// Ejecutar setupWeeklyBackupTrigger() una vez desde el editor
// para activar el trigger. Crea/actualiza archivos JSON en la
// carpeta "Finanzas Backup" del Drive del propietario del script.
// ============================================================

function weeklyBackupToDrive() {
  var props   = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("SHEET_ID");
  if (!sheetId) { Logger.log("SHEET_ID no configurado"); return; }

  var ss      = SpreadsheetApp.openById(sheetId);
  var users   = _getAllowedUsers();
  var date    = Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd");

  // Encontrar o crear carpeta "Finanzas Backup" en Drive
  var folders = DriveApp.getFoldersByName("Finanzas Backup");
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder("Finanzas Backup");

  var backed = 0;
  users.forEach(function(uid) {
    // Misma resolución de nombre de tab que _getSheet (capitaliza el userId, ej.
    // "jose" → "Jose"), reutilizando el spreadsheet ya abierto arriba en vez de
    // reabrirlo por cada usuario. Antes se buscaba por uid en minúsculas
    // directamente y el backup fallaba en silencio para todos los usuarios.
    var tab = ss.getSheetByName(_tabNameForUser(uid));
    if (!tab) return;
    var data    = tab.getDataRange().getValues();
    if (data.length < 2) return;
    var headers = data[0];
    var rows    = data.slice(1).map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i] instanceof Date ? row[i].toISOString() : row[i]; });
      return obj;
    });
    var filename = "backup_" + uid + "_" + date + ".json";
    // Eliminar backup previo del mismo día si existe
    var existing = folder.getFilesByName(filename);
    while (existing.hasNext()) existing.next().setTrashed(true);
    folder.createFile(filename, JSON.stringify(rows, null, 2), MimeType.PLAIN_TEXT);
    backed++;
  });

  Logger.log("Backup completado: " + backed + " usuarios — " + date);
}

// ── F7: Alertas por email ──────────────────────────────────────────────────────

function _formatCOP(amount) {
  return "$" + Number(amount).toLocaleString("es-CO");
}

function _sendAlertEmail(userId, tx) {
  var props     = PropertiesService.getScriptProperties();
  var email     = props.getProperty("APP_ALERT_EMAIL_" + userId) || "";
  var threshold = Number(props.getProperty("APP_ALERT_THRESHOLD_" + userId) || "0");
  if (!email || !threshold || !tx.monto || Number(tx.monto) <= threshold) return;

  var subject = "⚠️ Gasto de " + _formatCOP(tx.monto) + " en " + (tx.comercio || tx.tipo || "transacción");
  var htmlBody = "<div style='font-family:sans-serif;max-width:480px'>"
    + "<h2 style='color:#dc2626'>⚠️ Alerta de gasto</h2>"
    + "<table style='border-collapse:collapse;width:100%'>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Monto</td><td style='font-weight:700;color:#0f172a'>" + _formatCOP(tx.monto) + "</td></tr>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Comercio</td><td>" + (tx.comercio || "—") + "</td></tr>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Banco</td><td>" + (tx.banco || "—") + "</td></tr>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Categoría</td><td>" + (tx.categoria || "—") + "</td></tr>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Fecha</td><td>" + (tx.fecha ? Utilities.formatDate(tx.fecha, TIMEZONE, "dd/MM/yyyy HH:mm") : "—") + "</td></tr>"
    + "</table>"
    + "<p style='color:#64748b;font-size:12px;margin-top:16px'>Finance Manager · alerta automática</p>"
    + "</div>";

  MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody });
}

// ── F8: Resumen semanal ────────────────────────────────────────────────────────

// Run this function ONCE manually from the Apps Script editor to set up the weekly trigger.
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "runWeeklyDigests"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("runWeeklyDigests")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(14) // 9am Colombia = 14:00 UTC
    .create();
  Logger.log("Trigger semanal creado: runWeeklyDigests cada lunes a las 9am COT");
}

function runWeeklyDigests() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try { _sendWeeklySummary(uid); } catch(e) { Logger.log("Digest error " + uid + ": " + e); }
  });
}

function _sendWeeklySummary(userId) {
  var props  = PropertiesService.getScriptProperties();
  var email  = props.getProperty("APP_ALERT_EMAIL_" + userId) || "";
  var digest = props.getProperty("APP_WEEKLY_DIGEST_" + userId);
  if (!email || digest !== "true") return;

  // Get last week (Mon–Sun)
  var now    = new Date();
  var curDow = now.getDay() === 0 ? 7 : now.getDay(); // Mon=1 ... Sun=7
  var lastSun = new Date(now); lastSun.setDate(now.getDate() - (curDow));
  lastSun.setHours(23, 59, 59, 0);
  var lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6);
  lastMon.setHours(0, 0, 0, 0);

  var ref   = _getSheet(userId);
  if (!ref.sheet) return;
  var data    = ref.sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0];
  var rows    = data.slice(1);

  var tsIdx    = headers.indexOf("Timestamp");
  var montoIdx = headers.indexOf("Monto (COP)");
  var catIdx   = headers.indexOf("Categoría");

  var total = 0;
  var bycat = {};
  var txCount = 0;

  rows.forEach(function(row) {
    var ts = new Date(row[tsIdx]);
    if (isNaN(ts) || ts < lastMon || ts > lastSun) return;
    var monto = Number(row[montoIdx]) || 0;
    if (monto <= 0) return;
    total += monto;
    txCount++;
    var cat = row[catIdx] || "Otro";
    bycat[cat] = (bycat[cat] || 0) + monto;
  });

  var catRows = Object.keys(bycat).map(function(c) { return { cat: c, total: bycat[c] }; });
  catRows.sort(function(a, b) { return b.total - a.total; });
  var top3 = catRows.slice(0, 3);

  var weekStr = Utilities.formatDate(lastMon, TIMEZONE, "dd MMM")
    + " – " + Utilities.formatDate(lastSun, TIMEZONE, "dd MMM yyyy");

  var catHtml = top3.map(function(c) {
    return "<tr><td style='padding:5px 0;color:#64748b'>" + c.cat + "</td>"
      + "<td style='font-weight:600;color:#0f172a;text-align:right'>" + _formatCOP(c.total) + "</td></tr>";
  }).join("");

  var htmlBody = "<div style='font-family:sans-serif;max-width:480px'>"
    + "<h2 style='color:#1d4ed8'>📊 Tu resumen semanal</h2>"
    + "<p style='color:#64748b'>" + weekStr + "</p>"
    + "<table style='border-collapse:collapse;width:100%;margin-bottom:16px'>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Total gastado</td><td style='font-weight:700;font-size:18px;color:#0f172a;text-align:right'>" + _formatCOP(total) + "</td></tr>"
    + "<tr><td style='padding:6px 0;color:#64748b'>Transacciones</td><td style='text-align:right'>" + txCount + "</td></tr>"
    + "</table>"
    + (catHtml ? "<h3 style='color:#374151;font-size:14px;margin-bottom:8px'>Top categorías</h3>"
      + "<table style='border-collapse:collapse;width:100%'>" + catHtml + "</table>" : "")
    + "<p style='color:#94a3b8;font-size:11px;margin-top:20px'>Finance Manager · resumen automático semanal</p>"
    + "</div>";

  MailApp.sendEmail({
    to: email,
    subject: "📊 Tu resumen financiero — " + weekStr,
    htmlBody: htmlBody
  });
}

// ── Tarjetas/Cuentas registradas por usuario ──────────────────
function _getCards(userId) {
  var raw = PropertiesService.getScriptProperties().getProperty('cards_' + userId);
  try { return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}

function _saveCards(userId, cards) {
  PropertiesService.getScriptProperties().setProperty('cards_' + userId, JSON.stringify(cards));
}

// ══════════════════════════════════════════════════════════════════════
// ── NUEVAS CAPACIDADES BACKEND (Clusters 1-5) ────────────────────────
// ══════════════════════════════════════════════════════════════════════

// ── Rate limit helper (devuelve {ok, error} en vez de throw) ─────────
function _checkRate(userId, action, dailyLimit) {
  var cache = CacheService.getScriptCache();
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var key = 'rate_' + action + '_' + userId + '_' + today;
  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= dailyLimit) return { ok: false, error: 'Límite diario de ' + action + ' alcanzado (' + dailyLimit + '/día).' };
  cache.put(key, String(count + 1), CACHE_TTL_6H);
  return { ok: true };
}

// ── Leer transacciones con ventana de meses configurable ─────────────
function _getTxnsRange(userId, months) {
  var ref = _getSheet(userId);
  if (!ref.sheet) return [];
  var rows = ref.sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  var headers = rows[0];
  var fechaIdx = headers.indexOf('Fecha');
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - (months || 12));
  var result = [];
  for (var i = rows.length - 1; i >= 1; i--) {
    var row = rows[i];
    if (fechaIdx >= 0) {
      var cell = row[fechaIdx];
      var d = cell instanceof Date ? cell : new Date(String(cell));
      if (!isNaN(d.getTime()) && d < cutoff) continue;
    }
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j] instanceof Date ? row[j].toISOString() : row[j];
    }
    result.push(obj);
  }
  return result;
}

// ── Normalizar nombre de comercio ─────────────────────────────────────
function _normMerchant(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

// Quita la llave/alias del destinatario de un comercio Bre-B ("Llave Bre-B
// 3001234567" / "Llave Bre-B @usuario9237" → "Bre-B") antes de que el texto
// entre a un prompt de Claude. La llave es PII del destinatario (teléfono o
// alias de otra persona) — útil para mostrarla en la UI del usuario, pero no
// hay razón para que un pago recurrente a la misma persona le mande su
// teléfono/alias a un proveedor de IA externo en cada resumen o coach.
function _redactBrebKeyForAI(comercio) {
  return String(comercio || '').replace(/^Llave Bre-?B\s+\S+/i, 'Bre-B');
}

// ── Detectar pagos recurrentes desde transacciones ───────────────────
// Devuelve array de {comercio, monthlyAvg, annualCost, occurrences, lastSeen}
function _detectRecurring(txns) {
  var byMerchant = {};
  txns.forEach(function(t) {
    var cat = String(t.Categoría || '');
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0 || cat === 'Ingreso') return;
    var key = _normMerchant(t.Comercio);
    if (!key) return;
    var month = String(t.Fecha || '').slice(0, 7);
    if (!byMerchant[key]) byMerchant[key] = { comercio: String(t.Comercio || '').trim(), months: {}, montos: [], categoria: cat };
    byMerchant[key].months[month] = true;
    byMerchant[key].montos.push(monto);
  });
  var recurring = [];
  Object.keys(byMerchant).forEach(function(k) {
    var info = byMerchant[k];
    var monthCount = Object.keys(info.months).length;
    if (monthCount < 2) return;
    var avg = Math.round(info.montos.reduce(function(s,v){ return s+v; },0) / info.montos.length);
    var sortedMonths = Object.keys(info.months).sort();
    recurring.push({
      comercio: info.comercio,
      monthlyAvg: avg,
      annualCost: avg * 12,
      occurrences: monthCount,
      lastSeen: sortedMonths[sortedMonths.length - 1],
      categoria: info.categoria,
      cancelUrl: _getCancelUrl(k)
    });
  });
  return recurring.sort(function(a,b){ return b.monthlyAvg - a.monthlyAvg; });
}

// Links de cancelación de servicios conocidos
var CANCEL_URLS = {
  'NETFLIX': 'https://www.netflix.com/cancelplan',
  'SPOTIFY': 'https://www.spotify.com/account/subscription/cancel',
  'AMAZON': 'https://www.amazon.com/mc/pipelines/cancellation',
  'PRIME': 'https://www.amazon.com/mc/pipelines/cancellation',
  'DISNEY': 'https://help.disneyplus.com/csp',
  'HBO': 'https://play.max.com/settings/subscription',
  'MAX': 'https://play.max.com/settings/subscription',
  'PARAMOUNT': 'https://help.paramountplus.com',
  'APPLE': 'https://support.apple.com/en-us/HT202039',
  'YOUTUBE': 'https://support.google.com/youtube/answer/6308278',
  'GOOGLE': 'https://support.google.com/googleplay/answer/2853785',
  'MICROSOFT': 'https://account.microsoft.com/services',
  'ADOBE': 'https://account.adobe.com/plans',
  'CANVA': 'https://www.canva.com/settings/billing',
  'NOTION': 'https://www.notion.so/my-account',
  'RAPPI': 'https://rappi.com/configuracion',
  'UBER': 'https://help.uber.com',
  'DEEZER': 'https://www.deezer.com/account/offer',
  'TIDAL': 'https://account.tidal.com/subscription',
  'DUOLINGO': 'https://www.duolingo.com/settings/subscription',
  'HEADSPACE': 'https://www.headspace.com/subscriptions',
  'CALM': 'https://www.calm.com/settings',
  'CHATGPT': 'https://chat.openai.com/settings',
  'CLAUDE': 'https://console.anthropic.com/settings/billing',
  'OPENAI': 'https://platform.openai.com/account/billing'
};
function _getCancelUrl(normKey) {
  var keys = Object.keys(CANCEL_URLS);
  for (var i = 0; i < keys.length; i++) {
    if (normKey.indexOf(keys[i]) !== -1) return CANCEL_URLS[keys[i]];
  }
  return null;
}

// ── CLUSTER 1: Analytics Engine ───────────────────────────────────────
function _buildAnalytics(userId, params) {
  var months = parseInt((params && params.months) || '12', 10);
  var multiYearMonths = Math.max(months, 24);
  var txns = _getTxnsRange(userId, multiYearMonths);

  // --- Top Merchants ---
  var merchantMap = {};
  txns.forEach(function(t) {
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0 || String(t.Categoría||'') === 'Ingreso') return;
    var key = _normMerchant(t.Comercio);
    if (!key) return;
    if (!merchantMap[key]) merchantMap[key] = { comercio: String(t.Comercio||'').trim(), total:0, count:0, categoria: String(t.Categoría||'Otro') };
    merchantMap[key].total += monto;
    merchantMap[key].count++;
  });
  var topMerchants = Object.keys(merchantMap).map(function(k){
    var m = merchantMap[k];
    return { comercio: m.comercio, total: m.total, count: m.count, avgTicket: Math.round(m.total/m.count), categoria: m.categoria };
  }).sort(function(a,b){ return b.total - a.total; }).slice(0, 20);

  // --- By Card ---
  var cardMap = {};
  txns.forEach(function(t) {
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0) return;
    var card = String(t['Tarjeta/Cuenta'] || 'Sin tarjeta');
    if (!cardMap[card]) cardMap[card] = { card: card, banco: String(t.Banco||''), total:0, count:0, lastActivity: '', categories:{} };
    cardMap[card].total += monto;
    cardMap[card].count++;
    var fecha = String(t.Fecha||'').slice(0,10);
    if (fecha > cardMap[card].lastActivity) cardMap[card].lastActivity = fecha;
    var cat = String(t.Categoría||'Otro');
    cardMap[card].categories[cat] = (cardMap[card].categories[cat]||0) + monto;
  });
  var byCard = Object.values ? Object.values(cardMap) : Object.keys(cardMap).map(function(k){ return cardMap[k]; });
  byCard.sort(function(a,b){ return b.total - a.total; });

  // --- Hourly Heatmap ---
  var DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  var heatmap = {};
  for (var h = 0; h < 24; h++) {
    heatmap[String(h)] = {};
    DAYS.forEach(function(d){ heatmap[String(h)][d] = 0; });
  }
  txns.forEach(function(t) {
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0 || String(t.Categoría||'') === 'Ingreso') return;
    var ts = String(t.Timestamp || t.Fecha || '');
    var dt = new Date(ts);
    if (isNaN(dt.getTime())) return;
    var hour = dt.getHours();
    var dow = DAYS[dt.getDay()];
    heatmap[String(hour)][dow] = (heatmap[String(hour)][dow] || 0) + monto;
  });

  // --- Subscriptions ---
  var subscriptions = _detectRecurring(txns).filter(function(s){ return s.occurrences >= 2; });

  // --- Lifestyle Inflation ---
  var monthlyTotals = {};
  txns.forEach(function(t) {
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0 || String(t.Categoría||'') === 'Ingreso') return;
    var month = String(t.Fecha||'').slice(0,7);
    if (!month) return;
    monthlyTotals[month] = (monthlyTotals[month]||0) + monto;
  });
  var sortedMonths = Object.keys(monthlyTotals).sort().slice(-6);
  var inflationSignal = { detected: false, months: sortedMonths, totals: sortedMonths.map(function(m){ return monthlyTotals[m]||0; }), growthRatePct: null, message: null };
  if (sortedMonths.length >= 4) {
    var consecutive = 0;
    var rates = [];
    for (var mi = 1; mi < sortedMonths.length; mi++) {
      var prev = monthlyTotals[sortedMonths[mi-1]] || 1;
      var curr = monthlyTotals[sortedMonths[mi]] || 0;
      var rate = (curr - prev) / prev * 100;
      rates.push(rate);
      if (rate >= 5) consecutive++; else consecutive = 0;
    }
    if (consecutive >= 3) {
      var avgRate = Math.round(rates.slice(-3).reduce(function(s,r){ return s+r; },0) / 3);
      inflationSignal.detected = true;
      inflationSignal.growthRatePct = avgRate;
      inflationSignal.message = 'Tu gasto base sube ~' + avgRate + '% cada mes desde ' + _monthName(sortedMonths[sortedMonths.length-4]) + '. ¿Es intencional?';
    }
  }

  // --- Multi-year monthly breakdown ---
  var multiYear = sortedMonths.concat(Object.keys(monthlyTotals).sort().filter(function(m){ return sortedMonths.indexOf(m) === -1; }));
  var byMonth = {};
  txns.forEach(function(t) {
    var monto = Number(t['Monto (COP)']) || 0;
    if (monto <= 0 || String(t.Categoría||'') === 'Ingreso') return;
    var month = String(t.Fecha||'').slice(0,7);
    var cat = String(t.Categoría||'Otro');
    if (!byMonth[month]) byMonth[month] = { month: month, total: 0, byCategory: {} };
    byMonth[month].total += monto;
    byMonth[month].byCategory[cat] = (byMonth[month].byCategory[cat]||0) + monto;
  });
  var multiYearArr = Object.keys(byMonth).sort().map(function(m){ return byMonth[m]; });

  return {
    ok: true,
    topMerchants: topMerchants,
    byCard: byCard,
    hourlyHeatmap: heatmap,
    subscriptions: subscriptions,
    inflationSignal: inflationSignal,
    multiYear: multiYearArr
  };
}

function _monthName(yyyymm) {
  var months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var parts = String(yyyymm||'').split('-');
  if (parts.length < 2) return yyyymm;
  return months[parseInt(parts[1],10)-1] || yyyymm;
}

// ── CLUSTER 2: Calendario de Pagos Fijos ──────────────────────────────
function _getFixedPayments(userId) {
  var raw = PropertiesService.getScriptProperties().getProperty('FIXED_PAYMENTS_' + userId);
  try { return raw ? JSON.parse(raw) : []; } catch(e) { return []; }
}
function _saveFixedPayments(userId, payments) {
  PropertiesService.getScriptProperties().setProperty('FIXED_PAYMENTS_' + userId, JSON.stringify(payments));
}

function _getFixedCalendar(userId, month) {
  var payments = _getFixedPayments(userId);
  var txns = _getTxnsRange(userId, 2);
  var monthTxns = txns.filter(function(t){ return String(t.Fecha||'').slice(0,7) === month; });
  var today = new Date();
  var todayStr = today.toISOString().slice(0,10);
  var yearMonth = month.split('-');
  var y = parseInt(yearMonth[0],10), m = parseInt(yearMonth[1],10) - 1;
  var daysInMonth = new Date(y, m+1, 0).getDate();

  var result = payments.filter(function(p){ return p.activo !== false; }).map(function(p) {
    // Monto efectivo: el consultado por scraping si existe, si no el estimado.
    var monto = Number(p.ultimoMonto != null ? p.ultimoMonto : p.monto) || 0;
    // Fecha de pago: la fecha de vencimiento consultada (si cae en el mes), si no el día fijo.
    var payDate = (p.ultimaFechaVencimiento && String(p.ultimaFechaVencimiento).slice(0,7) === month)
      ? p.ultimaFechaVencimiento
      : month + '-' + String(p.diaDelMes).padStart(2,'0');
    var status = 'pending';
    if (payDate < todayStr) {
      // Look for matching txn (same category, amount ±15%, within ±5 days)
      var amtLow = monto * 0.85, amtHigh = monto * 1.15;
      var dayStart = month + '-' + String(Math.max(1, p.diaDelMes-5)).padStart(2,'0');
      var dayEnd   = month + '-' + String(Math.min(daysInMonth, p.diaDelMes+5)).padStart(2,'0');
      var match = monto > 0 && monthTxns.find(function(t){
        var m = Number(t['Monto (COP)'])||0;
        var fecha = String(t.Fecha||'').slice(0,10);
        var catMatch = !p.categoria || t.Categoría === p.categoria;
        return m >= amtLow && m <= amtHigh && fecha >= dayStart && fecha <= dayEnd && catMatch;
      });
      status = match ? 'paid' : 'overdue';
    }
    return { id: p.id, nombre: p.nombre, monto: monto, diaDelMes: p.diaDelMes,
      categoria: p.categoria || 'Hogar', tipo: p.tipo || 'manual', status: status, payDate: payDate,
      // Campos de servicio público (pasan a la PWA para el tab Facturas):
      providerId: p.providerId || null, numeroCuenta: p.numeroCuenta || null, urlPago: p.urlPago || null,
      ultimoMonto: (p.ultimoMonto != null ? p.ultimoMonto : null),
      ultimaFechaVencimiento: p.ultimaFechaVencimiento || null,
      ultimaConsulta: p.ultimaConsulta || null };
  });

  var totalExpected = result.reduce(function(s,p){ return s+p.monto; },0);
  var totalPaid  = result.filter(function(p){ return p.status==='paid'; }).reduce(function(s,p){ return s+p.monto; },0);
  var autoDetected = _detectRecurring(txns).filter(function(r){
    return !payments.some(function(p){ return _normMerchant(p.nombre) === _normMerchant(r.comercio); });
  });

  return { ok: true, month: month, payments: result, totalExpected: totalExpected,
    totalPaid: totalPaid, totalPending: totalExpected - totalPaid, autoDetected: autoDetected };
}

function _saveFixedPayment(userId, fp) {
  var payments = _getFixedPayments(userId);
  var id = fp.id || Utilities.getUuid();
  var idx = payments.findIndex ? payments.findIndex(function(p){ return p.id === id; })
    : (function(){ for(var i=0;i<payments.length;i++){ if(payments[i].id===id) return i; } return -1; })();
  if (idx < 0 && payments.length >= 50) return { ok: false, error: 'Máximo 50 pagos fijos' };
  var prev = idx >= 0 ? payments[idx] : {};

  var entry = { id: id, nombre: fp.nombre, monto: Number(fp.monto)||0,
    diaDelMes: Number(fp.diaDelMes)||1, categoria: fp.categoria || 'Hogar',
    activo: fp.activo !== false, tipo: fp.tipo || 'manual',
    creadoEn: prev.creadoEn || new Date().toISOString().slice(0,10) };

  // Campos de servicio público ('utility'): vienen del form o se preservan del registro previo.
  entry.providerId   = fp.providerId   !== undefined ? fp.providerId   : prev.providerId;
  entry.numeroCuenta = fp.numeroCuenta !== undefined ? fp.numeroCuenta : prev.numeroCuenta;
  entry.urlPago      = fp.urlPago      !== undefined ? fp.urlPago      : prev.urlPago;
  // Estado de la última consulta automática: no viene del form, se conserva.
  entry.ultimoMonto            = prev.ultimoMonto;
  entry.ultimaFechaVencimiento = prev.ultimaFechaVencimiento;
  entry.ultimaConsulta         = prev.ultimaConsulta;

  if (idx >= 0) payments[idx] = entry; else payments.push(entry);
  _saveFixedPayments(userId, payments);
  return { ok: true, id: id };
}

// ── Consulta automática (scraping) de una factura tipo 'utility' ──────
// Usa el conector del proveedor (connectors_facturas.gs) para traer monto + vencimiento.
// Si no hay conector o el portal falla, devuelve ok:false y la UI cae a entrada manual.
function _refreshFixedPayment(userId, id) {
  var payments = _getFixedPayments(userId);
  var idx = -1;
  for (var i = 0; i < payments.length; i++) { if (payments[i].id === id) { idx = i; break; } }
  if (idx < 0) return { ok: false, error: 'Factura no encontrada' };
  var p = payments[idx];
  if (p.tipo !== 'utility' || !p.providerId) return { ok: false, error: 'Esta factura no admite consulta automática' };
  if (!p.numeroCuenta) return { ok: false, error: 'Falta el número de cuenta' };

  var res = consultarFactura(p.providerId, p.numeroCuenta); // connectors_facturas.gs
  p.ultimaConsulta = new Date().toISOString();
  if (!res || !res.ok) {
    payments[idx] = p;
    _saveFixedPayments(userId, payments);
    return { ok: false, error: (res && res.error) || 'El portal no respondió' };
  }
  if (res.monto != null) { p.ultimoMonto = Number(res.monto) || 0; p.monto = p.ultimoMonto; }
  if (res.fechaVencimiento) {
    p.ultimaFechaVencimiento = res.fechaVencimiento;
    var d = parseInt(String(res.fechaVencimiento).slice(8, 10), 10);
    if (d >= 1 && d <= 28) p.diaDelMes = d; // mantener el día del mes en sync para la tarjeta de Home
  }
  payments[idx] = p;
  _saveFixedPayments(userId, payments);

  // Devolver el pago con estado recalculado (reconciliación) para refrescar la UI.
  var month = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
  var cal = _getFixedCalendar(userId, month);
  var updated = (cal.payments || []).filter(function(x){ return x.id === id; })[0] || p;
  return { ok: true, payment: updated };
}

// Consulta semanal de todas las facturas 'utility' de todos los usuarios (trigger).
function refreshAllFacturas() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try {
      var payments = _getFixedPayments(uid);
      payments.forEach(function(p) {
        if (p.tipo === 'utility' && p.providerId && p.numeroCuenta) {
          try { _refreshFixedPayment(uid, p.id); } catch(e) { Logger.log('Factura ' + p.id + ' (' + uid + '): ' + e); }
          Utilities.sleep(800); // cortesía con los portales
        }
      });
    } catch(e) { Logger.log('refreshAllFacturas ' + uid + ': ' + e); }
  });
}

// Actualiza la factura (FixedPayment) de un proveedor con el monto + vencimiento que la
// extensión de navegador leyó de la página del portal en la sesión del usuario.
function _ingestFactura(userId, payload) {
  var providerId = payload.providerId || "";
  if (!providerId) return { ok: false, error: "providerId requerido" };
  var monto = (payload.monto != null && payload.monto !== "") ? Number(payload.monto) : null;
  var venc  = payload.fechaVencimiento || null; // 'YYYY-MM-DD'
  if ((monto == null || isNaN(monto)) && !venc) return { ok: false, error: "Nada que actualizar" };

  var payments = _getFixedPayments(userId);
  var idx = -1;
  for (var i = 0; i < payments.length; i++) {
    if (payments[i].providerId !== providerId) continue;
    // Si la extensión leyó el número de cuenta, exigir que coincida cuando ambos existen.
    if (payload.numeroCuenta && payments[i].numeroCuenta && payments[i].numeroCuenta !== String(payload.numeroCuenta)) continue;
    idx = i; break;
  }
  if (idx < 0) return { ok: false, error: "No hay una factura registrada para ese proveedor (agrégala primero en el app)" };

  var p = payments[idx];
  if (monto != null && !isNaN(monto)) { p.ultimoMonto = monto; p.monto = monto; }
  if (venc) {
    p.ultimaFechaVencimiento = venc;
    var d = parseInt(String(venc).slice(8, 10), 10);
    if (d >= 1 && d <= 28) p.diaDelMes = d;
  }
  p.ultimaConsulta = new Date().toISOString();
  payments[idx] = p;
  _saveFixedPayments(userId, payments);
  return { ok: true, factura: { id: p.id, nombre: p.nombre, monto: p.monto, ultimaFechaVencimiento: p.ultimaFechaVencimiento || null } };
}

function _deleteFixedPayment(userId, id) {
  var payments = _getFixedPayments(userId).filter(function(p){ return p.id !== id; });
  _saveFixedPayments(userId, payments);
  return { ok: true };
}

// ── CLUSTER 3: Budget Alert Helper ────────────────────────────────────
function _checkBudgetAlert(userId, categoria) {
  try {
    var month = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
    var sp = PropertiesService.getScriptProperties();
    var budgets = JSON.parse(sp.getProperty('CAT_BUDGETS_' + userId + '_' + month) || '{}');
    var budget = Number(budgets[categoria]) || 0;
    if (!budget) return null;
    var txns = _getTxnsRange(userId, 1);
    var spent = txns
      .filter(function(t){ return String(t.Fecha||'').slice(0,7) === month && t.Categoría === categoria && (Number(t['Monto (COP)'])||0) > 0; })
      .reduce(function(s,t){ return s + (Number(t['Monto (COP)'])||0); }, 0);
    var pct = Math.round(spent / budget * 100);
    if (pct >= 80) return { category: categoria, spent: spent, budget: budget, pct: pct };
    return null;
  } catch(e) { return null; }
}

function _getCategoryStatus(userId, month) {
  var sp = PropertiesService.getScriptProperties();
  var budgets = JSON.parse(sp.getProperty('CAT_BUDGETS_' + userId + '_' + month) || '{}');
  var txns = _getTxnsRange(userId, 2).filter(function(t){ return String(t.Fecha||'').slice(0,7) === month; });
  var result = {};
  Object.keys(budgets).forEach(function(cat) {
    var budget = Number(budgets[cat]) || 0;
    var spent = txns.filter(function(t){ return t.Categoría === cat && (Number(t['Monto (COP)'])||0) > 0; })
      .reduce(function(s,t){ return s+(Number(t['Monto (COP)'])||0); },0);
    result[cat] = { budget: budget, spent: spent, disponible: budget-spent, pct: budget ? Math.round(spent/budget*100) : 0 };
  });
  return { ok: true, month: month, categories: result };
}

// ── CLUSTER 5: AI Intelligence ────────────────────────────────────────
// Cliente central de Anthropic. Toda llamada a Claude debe pasar por aquí para que el
// modelo sea configurable vía Script Properties y el manejo de errores sea uniforme.
//
// `systemPrompt` puede ser:
//   - string: se envía como bloque de texto plano.
//   - Array<{type,text,cache_control?}>: para prompt caching (GA, sin beta header).
//
// Lanza Error con contexto del HTTP code si la API falla (no devuelve null silently).
// Para flujos donde el fallo debe ser no-fatal (fallback de parsing), el llamador envuelve en try/catch.
function _callClaudeAI(systemPrompt, userMessage, maxTokens, model) {
  var key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada');
  // Modelo por defecto configurable vía Script Properties (ver docs/CONVENTIONS.md: "el modelo va en env");
  // fallback al valor actual si CLAUDE_DEFAULT_MODEL no está seteado.
  var defaultModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_DEFAULT_MODEL') || 'claude-haiku-4-5-20251001';
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: model || defaultModel,
      max_tokens: maxTokens || 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    }),
    muteHttpExceptions: true
  });
  var code = resp.getResponseCode();
  var body = resp.getContentText();
  var result;
  try {
    result = JSON.parse(body);
  } catch (parseErr) {
    // Anthropic (o un WAF/Cloudflare intermedio) puede devolver HTML/502 — sin JSON.
    throw new Error('Anthropic devolvió respuesta no-JSON (HTTP ' + code + '): ' + body.slice(0, 120));
  }
  if (code !== 200) {
    var apiErr = result.error && result.error.message
      ? result.error.message
      : JSON.stringify(result).slice(0, 150);
    throw new Error('Claude API error ' + code + ': ' + apiErr);
  }
  return (result.content && result.content[0] && result.content[0].text) || '';
}

// ═══════════════════════════════════════════════════════════════════════════
// Categorización de comercios nuevos por búsqueda en internet
// ═══════════════════════════════════════════════════════════════════════════
//
// `detectCategory` resuelve por reglas del usuario, aprendizajes y una lista de
// keywords. Un comercio que no matchea nada cae en "Otro" y se queda ahí para
// siempre. Muchos de esos se identifican con una búsqueda trivial: basta saber
// a qué industria pertenece el nombre.
//
// Tres decisiones de diseño que no son obvias:
//
// 1. **La búsqueda NO corre en la ingesta.** El iOS Shortcut espera la respuesta
//    del webhook; meterle una búsqueda web de 5-15 s al camino crítico volvería
//    lenta la captura y le agregaría un modo de falla nuevo. En vez de eso la
//    ingesta encola el comercio y devuelve "Otro"; un trigger resuelve la cola
//    aparte y rellena las filas. La categoría aparece unos minutos después.
//
// 2. **El diccionario es global, no por usuario.** Que RAPPI sea Domicilios no
//    depende de quién compró. Las correcciones manuales del usuario siguen
//    viviendo en `CATEGORY_LEARN_<userId>` y tienen prioridad sobre esto.
//
// 3. **Cada comercio se busca UNA sola vez en la vida.** El resultado —incluido
//    el "no se pudo determinar"— queda cacheado. Sin eso el costo sería por
//    transacción en vez de por comercio nuevo.

var WEBCAT_PREFIX      = "WEBCAT_";
var WEBCAT_QUEUE_KEY   = "WEBCAT_QUEUE";
var WEBCAT_DESCONOCIDO = "?";      // marca de caché negativa
var WEBCAT_REINTENTO_D = 45;       // días antes de reintentar un desconocido
var WEBCAT_MAX_POR_RUN = 12;       // tope de comercios que mira una corrida
var WEBCAT_MAX_MS      = 240000;   // 4 min: corta el bucle antes del límite de 6 de GAS
var WEBCAT_MAX_COLA    = 200;      // techo de la cola, por si algo la inunda

// Los tres valores que significan "nadie clasificó esto todavía". No basta con
// "Otro": el import retroactivo de extractos (Fuente MANUAL) dejó filas con la
// celda de categoría VACÍA, y una tanda vieja quedó en "Otros" —plural, fuera
// de ALLOWED_CATEGORIES, así que el picker del UI ni siquiera la ofrece—.
// Medido sobre la hoja real: 45 comercios en "Otro" contra 51 repartidos entre
// vacío y "Otros", o sea que anclarse a la cadena "Otro" dejaba fuera a más de
// la mitad del histórico sin categorizar.
//
// Cualquier otro valor es una decisión de alguien y no se toca, aunque esté
// fuera del allowlist ("Seguros", "Transferencia"): pisarlo sería perder
// información, no ganarla.
var WEBCAT_SIN_CATEGORIA = ["", "Otro", "Otros"];

function _webcatSinCategoria(valor) {
  var v = String(valor == null ? "" : valor).trim();
  return WEBCAT_SIN_CATEGORIA.indexOf(v) !== -1;
}

/**
 * La categoría que la propia hoja ya le da a un comercio, si es unánime.
 *
 * Muchas veces la respuesta no hay que buscarla: el mismo comercio ya aparece
 * clasificado en otras filas. Preferirla no es solo ahorrarse la búsqueda —es
 * evitar partir un comercio en dos. TEMBICI tenía 7 filas sin categorizar y otras
 * ya en Transporte; una búsqueda podría contestar "Deporte" con toda la razón
 * (es bicicleta compartida) y dejar al mismo comercio repartido entre dos
 * categorías del presupuesto, que es peor que cualquiera de las dos.
 *
 * `conteos` es un mapa categoría → nº de filas. Exige unanimidad sobre TODAS las
 * categorías vistas, no solo las del allowlist: un comercio que aparece como
 * "Restaurantes" y "Seguros" es una señal mezclada y se deja para la búsqueda.
 */
function _categoriaUnanime(conteos) {
  if (!conteos) return "";
  var cats = [];
  for (var c in conteos) cats.push(c);
  if (cats.length !== 1) return "";
  return (ALLOWED_CATEGORIES.indexOf(cats[0]) !== -1 && cats[0] !== "Otro") ? cats[0] : "";
}

// Memo por ejecución. `detectCategory` se llama en bucles sobre miles de filas
// (recategorizeAll), así que el diccionario se lee una vez y se reusa.
var _webcatMemo = null;

function _webcatCargar() {
  if (_webcatMemo) return _webcatMemo;
  var todas = PropertiesService.getScriptProperties().getProperties();
  _webcatMemo = {};
  for (var k in todas) {
    if (k.indexOf(WEBCAT_PREFIX) !== 0 || k === WEBCAT_QUEUE_KEY) continue;
    try { _webcatMemo[k] = JSON.parse(todas[k]); } catch (e) { /* entrada corrupta: ignorar */ }
  }
  return _webcatMemo;
}

// Clave estable a partir del nombre del comercio. Normaliza para que
// "RAPPI COLOMBIA*DL" y "RAPPI COLOMBIA" compartan entrada.
function _webcatClave(comercio) {
  var norm = _webcatNormalizar(comercio);
  if (!norm) return null;
  var md5 = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, norm, Utilities.Charset.UTF_8);
  var hex = "";
  for (var i = 0; i < md5.length; i++) {
    var b = (md5[i] < 0 ? md5[i] + 256 : md5[i]).toString(16);
    hex += (b.length === 1 ? "0" : "") + b;
  }
  return WEBCAT_PREFIX + hex.slice(0, 16);
}

// Quita el ruido que los adquirentes le pegan al nombre: sufijos de canal
// (*DL, *CO), números de sucursal y códigos de ciudad al final. Lo que queda
// es lo que uno buscaría en Google.
function _webcatNormalizar(comercio) {
  var s = String(comercio == null ? "" : comercio).toUpperCase().trim();
  if (!s) return "";
  s = s.replace(/\*[A-Z]{1,3}\b/g, " ");          // RAPPI COLOMBIA*DL → RAPPI COLOMBIA
  s = s.replace(/\s+\d{3,}\s*$/, "");              // sucursal al final
  s = s.replace(/\s+(BOGOTA|MEDELLIN|CALI|BARRANQUILLA|CO|COL)\s*$/i, "");
  s = s.replace(/[^A-ZÁÉÍÓÚÑ0-9 ]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Categoría del diccionario web, o "" si no hay. Nunca hace red. */
function _webcatGet(comercio) {
  var clave = _webcatClave(comercio);
  if (!clave) return "";
  var e = _webcatCargar()[clave];
  if (!e) return "";
  if (e.c === WEBCAT_DESCONOCIDO) return "";
  return ALLOWED_CATEGORIES.indexOf(e.c) !== -1 ? e.c : "";
}

/** ¿Ya se intentó este comercio y sigue vigente el intento? */
function _webcatIntentado(comercio) {
  var clave = _webcatClave(comercio);
  if (!clave) return true;
  var e = _webcatCargar()[clave];
  if (!e) return false;
  if (e.c !== WEBCAT_DESCONOCIDO) return true;
  // Un desconocido se reintenta pasado un tiempo: el comercio pudo abrir web
  // o aparecer en directorios después del primer intento.
  var dias = (Date.now() - (e.t || 0)) / 86400000;
  return dias < WEBCAT_REINTENTO_D;
}

function _webcatPut(comercio, categoria, fuente) {
  var clave = _webcatClave(comercio);
  if (!clave) return;
  var entrada = {
    m: _webcatNormalizar(comercio),
    c: categoria || WEBCAT_DESCONOCIDO,
    t: Date.now(),
    f: fuente || "web"
  };
  PropertiesService.getScriptProperties().setProperty(clave, JSON.stringify(entrada));
  _webcatCargar()[clave] = entrada;
}

/**
 * Encola un comercio sin categorizar. Se llama desde la ingesta, así que tiene
 * que ser barato y no puede lanzar: un fallo acá no debe tumbar la captura de
 * la transacción.
 */
function _encolarComercioDesconocido(comercio) {
  try {
    if (!comercio || _webcatIntentado(comercio)) return;
    var sp = PropertiesService.getScriptProperties();
    var cola = JSON.parse(sp.getProperty(WEBCAT_QUEUE_KEY) || "[]");
    var norm = _webcatNormalizar(comercio);
    if (!norm || cola.indexOf(norm) !== -1) return;
    if (cola.length >= WEBCAT_MAX_COLA) return;
    cola.push(norm);
    sp.setProperty(WEBCAT_QUEUE_KEY, JSON.stringify(cola));
  } catch (e) {
    Logger.log("encolarComercioDesconocido: " + e);
  }
}

/**
 * `detectCategory` + encolado. Es la que usa la ingesta; `detectCategory` a
 * secas queda para los bucles de recategorización, que no deben encolar nada.
 */
function detectCategoryIngesta(comercio, userId) {
  var cat = detectCategory(comercio, userId);
  if (comercio && _webcatSinCategoria(cat)) _encolarComercioDesconocido(comercio);
  return cat;
}

/**
 * Le pregunta a Claude —con búsqueda web— a qué categoría pertenece un comercio.
 * Devuelve una de `ALLOWED_CATEGORIES` o "" si no se pudo determinar.
 *
 * Con herramientas de servidor la respuesta ya NO es `content[0].text`: llegan
 * bloques `server_tool_use` y `web_search_tool_result` intercalados, y el texto
 * final es el último bloque de tipo `text`. Por eso esto no puede reusar
 * `_callClaudeAI`.
 */
function _categorizeViaWebSearch(comercio) {
  var sp = PropertiesService.getScriptProperties();
  var key = sp.getProperty('ANTHROPIC_API_KEY');
  if (!key) throw new Error('ANTHROPIC_API_KEY no configurada');

  // `web_search_20260209` (con filtrado dinámico) exige Opus 4.6+ / Sonnet 4.6+:
  // NO corre sobre el Haiku que usa el resto del backend.
  //
  // Medido sobre 16 comercios reales del histórico (2026-08-12):
  //   opus-5    9/12 comercios resueltos, 4/4 no-comercios rechazados, ~$0.096 c/u
  //   sonnet-5 10/12 comercios resueltos, 4/4 no-comercios rechazados, ~$0.058 c/u
  // Opus queda de default aunque resuelva uno menos: se abstiene donde Sonnet
  // adivina, y una categoría equivocada ensucia el presupuesto sin que nadie se
  // entere, mientras que un "Otro" es visible. Cambiable por Script Property.
  var model = sp.getProperty('CLAUDE_CATEGORIZE_MODEL') || 'claude-opus-5';

  var systemPrompt =
    'Clasificas comercios colombianos en una categoría de gasto personal.\n' +
    'Busca en internet el nombre del comercio para saber a qué industria pertenece.\n' +
    'Categorías válidas (usa EXACTAMENTE una de estas cadenas):\n' +
    ALLOWED_CATEGORIES.join(', ') + '\n\n' +
    'Reglas:\n' +
    '- El nombre viene de un recibo bancario, así que puede estar abreviado o ' +
    'llevar códigos del adquirente. Busca el negocio real detrás del nombre.\n' +
    '- Prioriza fuentes colombianas: el mismo nombre puede ser otra cosa en otro país.\n' +
    '- Si la búsqueda no permite identificarlo con confianza razonable, responde ' +
    'DESCONOCIDO. Es preferible dejarlo sin categoría a inventar una: una ' +
    'categoría equivocada ensucia el presupuesto y el usuario no se entera.\n' +
    '- No uses "Otro" como respuesta: para eso está DESCONOCIDO.\n' +
    '- "Bre-B" es solo para transferencias por llave, nunca para un comercio.\n\n' +
    'Termina SIEMPRE con una última línea con este formato exacto:\n' +
    'CATEGORIA: <una de las categorías válidas, o DESCONOCIDO>';

  var mensajes = [{
    role: 'user',
    content: 'Comercio del recibo bancario: "' + comercio + '"\n' +
             '¿A qué categoría de gasto pertenece?'
  }];

  var texto = '';
  // Una búsqueda larga puede cortar el turno con `pause_turn`; se reanuda
  // devolviendo la respuesta parcial como turno del asistente.
  for (var intento = 0; intento < 3; intento++) {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      payload: JSON.stringify({
        model: model,
        max_tokens: 3000,
        output_config: { effort: 'low' },
        system: systemPrompt,
        // 3 búsquedas alcanzan para todos los casos que se resolvieron en la
        // medición; los que no se resuelven queman el tope sin llegar a nada,
        // así que subirlo solo encarece los fallos.
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        messages: mensajes
      }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    var body = resp.getContentText();
    var result;
    try {
      result = JSON.parse(body);
    } catch (parseErr) {
      throw new Error('Anthropic devolvió respuesta no-JSON (HTTP ' + code + '): ' + body.slice(0, 120));
    }
    if (code !== 200) {
      var apiErr = (result.error && result.error.message) || JSON.stringify(result).slice(0, 150);
      throw new Error('Claude API error ' + code + ': ' + apiErr);
    }

    // Los clasificadores de seguridad pueden declinar; no es un error HTTP.
    if (result.stop_reason === 'refusal') return '';

    var bloques = result.content || [];
    for (var i = 0; i < bloques.length; i++) {
      if (bloques[i].type === 'text' && bloques[i].text) texto = bloques[i].text;
    }

    if (result.stop_reason !== 'pause_turn') break;
    mensajes.push({ role: 'assistant', content: bloques });
  }

  var m = /CATEGORIA:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ\- ]+)/.exec(texto || '');
  if (!m) return '';
  var cat = m[1].trim();
  if (/^DESCONOCIDO$/i.test(cat)) return '';
  // La lista es la fuente de verdad: cualquier cosa fuera de ella se descarta.
  return ALLOWED_CATEGORIES.indexOf(cat) !== -1 && cat !== 'Otro' ? cat : '';
}

/**
 * Worker del trigger: drena la cola de comercios sin categoría, los busca en
 * internet y rellena las filas sin categorizar.
 *
 * Acotado por RELOJ, no por conteo. Una búsqueda con Opus puede encadenar hasta
 * tres consultas web, así que un lote de tamaño fijo no tiene una duración
 * predecible: basta con que unos cuantos comercios salgan lentos para pasarse
 * del límite de 6 minutos de Apps Script. Cuando eso pasa la ejecución muere sin
 * llegar al `setProperty` de la cola ni al relleno, así que el trabajo pagado se
 * pierde y la corrida siguiente lo repite — un bucle que no avanza. Ahora el
 * bucle se corta solo en `WEBCAT_MAX_MS` y devuelve a la cola lo que no alcanzó.
 *
 * Usa un lock para que dos corridas simultáneas no busquen el mismo comercio.
 */
function procesarColaCategorias() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('procesarColaCategorias: ya hay una corrida en curso');
    return { ok: true, omitido: 'lock' };
  }

  try {
    var sp = PropertiesService.getScriptProperties();
    var cola = JSON.parse(sp.getProperty(WEBCAT_QUEUE_KEY) || '[]');
    if (!cola.length) return { ok: true, buscados: 0, resueltos: 0, filas: 0, pendientes: 0 };

    var lote      = cola.slice(0, WEBCAT_MAX_POR_RUN);
    var resto     = cola.slice(WEBCAT_MAX_POR_RUN);
    var resueltos = {};
    var nBuscados = 0, nNuevos = 0, sinTiempo = 0;
    var t0 = Date.now();

    for (var i = 0; i < lote.length; i++) {
      var comercio = lote[i];

      // Ya intentado en una corrida anterior: no se vuelve a pagar la búsqueda,
      // pero SÍ entra al relleno. Sin esto, un comercio que quedó cacheado en una
      // corrida que murió antes de escribir la hoja se caía de la cola en la
      // corrida siguiente con sus filas todavía sin categorizar — para siempre.
      if (_webcatIntentado(comercio)) {
        var yaTenia = _webcatGet(comercio);
        if (yaTenia) resueltos[_webcatNormalizar(comercio)] = yaTenia;
        continue;
      }

      // Cortar por reloj antes de arrancar una búsqueda que no cabe.
      if (Date.now() - t0 > WEBCAT_MAX_MS) {
        resto = lote.slice(i).concat(resto);
        sinTiempo = lote.length - i;
        break;
      }

      try {
        var cat = _categorizeViaWebSearch(comercio);
        _webcatPut(comercio, cat, 'web');
        nBuscados++;
        if (cat) { resueltos[_webcatNormalizar(comercio)] = cat; nNuevos++; }
        Logger.log('webcat: ' + comercio + ' → ' + (cat || 'DESCONOCIDO'));
      } catch (e) {
        // Fallo transitorio (rate limit, red): NO se cachea y vuelve a la cola,
        // igual que la huella de ingesta se suelta ante un fallo transitorio.
        Logger.log('webcat error en "' + comercio + '": ' + e);
        resto.push(comercio);
      }
    }

    sp.setProperty(WEBCAT_QUEUE_KEY, JSON.stringify(resto));

    // El relleno corre si hay CUALQUIER respuesta disponible, nueva o cacheada.
    var filas = 0;
    for (var k in resueltos) { filas = _rellenarCategorias(resueltos); break; }

    Logger.log('procesarColaCategorias: ' + nBuscados + ' buscados, ' + nNuevos +
               ' resueltos, ' + filas + ' filas, ' + resto.length + ' pendientes' +
               (sinTiempo ? ' (' + sinTiempo + ' devueltos por reloj)' : ''));
    return {
      ok: true, buscados: nBuscados, resueltos: nNuevos,
      filas: filas, pendientes: resto.length, devueltosPorReloj: sinTiempo
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reescribe la categoría de las filas sin categorizar cuyo comercio ya quedó
 * resuelto. "Sin categorizar" es lo que define `_webcatSinCategoria`: vacío,
 * "Otro" u "Otros". Una categoría puesta a mano por el usuario o acertada por
 * las reglas no se pisa nunca.
 */
function _rellenarCategorias(resueltos) {
  var users = _getAllowedUsers();
  var tocadas = 0;

  for (var u = 0; u < users.length; u++) {
    var ref = _getSheet(users[u]);
    var sheet = ref && ref.sheet;
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var hdrs = data[0];
    var catCol      = hdrs.indexOf('Categoría');
    var comercioCol = hdrs.indexOf('Comercio');
    if (catCol < 0 || comercioCol < 0) continue;

    // Una sola escritura por hoja: leer todo, decidir en memoria, escribir la
    // columna completa. Escribir celda por celda sobre cientos de filas es lo
    // que hace que estas migraciones se pasen del límite de tiempo.
    var columna = [];
    var cambio = false;
    for (var i = 1; i < data.length; i++) {
      var actual = String(data[i][catCol] || '').trim();
      var nueva = actual;
      if (_webcatSinCategoria(actual)) {
        var clave = _webcatNormalizar(data[i][comercioCol]);
        if (clave && resueltos[clave]) { nueva = resueltos[clave]; tocadas++; cambio = true; }
      }
      columna.push([nueva]);
    }
    if (cambio) sheet.getRange(2, catCol + 1, columna.length, 1).setValues(columna);
  }
  return tocadas;
}

/**
 * Siembra la cola con los comercios que las hojas ya tienen sin categorizar
 * (vacío, "Otro" u "Otros" — ver `_webcatSinCategoria`).
 *
 * La cola solo se llena desde la ingesta, así que sin esto el feature arrancaría
 * mirando hacia adelante y dejaría intacto el histórico — que es justo donde
 * están los comercios acumulados. Correr una vez desde el editor de Apps Script
 * después de desplegar; es idempotente (lo ya intentado no se re-encola), así
 * que volver a correrla no hace daño.
 */
function encolarOtrosExistentes() {
  var users = _getAllowedUsers();
  var vistos = {};
  var candidatos = 0, porHoja = 0, porDiccionario = 0;

  for (var u = 0; u < users.length; u++) {
    var ref = _getSheet(users[u]);
    var sheet = ref && ref.sheet;
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) continue;
    var hdrs = data[0];
    var catCol      = hdrs.indexOf('Categoría');
    var comercioCol = hdrs.indexOf('Comercio');
    if (catCol < 0 || comercioCol < 0) continue;

    // Pasada 1: qué categoría le da ya la hoja a cada comercio.
    var conteos = {};
    for (var i = 1; i < data.length; i++) {
      var cActual = String(data[i][catCol] || '').trim();
      if (_webcatSinCategoria(cActual)) continue;
      var nA = _webcatNormalizar(data[i][comercioCol]);
      if (!nA) continue;
      if (!conteos[nA]) conteos[nA] = {};
      conteos[nA][cActual] = (conteos[nA][cActual] || 0) + 1;
    }

    // Pasada 2: rellenar lo que ya se puede contestar gratis, encolar el resto.
    // Una sola escritura por hoja, igual que en `_rellenarCategorias`.
    var columna = [];
    var cambio = false;
    for (var j = 1; j < data.length; j++) {
      var actual = String(data[j][catCol] || '').trim();
      var nueva = actual;

      if (_webcatSinCategoria(actual)) {
        var comercio = String(data[j][comercioCol] || '').trim();
        var norm = comercio ? _webcatNormalizar(comercio) : '';
        if (norm) {
          // La hoja manda sobre el diccionario: refleja las reglas y las
          // correcciones a mano del usuario sobre ese comercio exacto.
          var local = _categoriaUnanime(conteos[norm]);
          var dic   = local ? '' : _webcatGet(comercio);
          if (local)    { nueva = local; porHoja++;         cambio = true; }
          else if (dic) { nueva = dic;   porDiccionario++;  cambio = true; }
          else if (!vistos[norm]) {
            vistos[norm] = true;
            candidatos++;
            _encolarComercioDesconocido(comercio);
          }
        }
      }
      columna.push([nueva]);
    }
    if (cambio) sheet.getRange(2, catCol + 1, columna.length, 1).setValues(columna);
  }

  var cola = JSON.parse(PropertiesService.getScriptProperties().getProperty(WEBCAT_QUEUE_KEY) || '[]');
  Logger.log('encolarOtrosExistentes: ' + porHoja + ' filas resueltas por la propia hoja, ' +
             porDiccionario + ' por el diccionario, ' + candidatos +
             ' comercios encolados para buscar, ' + cola.length + ' en cola');
  return {
    ok: true, porHoja: porHoja, porDiccionario: porDiccionario,
    candidatos: candidatos, enCola: cola.length
  };
}

/** Diagnóstico: qué tiene el diccionario y qué quedó pendiente. */
function estadoCategoriasWeb() {
  var dic = _webcatCargar();
  var resueltos = [], desconocidos = [];
  for (var k in dic) {
    var e = dic[k];
    (e.c === WEBCAT_DESCONOCIDO ? desconocidos : resueltos).push(e.m + ' → ' + e.c);
  }
  var cola = JSON.parse(PropertiesService.getScriptProperties().getProperty(WEBCAT_QUEUE_KEY) || '[]');
  return {
    ok: true,
    resueltos: resueltos.sort(),
    desconocidos: desconocidos.sort(),
    enCola: cola
  };
}

function _spendingCoach(userId, months) {
  // Cache same-day result (CacheService pattern, ver _buildWidgetData) para que
  // getRetoSuggestion no recompute vía Claude cuando ya corrió spendingCoach hoy.
  var cache = CacheService.getScriptCache();
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var cacheKey = 'coach_' + userId + '_' + (months || 3) + '_' + today;
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var txns = _getTxnsRange(userId, months || 3);
  // Aggregate data for Claude (deterministic computation)
  var byCat = {};
  txns.forEach(function(t){
    var monto = Number(t['Monto (COP)'])||0;
    if (monto<=0 || String(t.Categoría||'')==='Ingreso') return;
    var cat = String(t.Categoría||'Otro');
    byCat[cat]=(byCat[cat]||0)+monto;
  });
  var topCats = Object.keys(byCat).sort(function(a,b){ return byCat[b]-byCat[a]; }).slice(0,5)
    .map(function(c){ return c+': '+_formatCOP(Math.round(byCat[c])); }).join(', ');
  var subs = _detectRecurring(txns).slice(0,5).map(function(s){ return _redactBrebKeyForAI(s.comercio)+'($'+s.monthlyAvg+'/mes)'; }).join(', ');
  var totalSpent = Object.values ? Object.values(byCat).reduce(function(s,v){return s+v;},0)
    : Object.keys(byCat).reduce(function(s,k){return s+byCat[k];},0);

  var systemPrompt = 'Eres un coach financiero amigable para un usuario colombiano. Analiza los datos y devuelve ÚNICAMENTE un JSON válido con esta estructura: {"insights":["insight1","insight2","insight3"],"suggestedReto":{"titulo":"string","tipo":"budget_limit|frequency_limit|no_spend","categorias":["Cat"],"objetivo":number,"razon":"string"}}. Los insights deben ser específicos con números reales. El reto debe ser el más impactante dado el perfil. Máx 80 palabras por insight. En español colombiano informal.';
  var userMsg = 'Datos del usuario (últimos ' + months + ' meses): Total gastado: ' + _formatCOP(Math.round(totalSpent)) + '. Por categoría: ' + topCats + '. Suscripciones detectadas: ' + (subs || 'ninguna') + '.';

  try {
    // Modelo configurable vía Script Properties (ver docs/CONVENTIONS.md: "el modelo va en env"); fallback al valor actual.
    var coachModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_COACH_MODEL') || 'claude-haiku-4-5-20251001';
    var rawText = _callClaudeAI(systemPrompt, userMsg, 800, coachModel);
    var jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: 'Claude no devolvió JSON válido' };
    var parsed = JSON.parse(jsonMatch[0]);
    var result = { ok: true, insights: parsed.insights || [], suggestedReto: parsed.suggestedReto || null };
    cache.put(cacheKey, JSON.stringify(result), CACHE_TTL_6H); // sirve para el resto del día
    return result;
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function _generateHealthReport(userId, month) {
  var targetMonth = month || Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
  var txns = _getTxnsRange(userId, 6);
  var monthTxns = txns.filter(function(t){ return String(t.Fecha||'').slice(0,7) === targetMonth; });
  var prevMonth = (function(){
    var d = new Date(targetMonth + '-01'); d.setMonth(d.getMonth()-1);
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM');
  })();
  var prevTxns = txns.filter(function(t){ return String(t.Fecha||'').slice(0,7) === prevMonth; });

  var sumCat = function(txArr) {
    var r = {};
    txArr.forEach(function(t){
      var m = Number(t['Monto (COP)'])||0; if(m<=0||String(t.Categoría||'')==='Ingreso') return;
      var c = String(t.Categoría||'Otro'); r[c]=(r[c]||0)+m;
    }); return r;
  };
  var catCurr = sumCat(monthTxns), catPrev = sumCat(prevTxns);
  var totalCurr = Object.keys(catCurr).reduce(function(s,k){return s+catCurr[k];},0);
  var totalPrev = Object.keys(catPrev).reduce(function(s,k){return s+catPrev[k];},0);
  var topCatsStr = Object.keys(catCurr).sort(function(a,b){return catCurr[b]-catCurr[a];}).slice(0,5)
    .map(function(c){return c+': '+_formatCOP(Math.round(catCurr[c]));}).join(', ');
  var subs = _detectRecurring(txns).slice(0,5).map(function(s){return _redactBrebKeyForAI(s.comercio)+'($'+s.monthlyAvg+'/mes)';}).join(', ');
  var budgets = JSON.parse(PropertiesService.getScriptProperties().getProperty('CAT_BUDGETS_' + userId + '_' + targetMonth) || '{}');
  var budgetStr = Object.keys(budgets).length ? Object.keys(budgets).map(function(c){
    var b=budgets[c], s=catCurr[c]||0; return c+': gastado '+_formatCOP(Math.round(s))+' de '+_formatCOP(Math.round(b))+'('+Math.round(s/b*100)+'%)';
  }).join('; ') : 'sin presupuestos configurados';

  var systemPrompt = 'Eres un asesor financiero generando un reporte mensual en español colombiano. Devuelve ÚNICAMENTE JSON con esta estructura exacta: {"resumenEjecutivo":"string","seccion1_gastos":"string","seccion2_tendencias":"string","seccion3_recomendaciones":["r1","r2","r3"],"proyeccion6meses":"string","scoreGeneral":number}. scoreGeneral es 0-100 basado en control de gastos y hábitos. Sé específico con números, usa lenguaje cercano pero profesional.';
  var userMsg = 'Mes: '+targetMonth+'. Total gastos: '+_formatCOP(Math.round(totalCurr))+'. Mes anterior: '+_formatCOP(Math.round(totalPrev))+'. Variación: '+(totalPrev?Math.round((totalCurr-totalPrev)/totalPrev*100)+'%':'N/A')+'. Por categoría: '+topCatsStr+'. Presupuestos: '+budgetStr+'. Suscripciones: '+(subs||'ninguna')+'.';

  try {
    // Modelo configurable vía Script Properties (ver docs/CONVENTIONS.md: "el modelo va en env"); fallback al valor actual.
    // NOTA: se mantiene en Sonnet a propósito — bajar a Haiku es una decisión de producto pendiente (ver TODOS.md).
    var reportModel = PropertiesService.getScriptProperties().getProperty('CLAUDE_HEALTH_REPORT_MODEL') || 'claude-sonnet-4-6';
    var rawText = _callClaudeAI(systemPrompt, userMsg, 2000, reportModel);
    var jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: 'Claude no devolvió JSON válido' };
    var report = JSON.parse(jsonMatch[0]);
    report.periodo = targetMonth;
    report.generadoEn = new Date().toISOString();
    return { ok: true, report: report };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ── CLUSTER 6: Widget Data ────────────────────────────────────────────
function _buildWidgetData(userId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'widget_' + userId;
  var cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  var txns = _getTxnsRange(userId, 1);
  var month = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM');
  var monthTxns = txns.filter(function(t){ return String(t.Fecha||'').slice(0,7) === month; });
  var totalGastos = monthTxns.filter(function(t){ return (Number(t['Monto (COP)'])||0) > 0 && String(t.Categoría||'') !== 'Ingreso'; })
    .reduce(function(s,t){ return s+(Number(t['Monto (COP)'])||0); },0);
  var sp = PropertiesService.getScriptProperties();
  var profile = sp.getProperty('APP_PROFILE_NAME_' + userId) || userId;
  var ultimasTxns = monthTxns.slice(0,5).map(function(t){
    return { monto: Number(t['Monto (COP)'])||0, comercio: String(t.Comercio||''), fecha: String(t.Fecha||'').slice(0,10) };
  });

  var result = { ok: true, mesActual: _monthName(month) + ' ' + month.slice(0,4),
    totalGastos: Math.round(totalGastos), ultimasTxns: ultimasTxns,
    timestamp: new Date().toISOString() };
  cache.put(cacheKey, JSON.stringify(result), 300); // 5 min cache
  return result;
}

// ── Triggers programables (ejecutar una vez desde el editor GAS) ──────
function createTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  var names = existing.map(function(t){ return t.getHandlerFunction(); });
  if (names.indexOf('sendWeeklySummaryTrigger') === -1)
    ScriptApp.newTrigger('sendWeeklySummaryTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  if (names.indexOf('sendFridayNudgeTrigger') === -1)
    ScriptApp.newTrigger('sendFridayNudgeTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(17).create();
  if (names.indexOf('sendUncategorizedReminderTrigger') === -1)
    ScriptApp.newTrigger('sendUncategorizedReminderTrigger').timeBased().onWeekDay(ScriptApp.WeekDay.TUESDAY).atHour(9).create();
  if (names.indexOf('checkLifestyleInflationTrigger') === -1)
    ScriptApp.newTrigger('checkLifestyleInflationTrigger').timeBased().onMonthDay(1).atHour(9).create();
  Logger.log('Triggers creados correctamente');
}

function sendWeeklySummaryTrigger() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try {
      var email = PropertiesService.getScriptProperties().getProperty('APP_ALERT_EMAIL_' + uid);
      if (!email) return;
      var txns = _getTxnsRange(uid, 1);
      var now = new Date();
      var weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
      var weekTxns = txns.filter(function(t){
        var d = new Date(String(t.Fecha||'')); return d >= weekAgo && d <= now && (Number(t['Monto (COP)'])||0) > 0 && String(t.Categoría||'') !== 'Ingreso';
      });
      if (!weekTxns.length) return;
      var total = weekTxns.reduce(function(s,t){ return s+(Number(t['Monto (COP)'])||0); },0);
      var byCat = {};
      weekTxns.forEach(function(t){ var c=String(t.Categoría||'Otro'); byCat[c]=(byCat[c]||0)+(Number(t['Monto (COP)'])||0); });
      var top = Object.keys(byCat).sort(function(a,b){return byCat[b]-byCat[a];}).slice(0,3)
        .map(function(c){ return c+': '+_formatCOP(Math.round(byCat[c])); }).join(' · ');
      // Check lifestyle inflation
      var analytics = _buildAnalytics(uid, { months: 4 });
      var inflMsg = analytics.inflationSignal && analytics.inflationSignal.detected ? '<p style="color:#f59e0b">⚠️ '+analytics.inflationSignal.message+'</p>' : '';
      MailApp.sendEmail({ to: email, subject: '📊 Tu semana financiera',
        htmlBody: '<div style="font-family:sans-serif;max-width:480px;margin:0 auto"><h2 style="color:#6366f1">Tu semana en números</h2><p>Gastaste <strong>'+_formatCOP(Math.round(total))+'</strong> esta semana.</p><p>'+top+'</p>'+inflMsg+'<p style="color:#94a3b8;font-size:11px">Finanzas Personales · resumen semanal</p></div>'
      });
    } catch(e) { Logger.log('sendWeeklySummary error para ' + uid + ': ' + e.message); }
  });
}

function sendFridayNudgeTrigger() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try {
      var email = PropertiesService.getScriptProperties().getProperty('APP_ALERT_EMAIL_' + uid);
      if (!email) return;
      var nudgeKey = 'NUDGE_LAST_' + uid;
      var sp = PropertiesService.getScriptProperties();
      var lastNudge = JSON.parse(sp.getProperty(nudgeKey) || '{}');
      var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
      if (lastNudge.date === today) return;
      var txns = _getTxnsRange(uid, 1);
      var restoCats = ['Restaurantes','Domicilios','Entretenimiento'];
      var fridaySpend = txns.filter(function(t){
        var d = new Date(String(t.Fecha||'')); var dow = d.getDay();
        return (dow===5||dow===6) && restoCats.indexOf(String(t.Categoría||''))!==-1 && (Number(t['Monto (COP)'])||0)>0;
      });
      if (fridaySpend.length >= 3) {
        var avg = Math.round(fridaySpend.reduce(function(s,t){ return s+(Number(t['Monto (COP)'])||0); },0)/fridaySpend.length);
        MailApp.sendEmail({ to: email, subject: '🍕 ¡Llega el viernes!',
          htmlBody: '<div style="font-family:sans-serif"><p>Son las 5pm del viernes. Los últimos 3 fines de semana gastaste en promedio <strong>'+_formatCOP(avg)+'</strong> en restaurantes y domicilios. ¿Lo tienes en tu presupuesto?</p><p style="color:#94a3b8;font-size:11px">Finanzas Personales</p></div>'
        });
        sp.setProperty(nudgeKey, JSON.stringify({ date: today, type: 'friday-restaurant' }));
      }
    } catch(e) { Logger.log('sendFridayNudge error para ' + uid + ': ' + e.message); }
  });
}

function sendUncategorizedReminderTrigger() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try {
      var email = PropertiesService.getScriptProperties().getProperty('APP_ALERT_EMAIL_' + uid);
      if (!email) return;
      var txns = _getTxnsRange(uid, 1);
      var weekAgo = new Date(Date.now() - 7*24*60*60*1000);
      var uncat = txns.filter(function(t){
        var d = new Date(String(t.Fecha||'')); return d >= weekAgo && (!t.Categoría || t.Categoría==='' || t.Categoría==='Otro');
      }).length;
      if (uncat >= 3) {
        MailApp.sendEmail({ to: email, subject: '🏷️ Tienes '+uncat+' transacciones sin categorizar',
          htmlBody: '<div style="font-family:sans-serif"><p>Tienes <strong>'+uncat+' transacciones</strong> sin categorizar esta semana. Categorizarlas mejora tu análisis financiero y te da XP.</p><p><a href="'+_getPwaUrl()+'">Abrir app →</a></p><p style="color:#94a3b8;font-size:11px">Finanzas Personales</p></div>'
        });
      }
    } catch(e) { Logger.log('sendUncategorizedReminder error para ' + uid + ': ' + e.message); }
  });
}

function checkLifestyleInflationTrigger() {
  var users = _getAllowedUsers();
  users.forEach(function(uid) {
    try {
      var email = PropertiesService.getScriptProperties().getProperty('APP_ALERT_EMAIL_' + uid);
      if (!email) return;
      var analytics = _buildAnalytics(uid, { months: 6 });
      var inf = analytics.inflationSignal;
      if (inf && inf.detected) {
        MailApp.sendEmail({ to: email, subject: '📈 Alerta: tu gasto sube cada mes',
          htmlBody: '<div style="font-family:sans-serif"><p>⚠️ <strong>'+inf.message+'</strong></p><p>Tus totales recientes: '+inf.months.map(function(m,i){ return _monthName(m)+': '+_formatCOP(inf.totals[i]||0); }).join(' → ')+'</p><p><a href="'+_getPwaUrl()+'">Ver análisis →</a></p><p style="color:#94a3b8;font-size:11px">Finanzas Personales</p></div>'
        });
      }
    } catch(e) { Logger.log('checkLifestyleInflation error para ' + uid + ': ' + e.message); }
  });
}
