# Agent Instructions — Personal Finance Manager

> **Manual de ingeniería:** la fuente de verdad para decidir, explorar y extender el sistema es
> **[`AGENTS.md`](./AGENTS.md)**. Léelo primero. Este archivo conserva solo el enrutamiento de
> **skills** específico de Claude Code; todo lo demás vive en:
> - `docs/ARCHITECTURE.md` — arquitectura, flujo de datos, auth, deploy.
> - `docs/DATA_MODEL.md` — Sheets, Script Properties, localStorage, contrato de categorías y API.
> - `docs/CONVENTIONS.md` — convenciones de código TS/GAS/CF.
> - `DESIGN.md` — sistema de diseño y tokens.
> - `TODOS.md` — decisiones técnicas (ADRs) y roadmap.
> - `workflows/` — SOPs (onboarding, add_new_bank, jose_qa).

**Stack vivo:** PWA (React+Vite+TS) → Cloudflare Pages Functions → Apps Script
(`apps_script/webhook.gs`) → Google Sheets (un tab por usuario). `archive/` = capa Python legacy
(no desplegada, recuperable bajo triggers).

**Comandos:** `cd pwa && npm run dev|build|test|lint`. Gate de PR: `npm run lint && npm run build && npm run test`.
Deploy: ver comandos en `docs/ARCHITECTURE.md` §Deployment.

**Ramas:** `main` = producción (push automático a Cloudflare). Todo desarrollo va en ramas `feat/*`/`fix/*`/etc. creadas desde `origin/main`. Ver [`workflows/branching.md`](./workflows/branching.md). **Nunca commitear directo en `main`.**

## Skill routing

Cuando el request matchee un skill disponible, invócalo vía la herramienta Skill. En duda, invoca el skill.

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

## Health Stack

Comandos que corre `/health` para el tablero de calidad. Todos corren también en
`.github/workflows/ci.yml`, así que el tablero y el CI no pueden divergir.

- typecheck: `cd pwa && npx tsc --noEmit`
- lint: `cd pwa && npm run lint`
- test: `cd pwa && npm run test`
- deadcode: `cd pwa && npm run deadcode` (knip)
- drift: `node scripts/check-category-drift.mjs && node scripts/check-provider-drift.mjs`
- backend: `node scripts/test-ingest-dedup.mjs && node scripts/test-itau-breb-merge.mjs && node scripts/test-webhook-security.mjs --self-test`
- shell: no configurado (shellcheck no instalado)

Dos detalles que no son obvios:

- **knip** rompe ante archivos y dependencias sin usar, pero solo *lista* los exports
  sueltos. `lib/api.ts` expone clientes de endpoints que `webhook.gs` ya sirve pero que
  todavía no tienen UI (`saveMood`, `fetchMoodHistory`, `fetchSpendingCoach`), y
  `primitives.tsx` / `motion.ts` son superficies de design system documentadas en
  `DESIGN.md`. Borrarlos por estar "sin usar" rompería contratos vivos.
- **`test-webhook-security.mjs`** sin `--self-test` pega contra un deployment real y exige
  `WEBHOOK_EXEC_URL` + `WEBHOOK_SECRET`; sin esas variables sale con código 2 (omitido, no
  fallido). En CI corre con `--self-test`.

