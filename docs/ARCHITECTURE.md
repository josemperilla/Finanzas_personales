# Arquitectura — Finanzas Personales (`finanzas-abiertas`)

Fuente de verdad del sistema. `AGENTS.md` resume; este documento explica. Si cambias la arquitectura,
actualiza este archivo.

## Visión de producto

App personal de finanzas para Colombia (COP). Captura transacciones **automáticamente** (SMS y
notificaciones vía iOS Shortcuts; recibos/extractos vía OCR/PDF con Claude), las categoriza y ofrece
lectura rápida del mes, presupuestos, detección de suscripciones, patrimonio neto, calendario de pagos
fijos, gamificación (XP/racha/logros) y un coach de IA. Optimiza el registro cotidiano desde móvil.

## Las 3 capas vivas

### 1. PWA — `pwa/` (React 18 + Vite 5 + TypeScript estricto)
- **Stack:** React 18, Vite 5, TS (`strict`, `noEmit`), Framer Motion, Workbox (PWA `autoUpdate`),
  Capacitor (wrapper iOS/Android). Tailwind instalado pero **no se usa como utilities** — el app es
  **CSS-var driven** (tokens en `src/index.css`).
- **Entrada:** `src/main.tsx` → `App.tsx` (orquesta auth, tabs, overlays, gamificación).
- **Páginas:** `src/pages/*` con **lazy import** en `App.tsx`. **Sin router** — navegación por
  `useState` (enum `Tab`) + `BottomNav`. Chunks manuales: `react-vendor`, `framer-motion` (cache estable).
- **Capa de datos cliente:** `src/lib/api.ts` (todas las llamadas al backend; `secureUrl`,
  `withUser`/`withAuth`, token de sesión en `localStorage`). **Toda pantalla consume `lib/api.ts`**.
- **Lógica pura:** `src/lib/*.ts` (analytics, gamification, healthScore, budgets, subscriptions,
  merchantCleaner…). Testeable con vitest (`*.test.ts`).
- **UI:** `src/components/ui/primitives.tsx` (Card, ActionButton, Skeleton, StatusToast, PageHeader),
  `ui/icons.tsx` (Lucide-style), `ui/FriendlyEmptyState.tsx`.

### 2. Edge — `functions/api/` (Cloudflare Pages Functions, JS plano)
Cada archivo exporta `onRequest(context)` con `{ request, env }`:

| Archivo | Propósito | Auth |
|---|---|---|
| `proxy.js` | Reenvía PWA→GAS, inyecta `_secret` desde env. **Modo preview** (mock) si falta `WEBHOOK_URL`. Cache `no-store` + `_cb` cache-buster en GET. | canal web (`WEB_SECRET`) |
| `ocr.js` | Claude Vision sobre foto de recibo → transacciones. | `validateToken` contra GAS |
| `extract-pdf.js` | Claude con soporte de documentos sobre PDF de extracto. | `validateToken` contra GAS |
| `sms.js` | Proxy del iOS Shortcut hacia GAS (evita doble-redirect de script.google.com). | canal shortcut (`WEBHOOK_SECRET`) |
| `shortcut-config.js` | Devuelve URL+secret del shortcut a usuario autenticado. | `validateToken` contra GAS |

Los 3 endpoints de IA repiten el patrón: validar `token` contra GAS `validateToken` **antes** de gastar
la API de Anthropic. Modelos y `ANTHROPIC_API_KEY` viven en env (server-side).

> **Modelos Claude:** los slugs `claude-opus-4-8` (`ocr.js`), `claude-sonnet-4-6` (`extract-pdf.js`) y
> `claude-haiku-4-5-20251001` (fallback de `_callClaudeAI`) son **vigentes y válidos** (verificado contra
> docs.claude.com 2026-06-27; todos soportan visión y documentos). Oportunidad menor: el modelo está
> hardcodeado en 4 sitios y `extract-pdf.js` envía un `anthropic-beta: pdfs-*` ya obsoleto (PDF es GA).
> Ver `TODOS.md` (P3).

### 3. Backend — `apps_script/` (Google Apps Script)
- **`webhook.gs`** (~3.5k LOC, ~90 funciones): webhook web app desplegado vía `clasp`. `doGet`
  (lecturas: `transactions`, `cards`, `analytics`, `widgetData`) y `doPost` (~45 `type` actions:
  auth, usuarios/invitaciones, transacciones, categorías, tarjetas, fixed payments, budgets, net worth,
  cashback, mood, IA). Ver `docs/DATA_MODEL.md` para el contrato completo.
- **`connectors_facturas.gs`**: conectores de consulta de facturas (esqueletos; registry
  `FACTURA_CONNECTORS`). Solo `acueducto-bogota` y `vanti` declarados (aún sin cablear).
- **`setup_triggers.gs`**: crea triggers time-based (backup semanal a Drive, refresh de facturas).
  Ejecutar cada función **una sola vez** desde el editor GAS.
- **Deploy:** `appsscript.json` → `webapp.access: ANYONE_ANONYMOUS`, `executeAs: USER_DEPLOYING`.
  Seguridad vía `_checkSecret` (query param `_secret`). `cd apps_script && clasp push`.

### 4. (No viva) `archive/` — capa Python legacy
FastAPI (SQLAlchemy+Alembic) + tools Streamlit + suite pytest, intacta y recuperable. **Solo**
reactivar bajo los triggers de `TODOS.md` (>20 usuarios, Gmail multi-cuenta, análisis cruzado,
historial >2 años). Recuperar: `git mv archive/api archive/tools archive/tests ./`.

## Flujo de datos (end-to-end)

```
iOS Shortcut (SMS/notif) ─┐                      ┌─ webhook.gs doPost ─→ parseX → detectCategory → appendToSheet
                          ├─→ functions/api/sms ─┤
PWA (Agregar/importar)  ──┼─→ functions/api/proxy┘   (proxy inyecta _secret desde env)
PWA (OCR/PDF)           ──┼─→ functions/api/ocr|extract-pdf ─→ Anthropic ─→ GAS manual
PWA (lecturas)          ──┴─→ functions/api/proxy ─→ webhook.gs doGet ─→ Sheet ─→ JSON ─→ lib/api.ts ─→ App.tsx
```
La escritura diaria (SMS) entra por `sms.js`→GAS, no por la PWA. La PWA lee y edita vía `proxy`.

## Autenticación y seguridad

- **Canales de secreto** (`_checkSecret`): `web` (`WEB_SECRET`, proxy CF) y `shortcut`
  (`WEBHOOK_SECRET`, iOS Shortcut). Viaja como query param `_secret` (Apps Script no lee headers custom)
  o en el body (Workers OCR).
- **PIN:** SHA-256 + salt por usuario (`sha256:<salt>:<hex>`). Auto-upgrade de texto plano al 1er login.
  Comparación `===` (TODO constant-time, ver `TODOS.md`).
- **Token de sesión:** emitido por GAS (`CacheService`, TTL 6h) tras validar PIN. La PWA lo guarda en
  `localStorage` (`fm_token_<id>`) y lo envía en el body (`withAuth`). Los Workers lo validan con
  `validateToken` antes de cualquier acción costosa.
- **Rate limiting:** `validatePin` 20 intentos/hora; `redeemInvite` 30 globales + 8/código/hora;
  admin 100 ops/día. Vía `CacheService` con ventanas por hora.
- **Invitaciones:** 8 chars (alfabeto sin ambigüedad), CSPRNG (SHA-256(UUID)), un solo uso, 7 días.
  `setupPin` exige siempre código válido (H1 guard anti invite-squatting).
- **Allowlist de categorías** en `updateCategoryInSheet` (anti formula-injection H-03).
- **`_validateUserId`** no expone la lista de usuarios en errores.

## Deployment (manual, sin CI de deploy)

- **PWA + functions:** `wrangler deploy` desde la raíz (sirve `pwa/dist/` + `functions/api/*`).
  Un solo proyecto: `finanzas-abiertas` (prod). Variables en el dashboard: `WEBHOOK_URL`,
  `WEB_SECRET`, `ANTHROPIC_API_KEY` (y `WEBHOOK_SECRET` para el canal shortcut).
- **GAS:** `cd apps_script && clasp push`. **No toma efecto solo.**
- **CI (`.github/workflows/ci.yml`):** lint+build+test del PWA + drift de categorías
  (`continue-on-error: true` mientras exista drift de "Bre-B").

## Fortalezas

- Separación clara vivo vs archivado; stack deliberadamente simple para 10–15 usuarios.
- Aislamiento de secretos (proxy + env + Script Properties; nada en el bundle).
- Contrato de categorías entre capas verificado por CI.
- Tokens de diseño documentados y módulos de lógica pura testeables.
- Auth con token de sesión + rate limiting + allowlists (defensa en profundidad razonable).

## Debilidades / deuda técnica

- **`webhook.gs` sin tests automatizados** (28+ paths de seguridad). Monolito ~3.5k LOC.
- **Modelos Claude hardcodeados** en 4 sitios (`ocr.js`, `extract-pdf.js`, `_callClaudeAI` y sus callers) —
  los slugs son válidos, pero deberían leerse de `env` (ver `TODOS.md` P3).
- **Bloque `validateToken` triplicado** en los 3 Workers de IA (extracción pendiente).
- ~~Drift en `workflows/jose_qa.md`~~ — **corregido 2026-06-27** (tab names y branch actualizados).
- Deuda de diseño (`DESIGN.md` §"Inconsistencias"): `--blue-*` es verde en claro, `--z-drawer`
  inexistente, scrims/hex hardcodeados.
- Estado por dispositivo (`localStorage`) no sincroniza entre dispositivos (aceptado).
- Comparación de PIN no constant-time.

Ver `TODOS.md` para el roadmap priorizado.
