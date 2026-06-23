# Changelog

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
