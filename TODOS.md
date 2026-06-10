# TODOs y decisiones técnicas

## TODO: Agregar framework de tests (vitest) al pwa

El pwa no tiene ningún framework de tests automatizados. Todos los nuevos code paths
se verifican manualmente. Con el sprint de Análisis Inteligente, se documentaron 14 paths
que requieren verificación manual (badge lifecycle, dismissal, multi-usuario, colores, top merchants).

**Por qué:** Sin tests, cada sprint agrega regresiones potenciales no detectables hasta QA manual.
`vitest` + `@testing-library/react` es la combinación estándar para proyectos Vite+React.

**Cómo:** `npm install -D vitest @testing-library/react @testing-library/user-event jsdom`.
Agregar `test: vitest` en `package.json > scripts`. Primeras pruebas: `detectUnusualCategories`
(funciones puras en `lib/analytics.ts`) — las más fáciles de testear sin DOM.

**Depende de:** nada — puede hacerse en cualquier momento.

Surfaced by: plan-eng-review 2026-06-09 (Test Coverage Gap)

---

## TODO: Alinear CategoryComparison a baseline de 3 meses

`CategoryComparison` marca `anomaly: delta > 100%` comparando solo con el mes anterior.
`detectUnusualCategories` usa promedio de los 3 meses anteriores. Ambos usan color naranja
(señal unificada de "gasto inusual"), pero el criterio de activación es distinto.

**Por qué:** Para un usuario con gasto variable, el mes anterior puede ser atípicamente bajo,
disparando falsos positivos en CategoryComparison. El baseline de 3 meses sería más robusto.

**Cómo:** Modificar `getCategoryComparison()` en `lib/analytics.ts` para aceptar `monthsBack: number`
y usar el promedio, igual que `detectUnusualCategories`. Coordinar con `CategoryComparison.tsx`.

**Riesgo:** Cambia el comportamiento visible de la comparativa MoM — evaluar antes de implementar.

Surfaced by: plan-eng-review 2026-06-09 (Outside Voice finding 4)

---

## TODO: Crear DESIGN.md con sistema de diseño documentado

Ejecutar `/design-consultation` para generar `DESIGN.md` con tokens de color, tipografía,
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

### Estado del FastAPI en `api/`

~70% listo: auth JWT, CRUD completo, modelos Alembic, integración Claude.
Falta: rate limiting, tests de integración, logging, hardening de inputs.

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

## P2 TODO: Corregir entorno sqlalchemy para test_api.py

`tests/test_api.py` falla con `ModuleNotFoundError: No module named 'sqlalchemy'` en el
entorno Python 3.9 del sistema. No es un problema del código del branch — es configuración
del entorno local.

**Cómo:** `pip install sqlalchemy` en el entorno correcto, o crear un `requirements.txt`
con dependencias de test y usar `pip install -r requirements.txt` en CI.

Surfaced by: /ship test run 2026-06-10

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
