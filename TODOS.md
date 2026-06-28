# TODOs y decisiones técnicas

> **2026-06-21:** `api/` (FastAPI), `tools/` (Streamlit) y `tests/` se movieron a
> `archive/` (ver `archive/README.md`). Los TODOs que dependían de esa capa se marcan
> `[ARCHIVADO]`. El backend vivo sigue siendo `apps_script/webhook.gs` + Google Sheets.

## Roadmap de ingeniería — audit Founding Staff (2026-06-27)

Priorización por leverage (valor / esfuerzo). Ítems nuevos surgidos de la auditoría documentada en
`AGENTS.md` + `docs/ARCHITECTURE.md`. **Al resolver uno, márcalo ✅ con commit.**

### P3 — Modelos Claude: centralizar en env + limpiar header obsoleto
**(No es un bug:** verificado contra docs.claude.com el 2026-06-27 — `claude-opus-4-8`,
`claude-sonnet-4-6` y `claude-haiku-4-5-20251001` son slugs vigentes y válidos; todos soportan
visión y documentos. La afirmación anterior de que "no existen y harían 404" era **incorrecta**.)
Lo que sí vale la pena, como refactor de menor prioridad:
- **Centralizar el modelo en `env`** (no en el código). Hoy está *hardcodeado* en 4 sitios: `ocr.js`,
  `extract-pdf.js`, `_callClaudeAI` (fallback) y las llamadas en `_spendingCoach`/`_generateHealthReport`.
  Mover a `env.CLAUDE_*_MODEL` con fallback al slug actual (cumple `docs/CONVENTIONS.md`: "el modelo va en env").
- **Quitar `anthropic-beta: pdfs-2024-09-25`** en `extract-pdf.js`: el soporte PDF ya es GA (la doc actual
  no lo pide). Es peso muerto; no rompe nada dejarlo.
- **Costo:** `ocr.js` usa Opus (tier más caro) para OCR de recibos. Considerar Sonnet/Haiku (ambos soportan
  visión) para bajar costo — decisión de producto, evaluar precisión vs precio.

### ✅ RESUELTO (2026-06-27): Drift en `workflows/jose_qa.md`
`jose_qa.md` decía que los tabs del Sheet debían llamarse `Jose`/`Dani` (capital J) y citaba la rama
`feat/multi-user`. Corregido: los tabs van en **minúsculas** (igual que el `userId`, que `doPost`/
`_validateUserId` lowercasean) y prod es `main` → proyecto `finanzas-abiertas`. También se actualizó la
referencia de `requirements.txt` (`api/`→`archive/api/`) y se agregó `WEB_SECRET` al listado de vars.
El resto de la checklist sigue siendo válido.

### P1 — Constant-time comparison en `_verifyPin` (security)
Ya documentado abajo. Implementar `_timingSafeEqual(a,b)` y reemplazar el `===` del digest SHA-256.

### P1 — Tests de integración para `webhook.gs` (28+ paths de seguridad sin cobertura)
Ya documentado abajo. Harness que llame al endpoint GAS real con `WEBHOOK_SECRET` y verifique los
contratos (validatePin/setupPin/redeemInvite/_checkSecret/validateToken/emergency…).

### P2 — Hacer `check-category-drift.mjs` bloqueante en CI
`.github/workflows/ci.yml` corre el drift con `continue-on-error: true` por el drift conocido de "Bre-B".
**Cómo:** reconciliar "Bre-B" en `ALLOWED_CATEGORIES` ↔ `detectCategory` ↔ `CATEGORIES` (¿asignarla por
keyword/campo `Tipo`, o quitarla del picker?) y quitar el `continue-on-error`.

### P2 — Extraer helper `validateToken` compartido (DRY)
`ocr.js`, `extract-pdf.js` y `shortcut-config.js` repiten el bloque "validar `token` contra GAS
`validateToken` antes de actuar". **Cómo:** extraer a `functions/api/_auth.js` (`assertSession(env, token)`).

### P3 — Modularizar `webhook.gs` (~3.5k LOC)
Monolito con ~90 funciones. **Solo abordar si bloquea velocidad** (baja urgencia hoy). `clasp` permite
varios `.gs` en el mismo proyecto. Corte por dominio: `auth.gs`, `parsers.gs` (`parseX`+`detectBank`+
`detectCategory`), `sheet.gs` (`_getSheet`/`appendToSheet`/CRUD), `ai.gs`. Mantener `doGet`/`doPost`
como dispatcher único.

### P3 — Deuda de diseño (`DESIGN.md` §"Inconsistencias")
Definir `--z-drawer`/`--z-modal`, migrar `zIndex:400` y `--z-drawer, 9999`; añadir `--scrim`; migrar hex
de estado a tokens semánticos; aplicar `useOverlayA11y` a los sheets heredados restantes. Progresivo.

### P3 — Cobertura de tests del PWA
Ampliar `vitest` desde funciones puras (`lib/analytics`, parsers clientes, `subscriptions`,
`gamification`, `healthScore`, `merchantCleaner`) hacia integración (guardar/filtrar/editar/perfil).

---

## Decisiones de arquitectura (vigentes)

- **Backend = GAS + Sheets** (2026-06-05) para 10–15 usuarios. FastAPI/Postgres (`archive/`) se reactiva
  solo ante los triggers de `archive/README.md`. **No migrar sin disparador.**
- **Estado por dispositivo:** presupuestos/gamificación/learnings/net worth/cashback viven en
  `localStorage` (no sincronizan entre dispositivos). Perfil + transacciones + presets sí sincronizan
  (Script Properties / Sheets). Limitación aceptada.
- **Sin router lib** en la PWA (tabs manuales con `useState`). Sin tests E2E.
- **`webhook.gs` es un monolito**; su modularización es P3 (ver arriba).

---

## TODO: Agregar framework de tests (vitest) al pwa

**Estado (2026-06-21):** vitest YA está configurado (`pwa/vite.config.ts` +
`pwa/src/test/setup.ts`) y hay 3 tests: `BottomNav.test.tsx`, `cardOptimizer.test.ts`,
`ui/primitives.test.tsx`. Falta ampliar cobertura (analytics.ts, parsers, categorización).

**Por qué:** Sin tests, cada sprint agrega regresiones potenciales no detectables hasta QA manual.
`vitest` + `@testing-library/react` es la combinación estándar para proyectos Vite+React.

**Cómo:** `npm install -D vitest @testing-library/react @testing-library/user-event jsdom`.
Agregar `test: vitest` en `package.json > scripts`. Primeras pruebas: `detectUnusualCategories`
(funciones puras en `lib/analytics.ts`) — las más fáciles de testear sin DOM.

**Depende de:** nada — puede hacerse en cualquier momento.

Surfaced by: plan-eng-review 2026-06-09 (Test Coverage Gap)

---

## ✅ RESUELTO (2026-06-25): Alinear CategoryComparison a baseline de 3 meses

**Implementado.** `getCategoryComparison(txs, monthsBack = 1)` ahora acepta `monthsBack`;
con valor >1 usa el promedio de los meses previos con gasto (mismo criterio que
`detectUnusualCategories`). `CategoryComparison.tsx` usa `monthsBack=3` con labels
honestos ("Prom. 3m", "vs. promedio de los 3 meses previos"). Tests cubren el caso del
mes anterior atípicamente bajo. Ver commit `feat(analytics): baseline de 3 meses`.

---

<details><summary>Contexto original</summary>

`CategoryComparison` marca `anomaly: delta > 100%` comparando solo con el mes anterior.
`detectUnusualCategories` usa promedio de los 3 meses anteriores. Ambos usan color naranja
(señal unificada de "gasto inusual"), pero el criterio de activación es distinto.

**Por qué:** Para un usuario con gasto variable, el mes anterior puede ser atípicamente bajo,
disparando falsos positivos en CategoryComparison. El baseline de 3 meses sería más robusto.

**Cómo:** Modificar `getCategoryComparison()` en `lib/analytics.ts` para aceptar `monthsBack: number`
y usar el promedio, igual que `detectUnusualCategories`. Coordinar con `CategoryComparison.tsx`.

**Riesgo:** Cambia el comportamiento visible de la comparativa MoM — evaluar antes de implementar.

Surfaced by: plan-eng-review 2026-06-09 (Outside Voice finding 4)

</details>

---

## TODO: Crear DESIGN.md con sistema de diseño documentado

**Estado (2026-06-21):** `DESIGN.md` existe. Mantenerlo actualizado al evolucionar tokens.
espaciados, patrones de componentes y convenciones de interacción del app.

**Por qué:** Sin DESIGN.md, cada revisión de diseño (plan-design-review, design-review)
opera sin referencia y recalibra tokens desde cero. Con DESIGN.md, las revisiones automáticas
calibran contra las decisiones de diseño ya tomadas, detectando inconsistencias de forma
fiable.

**Cómo:** El app ya tiene un sistema de diseño implícito en CSS vars (`var(--blue-700)`,
`var(--card)`, `var(--r-xl)`, etc.) y patrones consistentes (riseItem, softSpring, FriendlyEmptyState).
Solo falta documentarlo. Tiempo estimado: ~30 min con /design-consultation.

Surfaced by: plan-design-review 2026-06-09 (Pass 5 — Design System Alignment)

## TODO: Migrar webhook a Cloudflare Workers

Cuando haya >10 usuarios o se necesite dominio custom, migrar `apps_script/webhook.gs`
a un Cloudflare Worker.
Elegimos GAS el 2026-06-04 por simplicidad (2 usuarios, sin problemas de rate limit).
Workers darían: dominio custom, mejores rate limits, KV para tokens de Gmail, Cron para
polling de email.
Bloqueado por: migración es reescritura completa de webhook.gs en TypeScript.

---

## TODO: Migrar base de datos (Google Sheets → PostgreSQL)

**Decisión actual (2026-06-05):** mantener Google Sheets + GAS para 10–15 usuarios.

### Por qué GAS/Sheets sigue siendo adecuado

| Factor | Google Sheets + GAS | FastAPI + Neon Postgres |
|---|---|---|
| Usuarios | Hasta ~15 sin problemas | Ilimitado |
| Filas | ~12K cómodo (límite 500MB) | Ilimitado |
| Concurrencia | Sin locks, last-write-wins | ACID transactions |
| Velocidad | 1–3s por request | <200ms |
| Gmail multi-cuenta | Solo el dueño del script | Posible |
| Costo | Gratis | Free tier Neon (0.5GB) |
| Complejidad deploy | Ya funciona | Railway + Neon + migraciones |

### Triggers para migrar

Ejecutar `/plan-eng-review` y usar `tools/migrate_sheet_to_db.py` cuando se cumpla
cualquiera de estas condiciones:

1. Un usuario reporta timeout o error de concurrencia
2. Se superan **20 usuarios activos**
3. Se necesita **Gmail multi-cuenta** (capturar correos de otros usuarios)
4. Se necesita **análisis cruzado** entre usuarios
5. Se necesita **historial > 2 años** por usuario (riesgo de límite 500MB)

### Estado del FastAPI en `api/` [ARCHIVADO 2026-06-21]

`api/` se movió a `archive/` (ver `archive/README.md`). Estaba ~70% listo (auth JWT,
CRUD completo, modelos Alembic, integración Claude). Si se reactiva por los triggers de
arriba, recuperarlo con `git mv archive/api ./` y completar: rate limiting, tests de
integración, logging, hardening de inputs.

---

## P1 TODO: Tests de integración para flujo multi-usuario en GAS

El código GAS (webhook.gs) no es testeable unitariamente en local (corre en la JVM de Apps
Script). Los 28+ paths de seguridad críticos no tienen cobertura automatizada.

**Rutas críticas sin test:**
- `validatePin`: rate limiting a los 20 intentos, auto-upgrade de PIN legado a sha256
- `setupPin`: rechazo de código inválido/expirado/ya usado, H1 guard
- `redeemInvite`: rate limit global (30/h) y por código (8/h), código ya usado, caducado
- `_checkSecret`: canal `web` con WEB_SECRET ausente, canal `shortcut`, secreto incorrecto
- `generateEmergencyPin`: uso único, expiración a 24h
- `revokeInvite`: no borra usuario con PIN ya fijado (`userDeleted: false`)
- `_validateUserId`: usuario deshabilitado devuelve error sin exponer lista

**Cómo:** Crear tests de integración contra el endpoint GAS real (URL del deployment).
Usar `tests/test_api.py` o un script dedicado `tools/test_gas_integration.py` que llame al
webhook con WEBHOOK_SECRET y verifique los contratos de respuesta.

**Desbloquea:** CI que verifique regresiones de seguridad en cada push a GAS.

Surfaced by: /ship pre-landing review 2026-06-10 (Testing specialist + Red Team)

---

## P2 TODO: Corregir entorno sqlalchemy para test_api.py [ARCHIVADO 2026-06-21]

`tests/` se movió a `archive/`. Irrelevante mientras la capa FastAPI esté archivada.

---

## P1 TODO: Constant-time comparison para validación de PIN hash

`_verifyPin` en webhook.gs usa `===` (JavaScript string equality) para comparar digests
SHA-256. En V8/GAS esto hace short-circuit en el primer carácter diferente, creando un
canal lateral de timing. El riesgo práctico es bajo dado la latencia de red GAS, pero es
una buena práctica.

**Cómo:** Implementar comparación byte a byte acumulando XOR en un entero antes de evaluar
igualdad:
```javascript
function _timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```
Reemplazar `stored.split(":")[2] === _computePinHash(...)` con `_timingSafeEqual(...)`.

Surfaced by: /ship pre-landing review 2026-06-10 (Security specialist)
