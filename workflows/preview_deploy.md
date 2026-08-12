# Deploy de pilotos / versiones parciales — Personal Finance Manager

Cómo publicar una versión parcial (un branch en desarrollo) para que un humano o agente la
revise **antes** de mergear a `main`. Hay tres modos; elige con la tabla de decisión.

## Tabla de decisión — qué modo usar

| Quiero... | Modo | Toca producción? |
|---|---|---|
| Iterar rápido, ver cambios al guardar | **Local** (`npm run dev`) | No toca CF; sí golpea GAS/Sheets real |
| Compartir un link para que otro revise en su celular | **Preview CF con backend real** | No toca CF prod; sí golpea GAS/Sheets real |
| Revisar solo UI/flujo sin tocar datos reales | **Preview CF modo mock** | No toca nada real |

> Regla de oro: **GAS es single-instance.** Un preview de la PWA apunta al MISMO Sheets de
> producción. Cualquier escritura (agregar/editar/borrar transacción) afecta datos reales.
> Para revisar UI sin riesgo → modo mock o local con un `userId` de prueba.

## Modo 1 — Local (`npm run dev`)

Para iteración durante el desarrollo. La PWA habla directo con GAS (sin proxy de Cloudflare).

```bash
cd pwa
npm install
# Configura pwa/.env.local (NO se commitea):
#   VITE_WEBHOOK_URL=https://script.google.com/macros/s/TU_ID/exec
#   VITE_WEBHOOK_SECRET=TU_SECRET_WEB
npm run dev   # http://localhost:5173
```

- `import.meta.env.PROD` es false → la PWA usa `VITE_WEBHOOK_URL`/`VITE_WEBHOOK_SECRET`
  directos (ver `pwa/src/lib/config.ts`).
- Para no tocar datos reales: usa un `userId` de prueba que no exista en `USERS_LIST`, o
  crea una pestaña de prueba en el Sheet.
- Requisito: `pwa/.env.local` con las dos vars (pedir valores al owner; nunca commitearlas).

## Modo 2 — Preview de Cloudflare con backend real (recomendado para compartir)

Cloudflare Pages está **git-connected**: cualquier push a una rama que no sea `main`
genera un preview en `https://<branch>.finanzas-abiertas.pages.dev`.

### Flujo automático (preferido)
1. Trabajar en `feat/*` o `fix/*` desde `origin/main` (ver `workflows/branching.md`).
2. `git push origin feat/mi-feature`.
3. Cloudflare construye y publica en `https://feat-mi-feature.finanzas-abiertas.pages.dev`.
   - El nombre de branch se sanitizea: `/` → `-`. P. ej. `feat/x` → `feat-x.finanzas-abiertas.pages.dev`.
4. En el dashboard de Cloudflare → proyecto `finanzas-abiertas` → pestaña **Deployments**,
   filtra por la rama para ver la URL.

### Requisito OBLIGATORIO: env vars en entorno "Preview"
El preview **no hereda** las env vars de Production. Hay que configurarlas en:
**Cloudflare dashboard → `finanzas-abiertas` → Settings → Environment variables → pestaña "Preview"**:

| Variable | Valor |
|---|---|
| `WEBHOOK_URL` | URL del GAS `/exec` (sin `_secret`) |
| `WEB_SECRET` | el secreto del canal web (debe calzar con Script Property `WEB_SECRET` del GAS) |
| `ANTHROPIC_API_KEY` | (solo si el feature usa OCR/PDF/chat IA) |

- Tras setear/cambiar vars, **hay que redeployear** (cualquier push nuevo o "Retry deployment"
  en el dashboard). Las vars no aplican retroactivamente al deploy existente.
- `WEBHOOK_SECRET` solo se necesita si el preview va a recibir POSTs del iOS Shortcut (raro en preview).

### Fallback manual (si el git-integration no sirve)
```bash
cd pwa && npm run build   # genera pwa/dist
cd ..
wrangler pages deploy pwa/dist --project-name=finanzas-abiertas --branch feat/mi-feature
```
- Requiere `wrangler` autenticado (`wrangler login`).
- **NUNCA `--branch main` sin aprobación explícita** (sobreescribe producción).

## Modo 3 — Preview de Cloudflare en modo mock (solo UI)

Si NO se configuran `WEBHOOK_URL`/`WEB_SECRET` en entorno Preview, `functions/api/proxy.js`
entra en **modo mock** automáticamente (líneas 12-40):

- `validatePin` / `setupPin` → `{ ok: true, token: 'preview-mode' }` (**cualquier PIN entra**).
- `hasPin` → `{ ok: true, exists: true }`.
- `getProfile` → `{ displayName: 'Preview', avatar: '' }`.
- Lecturas (`transactions`, `analytics`, …) → `[]`.
- `chat` → `{ answer: '(modo preview — sin backend)' }`.

Útil para: revisar layout, flujo de pantallas, animaciones, responsive — **sin riesgo de tocar datos**.
No útil para: validar lógica de negocio, categorización, parsers, ni nada que dependa del backend.

## Síntomas y causas (qué hacer si "no me deja entrar")

| Síntoma al hacer login en el preview | Causa | Fix |
|---|---|---|
| "Unauthorized" | `WEBHOOK_URL` set en Preview pero `WEB_SECRET` falta o no calza con el Script Property del GAS | Setear `WEB_SECRET` en entorno Preview = valor del Script Property; redeployear |
| Entra cualquier PIN pero no hay datos (transacciones vacías) | `WEBHOOK_URL` no está set en Preview → modo mock | Si querías backend real: setear `WEBHOOK_URL`+`WEB_SECRET` y redeployear. Si querías mock: es el comportamiento esperado |
| Error de red / CORS | raro (CSP `connect-src 'self'` cubre cualquier `*.pages.dev`) | Verificar que la URL sea `<branch>.finanzas-abiertas.pages.dev` y no otro dominio |
| "Falta configurar WEBHOOK_URL en el servidor" | no aplica en preview prod-build (siempre `/api/proxy`) | Si aparece, el build no es prod-mode; verificar `npm run build` |

## Reglas no negociables

1. **Nunca `--branch main` ni push directo a `main` sin aprobación** (prod vivo). El hook
   `scripts/hooks/pre-push` lo bloquea localmente; branch protection en GitHub lo bloquea remoto.
2. **Un solo proyecto Cloudflare: `finanzas-abiertas`.** No crear proyectos paralelos.
3. **GAS es single-instance**: un preview con backend real escribe en el Sheet de producción.
   Para revisar escrituras sin riesgo → usar `userId` de prueba o modo mock.
4. **`functions/api/` viaja con cualquier deploy** (preview y prod). No excluirlo.
5. **No deployar sin que `npm run lint && npm run build && npm run test` pase en `pwa/`.**

## Para agentes de IA

- Antes de proponer un deploy de preview, verifica en qué rama estás (`git status -sb`).
- Si el usuario reporta "no me deja entrar al preview", corre la tabla de **Síntomas y causas**.
- El modo mock NO es un error — es un feature. Confirma con el usuario qué modo quería antes de
  "arreglarlo".
- Para compartir un preview con alguien externo: dale la URL `https://<branch>.finanzas-abiertas.pages.dev`
  + su `userId` + PIN (solo si el preview tiene backend real).
