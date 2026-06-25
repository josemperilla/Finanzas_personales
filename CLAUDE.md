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

**Deploy — PROTOCOLO CANÓNICO (leer antes de mergear o "deployar"):**

La PWA + Cloudflare Functions se despliegan por **auto-deploy de git** en el proyecto
Cloudflare Pages `finanzas-abiertas` (git-connected). **NO se usa `wrangler deploy` manual.**

- **`main` es la ÚNICA rama de producción.** Todo push a `origin/main` dispara un build
  de **Production** → `https://finanzas-abiertas.pages.dev`.
- **Cualquier otra rama** (feature, `loop/*`, `fix/*`, PRs) dispara un deploy de **Preview**
  con URL propia (`https://<hash>.finanzas-abiertas.pages.dev`), no público. Sirve para QA.
- El **CI** (`.github/workflows/ci.yml`) corre lint + build + test en PRs y en push a `main`;
  no deploya (de eso se encarga Cloudflare).
- **Backend (Apps Script):** sí es manual → `cd apps_script && clasp push`. No está en git-deploy.

**Guion para CADA sesión de Claude (siempre la misma rama a producción):**
1. La fuente de verdad es **`origin/main`**, NO el `main` local (este clon está divergido;
   nunca pushear `main` local ni trabajar sobre él).
2. Empezar: `git fetch origin && git switch -c <rama> origin/main`.
3. Hacer cambios en la feature branch, `git push -u origin <rama>` → genera Preview para QA.
4. Abrir PR **contra `main`** (`gh pr create --base main`). Esperar CI verde.
5. Mergear el PR a `main` (squash). El merge a `main` es lo que **entra en producción**
   automáticamente. No hay otro paso de deploy para la PWA.
6. Si tocaste `apps_script/webhook.gs`: además `cd apps_script && clasp push`.
7. Nunca crear nuevos proyectos Cloudflare ni cambiar la rama de producción del proyecto.

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
