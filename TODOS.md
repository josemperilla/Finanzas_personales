# TODOs y decisiones técnicas

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
