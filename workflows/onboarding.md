# Onboarding: Personal Finance Manager

Setup para correr y desarrollar el app. El stack vivo es una **PWA (React+Vite+TS)**
que habla con **Apps Script (`apps_script/webhook.gs`)** vía **Cloudflare Pages Functions**,
persistiendo en **Google Sheets**.

## Requisitos previos

- **Node.js 18+** y npm (para la PWA)
- (Opcional, solo para deploy) `wrangler` CLI (Cloudflare) y `clasp` CLI (Apps Script)

## Setup del PWA (desarrollo local)

```bash
cd pwa
npm install

# Crea variables de entorno locales para desarrollo.
# En PROD estos secretos viven server-side en Cloudflare (functions/api/proxy.js),
# NUNCA en el bundle. En dev, apunta directo al webhook:
cp ../.env.example ../.env  # si no existe
# Configura en pwa/.env.local:
#   VITE_WEBHOOK_URL=https://script.google.com/macros/s/TU_ID/exec?_secret=TU_SECRET
#   VITE_WEBHOOK_SECRET=TU_SECRET_WEB   # solo para bypass del proxy en dev

npm run dev   # abre en http://localhost:5173
```

> Nota: `import.meta.env.PROD` en `pwa/src/lib/config.ts` decide si la PWA usa el proxy
> (`/api/proxy`) o las variables `VITE_WEBHOOK_*` directas.

## Comandos del PWA

```bash
npm run dev        # dev server (Vite)
npm run build      # type-check (tsc) + bundle a dist/
npm run preview    # servir el build localmente
npm run test       # vitest run
npm run test:watch # vitest en modo watch
npm run lint       # ESLint (si está configurado)
```

## Deploy

- **PWA + Cloudflare Functions** (juntos): desde la raíz del repo, `wrangler deploy`.
  Sirve `pwa/dist/` como assets estáticos + `functions/api/*` como edge functions.
  Variables `WEBHOOK_URL`, `WEB_SECRET`, `ANTHROPIC_API_KEY` se configuran en el
  dashboard de Cloudflare.
- **Backend Apps Script**: `cd apps_script && clasp push` (usa `.clasp.json`).

## Agregar bancos nuevos

Ver `workflows/add_new_bank.md` — el parser canónico vive en `apps_script/webhook.gs`.

## Estructura de archivos (vivo)

```
pwa/                # App React+Vite+TS (UI)
functions/api/      # Cloudflare Pages Functions (proxy, ocr, pdf, sms)
apps_script/        # webhook.gs (backend vivo) → Google Sheets
android/            # wrapper APK (Capacitor/Gradle)
ios_shortcut/       # docs de captura vía iOS Shortcuts
workflows/          # SOPs en Markdown (este directorio)
archive/            # Capa Python legacy (FastAPI + tools Streamlit) — ver archive/README.md
docs/               # Notas y brainstorms
.env / .env.example # Credenciales (NUNCA commitear .env)
```
