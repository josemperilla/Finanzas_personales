# Changelog

## [1.4.0] — 2026-08-12

### Fixes
- **Transacciones duplicadas en toda la ingesta**: el iPhone reenvía el mismo SMS y cada envío creaba su propia fila. En la hoja real había 14 pares con `SMS_Original` idéntico byte por byte separados por **6 ms a 5 s** (AV Villas `****3403` y Banco de Bogotá `****8439`). La causa en el teléfono nunca se determinó, así que ahora el servidor es idempotente: `_isDuplicateIngest` descarta el reenvío por huella del texto crudo, bajo lock y **antes del parseo**, así un duplicado tampoco paga el fallback de IA. Se compara el texto crudo y no los campos parseados porque la IA no es determinista — el mismo SMS produjo `DIDI RIDES*DL` en una fila y `DIDI RIDES` en la otra. Es seguro porque el texto del banco trae su propia marca de tiempo: dos compras reales nunca generan el mismo texto (verificado contra 8 pares de mismo monto y comercio a horas distintas, que quedaron intactos).
- **La tarjeta `****8439` aparecía partida en dos productos**: Banco de Bogotá compró a Itaú y cambió el pie del SMS (`ITAU Tel: 5818181...` → `Si no fuiste tu, comunicate con la Servilinea de Banco de Bogota.`) conservando la estructura. `detectBank` buscaba `\bITAU\b`, dejó de reconocerlo y meses de transacciones cayeron al fallback de IA con la tarjeta transcrita como `8439` pelado. Ahora `detectBank` rutea **por la estructura del mensaje, no por la marca**, y `parseAnyBank` prueba los demás parsers antes de gastar IA.
- **Nombre de banco unificado**: `Itaú` y `Bogotá` son la misma entidad desde la compra, así que comparten nombre visible (`Banco de Bogotá`). Lo que distingue un producto es la tarjeta, no el banco. La lógica que necesita saber que un mensaje llegó con formato Itaú usa `_bankKey`, nunca el nombre visible, para que el banco pueda renombrarse sin romper el parseo.
- **Dos formatos de Itaú que caían a la IA**: `Se realizo Transferencia de tu Cuenta...` (el artículo era obligatorio y ese mensaje no lo trae) y el Bre-B entrante (`has recibido una transferencia a tu cuenta AHO...`). Los dos dejaban la cuenta como `8448` pelado.
- **Publicidad de `dale!` entraba como compra**: los combos promocionales (`Compra tu combo dale! por $14.900...`) se guardaban como transacciones reales con fecha inventada (2024-01-01).
- **Un fallo transitorio podía perder una transacción**: la huella de idempotencia se reservaba antes de guardar la fila, así que si el parseo o la IA fallaban, el reenvío del teléfono —el mecanismo que la recuperaría— se descartaba. Ahora las rutas de fallo real sueltan la reserva; las que resuelven a propósito sin guardar (reversa, fusión Bre-B) la conservan, o una reversa reenviada borraría dos filas.

### Changed
- **`BANKS` (`pwa/src/lib/banks.ts`) y `BANK_DISPLAY` (`ImportarExtracto.tsx`) usan los nombres canónicos.** Antes el selector de "crear cuenta", el de "editar transacción" y el importador de extractos podían escribir `Itaú`/`Bogotá`, que reintroducían el producto duplicado por la puerta de atrás.
- **El arte de la tarjeta se elige por los últimos 4 dígitos, no por el nombre del banco** (`PRODUCT_ART` en `ProductCardFace.tsx`). El plástico no cambia cuando el banco se renombra.

### Security
- **`migrarProductos` exige token de sesión de admin.** En el canal `shortcut`, `_authUserId` devuelve el `userId` que declare el llamante sin verificarlo, así que bastaba tener `WEBHOOK_SECRET` para disparar un borrado masivo. Es una debilidad preexistente que comparten `deleteUser`/`resetPin`; aquí no se hereda porque el daño sería irreversible. La acción también entra en `ADMIN_TYPES` para quedar rate-limitada.

### Tooling
- **`migrarProductosYDuplicados()`**: repara datos ya escritos (renombra el banco en la hoja **y** en el catálogo `cards_<userId>` de Script Properties, completa las tarjetas peladas usando la etiqueta que ya existe para esos cuatro dígitos, borra duplicados y promos). Idempotente y con modo simulación. Aplicada sobre 963 filas: 886 renombres, 17 tarjetas unificadas, 14 duplicados y 3 promos borradas.
- **`scripts/test-ingest-dedup.mjs`**: 24 casos sobre SMS reales del Sheet, incluidos los controles de "no borrar compras reales del mismo monto a horas distintas" y la idempotencia de la migración.

## [1.3.0] — 2026-07-05

### Features
- **Recordatorios de vencimiento de Facturas**: `VencimientosUrgentes` — banner en Home que agrupa pagos fijos vencidos/por vencer, con notificaciones locales (Notification API del navegador) y toggle de activación en Ajustes (gesto explícito del usuario, nunca se pide permiso sin interacción).
- **Extensión de navegador — extracción afinada por portal**: `popup.js` ahora usa keywords específicas por proveedor (Acueducto de Bogotá, Vanti, Enel Codensa, ETB) en vez de solo heurística genérica, y también captura el número de cuenta/contrato para hacer match fino en el backend cuando hay varias facturas del mismo proveedor.
- **`pwa/src/lib/banks.ts`**: catálogo único de bancos como fuente de verdad (antes duplicado inline en `Cuentas.tsx`/`Historial.tsx`).
- **`scripts/check-provider-drift.mjs`**: verifica que todo `providerId` de la extensión exista en el catálogo canónico (`pwa/src/lib/providers.ts`), mismo patrón que el check de categorías.

### Fixes
- **Barra de navegación inferior — hide/show al hacer scroll**: el contenedor de scroll no estaba realmente acotado en altura (`html`/`body`/`#root` usaban `min-height` en vez de `height` + `overflow:hidden`), así que quien scrolleaba de verdad era la ventana y el listener de la barra nunca se disparaba. Además, el umbral de dirección se reseteaba en cada frame, por lo que un scroll lento y continuo (trackpad) nunca ocultaba la barra. Ambos corregidos.
- **Transacciones duplicadas de Bre-B (Itaú)**: Itaú envía dos SMS/notificaciones para una misma transferencia Bre-B (una genérica + una con la llave del destinatario); ahora se fusionan en una sola fila en vez de duplicarse, preservando siempre la llave del destinatario sin importar el orden de llegada. Incluye lock corto (`LockService`) contra condición de carrera entre las dos notificaciones casi simultáneas, y ventana de coincidencia angosta (90s) para no fusionar por error dos transferencias reales distintas del mismo monto.
- **`weeklyBackupToDrive()`**: el respaldo semanal a Drive fallaba en silencio para todos los usuarios (buscaba la pestaña del Sheet por `userId` en minúsculas en vez del nombre capitalizado real). Corregido, y ahora reutiliza una sola conexión al spreadsheet en vez de reabrirlo por usuario.
- **`PagosProximosCard`**: un pago que vence exactamente hoy se clasificaba mal como ya vencido (comparaba medianoche vs mediodía) y desaparecía del widget.
- Botón "Guardar configuración" en Ajustes no cambiaba de color al confirmar éxito (un refactor de tokens CSS lo dejó apuntando a `--good`, idéntico a `--blue-600` en tema claro, en vez de `--success`).

### Privacy
- La llave/alias del destinatario de una transferencia Bre-B (dato del comercio, ahora más específico) se redacta antes de entrar a los prompts de IA (`_spendingCoach`, `_generateHealthReport`) — nunca se envía el teléfono/alias de otra persona a un proveedor de IA externo.

### Infrastructure
- `_callClaudeAI()` centraliza las 4 llamadas a Claude que antes duplicaban su propio `UrlFetchApp.fetch` (voz, chat, SMS fallback, coach/reporte); modelo y cuotas configurables vía Script Properties.
- `CANONICAL_BANCO` normaliza el nombre de banco en toda transacción parseada (evita que el fallback de IA devuelva el nombre tal cual aparece en el SMS).

## [1.2.0] — 2026-06-23

### Features
- **Rediseño "Corriente"**: re-skin completo de la PWA a tokens CSS (papel/esmeralda en claro, azul fosfo en oscuro), tipografías Space Grotesk / Plus Jakarta / IBM Plex Mono.
- **Navegación de 4 tabs + FAB**: Inicio, Movimientos, Insights, Progreso; botón central "Agregar" y FAB global "Pregúntale a Fino" (asistente).
- **Drawer lateral**: panel desde el avatar con Cuentas, Asistente, Ajustes, Exportar datos, Administrar usuarios y Cerrar sesión.
- **Insights**: barra de chat sticky ("Pregunta sobre tu dinero…"), medidor de salud financiera, top comercios, comparativa mensual.
- **Progreso consolidado**: nivel/XP, racha de disciplina, círculos de bienestar y galería de logros en una sola pantalla.
- **Agregar**: dropdown de categorías con iconos; numpad amount-first.
- **Movimientos**: rango de fechas personalizado + logos de comercio.
- **Card3D**: tarjeta con tilt/flip y edición de cuota.
- **Motion polish**: transiciones page-turn (rotateY + perspectiva), stagger, press-scale, respeto a reduced-motion.

### Infrastructure
- **Migración a `archive/`**: capa Python legacy (FastAPI no desplegado + tools Streamlit + suite pytest) movida a `archive/` para reducir ruido. Recuperable; el stack vivo sigue siendo PWA → Cloudflare Functions → Apps Script → Sheets.
- **CI (GitHub Actions)**: `.github/workflows/ci.yml` corre lint + build + test del PWA y un check de drift de categorías (UI vs `webhook.gs`).
- **`scripts/check-category-drift.mjs`**: verificación de alineación entre `config.ts:CATEGORIES` y `webhook.gs:detectCategory`.
- **Tooling PWA**: configuración de ESLint (flat config) y Prettier.

## [1.1.0] — 2026-06-10

### Features
- **Multi-user**: soporte para múltiples usuarios con tabs de Sheets individuales. Registro gestionado en Script Property `USERS_LIST` (sin tabs adicionales).
- **Sistema de invitaciones**: códigos de 8 caracteres (alfabeto sin ambigüedad) de un solo uso con expiración de 7 días. Generados con CSPRNG (SHA-256 + UUID via GAS).
- **Flujo de onboarding**: `InviteRedeem → SetupPin` — el usuario nuevo redime su código y fija su PIN en dos pasos, sin intervención del admin.
- **Panel admin**: `AdminPanel` con listado de usuarios (estado, transacciones, última actividad), toggle disable/enable, delete con flag `deleteData`, y gestión de invitaciones.
- **Hasheo de PIN**: SHA-256 + salt por usuario (`sha256:<salt>:<hex>`). Auto-upgrade transparente del PIN en texto plano al primer login.
- **Perfil cross-device**: `updateProfile` / `getProfile` persistidos en Script Properties para sincronía entre dispositivos.
- **Filtros Historial**: filtro de fecha y categoría en la vista de transacciones históricas.
- **Análisis Inteligente**: badge de anomalía, top 10 comercios, gráfico mensual, colores semánticos.
- **OCR de recibos**: endpoint Cloudflare Worker `/api/ocr` gated por token de sesión + límites de imagen.

### Security
- Tokens de sesión emitidos por GAS (CacheService, 6 h) — la PWA nunca envía PIN al servidor tras el login inicial.
- `_checkSecret` dual-channel: `WEB_SECRET` (proxy Cloudflare) vs `WEBHOOK_SECRET` (iOS Shortcut de confianza).
- Rate limiting: 20 intentos/hora por usuario en validatePin; 30 globales + 8 por código en redeemInvite.
- Código de emergencia de un solo uso (24 h) generado con CSPRNG.
- `setupPin` H1 guard: siempre requiere código de invitación válido para fijar PIN (cierra hueco de invite squatting con invitaciones expiradas).
- `_validateUserId` no expone la lista de usuarios en mensajes de error.
- Secreto de autenticación enviado en POST body en el Worker OCR (no en query string).
- Admin rate limit: 100 operaciones/día para el bloque de acciones admin.

### Infrastructure
- Cloudflare Pages Functions: `/api/proxy`, `/api/ocr` con WAF de sesión.
- `clasp` para despliegue de GAS desde CLI.
- PIN hasheado auto-upgrade: compatible con instalaciones existentes sin migración manual.

## [1.0.0] — base

Versión inicial: PWA de finanzas personales para usuario único, SMS parsing, categorización automática, voz, dashboard.
