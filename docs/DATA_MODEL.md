# Modelo de datos — Finanzas Personales

Contratos de datos y estado. Lee esto antes de tocar persistencia o añadir un campo. Fuente
única: no se duplica en otros docs.

## 1. Google Sheets — la base transaccional

Una sola spreadsheet (Script Property `SHEET_ID`), **un tab por usuario** (el `userId` en minúsculas).
Cabecera fija (la crea `_provisionUser`; `_migrateSheetHeaders` la repara en instalaciones viejas):

| # | Columna | Tipo | Notas |
|---|---|---|---|
| 1 | `Timestamp` | Date (ms) | **Clave primaria**. Búsqueda/edición/borrado con tolerancia ±2s. |
| 2 | `Fecha` | string `YYYY-MM-DD` | Fecha bancaria (puede diferir del `Timestamp` de captura). |
| 3 | `Banco` | string | Valor de `CANONICAL_BANCO`: `Bancolombia` \| `Banco de Bogotá` \| `Davivienda` \| `Nequi` \| `Daviplata` \| `AV Villas` \| … Ver §1.1. |
| 4 | `Tipo` | string | `Compra` \| `Retiro` \| `Transferencia` \| `Abono` \| … (normalizado por `normalizeTipo`) |
| 5 | `Monto (COP)` | number | Entero positivo en COP. Formato COL vs US por banco (ver `jose_qa.md` §4.3). |
| 6 | `Comercio` | string | Normalizado por `normalizeComercio` (limpieza de marca). |
| 7 | `Tarjeta/Cuenta` | string | Últimos 4 / cuenta. Alimenta filtros y `_getCards`. |
| 8 | `Categoría` | string | **Debe estar en `ALLOWED_CATEGORIES`** (allowlist, anti inyección). |
| 9 | `SMS_Original` | string | Texto crudo del SMS/notificación (auditoría). |
| 10 | `Fuente` | string | `sms` \| `notification` \| `email` \| `manual` \| `apple_pay` \| `google_pay`. `isSmsTx` lo usa. |
| 11 | `Nota` | string | Nota libre del usuario. |

> **Ingreso vs gasto** se deriva, no se persiste: `isIncomeTx(tx)` = (`Categoría === 'Ingreso'`) **o**
> (`Tipo ∈ INCOME_TIPOS = {Depósito, Abono, Consignación, Crédito, Ingreso, Nómina}`). `isGasto = !isIncomeTx`.

### 1.1 El nombre del banco es un contrato, no una etiqueta

Un **producto** (una tarjeta, una cuenta) se identifica por `banco|ultimos4` —
es literalmente `productKey()` en `pwa/src/lib/personalProducts.ts`. Si el mismo
plástico llega con dos nombres de banco distintos, la PWA lo muestra como **dos
productos separados** y los totales por producto quedan partidos.

Por eso el nombre visible tiene que ser idéntico en **cinco** lugares. Cambiar
uno solo reintroduce el bug:

| Dónde | Qué es |
|---|---|
| `CANONICAL_BANCO` (`apps_script/webhook.gs`) | Lo que se escribe en la columna `Banco` |
| `cards_<userId>` (Script Properties) | Catálogo de productos que sirve `action=cards` |
| `BANKS` (`pwa/src/lib/banks.ts`) | Selector al crear cuenta y al editar transacción |
| `BANK_DISPLAY` (`pwa/src/components/ImportarExtracto.tsx`) | Banco que se escribe al importar un extracto |
| `JOSE_DEFAULT_PRODUCTS` (`pwa/src/lib/personalProducts.ts`) | Productos sembrados del usuario |

**Banco de Bogotá compró a Itaú (2026).** Las tarjetas `****8439` y `****8448`
pasaron a ser productos de Banco de Bogotá, así que `CANONICAL_BANCO.bogota` y
`.itau` valen los dos `"Banco de Bogotá"` — una entidad con varios productos.
`Itaú` ya no es un valor válido de la columna `Banco`.

La lógica que necesita saber que un mensaje llegó **con formato Itaú** (las
guardas de `mergeBrebDuplicate`) usa `_bankKey === "itau"`, nunca el nombre
visible. Distinguir formato de marca es lo que permite que el banco se renombre
sin romper el parseo.

`migrarProductosYDuplicados()` repara los cinco lugares de una pasada y es
idempotente; correrla dos veces no hace nada la segunda.

## 2. Script Properties (config + estado en GAS)

Set/get vía `PropertiesService.getScriptProperties()`. Sensibles a mayúsculas.

| Propiedad | Propósito |
|---|---|
| `SHEET_ID` | ID de la spreadsheet compartida. **Requerida.** |
| `USERS_LIST` | JSON array de userIds. Gestiona `_provisionUser`/`_deprovisionUser`. Fallback `["jose","dani"]`. |
| `APP_PIN_<id>` | Hash de PIN `sha256:<salt>:<hex>` (auto-upgrade de texto plano al 1er login). |
| `APP_PIN_SALT_<id>` | (si aplica) salt del PIN. |
| `EMERGENCY_PIN_<id>` | JSON `{code, expiry}` (24h, un solo uso). |
| `INVITES` | JSON map `code → {userId, displayName, expiry, used}`. |
| `RULES_<id>` | JSON array de reglas de categorización del usuario `{pattern, category, priority}` (prioridad alta). |
| `CATEGORY_LEARN_<id>` | JSON map de learnings manuales (comercio normalizado → categoría). |
| `ADMIN_USER` | Override del admin id (default `"jose"`). |
| `WEBHOOK_SECRET` | Secreto del canal shortcut (iOS Shortcut). |
| `WEB_SECRET` | Secreto del canal web (proxy Cloudflare). |
| `ANTHROPIC_API_KEY` | Clave de Anthropic para `_callClaudeAI`. |
| `CLAUDE_DEFAULT_MODEL` | Modelo por defecto de `_callClaudeAI` (fallback `claude-haiku-4-5-20251001`). |
| `CLAUDE_VOICE_MODEL` | Modelo para `parseVoice` (transcripción de voz). Default Haiku. |
| `CLAUDE_CHAT_MODEL` | Modelo para `handleChat` (asistente financiero; usa prompt caching). Default Haiku. |
| `CLAUDE_SMS_MODEL` | Modelo para `parseSmsFallback` (parser IA de SMS no reconocidos). Default Haiku. |
| `CLAUDE_COACH_MODEL` | Modelo para `_spendingCoach` (insights + retos). Default Haiku. |
| `CLAUDE_HEALTH_REPORT_MODEL` | Modelo para `_generateHealthReport` (reporte mensual; Default Sonnet — decisión de producto, ver TODOS.md). |
| `CLAUDE_CATEGORIZE_MODEL` | Modelo para `_categorizeViaWebSearch`. Default `claude-opus-5`. **No puede ser Haiku:** `web_search_20260209` exige Opus 4.6+/Sonnet 4.6+. |
| `WEBCAT_<hash16>` | Entrada del diccionario de comercios resueltos por búsqueda web. Clave = MD5 del nombre normalizado. Valor JSON `{m: normalizado, c: categoría o "?", t: timestamp, f: fuente}`. `"?"` es la **caché negativa** (se reintenta a los 45 días); una categoría resuelta no caduca nunca. |
| `WEBCAT_QUEUE` | JSON array de comercios normalizados pendientes de buscar. Tope 200. Lo llena la ingesta (`detectCategoryIngesta`) y lo drena el trigger `procesarColaCategorias` (cada 15 min, 12 por corrida). |
| `APP_USER_DISABLED_<id>` | `"true"` → usuario bloqueado. |
| `APP_PROFILE_NAME_<id>` / `APP_PROFILE_AVATAR_<id>` | Perfil cross-device (sincronizado). |
| `APP_ALERT_EMAIL_<id>` / `APP_ALERT_THRESHOLD_<id>` | Alertas de gasto por email. |
| `APP_WEEKLY_DIGEST_<id>` | JSON de configuración del digest semanal. |
| `CAT_BUDGETS_<id>` | JSON de presupuestos por categoría. |
| `NET_WORTH_<id>` | JSON del historial de patrimonio neto. |
| `CASHBACK_<id>` | JSON del tracker de cashback. |
| `MOOD_HISTORY_<id>` | JSON del historial de mood. |
| `LAST_SMS_AT_<id>` | Timestamp del último SMS procesado (dedup). |
| `GMAIL_USER_ID` | Usuario asociado al Gmail trigger (mono-cuenta). |

## 3. CacheService (rate limiting + sesiones)

| Key pattern | Uso |
|---|---|
| `rl_pin_<id>_<yyyy-MM-dd-HH>` | Contador de intentos de PIN (límite 20/h). TTL 3600s. |
| `rl_invite_*`, `rl_admin_*` | Rate limits de invitaciones y admin. |
| `sess_<token>` | Token de sesión → userId (TTL 6h). Emitido por `_issueToken`, validado por `_userFromToken`/`validateToken`. |

## 4. localStorage (estado por dispositivo — PWA)

Prefijo `fm_`. **Limitación documentada: NO sincroniza entre dispositivos** (gamificación,
presupuestos, net worth, cashback viven aquí salvo que el backend los persista en Script Properties).

| Key | Contenido |
|---|---|
| `fm_token_<id>` | Token de sesión GAS (sobrevive reinicios, desbloqueo biométrico). |
| `fm_known_profiles`, `fm_profile` | Perfiles conocidos / activo. |
| `fm_nickname_<id>`, `fm_avatar_<id>` | Nombre/avatar locales. |
| `fm_theme`, `fm_color_scheme`, `fm_accessible_<id>` | Tema claro/oscuro, modo accesible. |
| `fm_gamification_<id>`, `fm_visits_<id>`, `fm_xp_rewarded_<id>` | XP, racha, badges. |
| `fm_meta_<id>` | Meta de gasto mensual. |
| `fm_budgets_<id>` (`fm_budgets_shared`) | Presupuestos por categoría. |
| `fm_retos_<id>`, `fm_desafio_<id>`, `fm_reto_semana_<id>` | Retos/desafíos. |
| `fm_suenos_<id>` | Lista de sueños/metas. |
| `fm_networth_history_<id>` | Historial de patrimonio (espejo local). |
| `fm_learned_<id>` | Learnings de merchant (correcciones de categoría). |
| `fm_default_bank`, `fm_tab_order_<id>` | Preferencias de UI. |
| `fm_pin_lockout_<id>`, `fm_unlocked_<id>` | Estado de bloqueo/desbloqueo del PIN local. |
| `fm_webauthn_cred_<id>` | Credencial WebAuthn (desbloqueo biométrico). |
| `fm_sms_verified_<id>`, `fm_canales_<id>`, `fm_tutorial_seen_<id>` | Onboarding de canales SMS. |
| `fm_anomaly_seen_<id>`, `fm_recap_seen_<id>`, `fm_greeting_seen_<id>` | Flags de UX (no repetir). |

## 5. El contrato de categorías (cross-layer)

**Fuente de verdad = `webhook.gs:ALLOWED_CATEGORIES`** (allowlist que `updateCategoryInSheet` usa
como compuerta; una categoría fuera de la lista se **rechaza** al persistir):

```
Restaurantes · Domicilios · Mercado · Transporte · Hogar · Salud · Deporte · Compras ·
Suscripciones · Viajes · Software · Bre-B · Entretenimiento · Otro
```

- `pwa/src/lib/config.ts:CATEGORIES` es un **espejo** (nombre + color + icono) solo para render
  inmediato del picker antes de fetchar. **No** es autoritativo.
- `detectCategory(merchant, userId)` asigna por keyword, pero **no** define la lista completa: hay
  categorías que se asignan por otros caminos (campo `Tipo`, prompt de Haiku, edición manual,
  `RULES_<id>` del usuario). Por eso el check de drift ancla en `ALLOWED_CATEGORIES`.
- **Al añadir/quitar una categoría:** edita `ALLOWED_CATEGORIES` **Y** `CATEGORIES`, y corre
  `node scripts/check-category-drift.mjs`. Hoy **no hay drift**, y el check **bloquea el merge**
  en CI (job `drift-check`, sin `continue-on-error`).

`normalizeCategory()` (`pwa/src/lib/config.ts` — vive en la PWA, no en GAS) mapea nombres
obsoletos a los nuevos (`Comida`→`Restaurantes`, `Ropa`→`Compras`, `Otros`→`Otro`, …). Es solo
para **render**: no reescribe la hoja.

### 5.1 "Sin categorizar" son tres valores, no uno

`Otro` no es la única forma en que una fila queda sin clasificar, y asumir que sí lo era dejó
fuera a más de la mitad del histórico cuando se construyó la categorización por búsqueda web:

| valor en la celda | de dónde sale |
|---|---|
| `Otro` | fallback de `detectCategory` |
| **vacío** | import retroactivo de extractos (`Fuente: MANUAL`), que nunca escribió categoría |
| **`Otros`** | tanda vieja con el plural; está **fuera** de `ALLOWED_CATEGORIES` |

`webhook.gs:_webcatSinCategoria()` es el predicado único. Cualquier otro valor —incluso uno
fuera del allowlist, como `Seguros` o `Transferencia`— es la decisión de alguien y **no se
toca**: pisarlo pierde información en vez de ganarla.

### 5.2 Categorización de comercios nuevos por búsqueda web

Cuando ninguna regla reconoce un comercio, se busca en internet **una vez en la vida** y el
resultado queda en el diccionario `WEBCAT_*` (§2). La búsqueda **no corre en la ingesta** —el
iOS Shortcut espera la respuesta del webhook y 5-15 s de búsqueda le agregarían latencia y un
modo de falla nuevo al camino crítico—: `detectCategoryIngesta` encola y el trigger resuelve
aparte, así que la categoría aparece a los pocos minutos.

El relleno solo toca filas que cumplan `_webcatSinCategoria`, así que nunca pisa una categoría
puesta a mano.

**No todo se busca.** `encolarOtrosExistentes()` resuelve en tres niveles, de más barato a más
caro, y solo llega al último si los dos anteriores no contestan:

1. **La propia hoja** (`_categoriaUnanime`) — si el mismo comercio ya está clasificado en otras
   filas y todas coinciden, esa gana. Gratis, y evita partir un comercio en dos categorías del
   presupuesto. Si las filas existentes **no** coinciden, no se adivina: pasa al siguiente nivel.
2. **El diccionario `WEBCAT_*`** — ya se pagó por esa respuesta.
3. **Búsqueda web** — solo para lo que nadie sabe todavía.

El worker se corta **por reloj** (`WEBCAT_MAX_MS`, 4 min), no por conteo: una búsqueda con Opus
puede encadenar hasta tres consultas web, así que un lote de tamaño fijo no tiene duración
predecible. Si la ejecución muriera pasada de tiempo, el trabajo pagado se perdería sin llegar a
escribirse. Un comercio que ya está en el diccionario **entra al relleno igual**, sin re-buscarse.

Tres funciones se corren **a mano desde el editor de Apps Script** (`clasp run` no sirve: el
proyecto no está desplegado como API executable):

| función | para qué |
|---|---|
| `setupCategoriasWebTrigger()` | crea el trigger de 15 min. Una sola vez. |
| `encolarOtrosExistentes()` | reconcilia el histórico sin categorizar. Idempotente. |
| `estadoCategoriasWeb()` | diagnóstico: resueltos, desconocidos y cola pendiente. |

## 6. Contrato de proveedores / conectores de facturas

- `pwa/src/lib/providers.ts:PROVIDERS` — catálogo semilla (id, nombre, servicio, categoría, urlPago,
  `requiereCuenta`, `tieneConector`). El picker de Facturas se arma sobre esta lista.
- `apps_script/connectors_facturas.gs:FACTURA_CONNECTORS` — registry `providerId → fn`.
- `extension/providers.js:PROVIDER_DOMAINS` — **3ª fuente de `providerId`**: la extensión del
  navegador mapea el dominio del portal (ej. `enel.com.co`) a un `providerId` para extraer la
  factura y enviarla vía `/api/proxy`. Todo `providerId` aquí debe existir en `PROVIDERS`
  (catálogo canónico). El drift lo detecta `scripts/check-provider-drift.mjs`.
- **`tieneConector` (UI) ↔ clave presente en `FACTURA_CONNECTORS` (backend).** Mantener en sync.
  Hoy todos los proveedores tienen `tieneConector: false` y los conectores son esqueletos que
  devuelven `ok:false` (la PWA cae a entrada manual — **nunca** inventa un monto).

## 7. API del webhook (resumen — contrato `type`/`action`)

GET (`?action=`): `transactions` (filtros: `months`, `search`, `startDate`, `endDate`, `card`),
`cards`, `analytics`, `widgetData`.

POST (`{type, ...}`), ~45 acciones — agrupadas:
- **Arranque/auth:** `hasPin`, `validatePin`, `setupPin`, `changePin`, `resetPin`, `generateEmergencyPin`,
  `validateToken`, `redeemInvite`, `lastSmsSeen`.
- **Usuarios (admin):** `listUsers`, `listUsersData`, `createUser`, `deleteUser`, `disableUser`,
  `enableUser`, `createInvite`, `listInvites`, `revokeInvite`, `migrateCategories`.
- **Transacciones:** `manual`, `voice`, `notification`, `chat`, `updateCategory`, `updateTransaction`,
  `deleteTransaction`, `uncategorizedCount`, `monthSummary`.
- **Tarjetas:** `saveCard`, `deleteCard`.
- **Pagos fijos:** `getFixedCalendar`, `saveFixedPayment`, `deleteFixedPayment`, `refreshFixedPayment`,
  `autoDetectFixed`.
- **Reglas de categorización:** `getRules`, `deleteRule`.
- **Presupuestos:** `getCategoryBudgets`, `setCategoryBudget`, `deleteCategoryBudget`.
- **Patrimonio / cashback / mood:** `getNetWorth`, `saveNetWorthEntry`, `deleteNetWorthEntry`,
  `getCashback`, `updateCashback`, `deleteCashback`, `recordCashbackEarned`, `saveMood`, `getMoodHistory`.
- **IA:** `spendingCoach`, `getRetoSuggestion`, `generateHealthReport`.

Respuesta estándar: `{ ok: true|false, data|error|..., [token], [userId] }`. La PWA valida
`json.ok` y lanza `json.error` si es falso. El `userId` y el `token` se inyectan en el body por
`withUser`/`withAuth` en `lib/api.ts`.
