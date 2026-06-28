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

**Comandos:** `cd pwa && npm run dev|build|test|lint`. Deploy: `wrangler deploy` (PWA+functions),
`cd apps_script && clasp push` (backend). Gate de PR: `npm run lint && npm run build && npm run test`.

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

