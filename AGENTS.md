# AGENTS.md — Manual de operación para agentes de IA

Manual **primario** que todo agente (Claude Code, Cline, Codex, Cursor, Gemini…) debe leer primero.
Enseña **cómo pensar y decidir**, no solo describe el proyecto. Los hechos de arquitectura/datos viven
en `docs/ARCHITECTURE.md` y `docs/DATA_MODEL.md` (referencia, no duplicación). Convenciones de código
en `docs/CONVENTIONS.md`. Sistema de diseño en `DESIGN.md`. Decisiones técnicas en `TODOS.md`.

## Filosofía (no negociable)

1. **Entiende antes de codificar.** Lee este archivo + el doc relevante antes de tocar nada.
2. **Busca antes de crear.** Reusa abstracciones existentes. Modifica código antes que añadir archivos.
3. **Composición sobre duplicación.** Nunca dupliques lógica de negocio; extrae/impórtala.
4. **La solución más simple que resuelve el problema** es la correcta. Nada de over-engineering.
5. **No inventes arquitectura que no exista.** Si crees que hace falta algo nuevo, pregunta.
6. **Correctitud sobre velocidad. Reutilización sobre creatividad. Consistencia sobre originalidad.**
7. **Compatibilidad hacia atrás** salvo instrucción explícita. Nunca rompas una API existente.
8. **Cero placeholders, cero TODOs, cero `any`** cuando haya un tipo posible. Tipado explícito.
9. **Cada línea justifica su existencia.** Minimiza el código generado; maximiza el valor.
10. **Pregunta antes de supuestos riesgosos** (esquema de datos, secretos, ruptura de contrato).

## Modelo mental del sistema (3 capas vivas)

```
pwa/            React 18 + Vite + TS (estricto). UI. CSS-var driven, sin router (tabs manuales).
functions/api/  Cloudflare Pages Functions (JS plano). proxy / ocr / extract-pdf / sms / shortcut-config.
apps_script/    Google Apps Script: webhook.gs (~3.5k LOC) → Google Sheets (1 tab/usuario) + Script Properties.
archive/        Capa Python legacy (FastAPI/Streamlit). NO desplegada. Recuperable bajo triggers (ver TODOS.md).
```

Flujo: **iOS Shortcut / PWA → (proxy o GAS directo) → `webhook.gs` (`doGet`/`doPost`) → Google Sheets.**
La PWA **nunca** toca el webhook directo en prod: pasa por `/api/proxy`, que esconde `WEBHOOK_URL` y
`WEB_SECRET` server-side. Ver `docs/ARCHITECTURE.md` para el flujo completo, auth y los 5 endpoints.

## Dónde vive cada cosa (tabla de decisión)

| Necesitas... | Edita... | No olvides |
|---|---|---|
| Un **nuevo banco** (parser SMS/notif) | `apps_script/webhook.gs` (`parseX` + `detectBank` + dispatcher) + `testParsers()` | Desplegar GAS con `clasp push` |
| Una **nueva categoría** | `webhook.gs:ALLOWED_CATEGORIES` **Y** `pwa/src/lib/config.ts:CATEGORIES` (color+icono) | `node scripts/check-category-drift.mjs` |
| Un **nuevo tipo de acción** (API) | `webhook.gs:doPost` (rama `if (type === "...")`) **Y** fn cliente en `pwa/src/lib/api.ts` | El `type` es **case-sensitive** (no lowercase) |
| Un **nuevo conector de factura** | `apps_script/connectors_facturas.gs:FACTURA_CONNECTORS` **Y** `pwa/src/lib/providers.ts:tieneConector` | Mantener en sync |
| Un **feature de IA** | ¿Edge→Anthropic? → nuevo archivo en `functions/api/` con patrón `validateToken` (ver `ocr.js`). ¿Datos del usuario? → GAS `_callClaudeAI` | El modelo va en env, nunca en el bundle |
| Una **nueva pantalla** | `pwa/src/pages/X.tsx` (export nombrado) + lazy import en `App.tsx` | Consumir `lib/api.ts`; nunca hardcodear demo |
| Un **componente UI** reutilizable | `pwa/src/components/ui/primitives.tsx` o `ui/icons.tsx` | Tokens CSS (`var(--*)`), no hex/inline |
| **Lógica pura** (cálculos, analytics) | `pwa/src/lib/*.ts` (funciones puras) | Acompañar con test `*.test.ts` |
| **Persistencia** | Google Sheets (transacciones) o Script Properties (config/estado) | `docs/DATA_MODEL.md` |
| **Estado por dispositivo** (gamificación, net worth) | `localStorage` con prefijo `fm_` | **NO sincroniza** entre dispositivos |

## Contratos no negociables (romperlos = bugs silenciosos)

1. **`webhook.gs:ALLOWED_CATEGORIES` es la fuente de verdad** de categorías. `config.ts:CATEGORIES`
   es un espejo para render. El drift lo detecta `check-category-drift.mjs` en CI.
2. **`type`/`action` son case-sensitive.** `doPost` NO lowercases el `type` (rompería `validatePin`).
   Ver `workflows/jose_qa.md` §1.5.
3. **`userId` se loweracea** en `doPost`/`_validateUserId`. Los tabs de Sheets llevan el id en minúsculas.
4. **Ingreso vs gasto:** `isIncomeTx(tx)` / `isGasto(tx)` en `lib/api.ts` son la definición canónica
   (categoría `Ingreso` **o** `Tipo` en `INCOME_TIPOS`). Nunca reinventes esta lógica.
5. **Secretos:** solo `.env` (gitignored), Cloudflare env vars o GAS Script Properties. **Nunca** en el
   bundle (`import.meta.env.VITE_*` sí, pero sin secretos server-side).
6. **Timestamp es la clave primaria** de una transacción (tolerancia ±2s al buscar/actualizar/borrar).
7. **`webapp.access: ANYONE_ANONYMOUS`** en `appsscript.json` es intencional — la seguridad la da
   `_checkSecret` (el `_secret` query param), no el acceso de Apps Script. No cambiar a "solo yo".

## Cómo verificar tu trabajo (gate obligatorio)

```bash
cd pwa && npm run lint && npm run build && npm run test   # verde antes de cualquier PR
node scripts/check-category-drift.mjs                      # tras tocar categorías
```
- Cambios en `apps_script/`: `cd apps_script && clasp push` (deploy manual; NO toma efecto solo).
- **No deployar ni pushear a `main` sin aprobación** (prod vivo = proyecto `finanzas-abiertas`).

## Errores recurrentes (léelos para no repetirlos)

Ver `workflows/jose_qa.md` — checklist de los fallos más frecuentes: GAS no desplegado, Script
Properties con typo, `type` lowercased, montos COL vs US, `userId` no pasado explícito a
`validatePin`, `requirements.txt` en raíz (Cloudflare cree que es Python), `VITE_*` confundidas con
runtime vars. **Corre esa checklist antes de cerrar cualquier cambio.**

## Cómo extender sin introducir inconsistencias

- **Antes de crear un archivo nuevo**, confirma que no exista uno que cubra el caso (busca en `lib/`,
  `components/ui/`, `functions/api/`). Reusar > crear.
- **Estilos:** tokens CSS de `DESIGN.md` (`var(--blue)`, `var(--surface)`, `var(--r-xl)`). No hex
  literals, no utilidades de Tailwind (instalado pero el app usa CSS-vars + inline).
- **Overlays:** hook `useOverlayA11y` + `role="dialog"` (patrón canónico en DESIGN.md §patrones).
- **Movimiento:** variantes de `lib/motion.ts` (`softSpring`, `quickEase`, `pageVariants`,
  `staggerContainer`). Respeta `prefers-reduced-motion`.
- **Errores/vacío/carga:** `FriendlyEmptyState` / `<Skeleton/>` / `<ActionButton/>`.
- **Funciones puras** en `lib/` → añade un `*.test.ts` (vitest). El backend GAS no es testeable en
  local: queda para tests de integración contra el endpoint (ver TODOS.md P1).

## Idioma y unidades

Español (Colombia) en UI, docs y nombres visibles. Montos en COP vía `formatCOP` (`lib/utils`).
Fechas ISO `YYYY-MM-DD`. Zona horaria `America/Bogota` (GAS y triggers).
