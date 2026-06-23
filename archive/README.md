# archive/

Capa Python **legacy/no desplegada**, separada del stack vivo para reducir ruido y
duplicación. Se conserva íntegra e recuperable.

## Qué hay aquí

| Carpeta | Qué era | Por qué se archivó |
|---|---|---|
| `api/` | Backend FastAPI (SQLAlchemy + Alembic + Postgres/SQLite), ~70% completo | Nunca se desplegó. El stack vivo es **PWA → Cloudflare Functions → Apps Script → Google Sheets**. |
| `tools/` | Scripts Python de la era Streamlit (ingesta de extractos, parsers, categorización, análisis, chat) | Sustituidos en runtime por `apps_script/webhook.gs` y `functions/api/*`. Solo se mantenían vivos por `tests/`. |
| `tests/` | Suite pytest (8 archivos) que cubre `tools/` y `api/`, no el backend vivo | Cubren exclusivamente la capa archivada. |
| `conftest.py`, `pytest.ini` | Config pytest (raíz) | Solo relevantes para `tests/`. |

## El stack vivo (referencia)

```
pwa/                 → React+Vite+TS (UI)
functions/api/       → Cloudflare Pages Functions (proxy, ocr, pdf, sms)
apps_script/         → webhook.gs (backend vivo, vía clasp) → Google Sheets
android/             → wrapper APK
ios_shortcut/        → docs de captura vía iOS Shortcuts
```

## Cuándo revivir esta capa

La decisión (registrada en `TODOS.md`, 2026-06-05) es **mantener GAS+Sheets hasta
10–15 usuarios**. Reactivar FastAPI/Postgres solo si se cumple alguno de estos
triggers:

1. Un usuario reporta timeout o error de concurrencia en GAS.
2. Se superan **~20 usuarios activos**.
3. Se necesita **Gmail multi-cuenta** (capturar correos de otros usuarios).
4. Se necesita **análisis cruzado** entre usuarios.
5. Se necesita **historial > 2 años** por usuario (riesgo de límite 500 MB de Sheets).

## Cómo recuperarla

Si se reabre la migración, los imports vivos que acoplaban `api/` con `tools/` son solo
dos (ya documentados): `api/seed.py ← tools.db.schema` y
`api/services/categorize.py ← tools.categorization.rules`. Para revivir:

```bash
# Traer de vuelta a la raíz
git mv archive/api archive/tools archive/tests ./
git mv archive/conftest.py archive/pytest.ini ./
```

O trabajar directamente desde aquí sin mover nada. El código está intacto.
