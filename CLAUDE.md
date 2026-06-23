# Agent Instructions — Personal Finance Manager

App personal de finanzas. **Stack vivo:** PWA (React+Vite+TS) → Cloudflare Pages
Functions → Apps Script (`apps_script/webhook.gs`) → Google Sheets (un tab por usuario).

> Históricamente este repo usaba Streamlit + SQLite + Python (el "WAT framework"). Esa
> arquitectura se migró y la capa Python quedó archivada en `archive/` (ver
> `archive/README.md`). Este documento describe la arquitectura **actual**.

## Arquitectura viva

```
pwa/              → React 18 + Vite + TypeScript + Tailwind (la UI que usa la gente)
functions/api/    → Cloudflare Pages Functions:
                     - proxy.js  → esconde WEBHOOK_URL/WEB_SECRET del bundle y reenvía a GAS
                     - ocr.js    → Claude Vision (foto de recibo)
                     - extract-pdf.js, sms.js, shortcut-config.js
apps_script/      → webhook.gs (backend vivo, ~2.6k LOC, monolito) vía clasp → Google Sheets
android/          → wrapper APK (Capacitor/Gradle)
ios_shortcut/     → docs de captura vía iOS Shortcuts (ingestion de SMS → webhook)
archive/          → capa Python legacy (FastAPI no desplegado + tools Streamlit). Recuperable.
```

**Flujo de datos:** iOS Shortcuts / PWA → `webhook.gs` → Sheet del usuario. La PWA lee
y escribe transacciones a través del proxy de Cloudflare (`/api/proxy`), nunca tocando
el webhook directo ni exponiendo `WEB_SECRET`.

## Cómo operar

**Correr / desarrollar** (todo vive en `pwa/`):
```bash
cd pwa && npm install
npm run dev      # http://localhost:5173
npm run build    # tsc --noEmit + vite build
npm run test     # vitest
```
Detalle completo en `workflows/onboarding.md`.

**Deploy (manual, sin CI todavía):**
- PWA + functions: `wrangler deploy` (desde la raíz).
- Backend: `cd apps_script && clasp push`.

**Antes de tocar algo:** revisa `workflows/` (SOPs) y declara `apps_script/webhook.gs`
como fuente de verdad para parsing de bancos (`parseBanco*`) y categorización
(`detectCategory`). El drift entre el UI (`pwa/src/lib/config.ts`) y el backend se verifica
con `node scripts/check-category-drift.mjs`.

## Decisiones y limitaciones conocidas

- **Backend:** GAS + Sheets elegido el 2026-06-05 para 10–15 usuarios. FastAPI/Postgres
  (en `archive/`) se reactiva solo ante triggers: >20 usuarios, Gmail multi-cuenta,
  análisis cruzado, o >2 años de historial. Ver `TODOS.md`.
- **Presupuestos / gamificación / learnings:** viven en **localStorage por dispositivo**
  (no sincronizan entre dispositivos). Limitación aceptada por ahora.
- **Sin router lib** en la PWA (tabs manuales con `useState`). Sin tests E2E.
- **`webhook.gs` es un monolito de ~2.6k LOC** — su modularización queda para una
  iteración futura.

## Cómo mejorar el sistema

- Ante errores: lee el mensaje completo, fixea, verifica, y documenta el aprendizaje en el
  workflow correspondiente (o `TODOS.md` si es una decisión técnica).
- No crees workflows nuevos sin preguntar; estos archivos son instrucciones que se refinan.
- Secrets **solo** en `.env` (gitignored), Cloudflare env vars, o GAS Script Properties.
  Nunca en el bundle de la PWA.

## File structure

```
pwa/              # UI (código fuente + build a dist/)
functions/api/    # edge (JS)
apps_script/      # backend vivo (.gs)
workflows/        # SOPs en Markdown
scripts/          # utilidades de verificación (p.ej. check-category-drift.mjs)
archive/          # capa Python legacy (desechable/recuperable)
docs/             # notas y brainstorms
.env              # credenciales (NUNCA commitear)
wrangler.jsonc    # config Cloudflare
```

## Skill routing

Cuando el request matchee un skill disponible, invócalo vía la herramienta Skill. En duda, invoca el skill.

Reglas clave:
- Ideas de producto/brainstorming → `/office-hours`
- Estrategia/scope → `/plan-ceo-review`
- Arquitectura → `/plan-eng-review`
- Design system/review de plan → `/design-consultation` o `/plan-design-review`
- Pipeline de review completo → `/autoplan`
- Bugs/errores → `/investigate`
- QA/comportamiento del sitio → `/qa` o `/qa-only`
- Code review/diff → `/review`
- Pulido visual → `/design-review`
- Ship/deploy/PR → `/ship` o `/land-and-deploy`
- Guardar progreso → `/context-save`
- Autorar spec/issue → `/spec`
