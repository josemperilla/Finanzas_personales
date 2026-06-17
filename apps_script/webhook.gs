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
    newSheet.appendRow(["Timestamp","Fecha","Banco","Tipo","Monto (COP)","Comercio","Tarjeta/Cuenta","Categoría","SMS_Original","Fuente","Nota"]);
    newSheet.getRange(1,1,1,11).setFontWeight("bold").setBackground("#f3f3f3");
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

// Verifica PIN contra el valor almacenado. Acepta formato hasheado Y texto plano (legado).
function _verifyPin(userId, pin, stored) {
  if (!stored || !pin) return false;
  if (stored.indexOf("sha256:") === 0) {
    var parts = stored.split(":");
    if (parts.length !== 3) return false;
    return _computePinHash(userId, parts[1], pin) === parts[2];
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
  var hour = Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd-HH");
  var rlKey = "rl_redeem_" + hour;
  var n = parseInt(cache.get(rlKey) || "0", 10);
  if (n >= 30) return jsonResponse({ ok: false, error: "Demasiados intentos. Intenta más tarde." });
  cache.put(rlKey, String(n + 1), 3600);

  var key = _normalizeCode(payload.code);
  if (!key) return jsonResponse({ ok: false, error: "Código requerido" });

  var codeRlKey = "rl_redeem_code_" + key;
  var cn = parseInt(cache.get(codeRlKey) || "0", 10);
  if (cn >= 8) return jsonResponse({ ok: false, error: "Demasiados intentos. Intenta más tarde." });
  cache.put(codeRlKey, String(cn + 1), 3600);

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
  var today = Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd");
  var key = "rate_" + action + "_" + (userId || "global") + "_" + today;
  var count = parseInt(cache.get(key) || "0", 10);
  var limits = { chat: 100, voice: 50, admin: 100 };
  var limit = limits[action] !== undefined ? limits[action] : 100;
  if (count >= limit) {
    var msg = (action === "chat" || action === "voice")
      ? "Límite diario de llamadas de IA alcanzado. Intenta mañana."
      : "Límite diario de operaciones alcanzado. Intenta mañana.";
    throw new Error(msg);
  }
  cache.put(key, String(count + 1), 86400);
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
  CacheService.getScriptCache().put("tok_" + token, String(userId), 21600);
  return token;
}
function _userFromToken(token) {
  if (!token) return null;
  var cache = CacheService.getScriptCache();
  var uid = cache.get("tok_" + token);
  if (!uid) return null;
  cache.put("tok_" + token, uid, 21600); // refresco deslizante mientras este activo
  return uid;
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
    return jsonResponse({ ok: true, data: getTransactions(userId) });
  }

  if (action === "cards") {
    return jsonResponse({ ok: true, data: _getCards(userId) });
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
      var pinRlKey = "rl_pin_" + claimedUserId + "_" + Utilities.formatDate(new Date(), 'America/Bogota', "yyyy-MM-dd-HH");
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
      pinCache.put(pinRlKey, String(parseInt(pinCache.get(pinRlKey) || "0", 10) + 1), 3600);
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

    // -- A partir de aqui toda accion exige autenticacion real --
    var userId = _authUserId(e, channel, payload);
    if (!userId) return jsonResponse({ ok: false, error: "Unauthorized" });
    _validateUserId(userId);

    // Rate-limit admin write operations para mitigar abuso incluso con token válido.
    var ADMIN_TYPES = ["generateEmergencyPin","listUsers","createUser","createInvite","listInvites","listUsersData","disableUser","enableUser","revokeInvite","resetPin","deleteUser"];
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
        categoria:    payload.categoria || detectCategory(payload.comercio || "", userId),
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
      var comercioAprendido = updateCategoryInSheet(ts, cat, userId);
      // Guardar aprendizaje {comercio → categoría} para mejorar detección futura
      if (comercioAprendido) {
        var learnKey = "CATEGORY_LEARN_" + userId;
        var learnProps = PropertiesService.getScriptProperties();
        var learned = JSON.parse(learnProps.getProperty(learnKey) || "{}");
        learned[normalizeComercio(comercioAprendido).toUpperCase()] = cat;
        learnProps.setProperty(learnKey, JSON.stringify(learned));
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
      if (_getAllowedUsers().length >= 10) return jsonResponse({ ok: false, error: "Límite de 10 usuarios alcanzado en el plan de Sheets. Migra al backend FastAPI antes de agregar más." });
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
      if (_getAllowedUsers().length >= 10) return jsonResponse({ ok: false, error: "Límite de 10 usuarios alcanzado en el plan de Sheets. Migra al backend FastAPI antes de agregar más." });
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
      parsedNotif.categoria    = detectCategory(parsedNotif.comercio, userId);
      parsedNotif.sms_original = "PUSH | " + title + " | " + body;
      parsedNotif.fuente       = "notification";

      appendToSheet(parsedNotif, userId);
      return jsonResponse({ ok: true, data: parsedNotif });
    }

    // Cuenta transacciones sin categorizar (tipo: "uncategorizedCount")
    if (type === "uncategorizedCount") {
      var ss2    = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
      var tab2   = ss2.getSheetByName(userId);
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
      var ss3    = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("SHEET_ID"));
      var tab3   = ss3.getSheetByName(userId);
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

    if (!parsed) {
      // Banco conocido pero formato SMS no reconocido — intenta AI fallback.
      // VETO_RULES ya descartó promocionales/OTP, así que es probable un nuevo
      // formato transaccional que el banco introdujo.
      var aiFallback = parseSmsFallback(sms);
      if (!aiFallback) return jsonResponse({ ok: false, error: "parse failed", bank: resolvedBank });
      if (aiFallback.skipped) return jsonResponse({ ok: true, skipped: true, reason: "not a transaction (AI)" });
      parsed = aiFallback;
    }

    // Reversal: find and delete the original transaction instead of adding a new row
    if (parsed.reversal) {
      var removed = reverseTransaction(parsed, userId);
      return jsonResponse({ ok: true, reversed: true, found: removed });
    }

    parsed.timestamp    = new Date();
    parsed.categoria    = parsed.income ? 'Ingreso' : detectCategory(parsed.comercio, userId);
    delete parsed.income;
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
  var systemPrompt = "Extrae la informaci\u00f3n de una transacci\u00f3n financiera en pesos colombianos. " +
    "Responde ÚNICAMENTE con un objeto JSON v\u00e1lido con exactamente estos campos: " +
    "monto (n\u00famero sin s\u00edmbolos ni puntos de miles, ej: 50000), " +
    "comercio (nombre del lugar o descripci\u00f3n, string), " +
    "categoria (una de: Restaurantes, Domicilios, Mercado, Transporte, Hogar, Salud, Deporte, Compras, Suscripciones, Viajes, Software, Bre-B, Entretenimiento, Otro), " +
    "banco (Bogot\u00e1 o Ita\u00fa u Otro), " +
    "tipo (Compra, D\u00e9bito, Transferencia u Otro). " +
    "Si alg\u00fan campo no est\u00e1 claro en el texto, usa el valor m\u00e1s probable.";

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
  var systemPrompt = "Eres un asistente financiero personal del usuario. El usuario habla espa\u00f1ol colombiano. " +
    "Responde siempre en espa\u00f1ol. Puedes responder cualquier pregunta sobre los datos financieros del usuario, " +
    "sin importar qu\u00e9 tan espec\u00edfica o abierta sea. " +
    "Cuando el an\u00e1lisis lo requiera, s\u00e9 detallado y usa listas o vi\u00f1etas para mayor claridad. " +
    "Tienes acceso a la lista completa de transacciones en 'transacciones' y tambi\u00e9n a res\u00famenes pre-calculados " +
    "como 'comerciosPorCategoria' que ya agrupa los comercios por categor\u00eda con monto y n\u00famero de compras. " +
    "Usa los datos m\u00e1s convenientes para responder con precisi\u00f3n. " +
    "Datos financieros del usuario (\u00faltimos 6 meses): " + JSON.stringify(context);

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
  /Se realizo\s+Transferencia\s+de tu\s+Cuenta de Ahorros/i,
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
  return null;
}

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
    banco:    "AV Villas",
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
  var key = PropertiesService.getScriptProperties().getProperty("ANTHROPIC_API_KEY");
  if (!key) return null;

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

  try {
    var resp = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         key,
        "anthropic-version": "2023-06-01"
      },
      payload: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system:     systemPrompt,
        messages:   [{ role: "user", content: sms }]
      }),
      muteHttpExceptions: true
    });

    var result  = JSON.parse(resp.getContentText());
    var content = result.content && result.content[0] && result.content[0].text;
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
  var re = /Tu\s+(\w+)\s+por\s+([\d,.]+)\s+fue\s+\w+\s+con\s+(Tarjeta\s+(?:Cr[e\u00e9]dito|D[e\u00e9]bito)|Cuenta)\s+(\d+)\s+el\s+(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})\s+en\s+(.+?)(?:\s*[¿?]Dudas|$)/i;
  var m = sms.match(re);
  if (!m) return null;

  return {
    banco:    "Bogot\u00e1",
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
      banco:    "Ita\u00fa",
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
      banco:    "Ita\u00fa",
      tipo:     normalizeTipo(md[1]),
      comercio: md[2].trim(),
      tarjeta:  md[2].trim() + " ****" + md[3],
      monto:    parseMonto(md[4]),
      fecha:    parseFechaItau(md[5], md[6]),
      reversal: false
    };
  }

  // Inbound: deposit / abono TO account ("a tu Cuenta")
  // "Se realizo un Deposito en Efectivo a tu Cuenta de Ahorros ****8448 por $1,000 el 2026/06/14 06:27:00"
  var reCredit = /Se realizo\s+u?n?\s+(Deposito\s+en\s+Efectivo|Abono|Consignaci[o\u00f3]n|Ingreso)\s+a\s+tu\s+(Cuenta de (?:Ahorros|Corriente))\s+\*+(\d+)\s+por\s+\$([\d,.]+)\s+el\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{2}:\d{2}:\d{2})/i;
  var mc = sms.match(reCredit);
  if (mc) {
    return {
      banco:    "Ita\u00fa",
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

  // Check user-learned mappings first (from manual corrections)
  if (userId) {
    var learned = JSON.parse(PropertiesService.getScriptProperties().getProperty("CATEGORY_LEARN_" + userId) || "{}");
    var normalized = normalizeComercio(merchant).toUpperCase();
    if (learned[normalized]) return learned[normalized];
    // Also try exact match on raw merchant name
    if (learned[m]) return learned[m];
  }

  var rules = [
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
    if (Math.abs(cellMs - targetMs) < 2000) {
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

  var fecha = data.fecha ? Utilities.formatDate(data.fecha, 'America/Bogota', "yyyy-MM-dd HH:mm:ss") : "";

  sheet.appendRow([
    Utilities.formatDate(data.timestamp, 'America/Bogota', "yyyy-MM-dd HH:mm:ss"),
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
//   1. Abre script.google.com → proyecto Finanzas
//   2. En el menú de funciones, selecciona "resetAdminPin"
//   3. Clic en ▶ Run
// Esto fija el PIN de jose a 1028 sin necesitar sesión activa.
function resetAdminPin() {
  var userId = "jose";
  var newPin = "1028";
  PropertiesService.getScriptProperties().setProperty(
    "APP_PIN_" + userId,
    _hashPin(userId, newPin)
  );
  Logger.log("✓ PIN de " + userId + " establecido en " + newPin);
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
        parsed.categoria    = detectCategory(parsed.comercio, userId);
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
      banco:   "Ita\u00fa",
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
  var smsBogota       = "Banco de Bogota: Tu compra por 130,456 fue aprobada con Tarjeta Cr\u00e9dito 8645 el 30/05/26 15:11:08 en COUNTRY CLUB DE BOGOTA ¿Dudas? Llama a la Servilinea";
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
  var date    = Utilities.formatDate(new Date(), "America/Bogota", "yyyy-MM-dd");

  // Encontrar o crear carpeta "Finanzas Backup" en Drive
  var folders = DriveApp.getFoldersByName("Finanzas Backup");
  var folder  = folders.hasNext() ? folders.next() : DriveApp.createFolder("Finanzas Backup");

  var backed = 0;
  users.forEach(function(uid) {
    var tab = ss.getSheetByName(uid);
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
    + "<tr><td style='padding:6px 0;color:#64748b'>Fecha</td><td>" + (tx.fecha ? Utilities.formatDate(tx.fecha, 'America/Bogota', "dd/MM/yyyy HH:mm") : "—") + "</td></tr>"
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

  var weekStr = Utilities.formatDate(lastMon, 'America/Bogota', "dd MMM")
    + " – " + Utilities.formatDate(lastSun, 'America/Bogota', "dd MMM yyyy");

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
